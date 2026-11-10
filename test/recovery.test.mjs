import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Session, splitPreamble } from '../dist/index.js';
import { jsonLines } from '../dist/json-lines.js';

async function fixture(t) {
  const root = fs.mkdtempSync(path.join((process.env.RUNNER_TEMP || os.tmpdir()), 'rtex-recovery-'));
  const source = '\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n';
  fs.writeFileSync(path.join(root, 'main.tex'), source);
  const session = await Session.open({ projectRoot: root, mainFile: 'main.tex', maxPasses: 1 });
  clearTimeout(session.timer);
  session.engine = { close() {} };
  session.preambleHash = createHash('sha256').update(splitPreamble(source).preamble).digest('hex');
  t.after(() => { session.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { root, session };
}
const drawing = { kind: 'page', unit: 'sp', width: 0, height: 0, depth: 0, page: 1, page_width: 0, page_height: 0, origin: [0, 0], fonts: {}, flags: {}, images_info: {}, lines: [], other: [], glyphs: 0, inserts: 0 };
function artifacts(args, { pdf = true, code = 0, malformed = false } = {}) {
  const output = args.find(arg => arg.startsWith('--output-directory=')).slice('--output-directory='.length);
  fs.writeFileSync(path.join(output, 'main.rtex.json'), JSON.stringify({ pages: 1, units: malformed ? null : [], paragraphs: [], counters: [] }));
  fs.writeFileSync(path.join(output, 'main.rtex-page1.json'), JSON.stringify(drawing));
  if (pdf) fs.writeFileSync(path.join(output, 'main.pdf'), '%PDF-test');
  return { code, log: code ? '! source error' : '' };
}

test('failed layout artifact installation does not advance hashes, contexts or versions', async t => {
  const { session } = await fixture(t);
  const events = []; session.subscribe(event => events.push(event));
  session.processes.run = async (_exe, args) => artifacts(args, { pdf: false });
  await session.background();
  assert.equal(session.versions().layout_version, 0);
  assert.equal(session.versions().context_revision, 0);
  session.processes.run = async (_exe, args) => artifacts(args);
  await session.background();
  const first = events.find(event => event.event === 'LayoutUpdate');
  assert.equal(first.pages_changed.length, 1);
  assert.equal(first.versions.layout_version, 1);
  const pdf = fs.readFileSync(first.pdf_path);
  for (const options of [{ code: 1 }, { malformed: true }]) {
    session.processes.run = async (_exe, args) => artifacts(args, options);
    await session.background();
    assert.equal(session.versions().layout_version, 1);
    assert.deepEqual(fs.readFileSync(first.pdf_path), pdf);
  }
  assert.equal(events.filter(event => event.event === 'LayoutUpdate').length, 1);
});

test('export scratch data is removed on success and failure; only one export runs', async t => {
  const { root, session } = await fixture(t);
  let release;
  session.processes.run = async (_exe, args) => { await new Promise(resolve => { release = resolve; }); return artifacts(args); };
  const out = path.join(root, 'final.pdf');
  const pending = session.exportPdf(out);
  await assert.rejects(session.exportPdf(out), /already running/);
  release(); await pending;
  assert.ok(fs.existsSync(out));
  assert.equal(fs.readdirSync(session.buildDir).some(name => name.startsWith('export-')), false);
  session.processes.run = async () => { throw new Error('simulated crash'); };
  await assert.rejects(session.exportPdf(out), /simulated crash/);
  assert.equal(fs.readdirSync(session.buildDir).some(name => name.startsWith('export-')), false);
  assert.ok(fs.existsSync(out));
});

test('JSON-lines bounds UTF-8 bytes before newline and preserves split characters/CRLF', async () => {
  async function* chunks() { const bytes = Buffer.from('你好\r\n{}\nlast'); for (const byte of bytes) yield Buffer.from([byte]); }
  assert.deepEqual(await Array.fromAsync(jsonLines(chunks(), 8)), ['你好', '{}', 'last']);
  async function* tooLarge() { yield Buffer.from('中文中文'); }
  await assert.rejects(async () => { for await (const _ of jsonLines(tooLarge(), 8)) {} }, /too large/);
  let pulls = 0;
  async function* backpressure() { for (let i = 0; i < 100; i++) { pulls++; yield Buffer.from('{}\n'); } }
  const iterator = jsonLines(backpressure()); await iterator.next();
  assert.equal(pulls, 1); await iterator.return();
});
