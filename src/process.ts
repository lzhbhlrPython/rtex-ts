import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const SUPPORT_DIR = fileURLToPath(new URL('../vendor/realtime-tex/tex/', import.meta.url));
export function inside(root: string, file: string): boolean { const relative = path.relative(root, file); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); }
export function sourcePath(root: string, file: string): string {
  const real = realpathSync.native(path.resolve(root, file));
  if (!inside(root, real) || !/\.(tex|ltx)$/i.test(real) || !statSync(real).isFile()) throw new Error('Source must be a TeX file inside project');
  return real;
}
export function texPath(file: string): string { if (/[\r\n%#{}~"]/u.test(file)) throw new Error('Path contains unsupported TeX characters'); return file.replaceAll('\\', '/'); }
export function findLuaLaTeX(requested?: string): string {
  if (requested) return requested;
  if (process.env.RTEX_TEXLIVE_BIN) return path.join(process.env.RTEX_TEXLIVE_BIN, process.platform === 'win32' ? 'lualatex.exe' : 'lualatex');
  for (const candidate of ['/Library/TeX/texbin/lualatex', '/usr/local/bin/lualatex', '/usr/bin/lualatex']) if (existsSync(candidate)) return candidate;
  return process.platform === 'win32' ? 'lualatex.exe' : 'lualatex';
}
export function environment(root: string, mainFile: string, cache: string): NodeJS.ProcessEnv {
  mkdirSync(cache, { recursive: true });
  const sep = process.platform === 'win32' ? ';' : ':';
  return { ...process.env, RTEX_REQ: '', RTEX_PROJECT_DIR: texPath(root), RTEX_MAIN_DIR: path.dirname(mainFile) === '.' ? undefined : texPath(path.dirname(mainFile)), TEXMFCACHE: cache,
    TEXINPUTS: `${texPath(path.join(SUPPORT_DIR, 'latex'))}//${sep}${process.env.TEXINPUTS || ''}`,
    LUAINPUTS: `${texPath(SUPPORT_DIR)}//${sep}${process.env.LUAINPUTS || ''}`,
    openout_any: 'a', MIKTEX_ALLOWUNSAFEOUTPUTFILES: '1', max_print_line: '10000' };
}
// Derived from realtime-tex texlive.rs INPUT_PATH_HOOK; preserve subfolder lookup.
export const INPUT_PATH_HOOK = String.raw`\directlua{local d=os.getenv("RTEX_PROJECT_DIR") local m=os.getenv("RTEX_MAIN_DIR") local p="" if m then p="{"..m.."/}" if d then p=p.."{"..d.."/"..m.."/}" end end if d then p=p.."{"..d.."/}" end if p=="" then else token.set_macro("input@path",p) end}`;
export function killTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); killer.on('error', () => { child.kill(); });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already exited */ }
    setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* exited */ } }, 300).unref();
  }
}
export class Processes {
  readonly children = new Set<ChildProcess>();
  spawn(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): ChildProcess {
    const child = spawn(executable, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
    this.children.add(child); child.once('close', () => this.children.delete(child));
    return child;
  }
  run(executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, timeout: number): Promise<{ code: number; log: string }> {
    return new Promise((resolve, reject) => {
      const child = this.spawn(executable, args, cwd, env); let log = '', timedOut = false;
      const append = (chunk: Buffer) => { log = (log + chunk.toString('utf8')).slice(-65536); };
      child.stdout!.on('data', append); child.stderr!.on('data', append); child.stdin!.end();
      const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeout);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('close', (code, signal) => { clearTimeout(timer); if (timedOut || signal) reject(new Error(`Process interrupted (${timedOut ? 'timeout' : signal})`)); else resolve({ code: code ?? 1, log }); });
    });
  }
  close(): void { for (const child of this.children) killTree(child); }
}
