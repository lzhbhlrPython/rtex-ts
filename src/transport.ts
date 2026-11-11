/** Framed response pipes, adapted from upstream transport.rs without native modules. */
import { constants, openSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
import path from 'node:path';

const MAX_FRAME = 32 * 1024 * 1024;
/** Accumulates each byte once, including frames split across arbitrary stream chunks. */
export class FrameDecoder {
  private header = Buffer.alloc(4); private headerBytes = 0;
  private body?: Buffer; private bodyBytes = 0;
  push(chunk: Buffer, accept: (frame: Buffer) => void): void {
    let offset = 0;
    while (offset < chunk.length) {
      if (!this.body) {
        const n = Math.min(4 - this.headerBytes, chunk.length - offset);
        chunk.copy(this.header, this.headerBytes, offset, offset + n); this.headerBytes += n; offset += n;
        if (this.headerBytes < 4) continue;
        const length = this.header.readUInt32LE();
        if (length < 1 || length > MAX_FRAME) throw new Error('Invalid engine response frame');
        this.body = Buffer.allocUnsafe(length); this.bodyBytes = 0; this.headerBytes = 0;
      }
      const n = Math.min(this.body.length - this.bodyBytes, chunk.length - offset);
      chunk.copy(this.body, this.bodyBytes, offset, offset + n); this.bodyBytes += n; offset += n;
      if (this.bodyBytes === this.body.length) { const body = this.body; this.body = undefined; accept(body); }
    }
  }
}
export class ResponseChannel {
  address = '';
  private stream?: net.Socket; private server?: net.Server;
  private frames: Buffer[] = []; private failure?: Error;
  private pending?: { resolve: (frame: Buffer) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
  async open(work: string): Promise<void> {
    if (process.platform === 'win32') {
      this.address = '\\\\.\\pipe\\rtex-' + randomUUID();
      this.server = net.createServer(stream => {
        if (this.stream || this.failure) { stream.destroy(); return; }
        this.attach(stream); this.server?.close();
      });
      this.server.on('error', error => this.fail(error));
      await new Promise<void>((resolve, reject) => { this.server!.once('error', reject); this.server!.listen(this.address, () => { this.server!.off('error', reject); resolve(); }); });
    } else {
      this.address = path.join(work, 'response.fifo');
      execFileSync('mkfifo', ['-m', '600', this.address], { cwd: work });
      // O_RDWR prevents startup EOF before TeX opens its writer; nonblocking lets libuv
      // drain the FIFO without a blocked filesystem thread or polling timer.
      const fd = openSync(this.address, constants.O_RDWR | constants.O_NONBLOCK);
      try { this.attach(new net.Socket({ fd, readable: true, writable: true })); }
      catch (error) { closeSync(fd); throw error; }
    }
  }
  private attach(stream: net.Socket): void {
    this.stream = stream; const decoder = new FrameDecoder();
    stream.on('data', chunk => {
      try { decoder.push(chunk, frame => {
        if (this.failure) return;
        if (this.pending) { const pending = this.pending; this.pending = undefined; clearTimeout(pending.timer); pending.resolve(frame); }
        else { if (this.frames.length >= 2) throw new Error('Unexpected engine response backlog'); this.frames.push(frame); }
      }); } catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    });
    stream.on('error', error => this.fail(error));
    stream.on('end', () => this.fail(new Error('Engine response pipe closed')));
  }
  read(timeout: number): Promise<Buffer> {
    if (this.failure) return Promise.reject(this.failure);
    const frame = this.frames.shift(); if (frame) return Promise.resolve(frame);
    if (this.pending) return Promise.reject(new Error('Concurrent response reads'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error('Live engine response timed out')), timeout);
      this.pending = { resolve, reject, timer };
    });
  }
  fail(error: Error): void {
    if (this.failure) return; this.failure = error;
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending = undefined; }
    this.frames = []; this.stream?.destroy(); this.server?.close();
  }
  close(): void { this.fail(new Error('Live engine is closed')); }
}
