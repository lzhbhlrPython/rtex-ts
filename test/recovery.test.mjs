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
  const session = await Session.open({ projectRoot: root, mainFile: 'main.tex', maxPasses: 1, warmBackground: false });
  clearTimeout(session.timer);
  session.engine = { close() {}, async request() { return {op:'ok'}; } };
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
  while (!release) await new Promise(resolve => setImmediate(resolve));
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

test('a delayed live result cannot overwrite an edit-away-and-back revision', async t => {
  const { session } = await fixture(t), span = session.spans('main.tex').find(s => s.kind === 'paragraph');
  session.contexts.set(span.id, { file: 'main.tex', span, unit: { context: {}, placements: [] }, rows: [], verified: true, revision: 0 });
  const releases = [], events = [];
  session.subscribe(event => events.push(event));
  session.engine = { close() {}, request(command) { if (command.op === 'context') return Promise.resolve({op:'ok'}); return new Promise(resolve => releases.push(() => resolve({op:'result', status:'ok', dl:drawing}))); } };
  const base = session.documentText('main.tex');
  session.setDocument('main.tex',base.replace('Hello','Hallo'));
  await new Promise(resolve => setImmediate(resolve));
  session.setDocument('main.tex',base.replace('Hello','Other'));
  session.setDocument('main.tex',base.replace('Hello','Hallo'));
  releases.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(events.filter(e=>e.event==='ParagraphUpdate'&&e.status==='ok').length,0);
  releases.shift()(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events.filter(e=>e.event==='ParagraphUpdate'&&e.status==='ok').map(e=>e.versions.source_revision),[3]);
});

test('closing inside a Starting event cannot start a new owned process', async t => {
  const { session } = await fixture(t); session.engine = undefined; session.preambleHash = '';
  session.processes.run = async (_exe,args) => artifacts(args);
  session.processes.spawn = () => { throw new Error('Process spawned after close'); };
  const failures=[];
  session.subscribe(event=>{if(event.event==='EngineState'&&event.state==='Starting')session.close();if(event.event==='EngineState'&&event.state==='Failed')failures.push(event.reason);});
  await session.background(); assert.deepEqual(failures,[]); assert.deepEqual(session.processIds(),[]);
});
test('a leaking old-source probe closes the engine before any new-source compile',async t=>{
 const {session}=await fixture(t),span=session.spans('main.tex').find(s=>s.kind==='paragraph');let closes=0,compiles=0;const events=[];
 session.contexts.set(span.id,{file:'main.tex',span,unit:{context:{},placements:[]},rows:[],verified:false,revision:0});session.engine={close(){closes++;},async request(command){if(command.op==='compile'){compiles++;return{op:'result',status:'ok',leaks:['counter'],dl:drawing};}return{op:'ok'};}};session.subscribe(e=>events.push(e));
 session.setDocument('main.tex',session.documentText('main.tex').replace('Hello','Hallo'));await new Promise(r=>setImmediate(r));assert.equal(compiles,1);assert.equal(closes,1);assert.ok(events.some(e=>e.event==='EngineState'&&e.state==='Restarting'));assert.ok(!events.some(e=>e.event==='ParagraphUpdate'&&e.status==='ok'));
});
test('closing while an asynchronous snapshot is pending never spawns TeX',async t=>{
 const {session}=await fixture(t);session.engine=undefined;let release;const snapshot=session.snapshot.bind(session);session.snapshot=async(...args)=>{await new Promise(r=>release=r);return snapshot(...args);};let runs=0;session.processes.run=async()=>{runs++;return{code:0,log:''};};const pending=session.background();session.close();release();await pending;assert.equal(runs,0);assert.deepEqual(session.processIds(),[]);
});

test('optional picture-cache failure disables reuse and still installs an ordinary valid layout',async t=>{
 const {session}=await fixture(t),events=[];session.subscribe(e=>events.push(e));session.pictures={async manifest(){throw Error('simulated cache I/O failure');}};session.processes.run=async(_exe,args)=>artifacts(args);await session.background();assert.equal(session.versions().layout_version,1);assert.equal(session.stats().pictureCache,null);assert.ok(events.some(e=>e.event==='Diagnostics'&&e.source==='picture-cache'));
});
test('a final cached-picture boundary mismatch cannot install an incorrect layout',async t=>{
 const {session}=await fixture(t);session.files.get('main.tex').text='\\documentclass{article}\n\\begin{document}\n\\begin{tikzpicture}\n\\draw (0,0)--(1,1);\n\\end{tikzpicture}\n\\end{document}';let quarantined=false;session.pictures={async manifest(){},async absorb(_pics,_recorded,mismatches){quarantined=mismatches.includes('main.tex:3');},stats(){return{entries:0,manifestHits:0};}};session.processes.run=async(_exe,args)=>{const result=artifacts(args),output=args.find(a=>a.startsWith('--output-directory=')).slice('--output-directory='.length);fs.writeFileSync(path.join(output,'main.rtex.json'),JSON.stringify({pages:1,units:[],paragraphs:[],counters:[],pic_mismatch:['main.tex:3']}));return result;};await session.background();assert.equal(quarantined,true);assert.equal(session.versions().layout_version,0);
});
test('a failed cached TeX pass retries without cached pictures instead of repeating the failure',async t=>{
 const {session}=await fixture(t);session.config.maxPasses=2;let runs=0;session.pictures={async manifest(){},stats(){return{entries:1,manifestHits:1};}};session.processes.run=async(_exe,args)=>artifacts(args,{code:runs++===0?1:0});await session.background();assert.equal(runs,2);assert.equal(session.stats().pictureCache,null);assert.equal(session.versions().layout_version,1);
});
