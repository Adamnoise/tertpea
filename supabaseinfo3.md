The first summary query had a SQL scoping typo in its final JSON expression; it returned no data. I’m correcting that expression and rerunning the read-only check.
The prior summary inflated match counts because its team-count join duplicated each match. The date-group results did show 30 contiguous groups of eight per season; I’m correcting the match/team totals and checking the database-side import routines next.
## 1. Tényleges jelenlegi állapot

**A jelenlegi séma és adatok katalóguslekérdezésekkel ellenőrizve; módosítást nem végeztem.**

- A cél a modern `public.winmix_seasons` és `public.winmix_matches` táblacsalád. Két szezon van: egy `angol`, egy `spanyol`; a `v1.0-draft` adatverzió státusza `draft`, `is_current = false`.
- A helyes, javított számlálás szerint **szezononként 240 meccs, összesen 480**. Mindkét szezon 16 csapatot tartalmaz; mind a 16 csapatnak 15 hazai és 15 vendégszereplése van.
- Mindkét szezonban 240 különböző `match_no` van, a 1–240 tartományon kívüli és duplikált sorszámok száma nulla. Duplikált `(season_id, home_team_id, away_team_id)` párt sem találtam.
- Mindkét szezon `match_date_raw` értékei **30 egymást követő csoportot alkotnak, csoportonként 8 meccsel**, a `match_no` sorrendjében. Az értékeket nyers szövegként kezeltem; naptári dátummá nem alakítottam.
- A `winmix_seasons` táblában **nincs `source_season_key`**, és nem találtam ott `source`/`Retail`/külső azonosítónak megfelelő oszlopot. A `file_name` nem ilyen kulcs. A `winmix_matches.source_file_id` fájlhoz tartozó azonosító, nem szezonazonosító.
- A meccssorszám jelenlegi constraintje: `CHECK (match_no >= 1 AND match_no <= 240)`. A kért meglévő kulcs: `UNIQUE (season_id, match_no)`, constraint neve `winmix_matches_season_matchno_key`. Egy külön, vele azonos oszlopú unique index is létezik: `winmix_ingest_match_identity_uq`. **Mindkettő változatlan marad.**
- A `(season_id, home_team_id, away_team_id)` kulcsot védő **egyenértékű unique constraintet vagy unique indexet nem találtam**. A `winmix_matches_directed_pair_idx` nem egyedi; más egyedi indexek extra oszlopokat is tartalmaznak, ezért nem helyettesítik ezt a kulcsot.
- A score-korlátozások között már megvannak a nemnegatív félidei/végeredmény ellenőrzések, valamint a félidei pontszámok végeredményhez viszonyított felső korlátai.

**Importfüggőségek:**

- Létezik a `public.ingest_season_csv(p_league, p_season_name, p_season_index, p_file_name, p_matches)` RPC. `SECURITY DEFINER`, az `authenticated` és `service_role` számára végrehajtható; a szezon beszúrásakor nem ad meg source kulcsot, és nincs ilyen paramétere.
- Létezik a `public.w inmix_ingest_season_v1(p_season, p_matches, p_mode)` nevű RPC (a tényleges függvénynévben nincs szóköz: `winmix_ingest_season_v1`). `SECURITY INVOKER`, a katalógus szerint `service_role` számára végrehajtható, `authenticated` számára nem. A beszúrási oszloplistája nem tartalmazza a source kulcsot.
- A szezon- és meccstáblákon meglévő triggerek az adatverzió állapotát és a lezárt adatok módosíthatatlanságát ellenőrzik; source-kulcs-validáló trigger nincs. Az import batch állapotát külön trigger őrzi.
- Aktív `winmix-ingest` Edge Function van, de az elérhető eszköz csak a nevét és státuszát mutatja, a forrását nem. Ezért **nem tudtam ellenőrizni**, hogy a függvény hogyan hívja az RPC-ket, vagy jelenleg milyen importmezőket küld. A frontend kódja sem vizsgálható a Postgres-katalógusból.

**Adatleltár-korlát:** ligánként jelenleg csak egy szezon van, így a korábbi kiadásokon átívelő, ligán belüli 240 rendezett párhalmaz-egyezés még nem ellenőrizhető.

