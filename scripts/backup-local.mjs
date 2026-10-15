#!/usr/bin/env node
import { localConfig, parseFlags, writeBackup } from "./local-backup-lib.mjs";

try {
  const flags = parseFlags(process.argv.slice(2), [
    "database",
    "bucket",
    "output",
  ]);
  const manifest = await writeBackup({
    database: flags.database,
    bucket: flags.bucket,
    output: flags.output,
    config: localConfig(),
  });
  console.log(`Backup created: ${flags.output}`);
  console.log(
    `Database: ${manifest.database.name}; media objects: ${manifest.objects.length}; media bytes: ${manifest.totalMediaBytes}`,
  );
} catch (error) {
  console.error(`Local backup failed: ${error.message}`);
  process.exitCode = 1;
}
