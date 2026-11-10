#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { Session } from './session.js';
import { Processes, findLuaLaTeX, SUPPORT_DIR } from './process.js';

const args = process.argv.slice(2), command = args.shift();
const option = (name: string): string | undefined => { const index = args.indexOf('--' + name); if (index < 0) return undefined; const value = args[index + 1]; if (!value || value.startsWith('--')) throw new Error('Missing --' + name); return value; };
async function main(): Promise<void> {
  if (command === '--version' || command === 'version') { process.stdout.write('rtex-ts 0.1.0\n'); return; }
  if (command === 'doctor') {
    const executable = findLuaLaTeX(option('lualatex'));
    if (!existsSync(path.join(SUPPORT_DIR, 'rtex-serve.lua'))) throw new Error('Lua/TeX support files missing');
    const result = await new Processes().run(executable, ['--version'], process.cwd(), process.env, 10000);
    if (result.code) throw new Error(result.log);
    process.stdout.write(`rtex-ts 0.1.0\nsupport files: ${SUPPORT_DIR}\n${result.log.split('\n')[0]}\n`); return;
  }
  if (command !== 'serve') {
    process.stdout.write('rtex-ts 0.1.0\nUsage: rtex-ts doctor [--lualatex PATH]\n       rtex-ts serve --project DIR --main main.tex [--build DIR] [--lualatex PATH]\n\nJSON-lines on stdin/stdout. See docs/embedding.md.\n');
    if (command && !['--help', '-h'].includes(command)) process.exitCode = 1;
    return;
  }
  const root = option('project'); if (!root) throw new Error('--project is required');
  const session = await Session.open({ projectRoot: root, mainFile: option('main') || 'main.tex', buildDir: option('build'), lualatex: option('lualatex') });
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let queued = 0, output = Promise.resolve(), input = Promise.resolve(), closed = false;
  const close = () => { if (closed) return; closed = true; session.close(); lines.close(); process.stdin.destroy(); };
  const send = (value: unknown) => {
    const line = JSON.stringify(value) + '\n'; queued += Buffer.byteLength(line);
    if (queued > 64 * 1024 * 1024) { close(); process.stderr.write('Host is not draining output\n'); process.exitCode = 1; return; }
    output = output.then(() => new Promise<void>((resolve, reject) => process.stdout.write(line, error => { queued -= Buffer.byteLength(line); error ? reject(error) : resolve(); }))).catch(error => { close(); process.stderr.write(String(error) + '\n'); });
  };
  session.on('event', send);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, close);
  process.stdout.once('error', close);
  lines.on('line', line => {
    if (line.length > 8 * 1024 * 1024) { send({ reply: 'error', message: 'Request too large' }); close(); return; }
    input = input.then(async () => {
      if (closed || !line.trim()) return;
      let request: Record<string, unknown>;
      try {
        request = JSON.parse(line);
        if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('Expected JSON object');
        const id = request.id;
        const file = typeof request.path === 'string' ? request.path : session.mainFile;
        switch (request.cmd) {
          case 'set_document': if (typeof request.text !== 'string') throw new Error('text must be a string'); send({ reply: 'set_document', id, result: session.setDocument(file, request.text) }); break;
          case 'edit': if (typeof request.text !== 'string' || typeof request.start !== 'number' || typeof request.end !== 'number') throw new Error('Invalid edit'); send({ reply: 'edit', id, result: session.applyEdit(file, { start: request.start, end: request.end, text: request.text }) }); break;
          case 'spans': send({ reply: 'spans', id, spans: session.spans(file) }); break;
          case 'status': send({ reply: 'status', id, ...session.status() }); break;
          case 'request_layout': session.requestLayout(); send({ reply: 'request_layout', id }); break;
          case 'export_pdf': if (typeof request.out !== 'string') throw new Error('out must be a string'); send({ reply: 'export_pdf', id, ...await session.exportPdf(request.out) }); break;
          case 'quit': send({ reply: 'quit', id }); await output; close(); break;
          default: throw new Error('Unknown command');
        }
      } catch (error) { send({ reply: 'error', message: String(error) }); }
    });
  });
  lines.once('close', () => { void input.finally(close); });
}
main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
