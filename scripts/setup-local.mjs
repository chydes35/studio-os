#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
if (
  args.some((arg) => !["--prepare", "--check", "--start"].includes(arg)) ||
  args.length > 1
) {
  throw new Error(
    "Usage: node scripts/setup-local.mjs [--prepare|--check|--start]",
  );
}
if (Number(process.versions.node.split(".")[0]) < 24)
  throw new Error("Node 24 or newer is required");
const checkOnly = args.includes("--check");
const envPath = resolve(root, ".env");
if (!existsSync(envPath)) {
  if (checkOnly) throw new Error("Missing .env. Run npm run setup:local first");
  const template = readFileSync(resolve(root, ".env.example"), "utf8");
  writeFileSync(
    envPath,
    template.replace(
      "generate-with-openssl-rand-base64-32",
      randomBytes(32).toString("base64"),
    ),
    { flag: "wx", mode: 0o600 },
  );
  console.log("Created .env with a random auth secret");
}
const config = { ...parseEnv(readFileSync(envPath, "utf8")), ...process.env };
const minimumSecretLength = config.NODE_ENV === "production" ? 32 : 16;
config.CORS_ORIGINS ??= config.WEB_APP_URL;
if (
  !config.AUTH_SECRET ||
  config.AUTH_SECRET.length < minimumSecretLength ||
  config.AUTH_SECRET === "generate-with-openssl-rand-base64-32"
) {
  throw new Error(
    `Set AUTH_SECRET in .env to a unique random value of at least ${minimumSecretLength} characters`,
  );
}
const database = new URL(config.DATABASE_URL);
if (
  !["postgres:", "postgresql:"].includes(database.protocol) ||
  !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
  !database.pathname.slice(1)
) {
  throw new Error(
    "This local setup script requires a local Postgres DATABASE_URL; deploy remote databases separately",
  );
}
for (const key of [
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
  "WEB_APP_URL",
  "NEXT_PUBLIC_API_URL",
  "CORS_ORIGINS",
]) {
  if (!config[key]) throw new Error(`Missing ${key} in .env`);
}
for (const origin of config.CORS_ORIGINS.split(",").map((value) =>
  value.trim(),
)) {
  const url = new URL(origin);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
    throw new Error("CORS_ORIGINS must contain HTTP(S) origins without paths");
}
if (!config.R2_ENDPOINT && !config.R2_ACCOUNT_ID)
  throw new Error("Configure R2_ACCOUNT_ID or a local R2_ENDPOINT");
if (
  config.R2_ENDPOINT &&
  !["localhost", "127.0.0.1", "[::1]"].includes(
    new URL(config.R2_ENDPOINT).hostname,
  )
) {
  throw new Error(
    "Local R2_ENDPOINT must point to the local storage container; use R2_ACCOUNT_ID for Cloudflare R2",
  );
}
for (const workspacePath of [
  "packages/db/.env",
  "apps/api/.env",
  "apps/web/.env.local",
  "apps/mobile/.env",
]) {
  const destination = resolve(root, workspacePath);
  let present = false;
  try {
    lstatSync(destination);
    present = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (present) {
    if (realpathSync(destination) !== realpathSync(envPath))
      throw new Error(
        `${workspacePath} already has independent configuration; preserve it and link it to the root .env before continuing`,
      );
  } else if (checkOnly) {
    throw new Error(`Missing ${workspacePath}; run npm run setup:local`);
  } else {
    symlinkSync(relative(dirname(destination), envPath), destination);
  }
}
console.log(
  "Local environment and workspace links are valid; existing .env was preserved",
);
if (checkOnly || args.includes("--prepare")) process.exit(0);

function run(command, parameters) {
  const result = spawnSync(command, parameters, {
    cwd: root,
    env: config,
    stdio: "inherit",
    encoding: "utf8",
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `${command} ${parameters[0] ?? ""} failed; review the command output`,
    );
  return result.stdout?.trim();
}
if (
  !existsSync(resolve(root, "node_modules/.bin/prisma")) ||
  !existsSync(resolve(root, "node_modules/.bin/turbo"))
) {
  throw new Error(
    "Dependencies are missing. Install npm 11.19.1, then run npm ci and rerun setup:local",
  );
}
if (spawnSync("docker", ["info"], { stdio: "ignore" }).status !== 0)
  throw new Error(
    "Docker is unavailable. Start Colima (colima start) or Docker, then rerun setup:local",
  );
for (const container of [
  "studio_os_postgres",
  ...(config.R2_ENDPOINT ? ["studio_os_minio"] : []),
]) {
  const result = spawnSync(
    "docker",
    ["inspect", "--format", "{{.State.Running}}", container],
    { encoding: "utf8" },
  );
  if (result.status !== 0)
    throw new Error(
      `${container} is missing. Follow README local-service setup; existing images and volumes must be preserved`,
    );
  if (result.stdout.trim() !== "true") run("docker", ["start", container]);
}
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  if (
    spawnSync(
      "docker",
      ["exec", "studio_os_postgres", "pg_isready", "-U", "studio_os"],
      { stdio: "ignore" },
    ).status === 0
  ) {
    ready = true;
    break;
  }
  await delay(1000);
}
if (!ready) throw new Error("Local Postgres did not become ready");
if (config.R2_ENDPOINT) {
  const response = await fetch(
    `${config.R2_ENDPOINT.replace(/\/$/, "")}/minio/health/live`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error("Local media storage is not ready");
}
run("npm", ["run", "generate", "--workspace=@repo/db"]);
run("npm", ["run", "migrate:deploy", "--workspace=@repo/db"]);
console.log("Local setup complete. No seed or database reset was run");
if (args.includes("--start")) {
  // The same environment is inherited by both clients and the API.
  run("npm", ["run", "dev"]);
}