## 2. Mi támogatott már, mi hiányzik

- **Már támogatott:** a két liga, a szezononkénti 240 meccs, a 1–240 `match_no`-tartomány, a `(season_id, match_no)` egyediség, a nyers `match_date_raw` és a pontszámellenőrzések.
- **Hiányzik:** a nullable `source_season_key`, a trimelt, nem üres source kulcs ligánkénti egyedisége, valamint a `(season_id, home_team_id, away_team_id)` egyediség.
- **Fontos kompatibilitási megállapítás:** a jelenlegi import-RPC-k nem szolgáltatnak source kulcsot. Egy olyan trigger, amely minden új szezon beszúrásakor megköveteli a kulcsot, jelen állapotban elutasítaná a meglévő importutak beszúrásait. Emiatt az alábbi **sémamigráció nem tartalmaz ilyen triggert**. A kötelező kulcsot az importfolyamat külön, összehangolt módosításával kell kikényszeríteni; addig új importot nem szabad indítani.

## 3. Javasolt fájlnév és teljes migrációs SQL-tervezet

Javasolt fájlnév: `20261006193500_winmix_season_source_keys_and_directed_pair_uniqueness.sql`

Ez a tervezet kizárólag az új nullable oszlopot, a trimelt source kulcs ligánkénti részleges unique indexét, valamint — ha nincs már egyenértékű unique index — a szezonon belüli irányított párok egyediségét kezeli. Az objektumokra kerülő megjegyzések a rollback biztonságos azonosítását szolgálják.

```sql
BEGIN;

-- A vizsgálat és az egyedi szabályok létrehozása között ne kerülhessen
-- be új, az ellenőrzéseket megkerülő rekord.
LOCK TABLE public.winmix_seasons IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.winmix_matches IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.winmix_seasons
    ADD COLUMN source_season_key text NULL;

COMMENT ON COLUMN public.winmix_seasons.source_season_key
    IS 'Created by migration 20261006193500_winmix_season_source_keys_and_directed_pair_uniqueness';

DO $migration$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.winmix_seasons
        WHERE source_season_key IS NOT NULL
          AND btrim(source_season_key) <> ''
        GROUP BY league, btrim(source_season_key)
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Cannot create source key index: duplicate non-empty trimmed keys exist within a league';
    END IF;
END
$migration$;

CREATE UNIQUE INDEX winmix_seasons_league_source_season_key_uidx
    ON public.winmix_seasons (league, btrim(source_season_key))
    WHERE source_season_key IS NOT NULL
      AND btrim(source_season_key) <> '';

COMMENT ON INDEX public.winmix_seasons_league_source_season_key_uidx
    IS 'Created by migration 20261006193500_winmix_season_source_keys_and_directed_pair_uniqueness';

DO $migration$
DECLARE
    equivalent_unique_exists boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_index AS i
        WHERE i.indrelid = 'public.winmix_matches'::regclass
          AND i.indisunique
          AND i.indisvalid
          AND i.indisready
          AND i.indpred IS NULL
          AND i.indexprs IS NULL
          AND i.indnkeyatts = 3
          AND (
              SELECT array_agg(a.attname::text ORDER BY a.attname::text)
              FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key(attnum, ord)
              JOIN pg_attribute AS a
                ON a.attrelid = i.indrelid
               AND a.attnum = key.attnum
              WHERE key.ord <= i.indnkeyatts
          ) = ARRAY['away_team_id', 'home_team_id', 'season_id']::text[]
    )
    INTO equivalent_unique_exists;

    IF NOT equivalent_unique_exists THEN
        IF EXISTS (
            SELECT 1
            FROM public.winmix_matches
            GROUP BY season_id, home_team_id, away_team_id
            HAVING count(*) > 1
        ) THEN
            RAISE EXCEPTION
                'Cannot add directed-pair uniqueness: duplicate (season_id, home_team_id, away_team_id) rows exist';
        END IF;

        ALTER TABLE public.winmix_matches
            ADD CONSTRAINT winmix_matches_season_home_away_key
            UNIQUE (season_id, home_team_id, away_team_id);

        COMMENT ON CONSTRAINT winmix_matches_season_home_away_key
            ON public.winmix_matches
            IS 'Created by migration 20261006193500_winmix_season_source_keys_and_directed_pair_uniqueness';
    END IF;
END
$migration$;

COMMIT;
```

