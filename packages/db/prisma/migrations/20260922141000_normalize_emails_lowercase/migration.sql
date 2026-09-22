-- Emails are now normalized to lowercase on the way in (see packages/shared).
-- Existing rows predate that, so a mixed-case address stored earlier would
-- never match a lowercased login or client lookup.
--
-- Both statements below are guarded: if two rows differ only by case, the
-- merge is a data decision a human has to make, so the migration fails with
-- a clear message instead of tripping a unique constraint halfway through.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" GROUP BY lower(email) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Users exist whose emails differ only by case; merge them before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "Client" GROUP BY "ownerId", lower(email) HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Clients of one owner exist whose emails differ only by case; merge them before applying this migration';
  END IF;
END $$;

UPDATE "User" SET email = lower(email) WHERE email <> lower(email);
UPDATE "Client" SET email = lower(email) WHERE email <> lower(email);
