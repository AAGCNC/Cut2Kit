import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const configHome = path.resolve(scriptDir, "../.config");
const require = createRequire(import.meta.url);
const astroPackageJson = require.resolve("astro/package.json");
const astroEntrypoint = path.join(path.dirname(astroPackageJson), "bin/astro.mjs");
const astroArgs = process.argv.slice(2);

if (astroArgs.length === 0) {
  throw new Error("Expected an Astro command, for example: build, preview, dev, or check.");
}

const result = spawnSync(process.execPath, [astroEntrypoint, ...astroArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    ASTRO_TELEMETRY_DISABLED: "1",
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME ?? configHome,
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
