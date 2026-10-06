I’ll inspect the current table definitions and load PostgreSQL guidance so the draft targets the actual schema without running any changes.
# Draft only — not executed

## Read-only checks before migration

Run these checks first. The schema inspection confirmed `public.winmix_seasons` does not currently have `source_season_key`, and `public.winmix_matches.match_no` has a 1–240 check. The inspection did not expose enough constraint metadata to conclusively verify whether the requested match uniqueness constraint exists; the catalog check below does that.

```sql
-- Confirm whether source_season_key already exists.
SELECT
    a.attname AS column_name,
    format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull AS is_not_null
FROM pg_attribute AS a
WHERE a.attrelid = 'public.winmix_seasons'::regclass
  AND a.attname = 'source_season_key'
  AND a.attnum > 0
  AND NOT a.attisdropped;

-- Find any existing UNIQUE constraint on exactly these match columns,
-- regardless of their declared order.
SELECT
    c.conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
WHERE c.conrelid = 'public.winmix_matches'::regclass
  AND c.contype = 'u'
  AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname::text)
      FROM unnest(c.conkey) AS key(attnum)
      JOIN pg_attribute AS a
        ON a.attrelid = c.conrelid
       AND a.attnum = key.attnum
  ) = ARRAY['away_team_id', 'home_team_id', 'season_id']::text[];

-- Find existing duplicate match tuples that would prevent the constraint.
SELECT
    season_id,
    home_team_id,
    away_team_id,
    count(*) AS duplicate_count
FROM public.winmix_matches
GROUP BY season_id, home_team_id, away_team_id
HAVING count(*) > 1;

-- Verify the existing match_no check definition.
SELECT
    c.conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
WHERE c.conrelid = 'public.winmix_matches'::regclass
  AND c.contype = 'c'
  AND pg_get_constraintdef(c.oid) ILIKE '%match_no%';

-- Check for duplicate non-empty source identifiers if the column already exists.
-- If it does not yet exist, skip this query until after migration.
SELECT
    league,
    btrim(source_season_key) AS source_season_key,
    count(*) AS duplicate_count
FROM public.winmix_seasons
WHERE source_season_key IS NOT NULL
  AND btrim(source_season_key) <> ''
GROUP BY league, btrim(source_season_key)
HAVING count(*) > 1;
```

## Migration draft

The migration checks for duplicate match tuples before adding the constraint and skips adding that constraint if an equivalent UNIQUE constraint is already present. It also checks for duplicate non-empty season source keys before creating their unique index.

```sql
BEGIN;

ALTER TABLE public.winmix_seasons
    ADD COLUMN source_season_key text NULL;

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
            'Cannot create season source-key index: duplicate non-empty keys exist within a league';
    END IF;
END
$migration$;

CREATE UNIQUE INDEX winmix_seasons_league_source_season_key_uidx
    ON public.winmix_seasons (league, btrim(source_season_key))
    WHERE source_season_key IS NOT NULL
      AND btrim(source_season_key) <> '';

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint AS c
        WHERE c.conrelid = 'public.winmix_matches'::regclass
          AND c.contype = 'u'
          AND (
              SELECT array_agg(a.attname::text ORDER BY a.attname::text)
              FROM unnest(c.conkey) AS key(attnum)
              JOIN pg_attribute AS a
                ON a.attrelid = c.conrelid
               AND a.attnum = key.attnum
          ) = ARRAY['away_team_id', 'home_team_id', 'season_id']::text[]
    ) THEN
        IF EXISTS (
            SELECT 1
            FROM public.winmix_matches
            GROUP BY season_id, home_team_id, away_team_id
            HAVING count(*) > 1
        ) THEN
            RAISE EXCEPTION
                'Cannot add match uniqueness constraint: duplicate (season_id, home_team_id, away_team_id) tuples exist';
        END IF;

        ALTER TABLE public.winmix_matches
            ADD CONSTRAINT winmix_matches_season_home_away_key
            UNIQUE (season_id, home_team_id, away_team_id);
    END IF;
END
$migration$;

-- Require a non-empty key on new season inserts, and when the key is explicitly
-- changed. Existing rows with NULL keys remain valid unless their key is changed.
CREATE OR REPLACE FUNCTION public.winmix_require_source_season_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
    IF NEW.source_season_key IS NULL
       OR btrim(NEW.source_season_key) = '' THEN
        RAISE EXCEPTION
            'source_season_key must be non-empty for new or re-keyed seasons'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END
$function$;

CREATE TRIGGER winmix_seasons_require_source_season_key
    BEFORE INSERT OR UPDATE OF source_season_key
    ON public.winmix_seasons
    FOR EACH ROW
    EXECUTE FUNCTION public.winmix_require_source_season_key();

COMMIT;
```

