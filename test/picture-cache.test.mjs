import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanPictures, uncacheablePicture, PictureCache } from '../dist/picture-cache.js';
const pic=String.raw`\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}`;
const files=source=>new Map([['main.tex',{text:'\\documentclass{article}\n\\begin{document}\n'+source+'\n\\end{document}'}]]);
test('picture scanner hashes ordered setup and follows inputs without confusing deferred or repeated sources',()=>{
 assert.equal(scanPictures(files(pic+'\n\\newpage\n'+pic),'main.tex').length,2);
 let source=files('\\def\\H{4}\nText.\n'+pic+'\nAfter.');let [a]=scanPictures(source,'main.tex');assert.equal(a.key,'main.tex:5');assert.equal(a.end_line,7);assert.equal(a.cacheable,true);
 const changedText=scanPictures(files('\\def\\H{4}\nOther text.\n'+pic+'\nAfter.'),'main.tex')[0];assert.equal(a.hash,changedText.hash);
 assert.notEqual(a.hash,scanPictures(files('\\def\\H{5}\nText.\n'+pic),'main.tex')[0].hash);
 const input=files('\\input{fig}\n'+pic);input.set('fig.tex',{text:'\\definecolor{x}{rgb}{1,0,0}\n'+pic});const scanned=scanPictures(input,'main.tex');assert.deepEqual(scanned.map(p=>p.key),['fig.tex:2','main.tex:4']);
 input.get('main.tex').text=input.get('main.tex').text.replace('\\input{fig}','\\input{fig}\n\\input{fig}');assert.ok(scanPictures(input,'main.tex').filter(p=>p.key.startsWith('fig.tex:')).every(p=>!p.cacheable));
 assert.equal(scanPictures(files('\\newcommand{\\deferred}{\n'+pic+'}\n'+pic),'main.tex').length,1);
});
test('picture cache refuses counters, hidden state, references, files, inline/nested/unbalanced and remembered pictures',()=>{
 for(const body of ['\\ref{x}','\\thepage','\\pgfplotstableread{x}','\\node {\\input{data}};','\\begin{verbatim}x\\end{verbatim}','\\global\\def\\x{1}','overlay','table[x=a]{data}','\\begin{unknown}state\\end{unknown}'])assert.equal(uncacheablePicture(body),true,body);
 assert.equal(uncacheablePicture('\\node {$\\theta\\therefore$};'),false);
 for(const source of ['Before '+pic,pic.replace('\\draw','\\begin{tikzpicture}\\end{tikzpicture}\n\\draw'),pic.replace('--','} --'),'% ignored\n\\tikzset{every picture/.style={remember picture}}\n'+pic])assert.ok(scanPictures(files(source),'main.tex').every(p=>!p.cacheable),source);
 const hidden='\\newcommand{\\hidden}{\\thepage}\n\\newcommand{\\alias}{\\hidden}\n'+pic.replace('\\draw (0,0) -- (1,1);','\\node {\\alias};');assert.equal(scanPictures(files(hidden),'main.tex')[0].cacheable,false);
 assert.equal(scanPictures(files('\\begin{verbatim}\n'+pic+'\n\\end{verbatim}'),'main.tex').length,0);
});
test('picture manifests remap selected pages, quarantine mismatches and expire unused entries',async t=>{
 const root=await fs.mkdtemp(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-cache-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true,maxRetries:10}));
 let calls=0;const cache=new PictureCache(path.join(root,'cache'),{run:async(_bin,args)=>{calls++;const dir=args.find(a=>a.startsWith('--output-directory=')).split('=').slice(1).join('=');await fs.writeFile(path.join(dir,'extract.pdf'),'%PDF fixture');return {code:0,log:''};}},'lualatex',1000);
 const pictures=scanPictures(files(pic),'main.tex'),manifest=path.join(root,'pic-manifest.json'),pdf=path.join(root,'source.pdf');await fs.writeFile(pdf,'%PDF source');
 const record={env:'tikzpicture',page:3,x:10,y:20,w:30,h:40,d:5,page_height:100,state:'font-color-width'};
 await cache.manifest(pictures,manifest);assert.equal(cache.stats().manifestHits,0);
 await cache.absorb(pictures,{[pictures[0].key]:record},[],pdf,{},()=>false);assert.equal(calls,1);
 await cache.manifest(pictures,manifest);const entry=JSON.parse(await fs.readFile(manifest,'utf8'))[pictures[0].key];assert.equal(entry.page,1);assert.deepEqual(entry.bbox,[10,75,40,120]);assert.equal(entry.end_line,pictures[0].end_line);assert.equal(cache.stats().manifestHits,1);
 await cache.manifest([...pictures,...Array.from({length:300},(_,i)=>({...pictures[0],key:'main.tex:'+(100+i)}))],manifest);assert.equal(Object.keys(JSON.parse(await fs.readFile(manifest,'utf8'))).length,256);
 await cache.absorb(pictures,{},[pictures[0].key],pdf,{},()=>false);await cache.manifest(pictures,manifest);assert.equal(cache.stats().entries,0);assert.equal(cache.stats().manifestHits,0);await assert.rejects(fs.access(manifest));
 for(let i=0;i<6;i++)await cache.manifest([],manifest);
 await cache.absorb(pictures,{[pictures[0].key]:record},[],pdf,{},()=>false);assert.equal(cache.stats().entries,1);
 for(let i=0;i<6;i++)await cache.manifest([],manifest);await cache.absorb([],{},[],pdf,{},()=>false);assert.equal(cache.stats().entries,0);
});
