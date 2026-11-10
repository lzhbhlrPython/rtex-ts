// Persistent LuaLaTeX driver/context handling derived from realtime-tex engine.rs.
// The Node port uses JSON requests on stdin and a bounded binary response file on every OS.
import { readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync, copyFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { decodeDisplayList } from './display-list.js';
import type { DisplayList } from './types.js';
import { INPUT_PATH_HOOK, Processes, texPath, killTree } from './process.js';
export interface EngineReply { op: string; req?: number; status?: string; reason?: string; errors?: Array<{ message?: string }>; leaks?: string[]; dl?: DisplayList; images?: DisplayList['images_info']; t_tex_us?: number; t_traverse_us?: number; [key: string]: unknown }
export class LiveEngine {
  private child?: ChildProcess;
  private offset = 0;
  private buffer = Buffer.alloc(0);
  private response = '';
  private log = '';
  private serial: Promise<unknown> = Promise.resolve();
  private closed = false;
  private failure?: Error;
  constructor(private processes: Processes, private executable: string, private cwd: string, private work: string, private env: NodeJS.ProcessEnv, private timeout = 5000) {}
  async start(preamble: string, aux?: string): Promise<void> {
    mkdirSync(this.work, { recursive: true });
    const preambleFile = path.join(this.work, 'rtex-preamble.tex'), driver = path.join(this.work, 'rtex-live.tex');
    writeFileSync(preambleFile, preamble);
    if (aux) for (const ext of ['aux', 'bbl']) { const from = aux.replace(/\.aux$/, '.' + ext); if (existsSync(from)) copyFileSync(from, path.join(this.work, 'rtex-live.' + ext)); }
    const text = `${INPUT_PATH_HOOK}\n\\input{${texPath(preambleFile)}}\n` + String.raw`\newbox\rtexbox\newcount\rtexcontinue\rtexcontinue=1 \edef\rtexcountnum{\number\allocationnumber}\newcatcodetable\rtexcct{\makeatletter\savecatcodetable\rtexcct}
\begin{document}
\input{rtex-serve-patches}
\directlua{rtex_serve=dofile(kpse.find_file("rtex-serve.lua","lua")) rtex_serve.init(\number\rtexbox,\rtexcountnum,\number\rtexcct)}
\makeatletter\IfPackageLoadedTF{graphicx}{\AddToHook{cmd/Gin@setfile/after}{\directlua{rtex_serve.image(\number\lastsavedimageresourceindex,"\luaescapestring{\Gin@base\Gin@ext}","\luaescapestring{\Gin@page}",\number\lastsavedimageresourcepages)}}}{}\makeatother
\loop\rtexstep\ifnum\rtexcontinue>0 \repeat
\end{document}
`;
    writeFileSync(driver, text); this.response = path.join(this.work, 'response.bin'); writeFileSync(this.response, '');
    this.child = this.processes.spawn(this.executable, ['-interaction=batchmode', '--output-directory=' + texPath(this.work), texPath(driver)], this.cwd, { ...this.env, RTEX_RESP: this.response });
    const append = (chunk: Buffer) => { this.log = (this.log + chunk.toString('utf8')).slice(-4096); };
    this.child.stdout!.on('data', append); this.child.stderr!.on('data', append);
    this.child.once('error', error => { this.failure = error; });
    this.child.once('exit', () => { if (!this.closed) this.failure = new Error('LuaLaTeX live process exited: ' + this.log); });
    this.child.stdin!.on('error', error => { this.failure = error; });
    const reply = await this.readReply(Math.max(this.timeout, 60000));
    if (reply.op !== 'ready') throw new Error('Live engine did not become ready');
  }
  private async readReply(timeout: number): Promise<EngineReply> {
    const deadline = Date.now() + timeout;
    while (!this.closed) {
      if (this.failure) throw this.failure;
      if (this.buffer.length >= 4) {
        const length = this.buffer.readUInt32LE(0);
        if (length < 1 || length > 32 * 1024 * 1024) throw new Error('Invalid engine response frame');
        if (this.buffer.length >= length + 4) {
          const body = this.buffer.subarray(4, length + 4); this.buffer = this.buffer.subarray(length + 4);
          if (body[0] === 0) return JSON.parse(body.subarray(1).toString('utf8'));
          if (body[0] !== 1 || body.length < 5) throw new Error('Invalid engine response kind');
          const jsonLength = body.readUInt32LE(1);
          if (jsonLength > body.length - 5) throw new Error('Invalid engine response JSON length');
          const reply: EngineReply = JSON.parse(body.subarray(5, 5 + jsonLength).toString('utf8'));
          const drawing = body.subarray(5 + jsonLength);
          if (drawing.length) { reply.dl = decodeDisplayList(drawing); if (reply.images) reply.dl.images_info = reply.images; }
          return reply;
        }
      }
      if (Date.now() > deadline) { this.close(); throw new Error('Live engine response timed out'); }
      if (this.offset > 64 * 1024 * 1024) throw new Error('Live response stream reached restart limit');
      const fd = openSync(this.response, 'r');
      try {
        const chunk = Buffer.allocUnsafe(65536), count = readSync(fd, chunk, 0, chunk.length, this.offset);
        if (count) { this.offset += count; this.buffer = Buffer.concat([this.buffer, chunk.subarray(0, count)]); continue; }
      } finally { closeSync(fd); }
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    throw new Error('Live engine is closed');
  }
  request(command: Record<string, unknown>): Promise<EngineReply> {
    const task = this.serial.then(async () => {
      if (this.closed || !this.child) throw new Error('Live engine is closed');
      const encoded = JSON.stringify(command);
      if (Buffer.byteLength(encoded) > 8 * 1024 * 1024) throw new Error('Engine request too large');
      await new Promise<void>((resolve, reject) => this.child!.stdin!.write(encoded + '\n', error => error ? reject(error) : resolve()));
      const reply = await this.readReply(this.timeout);
      if (['error', 'fatal'].includes(reply.op)) throw new Error(`Live engine rejected request: ${reply.reason || JSON.stringify(reply.errors)}`);
      return reply;
    });
    this.serial = task.catch(() => {}); return task;
  }
  close(): void { this.closed = true; if (this.child) { this.child.stdin?.end(); killTree(this.child); } }
}
