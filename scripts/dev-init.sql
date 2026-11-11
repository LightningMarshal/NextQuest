-- Runs once, when docker-compose.dev.yml first creates the database volume.
-- `nextquest` (the dev database) already exists via POSTGRES_DB; this adds
-- the separate, disposable database `npm run e2e` wipes and re-seeds.
CREATE DATABASE nextquest_e2e;
