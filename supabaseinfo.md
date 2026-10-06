Újraellenőrzöm a tényleges korlátozásokat és RLS-policy-kat, majd csak egy javított, végrehajtásra nem kerülő tervet és SQL-tervezetet adok.
A list_tables visszaadja a 1–240 tartományellenőrzést, de nem sorolja fel ezt az egyedi megszorítást. Most közvetlenül a Postgres katalógusaiban ellenőrzöm a UNIQUE definíciókat és az indexeket; ez is csak olvasás.
A katalógus megerősíti a `UNIQUE (season_id, match_no)` meglétét; sőt két egyedi index is fedi ugyanezt a kulcsot. Mielőtt külön RLS-tervezetet írok, ellenőrzöm, hogy a régi táblákon milyen közvetlen API-jogosultságok vannak megadva.
## Javított státusz

A közvetlen katalógusellenőrzés **megerősítette**, hogy a `public.winmix_matches` táblán már létezik a `winmix_matches_season_matchno_key` megszorítás: `UNIQUE (season_id, match_no)`. Emellett találtam egy másik, ugyanezekre az oszlopokra létrehozott egyedi indexet is, a `winmix_ingest_match_identity_uq`-t. **Egyiket sem javaslom újralétrehozni vagy eltávolítani.**

A `match_no` meglévő `CHECK (match_no >= 1 AND match_no <= 240)` megszorítása is megvan. A katalógusban **nem találtam** `UNIQUE (season_id, home_team_id, away_team_id)` megszorítást; a párosításhalmaz korábbi ellenőrzése nem jelzett duplikált irányított párosítást a jelenlegi két szezonban.

A szezonforrás-azonosító hiányzik. Vannak már egyedi indexek például a `(league, season_index)`, `(data_version_id, league, season_index)` és `(data_version_id, league, file_name)` kulcsokra, de ezek nem helyettesítik a Retail-/forrásazonosítót.

## Minimális sémamigráció-tervezet

- Új, kezdetben nullable `source_season_key` mező a `winmix_seasons` táblán. Így a meglévő két rekord változatlan maradhat; az importvalidáció viszont csak nem üres forrásazonosítóval fogadjon új kiadást.
- Egy ligán belüli, nem null forrásazonosítókra érvényes egyedi index.
- Egyedi irányított párosítás-korlát szezononként.
- **Nem** változik a `match_no`, annak 1–240 ellenőrzése, a nyers virtuális dátum tárolása vagy a meglévő `(season_id, match_no)` egyediség.

Az alábbi SQL **tervezet, nem futtattam le**. A párosítási validátor egy már létrehozott draft szezonra és egy, azonos ligájú referencia-szezonra futtatható. A párok összehasonlítása halmazművelettel történik, ezért a sorrendjük eltérhet.

```sql
ALTER TABLE public.winmix_seasons
  ADD COLUMN source_season_key text;

ALTER TABLE public.winmix_seasons
  ADD CONSTRAINT winmix_seasons_source_season_key_nonblank
  CHECK (
    source_season_key IS NULL
    OR length(btrim(source_season_key)) > 0
  );

CREATE UNIQUE INDEX winmix_seasons_league_source_key_uq
  ON public.winmix_seasons (league, source_season_key)
  WHERE source_season_key IS NOT NULL;

CREATE UNIQUE INDEX winmix_matches_season_directed_pair_uq
  ON public.winmix_matches (season_id, home_team_id, away_team_id);
```

Az importvalidátor tervezett SQL-vázlata:

