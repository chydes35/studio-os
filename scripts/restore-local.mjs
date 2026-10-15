#!/usr/bin/env node
import { localConfig, parseFlags, restoreBackup } from "./local-backup-lib.mjs";

try {
  const flags = parseFlags(process.argv.slice(2), [
    "backup",
    "database",
    "bucket",
  ]);
  const result = await restoreBackup({
    backup: flags.backup,
    database: flags.database,
    bucket: flags.bucket,
    config: localConfig(),
  });
  console.log(
    `Restore complete. Database: ${result.database}; media bucket: ${result.bucket}; media objects: ${result.objectCount}`,
  );
  console.log(
    "The existing database and media were not dropped or overwritten.",
  );
} catch (error) {
  console.error(`Local restore failed: ${error.message}`);
  process.exitCode = 1;
}
