// Persistent LuaLaTeX driver/context handling derived from realtime-tex engine.rs.
// JSON requests use stdin; framed replies use a FIFO or a Windows named pipe.
import { writeFileSync, existsSync, copyFileSync, mkdirSync, rm } from 'node:fs';
import path from 'node:path';
import { ResponseChannel } from './transport.js';
import type { ChildProcess } from 'node:child_process';
import { decodeDisplayList } from './display-list.js';
import type { DisplayList } from './types.js';
import { INPUT_PATH_HOOK, Processes, texPath, killTree } from './process.js';
export interface EngineReply { op: string; req?: number; status?: string; reason?: string; errors?: Array<{ message?: string }>; leaks?: string[]; dl?: DisplayList; images?: DisplayList['images_info']; t_tex_us?: number; t_traverse_us?: number; [key: string]: unknown }
export class LiveEngine {
  private child?: ChildProcess;
  private channel = new ResponseChannel();
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
    writeFileSync(driver, text); await this.channel.open(this.work);
    this.child = this.processes.spawn(this.executable, ['-interaction=batchmode', '--output-directory=' + texPath(this.work), texPath(driver)], this.cwd, { ...this.env, RTEX_RESP: this.channel.address });
    const append = (chunk: Buffer) => { this.log = (this.log + chunk.toString('utf8')).slice(-4096); };
    this.child.stdout!.on('data', append); this.child.stderr!.on('data', append);
    this.child.once('error', error => { this.failure = error; this.channel.fail(error); });
    this.child.once('exit', () => { if (!this.closed) { this.failure = new Error('LuaLaTeX live process exited: ' + this.log); this.channel.fail(this.failure); } });
    this.child.stdin!.on('error', error => { this.failure = error; this.channel.fail(error); });
    const reply = await this.readReply(Math.max(this.timeout, 60000));
    if (reply.op !== 'ready') throw new Error('Live engine did not become ready');
  }
  private async readReply(timeout: number): Promise<EngineReply> {
    const body = await this.channel.read(timeout);
    if (body[0] === 0) return JSON.parse(body.subarray(1).toString('utf8'));
    if (body[0] !== 1 || body.length < 5) throw new Error('Invalid engine response kind');
    const jsonLength = body.readUInt32LE(1);
    if (jsonLength > body.length - 5) throw new Error('Invalid engine response JSON length');
    const reply: EngineReply = JSON.parse(body.subarray(5, 5 + jsonLength).toString('utf8'));
    const drawing = body.subarray(5 + jsonLength);
    if (drawing.length) { reply.dl = decodeDisplayList(drawing); if (reply.images) reply.dl.images_info = reply.images; }
    return reply;
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
  close(): void {
    if (this.closed) return;
    this.closed = true; this.channel.close();
    const cleanup = () => rm(this.work, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }, () => {});
    if (this.child) {
      if (this.child.exitCode !== null || this.child.signalCode !== null) cleanup();
      else this.child.once('close', cleanup);
      this.child.stdin?.end(); killTree(this.child);
    } else cleanup();
  }
}