```sql
CREATE OR REPLACE FUNCTION public.winmix_validate_import_season(
  p_candidate_season_id uuid,
  p_reference_season_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_candidate_league text;
  v_reference_league text;
  v_source_key text;
  v_candidate_matches integer;
  v_candidate_pairs integer;
  v_reference_matches integer;
  v_reference_pairs integer;
  v_round_count integer;
  v_bad_rounds integer;
  v_team_count integer;
  v_bad_teams integer;
  v_pair_delta integer;
BEGIN
  SELECT s.league, s.source_season_key
    INTO v_candidate_league, v_source_key
  FROM public.winmix_seasons AS s
  WHERE s.id = p_candidate_season_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate season not found'
      USING ERRCODE = '23514';
  END IF;

  SELECT s.league
    INTO v_reference_league
  FROM public.winmix_seasons AS s
  WHERE s.id = p_reference_season_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reference season not found'
      USING ERRCODE = '23514';
  END IF;

  IF p_candidate_season_id = p_reference_season_id THEN
    RAISE EXCEPTION 'Candidate and reference seasons must differ'
      USING ERRCODE = '23514';
  END IF;

  IF v_candidate_league IS DISTINCT FROM v_reference_league THEN
    RAISE EXCEPTION 'Candidate and reference seasons must be in the same league'
      USING ERRCODE = '23514';
  END IF;

  IF nullif(btrim(v_source_key), '') IS NULL THEN
    RAISE EXCEPTION 'source_season_key is required for an imported season'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer,
         count(DISTINCT (m.home_team_id, m.away_team_id))::integer
    INTO v_candidate_matches, v_candidate_pairs
  FROM public.winmix_matches AS m
  WHERE m.season_id = p_candidate_season_id;

  SELECT count(*)::integer,
         count(DISTINCT (m.home_team_id, m.away_team_id))::integer
    INTO v_reference_matches, v_reference_pairs
  FROM public.winmix_matches AS m
  WHERE m.season_id = p_reference_season_id;

  IF v_candidate_matches <> 240 OR v_candidate_pairs <> 240 THEN
    RAISE EXCEPTION 'Candidate must contain 240 distinct directed pairings'
      USING ERRCODE = '23514';
  END IF;

  IF v_reference_matches <> 240 OR v_reference_pairs <> 240 THEN
    RAISE EXCEPTION 'Reference must contain 240 distinct directed pairings'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE r.matches <> 8)::integer
    INTO v_round_count, v_bad_rounds
  FROM (
    SELECT ((m.match_no - 1) / 8) + 1 AS round_no,
           count(*) AS matches
    FROM public.winmix_matches AS m
    WHERE m.season_id = p_candidate_season_id
    GROUP BY ((m.match_no - 1) / 8) + 1
  ) AS r;

  IF v_round_count <> 30 OR v_bad_rounds <> 0 THEN
    RAISE EXCEPTION 'Candidate must have 30 rounds with 8 matches per round'
      USING ERRCODE = '23514';
  END IF;

  WITH appearances AS (
    SELECT m.home_team_id AS team_id, true AS is_home
    FROM public.winmix_matches AS m
    WHERE m.season_id = p_candidate_season_id

    UNION ALL

    SELECT m.away_team_id AS team_id, false AS is_home
    FROM public.winmix_matches AS m
    WHERE m.season_id = p_candidate_season_id
  ),
  per_team AS (
    SELECT a.team_id,
           count(*) AS appearances,
           count(*) FILTER (WHERE a.is_home) AS home_appearances,
           count(*) FILTER (WHERE NOT a.is_home) AS away_appearances
    FROM appearances AS a
    GROUP BY a.team_id
  )
  SELECT count(*)::integer,
         count(*) FILTER (
           WHERE p.appearances <> 30
              OR p.home_appearances <> 15
              OR p.away_appearances <> 15
         )::integer
    INTO v_team_count, v_bad_teams
  FROM per_team AS p;

  IF v_team_count <> 16 OR v_bad_teams <> 0 THEN
    RAISE EXCEPTION 'Candidate must have 16 teams with 30 appearances each (15 home, 15 away)'
      USING ERRCODE = '23514';
  END IF;

  WITH candidate_pairs AS (
    SELECT m.home_team_id, m.away_team_id
    FROM public.winmix_matches AS m
    WHERE m.season_id = p_candidate_season_id
  ),
  reference_pairs AS (
    SELECT m.home_team_id, m.away_team_id
    FROM public.winmix_matches AS m
    WHERE m.season_id = p_reference_season_id
  ),
  candidate_only AS (
    SELECT * FROM candidate_pairs
    EXCEPT
    SELECT * FROM reference_pairs
  ),
  reference_only AS (
    SELECT * FROM reference_pairs
    EXCEPT
    SELECT * FROM candidate_pairs
  ),
  differences AS (
    SELECT * FROM candidate_only
    UNION ALL
    SELECT * FROM reference_only
  )
  SELECT count(*)::integer
    INTO v_pair_delta
  FROM differences;

  IF v_pair_delta <> 0 THEN
    RAISE EXCEPTION 'Candidate directed-pairing set differs from the reference'
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'league', v_candidate_league,
    'source_season_key', v_source_key,
    'match_count', v_candidate_matches,
    'directed_pair_count', v_candidate_pairs,
    'round_count', v_round_count,
    'teams', v_team_count,
    'reference_season_id', p_reference_season_id,
    'pairing_order_matters', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.winmix_validate_import_season(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.winmix_validate_import_season(uuid, uuid)
  TO service_role;
```

A backtesztben a forduló továbbra is levezethető: `((match_no - 1) / 8) + 1`. **Egy forduló egyetlen mérkőzésének eredménye sem kerülhet bele az adott forduló többi mérkőzésére használt állapotba**: az előrejelzéseknek ugyanabból a forduló előtti állapotból kell készülniük, az eredmények pedig csak a teljes, nyolcmérkőzéses forduló lezárása után frissíthetik a modellt. Ezt a futtatási/backtest logikában is érvényesíteni kell, nem pusztán adatbázis-korlátként.

## Külön RLS-tervezet

