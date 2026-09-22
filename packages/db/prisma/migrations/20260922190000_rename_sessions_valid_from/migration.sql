-- The column is bumped by a password change, a reset, and "sign out
-- everywhere", so naming it after one of those three was misleading. A
-- rename keeps existing values (and therefore existing sessions) intact.
ALTER TABLE "User" RENAME COLUMN "passwordChangedAt" TO "sessionsValidFrom";
