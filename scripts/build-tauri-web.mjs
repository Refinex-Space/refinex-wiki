import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiDir = resolve(rootDir, "app/api");
const nextDir = resolve(rootDir, ".next");
const tempDir = resolve(rootDir, ".tauri-build/app-api");

let movedApiDir = false;

try {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { force: true, recursive: true });
  }

  if (existsSync(nextDir)) {
    rmSync(nextDir, { force: true, recursive: true });
  }

  if (existsSync(apiDir)) {
    mkdirSync(dirname(tempDir), { recursive: true });
    renameSync(apiDir, tempDir);
    movedApiDir = true;
  }

  const command = process.platform === "win32" ? "cmd.exe" : "npm";
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npm run build"]
      : ["run", "build"];
  const result = spawnSync(command, args, {
    cwd: rootDir,
    env: {
      ...process.env,
      NEXT_OUTPUT: "export",
    },
    stdio: "inherit",
  });

  process.exitCode = result.status ?? 1;
} finally {
  if (movedApiDir && existsSync(tempDir) && !existsSync(apiDir)) {
    renameSync(tempDir, apiDir);
  }
}
