import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const configHome = path.resolve(scriptDir, "../.config");

const command = process.platform === "win32" ? "astro.cmd" : "astro";
const result = spawnSync(command, ["check"], {
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
