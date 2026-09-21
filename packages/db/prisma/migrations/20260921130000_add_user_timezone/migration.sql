-- AlterTable
ALTER TABLE "User" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- Accounts created before this column existed had their availability
-- implicitly evaluated in the API server's local zone, which for every
-- existing (dev) account was America/Chicago. Preserve their behavior;
-- new accounts get the browser's zone at registration (or 'UTC').
UPDATE "User" SET "timezone" = 'America/Chicago';
