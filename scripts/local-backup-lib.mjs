import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  createReadStream,
  createWriteStream,
  openSync,
  readFileSync,
} from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(resolve(root, "apps/api/package.json"));
const {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
} = require("@aws-sdk/client-s3");

export function parseFlags(args, required) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (
      !flag.startsWith("--") ||
      !args[index + 1] ||
      args[index + 1].startsWith("--")
    ) {
      throw new Error(`Expected ${flag} followed by a value`);
    }
    const name = flag.slice(2);
    if (values[name]) throw new Error(`Duplicate option: ${flag}`);
    values[name] = args[++index];
  }
  for (const name of required) {
    if (!values[name]) throw new Error(`Missing --${name}`);
  }
  for (const name of Object.keys(values)) {
    if (
      !required.includes(name) &&
      !["output", "backup", "database", "bucket"].includes(name)
    ) {
      throw new Error(`Unknown option: --${name}`);
    }
  }
  return values;
}

export function localConfig() {
  const env = parseEnv(readFileSync(resolve(root, ".env"), "utf8"));
  const db = new URL(env.DATABASE_URL ?? "");
  if (
    !["postgres:", "postgresql:"].includes(db.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(db.hostname)
  ) {
    throw new Error(
      "Local backup and restore require the local Postgres container",
    );
  }
  const username = decodeURIComponent(db.username);
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(username))
    throw new Error("Unsupported local Postgres username");
  if (
    !env.R2_ENDPOINT ||
    !["localhost", "127.0.0.1", "[::1]"].includes(
      new URL(env.R2_ENDPOINT).hostname,
    )
  ) {
    throw new Error("Local backup and restore require a local R2_ENDPOINT");
  }
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY)
    throw new Error("Missing local media storage credentials");
  return {
    env,
    username,
    endpoint: env.R2_ENDPOINT,
    region: env.R2_REGION ?? "us-east-1",
  };
}

export function validateDbName(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(name))
    throw new Error(
      "Database names must use letters, numbers, and underscores",
    );
  return name;
}

export function validateBucket(name) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name) || name.includes(".."))
    throw new Error("Invalid S3 bucket name");
  return name;
}

export function storageClient(config) {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.env.R2_ACCESS_KEY_ID,
      secretAccessKey: config.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

function runDocker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `docker ${args.slice(0, 3).join(" ")} failed with exit code ${result.status}`,
    );
  return result.stdout?.trim() ?? "";
}

export function dumpDatabase(database, username, file) {
  const outputFd = openSync(file, "w", 0o600);
  try {
    const descriptor = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        "studio_os_postgres",
        "pg_dump",
        "-U",
        username,
        "--format=custom",
        "--no-owner",
        "--no-acl",
        database,
      ],
      { stdio: ["ignore", outputFd, "inherit"] },
    );
    if (descriptor.error || descriptor.status !== 0)
      throw new Error(
        "Postgres backup failed; verify the local database container and name",
      );
  } finally {
    closeSync(outputFd);
  }
}

export function restoreDatabase(database, username, file) {
  const inputFd = openSync(file, "r");
  try {
    const descriptor = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        "studio_os_postgres",
        "pg_restore",
        "-U",
        username,
        "--dbname",
        database,
        "--no-owner",
        "--no-acl",
        "--exit-on-error",
      ],
      { stdio: [inputFd, "inherit", "inherit"] },
    );
    if (descriptor.error || descriptor.status !== 0)
      throw new Error(
        "Postgres restore failed; the target database may now be partially restored and was not deleted",
      );
  } finally {
    closeSync(inputFd);
  }
}

function query(database, username, sql) {
  return runDocker([
    "exec",
    "studio_os_postgres",
    "psql",
    "-U",
    username,
    "-d",
    database,
    "-Atqc",
    sql,
  ]);
}

export function ensurePostgresRunning(username) {
  const state = runDocker([
    "inspect",
    "--format",
    "{{.State.Running}}",
    "studio_os_postgres",
  ]);
  if (state !== "true")
    throw new Error(
      "The existing studio_os_postgres container is stopped; start it without replacing its volume",
    );
  runDocker(["exec", "studio_os_postgres", "pg_isready", "-U", username]);
}

export async function backupStorage(client, bucket, directory) {
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  const objects = [];
  let continuationToken;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    );
    for (const item of page.Contents ?? []) {
      if (!item.Key) continue;
      const index = objects.length;
      const file = `${index}.bin`;
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: item.Key }),
      );
      if (!response.Body)
        throw new Error(`Media object ${item.Key} has no body`);
      const hash = createHash("sha256");
      let size = 0;
      const meter = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(
        response.Body,
        meter,
        createWriteStream(resolve(directory, "objects", file), {
          flags: "wx",
          mode: 0o600,
        }),
      );
      objects.push({ key: item.Key, file, size, sha256: hash.digest("hex") });
    }
    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined;
  } while (continuationToken);
  return objects;
}

