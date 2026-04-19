-- Creates the scraper database alongside the catalog database.
-- Postgres auto-creates POSTGRES_DB (soulstep); this script creates the second one.
-- Runs once on first container start when the data volume is empty.
SELECT 'CREATE DATABASE soulstep_scraper'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'soulstep_scraper')\gexec
