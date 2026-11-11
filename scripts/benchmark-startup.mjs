/** Cold TeX processes, comparing normal installation cache with a fresh isolated cache per session. */
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {Session} from '../dist/index.js';import {findLuaLaTeX,Processes} from '../dist/process.js';
const args=process.argv.slice(2), value=(name,fallback)=>{const i=args.indexOf('--'+name);return i<0?fallback:args[i+1];};
const samples=Number(value('samples',3)),out=value('out',undefined);
if(!Number.isInteger(samples)||samples<1||samples>100)throw Error('samples must be 1..100');
const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-startup-')), results=[];
const source=String.raw`\documentclass{article}
\usepackage{fontspec}\setmainfont{Latin Modern Roman}
\begin{document}
A short paragraph with $x+1$.
\end{document}`;
fs.writeFileSync(path.join(root,'main.tex'),source);
const version=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))).version;
const digest=crypto.createHash('sha256');for(const file of fs.readdirSync(new URL('../dist/',import.meta.url)).filter(file=>file.endsWith('.js')).sort()){digest.update(file);digest.update(fs.readFileSync(new URL('../dist/'+file,import.meta.url)));}
const executable=findLuaLaTeX(),engine=await new Processes().run(executable,['--version'],root,process.env,10000);
try{
 for(let sample=0;sample<samples;sample++)for(const isolated of sample%2?[true,false]:[false,true]){
  const build=path.join(root,'build-'+sample+'-'+isolated),start=performance.now();let session;
  try{
   session=await Session.open({projectRoot:root,mainFile:'main.tex',buildDir:build,fontCacheDir:isolated?path.join(build,'font-cache'):undefined,warmBackground:false,pictureCache:false});
   let layout;await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{off();reject(Error('Startup timed out'));},180000);const off=session.subscribe(event=>{if(event.event==='LayoutUpdate')layout={pages:event.pages_total,passes:event.passes,wall_ms:event.wall_ms};if(event.event==='EngineState'&&['Ready','Failed'].includes(event.state)){clearTimeout(timer);off();event.state==='Ready'?resolve():reject(Error(event.reason));}});});
   results.push({sample,cache:isolated?'fresh-isolated':'installation',elapsed_ms:performance.now()-start,...session.stats().startup,layout});process.stderr.write(`startup ${sample+1}/${samples} ${isolated?'isolated':'installation'}: ${results.at(-1).elapsed_ms.toFixed(1)} ms\n`);
  }finally{session?.close();const deadline=Date.now()+5000;while(session?.processIds().length&&Date.now()<deadline)await new Promise(r=>setTimeout(r,25));if(session?.processIds().length)throw Error('Owned processes did not exit');await fs.promises.rm(build,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
 }
 const report={version,compiled_sha256:digest.digest('hex'),date:new Date().toISOString(),node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model,engine:engine.log.split('\n')[0],source_bytes:Buffer.byteLength(source),method:'Alternating fresh sessions/processes; installation cache is not cleared and may already be warm; fresh-isolated creates a new TEXMFCACHE each time. No standby, picture cache or host rendering.',results};
 if(out)fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');else process.stdout.write(JSON.stringify(report,null,2)+'\n');
}finally{await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