A tervezetet **nem futtattam és nem teszteltem tranzakcióban**. A PostgreSQL-katalógusokból ellenőrzött környezeti tények alapján készült; az élő módosítás futtathatóságát külön, jóváhagyott alkalmazás előtt újra ellenőrizni kell.

## 4. Importvalidáció külön terve és tesztjei

A source-kulcs kötelezővé tétele **nem része a fenti sémamigrációnak**. A jelenlegi RPC-k és az aktív Edge Function használatának ellenőrzése, majd az import API/validátor megfelelő módosítása szükséges, mielőtt új importot engedélyezünk. Különösen az `ingest_season_csv` jelenlegi aláírása nem fogad source kulcsot; az RPC szerződésének módosítása a hívókat is érintheti. Az Edge Function forrásának megtekintése nélkül nem állítható, hogy az jelenleg képes-e ilyen kulcsot átadni.

Az import validátornak legalább a következőket kell ellenőriznie:

- A CSV fejlécét, az elvárt oszlopokat és típusokat; a dátum/idő mezőt nyers `HH:MM` szövegként kezelje, ne naptári timestampként.
- Pontosan 240 sort és a sorpozícióból képzett, hiány- és duplikációmentes `match_no` értékeket 1–240 között.
- 30 egymást követő, egyenként 8 soros blokkot; a `round_no` a `match_no` alapján származtatható.
- A nyers időcsoportokból pontosan 30 egymást követő csoportot, csoportonként 8 sort, a CSV-sorrenddel összhangban. Az óra-perc ne legyen önmagában kulcs.
- A liga referencia-szezonjának pontosan 16 csapatát; csapatonként 30 szereplést, 15 hazait és 15 vendéget.
- A kiadáson belüli irányított párok egyediségét, és az irányított `(home, away)` párok halmazának sorrendtől független egyezését a liga referencia-szezonjával. A jelenlegi adatban csak egy szezon van ligánként, így ezt későbbi kiadásoknál lehet ténylegesen összehasonlítani.
- A ligaazonosságot, a csapat idegenkulcsokat, a nem negatív félidei és végeredmény-pontszámokat, valamint azt, hogy a félidei pontszám ne legyen nagyobb a végeredménynél.
- A forráskulcs meglétét, nem üres voltát és trimelés utáni egyediségét ugyanazon ligán belül. Más ligában azonos kulcs engedélyezhető.
- A sikeres validációt a lezárás feltételeként. A jelenlegi seal-ellenőrző függvény ellenőrzi a darabszámokat és hash-t, de az itt felsorolt teljes CSV üzleti validációt nem helyettesíti.

Elvárt külön tesztek: régi `NULL` kulcsú szezonok változatlanul megmaradnak; hiányzó/üres kulcsú új import elutasításra kerül; ugyanazon ligán belül ismétlődő trimelt kulcs elutasításra kerül; másik ligában azonos kulcs megengedhető; azonos irányított pár másik szezonban megengedett, ugyanabban elutasított; duplikált `match_no` továbbra is elutasított; hibás CSV nem vezethet sealed/current kiadáshoz.

## 5. RLS/ACL figyelmeztetés

Az érintett táblák RLS-e engedélyezett. **Ez a javaslat nem változtat RLS-policy-n, ACL-en, granton, role-on vagy `service_role` jogosultságon.** Az RPC-k eltérő végrehajtási jogosultságai külön függőségvizsgálatot igényelnek; azok módosítása külön feladat.

## 6. Rollback és postflight

A rollback a migráció által azonosítható megjegyzéseket használja; így nem törli az előzőleg létező egyenértékű unique indexet/constraintet. Az oszlop eltávolítása **elveszítheti** a migráció után beírt source kulcsokat, ezért rollback előtt azokat exportálni kell.