A policy-listában szereplő régi, aláhúzás nélküli táblákon `anon` és `authenticated` szerepkörre több, minden sort/módosítást engedő `USING (true)` / `WITH CHECK (true)` policy van. A policy-családok nevei táblánként jellemzően `*_select`, `*_insert`, `*_update`, `*_delete`.

Érintett régi táblák:

`winmixroundrequests`, `winmixroundfixtures`, `winmixfixturepredictionrequests`, `winmixfixturepredictioncards`, `winmixroundselections`, `winmixcoredecisions`, `winmixroundfixtureoutcomes`, `winmixroundfixturematchlinks`, `winmixpredictionfeedback`, `winmixpredictionoutcomelinks`, `winmixpairpenalty`, `winmixpairpenaltyevents`, `winmixenginejobs`, `winmixengineruns`, `winmixpipelinecheckpoints`, `winmixmatchfeatures`, `winmixteamstatesnapshots`, `winmixpredictions`, `winmixcalibrationresults`, `winmixh2hpairs`, `winmixteamseasonstats`, `winmixroundstandings`, `winmixrunstatistics`, `winmixvalidationruns`, `winmixevaluationwindows`, `winmixcalibrationbins`, `winmixcalibrationrefits`, `winmixmarkets`, `winmixdataversions`, `winmiximportbatches`, `winmixteams`, `winmixseasons`, `winmixmatches`, `winmixmatchoutcomes`, `winmixparametersnapshots`.

A hozzájuk tartozó közvetlen táblajogosultság-ellenőrzés `anon` és `authenticated` számára több helyen `INSERT`, `UPDATE` és `DELETE` jogokat is talált; a `PUBLIC`-nek adott ilyen táblajogosultságot nem mutatta. Biztonságosabb lenne az alkalmazás használatát az aláhúzásos táblákra átállítani, majd a régi táblák anon/authed policy-jait és táblajogosultságait külön migrációban eltávolítani. A `service_role` jogaihoz az alábbi tervezet nem nyúl.

Az aláhúzásos `winmix_matches` és `winmix_seasons` táblákon külön gond a két túl tág anon policy: **`"Anon select matches"` és `"Anon select seasons"`**. Ezeket eltávolítanám; a meglévő `winmix_current_matches_read` és `winmix_current_seasons_read` policy-k biztosítják a jelenlegi, lezárt verzióhoz kötött olvasást. A publikált fordulókhoz tartozó szűkebb policy-ket nem módosítanám.

```sql
-- KÜLÖN biztonsági migráció; előtte ellenőrizni kell,
-- hogy a kliens már nem a régi, aláhúzás nélküli táblákat használja.

DO $block$
DECLARE
  v_table text;
  v_policy record;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'winmixroundrequests',
    'winmixroundfixtures',
    'winmixfixturepredictionrequests',
    'winmixfixturepredictioncards',
    'winmixroundselections',
    'winmixcoredecisions',
    'winmixroundfixtureoutcomes',
    'winmixroundfixturematchlinks',
    'winmixpredictionfeedback',
    'winmixpredictionoutcomelinks',
    'winmixpairpenalty',
    'winmixpairpenaltyevents',
    'winmixenginejobs',
    'winmixengineruns',
    'winmixpipelinecheckpoints',
    'winmixmatchfeatures',
    'winmixteamstatesnapshots',
    'winmixpredictions',
    'winmixcalibrationresults',
    'winmixh2hpairs',
    'winmixteamseasonstats',
    'winmixroundstandings',
    'winmixrunstatistics',
    'winmixvalidationruns',
    'winmixevaluationwindows',
    'winmixcalibrationbins',
    'winmixcalibrationrefits',
    'winmixmarkets',
    'winmixdataversions',
    'winmiximportbatches',
    'winmixteams',
    'winmixseasons',
    'winmixmatches',
    'winmixmatchoutcomes',
    'winmixparametersnapshots'
  ]
  LOOP
    FOR v_policy IN
      SELECT p.policyname
      FROM pg_catalog.pg_policies AS p
      WHERE p.schemaname = 'public'
        AND p.tablename = v_table
    LOOP
      EXECUTE format(
        'DROP POLICY %I ON public.%I',
        v_policy.policyname,
        v_table
      );
    END LOOP;

    EXECUTE format(
      'REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',
      v_table
    );
  END LOOP;
END;
$block$;

-- Ezek a permisszív anon policy-k felülírják a szűkebb, verzióhoz
-- kötött read policy-ket, mert a permisszív policy-k OR-kapcsoltak.
DROP POLICY IF EXISTS "Anon select matches"
  ON public.winmix_matches;

DROP POLICY IF EXISTS "Anon select seasons"
  ON public.winmix_seasons;
```

**Sem a sémamigrációt, sem az RLS-migrációt nem alkalmaztam; rekordot és jogosultságot nem módosítottam.**