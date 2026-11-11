import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
// Removed source files must not leave publishable JavaScript from an older build.
rmSync(new URL('../dist/', import.meta.url), { recursive: true, force: true });
const child = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '-p', 'tsconfig.json'], { cwd: root, stdio: 'inherit' });
if (child.error) throw child.error;
process.exitCode = child.status ?? 1;