```sql
BEGIN;

DO $rollback$
DECLARE
    migration_marker constant text :=
        'Created by migration 20261006193500_winmix_season_source_keys_and_directed_pair_uniqueness';
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname = 'winmix_seasons_league_source_season_key_uidx'
          AND obj_description(c.oid, 'pg_class') = migration_marker
    ) THEN
        DROP INDEX public.winmix_seasons_league_source_season_key_uidx;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_constraint AS c
        WHERE c.conrelid = 'public.winmix_matches'::regclass
          AND c.conname = 'winmix_matches_season_home_away_key'
          AND obj_description(c.oid, 'pg_constraint') = migration_marker
    ) THEN
        ALTER TABLE public.winmix_matches
            DROP CONSTRAINT winmix_matches_season_home_away_key;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_attribute AS a
        WHERE a.attrelid = 'public.winmix_seasons'::regclass
          AND a.attname = 'source_season_key'
          AND a.attnum > 0
          AND NOT a.attisdropped
          AND col_description(a.attrelid, a.attnum) = migration_marker
    ) THEN
        ALTER TABLE public.winmix_seasons
            DROP COLUMN source_season_key;
    END IF;
END
$rollback$;

COMMIT;
```

Postflight-ellenőrzések — csak olvasási lekérdezések:

```sql
-- Az oszlop léte és nullable állapota.
SELECT
    a.attname AS column_name,
    format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull AS is_not_null
FROM pg_attribute AS a
WHERE a.attrelid = 'public.winmix_seasons'::regclass
  AND a.attname = 'source_season_key'
  AND a.attnum > 0
  AND NOT a.attisdropped;

-- A source-kulcs index definíciója.
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'winmix_seasons'
  AND indexname = 'winmix_seasons_league_source_season_key_uidx';

-- Azonos trimelt source kulcsok azonos ligán belül: elvárt eredmény nulla sor.
SELECT league, btrim(source_season_key) AS source_season_key, count(*) AS duplicate_count
FROM public.winmix_seasons
WHERE source_season_key IS NOT NULL
  AND btrim(source_season_key) <> ''
GROUP BY league, btrim(source_season_key)
HAVING count(*) > 1;

-- Az irányított párokra vonatkozó egyenértékű unique index/constraint.
SELECT
    i.indexrelid::regclass AS index_name,
    con.conname AS constraint_name,
    pg_get_indexdef(i.indexrelid) AS index_definition
FROM pg_index AS i
LEFT JOIN pg_constraint AS con ON con.conindid = i.indexrelid
WHERE i.indrelid = 'public.winmix_matches'::regclass
  AND i.indisunique
  AND i.indisvalid
  AND i.indisready
  AND i.indpred IS NULL
  AND i.indexprs IS NULL
  AND i.indnkeyatts = 3
  AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname::text)
      FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key(attnum, ord)
      JOIN pg_attribute AS a
        ON a.attrelid = i.indrelid
       AND a.attnum = key.attnum
      WHERE key.ord <= i.indnkeyatts
  ) = ARRAY['away_team_id', 'home_team_id', 'season_id']::text[];

-- A meglévő UNIQUE (season_id, match_no) és match_no CHECK definíciója.
SELECT conname, pg_get_constraintdef(oid, true) AS definition
FROM pg_constraint
WHERE conrelid = 'public.winmix_matches'::regclass
  AND conname IN ('winmix_matches_season_matchno_key', 'winmix_matches_match_no_check');
```

## 7. A migráció módosításai és következményei

A tervezet új nullable `source_season_key` oszlopot és ligánkénti, trimelt nem üres kulcsokra vonatkozó unique indexet ad hozzá. Hozzáadja a szezonon belüli irányított pár-egyediséget, ha nincs már egyenértékű unique index; meglévő ütköző sorok esetén hibával megáll. **Nem módosít meglévő rekordot, a `(season_id, match_no)` egyediséget, a `match_no` 1–240 ellenőrzést, az idő nyers szöveges tárolását, RLS/ACL beállítást vagy adatverzió-státuszt.**

**Jóváhagyás előtt tisztázandó:** a fenti sémamigráció önmagában nem teszi kötelezővé a kulcsot az import RPC-kben, mivel azok jelenleg nem adják át. A kötelező importvalidáció külön, az RPC- és `winmix-ingest` függőségekhez igazított módosítást igényel. Sem a migrációt, sem importot nem hajtottam végre.
