/** One-shot preloaded background engine, adapted from realtime-tex WarmEngine (MIT). */
import type { ChildProcess } from 'node:child_process';
import { killTree, Processes } from './process.js';
export class BackgroundEngine {
  private child: ChildProcess;
  private log = '';
  private failure?: Error;
  private preloaded = false;
  private done: Promise<{ code: number; log: string }>;
  constructor(processes: Processes, executable: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
    this.child = processes.spawn(executable, args, cwd, env);
    const append = (chunk: Buffer) => { this.log = (this.log + chunk.toString('utf8')).slice(-65536); if (this.log.includes('RTEX_BG_READY')) this.preloaded = true; };
    this.child.stdout!.on('data', append); this.child.stderr!.on('data', append);
    this.child.stdin!.on('error', error => { this.failure = error; });
    this.done = new Promise((resolve, reject) => {
      this.child.once('error', reject);
      this.child.once('close', code => resolve({ code: code ?? 1, log: this.log }));
    });
    // Standbys can fail before a consumer asks for them; retain the failure without an unhandled rejection.
    void this.done.catch(error => { this.failure = error; });
  }
  alive(): boolean { return !this.failure && this.child.exitCode === null && this.child.signalCode === null; }
  ready(): boolean { return this.preloaded && this.alive(); }
  async run(timeout: number): Promise<{ code: number; log: string }> {
    if (this.failure) throw this.failure;
    const timer = setTimeout(() => killTree(this.child), timeout);
    try { this.child.stdin!.end('GO\n'); return await this.done; }
    finally { clearTimeout(timer); }
  }
  close(): void { killTree(this.child); this.child.stdin?.end(); }
}