The trigger is the database-side import validation: import attempts that insert a missing or blank key are rejected with SQLSTATE `23514`. Existing rows are not backfilled, and the column remains nullable. Import code should report that rejection as a validation failure.

## Read-only checks after migration

```sql
-- Confirm the column remains nullable.
SELECT
    a.attname AS column_name,
    format_type(a.atttypid, a.atttypmod) AS data_type,
    a.attnotnull AS is_not_null
FROM pg_attribute AS a
WHERE a.attrelid = 'public.winmix_seasons'::regclass
  AND a.attname = 'source_season_key'
  AND a.attnum > 0
  AND NOT a.attisdropped;

-- Existing NULL keys are allowed; this reports them without changing them.
SELECT count(*) AS seasons_without_source_key
FROM public.winmix_seasons
WHERE source_season_key IS NULL
   OR btrim(source_season_key) = '';

-- Expected result: no rows.
SELECT
    league,
    btrim(source_season_key) AS source_season_key,
    count(*) AS duplicate_count
FROM public.winmix_seasons
WHERE source_season_key IS NOT NULL
  AND btrim(source_season_key) <> ''
GROUP BY league, btrim(source_season_key)
HAVING count(*) > 1;

-- Confirm the requested match UNIQUE constraint exists.
SELECT
    c.conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
WHERE c.conrelid = 'public.winmix_matches'::regclass
  AND c.contype = 'u'
  AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname::text)
      FROM unnest(c.conkey) AS key(attnum)
      JOIN pg_attribute AS a
        ON a.attrelid = c.conrelid
       AND a.attnum = key.attnum
  ) = ARRAY['away_team_id', 'home_team_id', 'season_id']::text[];

-- Confirm the partial unique index exists.
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'winmix_seasons'
  AND indexname = 'winmix_seasons_league_source_season_key_uidx';

-- Confirm the existing match_no check is still present.
SELECT
    c.conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint AS c
WHERE c.conrelid = 'public.winmix_matches'::regclass
  AND c.contype = 'c'
  AND pg_get_constraintdef(c.oid) ILIKE '%match_no%';
```

## Rollback plan

**Warning:** rolling back drops `source_season_key`. Any source identifiers added after the migration would be lost. Review or export them before rollback.

```sql
BEGIN;

DROP TRIGGER IF EXISTS winmix_seasons_require_source_season_key
    ON public.winmix_seasons;

DROP FUNCTION IF EXISTS public.winmix_require_source_season_key();

DROP INDEX IF EXISTS public.winmix_seasons_league_source_season_key_uidx;

-- Drop only if this migration added the constraint.
-- If it existed before the migration, leave it in place.
ALTER TABLE public.winmix_matches
    DROP CONSTRAINT IF EXISTS winmix_matches_season_home_away_key;

ALTER TABLE public.winmix_seasons
    DROP COLUMN IF EXISTS source_season_key;

COMMIT;
```

## Scope confirmation

This proposal does **not** update existing season rows or change their existing `source_season_key` values. It does not modify `UNIQUE (season_id, match_no)`, the `match_no` 1–240 validation, or any RLS policies.
