-- Add passwordHash as NOT NULL. Existing rows (the seeded dev owner) get a
-- temporary default so the column can be added without data loss; the
-- default is dropped immediately after so every future insert must supply
-- a real hash. The temporary default is bcrypt("devpassword123", 10) —
-- see packages/db/prisma/seed.ts, which sets the same value explicitly.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT NOT NULL DEFAULT '$2a$10$ZggCxp.ERkOyv2djqPhR8Oar4olKqX6p6uBlfwWeXyfUa9HMG.tli';
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP DEFAULT;
