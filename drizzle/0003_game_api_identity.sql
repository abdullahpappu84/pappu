ALTER TABLE "games" ADD COLUMN "api_source" varchar(40);
ALTER TABLE "games" ADD COLUMN "api_external_id" varchar(160);
ALTER TABLE "integrations" ADD COLUMN "last_test_at" timestamp with time zone;
ALTER TABLE "integrations" ADD COLUMN "last_sync_at" timestamp with time zone;
ALTER TABLE "integrations" ADD COLUMN "last_sync_summary" jsonb;

UPDATE "games"
SET "api_source" = 'aggregator',
    "api_external_id" = COALESCE("aggregator_game_id", "integration_ref", "provider_game_id")
WHERE "aggregator_game_id" IS NOT NULL;

UPDATE "games" AS g
SET "api_source" = p."adapter",
    "api_external_id" = COALESCE(g."integration_ref", g."provider_game_id")
FROM "providers" AS p
WHERE g."provider_id" = p."id"
  AND g."api_source" IS NULL
  AND p."adapter" <> 'direct'
  AND COALESCE(g."integration_ref", g."provider_game_id") IS NOT NULL;

WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "api_source", "api_external_id" ORDER BY "id") AS duplicate_rank
  FROM "games"
  WHERE "api_source" IS NOT NULL AND "api_external_id" IS NOT NULL
)
UPDATE "games" AS g
SET "api_external_id" = NULL
FROM ranked
WHERE ranked."id" = g."id" AND ranked.duplicate_rank > 1;

CREATE INDEX "games_api_source_idx" ON "games" USING btree ("api_source");
CREATE INDEX "games_name_idx" ON "games" USING btree ("name");
CREATE INDEX "game_categories_category_idx" ON "game_categories" USING btree ("category_id");
CREATE UNIQUE INDEX "games_api_external_unique" ON "games" USING btree ("api_source", "api_external_id");
