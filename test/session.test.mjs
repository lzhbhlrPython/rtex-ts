import { test } from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import { Session } from '../dist/index.js';
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'rtex-ts-unit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'main.tex'),'\\documentclass{article}\n\\begin{document}\nFirst paragraph.\n\nSecond paragraph.\n\\end{document}\n');return root}
test('setDocument maintains IDs after edits and does not write the original',async t=>{
 const root=fixture(t), original=fs.readFileSync(path.join(root,'main.tex'),'utf8');const session=await Session.open({projectRoot:root,mainFile:'main.tex'});t.after(()=>session.close());
 const spans=session.spans('main.tex'), first=spans.find(s=>s.text.includes('First')),second=spans.find(s=>s.text.includes('Second'));
 const changed=original.replace('First paragraph.','First changed paragraph.');session.setDocument('main.tex',changed);
 assert.equal(session.spans('main.tex').find(s=>s.text.includes('First')).id,first.id);
 assert.equal(session.spans('main.tex').find(s=>s.text.includes('Second')).id,second.id);
 assert.equal(fs.readFileSync(path.join(root,'main.tex'),'utf8'),original);
 session.close();assert.throws(()=>session.setDocument('main.tex',original));
});
test('outside files and symlink escapes are rejected',async t=>{
 const root=fixture(t), outside=path.join(os.tmpdir(),'rtex-ts-outside-'+Date.now()+'.tex');fs.writeFileSync(outside,'outside');t.after(()=>fs.rmSync(outside,{force:true}));
 const session=await Session.open({projectRoot:root,mainFile:'main.tex'});t.after(()=>session.close());
 assert.throws(()=>session.setDocument(outside,'bad'));
 if(process.platform!=='win32'){fs.symlinkSync(outside,path.join(root,'escape.tex'));assert.throws(()=>session.documentText('escape.tex'))}
 session.close();
});
test('missing executables report failure without crashing or writing source',async t=>{
 const root=fixture(t), session=await Session.open({projectRoot:root,mainFile:'main.tex',lualatex:path.join(root,'does-not-exist')});t.after(()=>session.close());
 const events=[];session.subscribe(event=>events.push(event));
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No failure event')),3000);session.subscribe(event=>{if(event.event==='EngineState'&&event.state==='Failed'){clearTimeout(timer);resolve()}})});
 assert.ok(events.some(e=>e.event==='Diagnostics'));session.close();
});

test('a build-directory alias cannot resolve to the project or escape from inside it',async t=>{
 const root=fixture(t),outside=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-build-path-'));t.after(()=>fs.rmSync(outside,{recursive:true,force:true}));
 const alias=path.join(outside,'alias');fs.symlinkSync(root,alias,'junction');await assert.rejects(Session.open({projectRoot:root,mainFile:'main.tex',buildDir:alias}),/cannot contain/);
 const escape=path.join(root,'build-alias');fs.symlinkSync(outside,escape,'junction');await assert.rejects(Session.open({projectRoot:root,mainFile:'main.tex',buildDir:escape}),/escapes/);
});

test('inferred block rules apply at open and after preamble changes while unchanged IDs survive',async t=>{
 const root=fixture(t);let text=String.raw`\documentclass{article}
\newenvironment{custom}{\begin{quote}}{\end{quote}}
\begin{document}
First paragraph.
\begin{custom}Wrapped text.\end{custom}

Second paragraph.
\end{document}`;fs.writeFileSync(path.join(root,'main.tex'),text);
 const session=await Session.open({projectRoot:root,mainFile:'main.tex'});t.after(()=>session.close());session.pauseBackground(true);
 assert.equal(session.spans('main.tex').find(s=>s.text.includes('Wrapped')).kind,'environment');const second=session.spans('main.tex').find(s=>s.text.includes('Second')).id;
 text=text.replace('\\begin{quote}','\\bfseries').replace('\\end{quote}','');session.setDocument('main.tex',text);assert.equal(session.spans('main.tex').find(s=>s.text.includes('Wrapped')).kind,'paragraph');assert.equal(session.spans('main.tex').find(s=>s.text.includes('Second')).id,second);session.close();
 await assert.rejects(Session.open({projectRoot:root,mainFile:'main.tex',fontCacheDir:path.join(root,'author-cache')}),/outside project/);assert.equal(fs.existsSync(path.join(root,'author-cache')),false);
});
