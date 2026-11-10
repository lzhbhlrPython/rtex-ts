import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { Session, isExact } from '../dist/index.js';
const lua=process.env.RTEX_TEXLIVE_BIN ? path.join(process.env.RTEX_TEXLIVE_BIN,process.platform==='win32'?'lualatex.exe':'lualatex') : fs.existsSync('/Library/TeX/texbin/lualatex')?'/Library/TeX/texbin/lualatex':'lualatex';
if(spawnSync(lua,['--version'],{encoding:'utf8'}).status!==0)throw new Error('Real TeX integration requires LuaLaTeX; this is not a passed or silently skipped check.');
function waitFor(session,predicate,timeout=90000){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('Timed out waiting for TeX event'))},timeout);const off=session.subscribe(event=>{if(predicate(event)){clearTimeout(timer);off();resolve(event)}})})}

test('real LuaLaTeX: CJK/math live edits, multi-file buffers, TikZ fallback, clean export and close', {timeout:180000},async t=>{
 const root=fs.mkdtempSync(path.join((process.env.RUNNER_TEMP || os.tmpdir()),'rtex-ts-real-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'chapters'));
 let main=String.raw`\documentclass[fontset=fandol]{ctexart}
\usepackage{unicode-math}
\usepackage{tikz}
\begin{document}
中文实时写作。English live paragraph with $\frac{x^2}{2}$.

\input{chapters/intro}

\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}
\end{document}
`;
 let intro='Second file paragraph. 子文件内容。\n';fs.writeFileSync(path.join(root,'main.tex'),main);fs.writeFileSync(path.join(root,'chapters/intro.tex'),intro);
 const session=await Session.open({projectRoot:root,mainFile:'main.tex',lualatex:lua,fastBudgetMs:500,debounceMs:500});t.after(()=>session.close());
 const seen=[];session.subscribe(event=>{seen.push(event);if(event.event==='EngineState'&&event.state==='Failed')console.error('TeX failure:',event.reason)});
 await waitFor(session,event=>event.event==='EngineState'&&event.state==='Ready');
 const layout=seen.find(event=>event.event==='LayoutUpdate');assert.ok(layout.pages_total>=1);assert.ok(fs.existsSync(layout.pdf_path));
 assert.ok(layout.pages_changed.some(page=>!isExact(page.dl)),'TikZ should require PDF rendering');
 let waiting=waitFor(session,event=>event.event==='ParagraphUpdate'&&event.status==='ok');
 main=main.replace('中文实时写作。','中文即时更新。');const first=session.setDocument('main.tex',main);assert.equal(first.routed,'fast');
 const paragraph=await waiting;assert.ok(paragraph.dl.lines.length);assert.ok(paragraph.dl.lines.flatMap(line=>line.items).some(item=>item[0]==='g'&&item[2]>0x3000));
 assert.ok(paragraph.timing.total_us>0);console.log('Observed CJK/math live update (ms):',paragraph.timing.total_us/1000);
 waiting=waitFor(session,event=>event.event==='ParagraphUpdate'&&event.status==='ok'&&event.versions.source_revision>=2);
 intro='Second file changed. 子文件更新。\n';assert.equal(session.setDocument('chapters/intro.tex',intro).routed,'fast');await waiting;
 waiting=waitFor(session,event=>event.event==='LayoutUpdate'&&event.versions.source_revision>=3);
 main=main.replace('(1,1)','(2,1)');assert.equal(session.setDocument('main.tex',main).routed,'background');await waiting;
 assert.equal(fs.readFileSync(path.join(root,'main.tex'),'utf8').includes('中文即时更新。'),false,'preview must not save source');
 const out=path.join(root,'export','clean.pdf');const result=await session.exportPdf(out);assert.equal(result.converged,true);assert.ok(fs.statSync(out).size>1000);
 session.close();assert.throws(()=>session.setDocument('main.tex',main));
});
