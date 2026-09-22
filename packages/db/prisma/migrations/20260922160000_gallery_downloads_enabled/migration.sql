-- Full-resolution downloads are opt-in per gallery. Existing galleries default
-- to disabled: clients of already-delivered jobs keep seeing watermarked
-- previews until the owner releases the finals.
ALTER TABLE "Gallery" ADD COLUMN "downloadsEnabled" BOOLEAN NOT NULL DEFAULT false;