export async function validateBackupFiles(directory, manifest) {
  if (
    manifest.formatVersion !== 1 ||
    !Array.isArray(manifest.objects) ||
    manifest.database?.file !== "database.dump"
  ) {
    throw new Error("Unsupported or invalid backup manifest");
  }
  const dbPath = resolve(directory, "database.dump");
  if (!relative(directory, dbPath) || (await stat(dbPath)).size === 0)
    throw new Error("Database dump is missing or empty");
  const dbHash = createHash("sha256");
  let dbSize = 0;
  for await (const chunk of createReadStream(dbPath)) {
    dbSize += chunk.length;
    dbHash.update(chunk);
  }
  if (
    dbSize !== manifest.database.size ||
    dbHash.digest("hex") !== manifest.database.sha256
  )
    throw new Error("Database dump checksum verification failed");
  const seen = new Set();
  for (const object of manifest.objects) {
    if (
      typeof object.file !== "string" ||
      !/^\d+\.bin$/.test(object.file) ||
      seen.has(object.file)
    )
      throw new Error("Backup manifest contains an invalid object file");
    seen.add(object.file);
    const file = resolve(directory, "objects", object.file);
    if (relative(resolve(directory, "objects"), file).startsWith(`..${sep}`))
      throw new Error("Backup object path escapes its folder");
    const hash = createHash("sha256");
    let size = 0;
    for await (const chunk of createReadStream(file)) {
      size += chunk.length;
      hash.update(chunk);
    }
    if (size !== object.size || hash.digest("hex") !== object.sha256)
      throw new Error(`Backup media verification failed for ${object.file}`);
  }
  return dbPath;
}

export async function ensureEmptyBucket(client, bucket) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (
      status !== 404 &&
      error?.name !== "NotFound" &&
      error?.name !== "NoSuchBucket"
    )
      throw error;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  const page = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }),
  );
  if ((page.Contents ?? []).length > 0)
    throw new Error(
      `Target bucket ${bucket} already contains media; restore never overwrites objects`,
    );
}

export function prepareEmptyDatabase(database, username) {
  const exists = query(
    "postgres",
    username,
    `SELECT 1 FROM pg_database WHERE datname = '${database}'`,
  );
  if (!exists)
    runDocker([
      "exec",
      "studio_os_postgres",
      "createdb",
      "-U",
      username,
      "--encoding=UTF8",
      database,
    ]);
  const relations = query(
    database,
    username,
    "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND c.relkind IN ('r','p','v','m','S','f')",
  );
  if (relations !== "0")
    throw new Error(
      `Target database ${database} is not empty; restore never drops or overwrites existing database objects`,
    );
}

export async function restoreStorage(client, bucket, directory, objects) {
  for (const object of objects) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: object.key,
        Body: createReadStream(resolve(directory, "objects", object.file)),
        ContentLength: object.size,
        Metadata: { sha256: object.sha256 },
      }),
    );
    const uploaded = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: object.key }),
    );
    if (
      uploaded.ContentLength !== object.size ||
      uploaded.Metadata?.sha256 !== object.sha256
    ) {
      throw new Error(`Restored media verification failed for ${object.key}`);
    }
  }
}

export async function writeBackup({ database, bucket, output, config }) {
  validateDbName(database);
  validateBucket(bucket);
  if (!isAbsolute(output))
    throw new Error("Backup destination must be an absolute path");
  const destination = resolve(output);
  const rel = relative(root, destination);
  if (rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`))) {
    throw new Error("Backup destination must be outside the repository");
  }
  try {
    await lstat(destination);
    throw new Error("Backup destination already exists; choose a new path");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  ensurePostgresRunning(config.username);
  const staging = `${destination}.partial-${randomUUID()}`;
  await mkdir(resolve(staging, "objects"), { recursive: true, mode: 0o700 });
  await chmod(staging, 0o700);
  const dumpPath = resolve(staging, "database.dump");
  try {
    dumpDatabase(database, config.username, dumpPath);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  const client = storageClient(config);
  try {
    const objects = await backupStorage(client, bucket, staging);
    const dumpHash = createHash("sha256");
    let dumpSize = 0;
    for await (const chunk of createReadStream(dumpPath)) {
      dumpSize += chunk.length;
      dumpHash.update(chunk);
    }
    const manifest = {
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      database: {
        name: database,
        file: "database.dump",
        size: dumpSize,
        sha256: dumpHash.digest("hex"),
      },
      bucket,
      objects,
      totalMediaBytes: objects.reduce((sum, object) => sum + object.size, 0),
    };
    await writeFile(
      resolve(staging, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { mode: 0o600, flag: "wx" },
    );
    await rename(staging, destination);
    await chmod(destination, 0o700);
    return manifest;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  } finally {
    client.destroy();
  }
}

export async function restoreBackup({ backup, database, bucket, config }) {
  validateDbName(database);
  validateBucket(bucket);
  const directory = resolve(backup);
  const manifest = JSON.parse(
    await readFile(resolve(directory, "manifest.json"), "utf8"),
  );
  const dbPath = await validateBackupFiles(directory, manifest);
  ensurePostgresRunning(config.username);
  const client = storageClient(config);
  try {
    await ensureEmptyBucket(client, bucket);
    prepareEmptyDatabase(database, config.username);
    restoreDatabase(database, config.username, dbPath);
    await restoreStorage(client, bucket, directory, manifest.objects);
    return { database, bucket, objectCount: manifest.objects.length };
  } finally {
    client.destroy();
  }
}
