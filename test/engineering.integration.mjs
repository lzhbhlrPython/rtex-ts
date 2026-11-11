import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { Session } from '../dist/index.js';
import { findTeXEngine } from '../dist/process.js';
function event(session,predicate){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(new Error('Engineering integration timed out'));},120000);const off=session.subscribe(e=>{if(e.event==='EngineState'&&e.state==='Failed'){clearTimeout(timer);off();reject(new Error(e.reason));}else if(predicate(e)){clearTimeout(timer);off();resolve(e);}});});}
async function fixture(t,source,options={}){
 const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-engineering-'));fs.mkdirSync(path.join(root,'chapters'));fs.writeFileSync(path.join(root,'chapters/main.tex'),source);let session;
 t.after(async()=>{session?.close();const deadline=Date.now()+5000;while(session?.processIds().length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));assert.deepEqual(session?.processIds()||[],[]);await fs.promises.rm(root,{force:true,recursive:true,maxRetries:10,retryDelay:100});});
 return {root,open:async()=>session=await Session.open({projectRoot:root,mainFile:'chapters/main.tex',debounceMs:1000,passTimeoutMs:120000,...options})};
}
for(const engine of ['xelatex','pdflatex'])test(`${engine}: nested main lookup, unsaved PDF layout and clean export`,{timeout:180000},async t=>{
 const source=String.raw`\documentclass{article}
\begin{document}
\input{intro}
\end{document}`;
 const f=await fixture(t,source,{engine,texExecutable:findTeXEngine(engine)});fs.writeFileSync(path.join(f.root,'chapters/intro.tex'),'Initial text.');const session=await f.open();let layout=await event(session,e=>e.event==='LayoutUpdate');assert.equal(layout.compile.state,'Ok');assert.ok(layout.pdf_fallback);assert.deepEqual(layout.pages_changed,[]);
 const pending=event(session,e=>e.event==='LayoutUpdate'&&e.versions.source_revision===1);assert.equal(session.setDocument('chapters/intro.tex','Unsaved replacement.').routed,'background');layout=await pending;assert.equal(layout.convergence.state,'Converged');const result=await session.exportPdf(path.join(f.root,'result.pdf'));assert.equal(result.converged,true);assert.ok(fs.statSync(result.path).size>1000);assert.equal(fs.readFileSync(path.join(f.root,'chapters/intro.tex'),'utf8'),'Initial text.');
});
test('LuaLaTeX: BibTeX and makeindex converge through controlled auxiliary passes',{timeout:180000},async t=>{
 const source=String.raw`\documentclass{article}
\usepackage{makeidx}\makeindex
\begin{document}
Text \cite{example}.\index{example}
\bibliographystyle{plain}\bibliography{refs}
\printindex
\end{document}`;
 const f=await fixture(t,source);fs.writeFileSync(path.join(f.root,'chapters/refs.bib'),'@book{example,author={Example Author},title={Example Book},year={2026},publisher={Example Press}}');const session=await f.open();const layout=await event(session,e=>e.event==='LayoutUpdate');assert.equal(layout.convergence.state,'Converged');const result=await session.exportPdf(path.join(f.root,'book.pdf'));assert.equal(result.converged,true);
});
test('LuaLaTeX: math ownership, pause/resume and warm-background buffer freshness',{timeout:180000},async t=>{
 let source=String.raw`\documentclass{article}
\usepackage{fontspec}\setmainfont{Latin Modern Roman}
\usepackage{unicode-math}
\begin{document}
Text $\attribute42=17 \frac{x}{y}$.

Second paragraph.
\end{document}`;
 const f=await fixture(t,source,{mathOwnerAttribute:42,fastBudgetMs:1000});const session=await f.open();await event(session,e=>e.event==='EngineState'&&e.state==='Ready');session.pauseBackground(true);const verification=await session.verify();assert.equal(verification.stale,false);assert.ok(verification.units.length);assert.ok(verification.units.every(unit=>unit.matched));const pending=event(session,e=>e.event==='ParagraphUpdate'&&e.status==='ok');source=source.replace('Text','Live');assert.equal(session.setDocument('chapters/main.tex',source).routed,'fast');const live=await pending;assert.ok(live.dl.math_owners?.glyphs.some(g=>g.owner===17),'binary live math owners');
 const standbyDeadline=Date.now()+30000;while(!session.stats().warmBackground&&Date.now()<standbyDeadline)await new Promise(r=>setTimeout(r,25));assert.equal(session.stats().warmBackground,true,'standby preamble is actually loaded');const version=session.versions().layout_version;const updated=event(session,e=>e.event==='LayoutUpdate'&&e.versions.source_revision===1);session.pauseBackground(false);const layout=await updated;assert.ok(layout.versions.layout_version>version);assert.equal(layout.convergence.state,'Converged');assert.ok(layout.pages_changed.some(p=>p.dl.math_owners?.glyphs.some(g=>g.owner===17)),'page math owners');
});
test('LuaLaTeX: Biber and imakeidx named index work in layout and plain export',{timeout:240000},async t=>{
 const source=String.raw`\documentclass{article}
\usepackage[backend=biber]{biblatex}\addbibresource{refs.bib}
\usepackage{imakeidx}\makeindex[name=names,title={Names}]
\begin{document}
Text \cite{example}.\index[names]{Example}
\printbibliography\printindex[names]
\end{document}`;
 const f=await fixture(t,source,{auxExecutables:process.env.RTEX_TEST_BIBER?{biber:process.env.RTEX_TEST_BIBER}:undefined});fs.writeFileSync(path.join(f.root,'chapters/refs.bib'),'@book{example,author={Example Author},title={Example Book},year={2026},publisher={Example Press}}');const session=await f.open();const layout=await event(session,e=>e.event==='LayoutUpdate');assert.equal(layout.convergence.state,'Converged');
 const output=fs.readdirSync(session.buildDir).filter(name=>name.startsWith('background-')).map(name=>path.join(session.buildDir,name,'output')).find(dir=>fs.existsSync(path.join(dir,'main.bbl')));
 assert.match(fs.readFileSync(path.join(output,'main.bbl'),'utf8'),/\\entry\{example\}/);assert.match(fs.readFileSync(path.join(output,'names.ind'),'utf8'),/Example/);
 const result=await session.exportPdf(path.join(f.root,'biber.pdf'));assert.equal(result.converged,true);
});
test('LuaLaTeX: picture cache preserves pagination and invalidates changed drawing/setup',{timeout:180000},async t=>{
 let source=String.raw`\documentclass{article}
\usepackage{tikz}
\begin{document}
\definecolor{drawing}{rgb}{1,0,0}
\begin{tikzpicture}
\draw[drawing,line width=2pt] (0,0) rectangle (3,2);
\node at (1,1) {Picture};
\end{tikzpicture}

Ordinary paragraph after the drawing.
\newpage Second page.
\begin{tikzpicture}
\draw[green] (0,0) circle (1);
\end{tikzpicture}
\end{document}`;
 const f=await fixture(t,source,{fastBudgetMs:1000});const session=await f.open();let layout=await event(session,e=>e.event==='LayoutUpdate');assert.equal(layout.convergence.state,'Converged');assert.equal(layout.pages_total,2);assert.ok(layout.pdf_fallback);assert.equal(session.stats().pictureCache.entries,2);assert.equal(session.stats().pictureCache.manifestHits,2);
 await event(session,e=>e.event==='EngineState'&&e.state==='Ready');session.pauseBackground(true);source=source.replace('Ordinary paragraph','Updated ordinary paragraph');session.setDocument('chapters/main.tex',source);let pending=event(session,e=>e.event==='LayoutUpdate'&&e.versions.source_revision===1);session.pauseBackground(false);layout=await pending;assert.equal(layout.pages_total,2);assert.equal(session.stats().pictureCache.manifestHits,2);
 source=source.replace('{1,0,0}','{0,0,1}').replace('(3,2)','(4,2)');pending=event(session,e=>e.event==='LayoutUpdate'&&e.versions.source_revision===2);session.setDocument('chapters/main.tex',source);layout=await pending;assert.equal(layout.convergence.state,'Converged');assert.equal(layout.pages_total,2);assert.ok(session.stats().pictureCache.entries>=4);
 const result=await session.exportPdf(path.join(f.root,'uncached.pdf'));assert.equal(result.converged,true);
});
