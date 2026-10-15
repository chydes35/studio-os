import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFlags,
  validateBucket,
  validateDbName,
  validateBackupFiles,
} from "./local-backup-lib.mjs";

test("requires explicit safe backup and restore targets", () => {
  assert.deepEqual(
    parseFlags(
      [
        "--database",
        "studio_os_test",
        "--bucket",
        "studio-os-test",
        "--output",
        "/tmp/backup",
      ],
      ["database", "bucket", "output"],
    ),
    {
      database: "studio_os_test",
      bucket: "studio-os-test",
      output: "/tmp/backup",
    },
  );
  assert.throws(
    () => parseFlags(["--database", "studio_os"], ["database", "bucket"]),
    /Missing --bucket/,
  );
  assert.throws(
    () =>
      parseFlags(
        ["--database", "studio_os", "--password", "secret"],
        ["database"],
      ),
    /Unknown option/,
  );
  assert.throws(
    () => validateDbName("studio_os;DROP DATABASE studio_os"),
    /Database names/,
  );
  assert.throws(() => validateBucket("not a bucket"), /Invalid S3 bucket/);
});

test("verifies database and media checksums before restore", async () => {
  const directory = await mkdtemp(join(tmpdir(), "studio-os-backup-test-"));
  try {
    const objectsDirectory = join(directory, "objects");
    await mkdir(objectsDirectory);
    const dump = Buffer.from("synthetic custom-format database dump");
    const object = Buffer.from("synthetic private media");
    await writeFile(join(directory, "database.dump"), dump);
    await writeFile(join(objectsDirectory, "0.bin"), object);
    const manifest = {
      formatVersion: 1,
      database: {
        name: "studio_os_test",
        file: "database.dump",
        size: dump.length,
        sha256: createHash("sha256").update(dump).digest("hex"),
      },
      objects: [
        {
          key: "originals/test.jpg",
          file: "0.bin",
          size: object.length,
          sha256: createHash("sha256").update(object).digest("hex"),
        },
      ],
    };
    assert.equal(
      await validateBackupFiles(directory, manifest),
      join(directory, "database.dump"),
    );

    await writeFile(join(objectsDirectory, "0.bin"), "modified after backup");
    await assert.rejects(
      validateBackupFiles(directory, manifest),
      /verification failed/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
