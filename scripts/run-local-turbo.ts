#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageJsonLike {
  readonly version?: string;
}

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const turboPackageJsonPath = join(repoRoot, "node_modules", "turbo", "package.json");
const turboBinPath = join(repoRoot, "node_modules", "turbo", "bin", "turbo");

if (!existsSync(turboPackageJsonPath) || !existsSync(turboBinPath)) {
  console.error("Local `turbo` is not installed in this repository. Run `bun install` first.");
  process.exit(1);
}

const turboPackageJson = JSON.parse(readFileSync(turboPackageJsonPath, "utf8")) as PackageJsonLike;

const result = spawnSync(process.execPath, [turboBinPath, ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    TURBO_DOWNLOAD_LOCAL_ENABLED: process.env.TURBO_DOWNLOAD_LOCAL_ENABLED ?? "true",
  },
});

if (result.error) {
  console.error(
    `Failed to launch local turbo${turboPackageJson.version ? ` ${turboPackageJson.version}` : ""}:`,
  );
  console.error(result.error.message);
  process.exit(1);
}

if (result.status === null) {
  console.error("Local turbo exited without a status code.");
  process.exit(1);
}

process.exit(result.status);
