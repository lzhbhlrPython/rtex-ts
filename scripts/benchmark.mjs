/** rtex-ts measurements only; no upstream benchmark numbers or paper fixtures. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { Session } from '../dist/index.js';
import { findLuaLaTeX } from '../dist/process.js';
const arg = name => { const at = process.argv.indexOf('--' + name); return at < 0 ? undefined : process.argv[at + 1]; };
const counts = (arg('pages') || '10,100,300').split(',').map(Number), samples = Number(arg('samples') || 30);
if (!counts.every(n => Number.isSafeInteger(n) && n > 0 && n <= 500) || !Number.isSafeInteger(samples) || samples < 2 || samples > 10000) throw Error('Invalid benchmark limits');
const engine = findLuaLaTeX();
const result = { schema: 1, packageVersion: JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url))).version, measuredAt: new Date().toISOString(), environment: { platform: process.platform, arch: process.arch, node: process.version, cpu: os.cpus()[0]?.model, tex: execFileSync(engine, ['--version'], {encoding:'utf8'}).split('\n')[0] }, method: 'One changed character in the first paragraph; warm persistent engine; initial probe excluded from latency samples; one host process; no viewer/IPC rendering time included. Synthetic TFM article with explicit page breaks.', results: [] };
const percentile = (values, p) => [...values].sort((a,b) => a-b)[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
const distribution = values => ({ p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: Math.max(...values) });
function wait(session, predicate, timeout = 180000) {
 return new Promise((resolve,reject) => { const timer = setTimeout(() => { off(); reject(Error('Benchmark timeout')); }, timeout); const off = session.subscribe(event => { if (event.event === 'EngineState' && event.state === 'Failed') {clearTimeout(timer);off();reject(Error(event.reason));} else if (predicate(event)) {clearTimeout(timer);off();resolve(event);} }); });
}
for (const pages of counts) {
 const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'rtex-bench-'));
 let session;
 try {
  const paragraph = 'Benchmark target a. ' + 'A paragraph uses captured context for its glyph positions and line breaks. '.repeat(6);
  let source = '\\documentclass{article}\n\\usepackage[T1]{fontenc}\n\\usepackage{lmodern}\n\\begin{document}\n' + Array.from({length: pages}, (_, i) => paragraph + '\n\n' + ('Page ' + i + '. ' + paragraph + '\n\n').repeat(3) + (i < pages - 1 ? '\\newpage\n\n' : '')).join('') + '\\end{document}\n';
  fs.writeFileSync(path.join(root,'main.tex'), source);
  const started = performance.now();
  session = await Session.open({ projectRoot:root, mainFile:'main.tex', lualatex:engine, debounceMs:60000, fastBudgetMs:10000, passTimeoutMs:180000 });
  await wait(session,event => event.event === 'EngineState' && event.state === 'Ready');
  const initialMs = performance.now() - started, total = [], synchronous = [], tex = [], traversal = [];
  let maxRss = process.memoryUsage().rss;
  for (let i = 0; i <= samples; i++) {
   const waiting = wait(session,event => event.event === 'ParagraphUpdate' && event.status === 'ok');
   const next = source.replace(/Benchmark target [ab]\./, 'Benchmark target ' + (i % 2 ? 'a' : 'b') + '.');
   const editStart = performance.now(), route = session.setDocument('main.tex', next), returned = performance.now();
   if (route.routed !== 'fast') throw Error('Benchmark did not route fast: ' + JSON.stringify(route));
   const update = await waiting;
   if (i) { total.push(performance.now() - editStart); synchronous.push(returned - editStart); tex.push(update.timing.tex_us/1000); traversal.push(update.timing.traversal_us/1000); }
   maxRss = Math.max(maxRss,process.memoryUsage().rss); source = next;
  }
  result.results.push({ pages, sourceBytes:Buffer.byteLength(source), samples, initialMs, editToEventMs:distribution(total), setDocumentMs:distribution(synchronous), texMs:distribution(tex), traversalMs:distribution(traversal), rssPeakBytes:maxRss });
  console.error(JSON.stringify(result.results.at(-1)));
 } finally {session?.close(); await new Promise(resolve => setTimeout(resolve,700)); fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
const output = arg('output');
if (output) {fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,JSON.stringify(result,null,2)+'\n');}
else process.stdout.write(JSON.stringify(result,null,2)+'\n');
