-- User's personal ordered selection of main-dashboard KPI tiles.
-- Null/empty means "use the default 6" (frontend kpi-tile-catalog.ts).
ALTER TABLE "users" ADD COLUMN "kpi_tile_preferences" JSONB;
