/** Reproducible rtex-ts picture-cache benchmark; independent of upstream measurements. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { Session } from '../dist/index.js';
import { findLuaLaTeX } from '../dist/process.js';
const arg=name=>{const i=process.argv.indexOf('--'+name);return i<0?undefined:process.argv[i+1];};
const count=Number(arg('pictures')||12),samples=Number(arg('samples')||5),strokes=Number(arg('strokes')||150);
if(![count,samples,strokes].every(Number.isSafeInteger)||count<1||count>256||samples<2||samples>100||strokes<1||strokes>1000)throw Error('Invalid benchmark limits');
const engine=findLuaLaTeX(),compiled=createHash('sha256');for(const file of fs.readdirSync(new URL('../dist/',import.meta.url)).filter(n=>n.endsWith('.js')).sort())compiled.update(file).update('\0').update(fs.readFileSync(new URL('../dist/'+file,import.meta.url))).update('\0');
const result={schema:1,packageVersion:JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))).version,compiledSha256:compiled.digest('hex'),measuredAt:new Date().toISOString(),environment:{platform:process.platform,arch:process.arch,node:process.version,cpu:os.cpus()[0]?.model,tex:execFileSync(engine,['--version'],{encoding:'utf8'}).split('\n')[0]},method:{pictures:count,strokesPerPicture:strokes,samples,warmBackground:true,edit:'One character in plain text after all pictures; explicitly request and await LayoutUpdate; includes snapshot, cache, all TeX/auxiliary passes and layout installation; excludes host rendering. Each mode uses an independent session/font cache.'},results:[]};
const wait=(session,predicate)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(Error('Picture benchmark timeout'));},180000),off=session.subscribe(e=>{if(e.event==='EngineState'&&e.state==='Failed'){clearTimeout(timer);off();reject(Error(e.reason));}else if(predicate(e)){clearTimeout(timer);off();resolve(e);}});});
const distribution=values=>{const v=[...values].sort((a,b)=>a-b);return {p50:v[Math.ceil(v.length*.5)-1],p95:v[Math.ceil(v.length*.95)-1],min:v[0],max:v.at(-1),samples:values};};
for(const pictureCache of [false,true]){
 const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-pic-bench-'));let session;
 try{
  let source='\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n'+Array.from({length:count},(_,i)=>`\\begin{tikzpicture}\n\\foreach \\i in {1,...,${strokes}} {\\draw[blue,opacity=.3] (0,0) -- (\\i*.01,2);}\n\\node at (1,1) {Picture ${i+1}};\n\\end{tikzpicture}\n\\newpage\n`).join('')+'Benchmark target a.\n\\end{document}\n';
  fs.writeFileSync(path.join(root,'main.tex'),source);const start=performance.now();session=await Session.open({projectRoot:root,mainFile:'main.tex',lualatex:engine,pictureCache,debounceMs:60000,passTimeoutMs:180000});const initial=await wait(session,e=>e.event==='LayoutUpdate');const initialMs=performance.now()-start;await wait(session,e=>e.event==='EngineState'&&e.state==='Ready');
  const elapsed=[],passes=[],manifestCandidates=[];
  for(let i=0;i<samples;i++){
   const deadline=Date.now()+180000;while(session.stats().backgroundRunning||!session.stats().warmBackground){if(Date.now()>deadline)throw Error("Standby did not become ready");await new Promise(r=>setTimeout(r,25));}
   const next=source.replace(/Benchmark target [ab]\./,'Benchmark target '+(i%2?'a':'b')+'.');const waiting=wait(session,e=>e.event==='LayoutUpdate'&&e.versions.source_revision===i+1);const before=performance.now();session.setDocument('main.tex',next);session.requestLayout();const layout=await waiting;elapsed.push(performance.now()-before);passes.push(layout.passes);manifestCandidates.push(session.stats().pictureCache?.manifestHits||0);source=next;
  }
  result.results.push({pictureCache,initialMs,initialPages:initial.pages_total,layoutMs:distribution(elapsed),passes,manifestCandidates});console.error(JSON.stringify(result.results.at(-1)));
 }finally{session?.close();const until=Date.now()+5000;while(session?.processIds().length&&Date.now()<until)await new Promise(r=>setTimeout(r,25));await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
if(arg('output')){fs.mkdirSync(path.dirname(path.resolve(arg('output'))),{recursive:true});fs.writeFileSync(arg('output'),JSON.stringify(result,null,2)+'\n');}else process.stdout.write(JSON.stringify(result,null,2)+'\n');
