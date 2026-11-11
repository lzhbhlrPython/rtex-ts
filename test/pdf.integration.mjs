import { test } from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';
import { comparePdfs } from '../dist/index.js';
// Minimal deterministic PDF fixture: rectangles only, no font or TeX dependency.
function pdf(colors,width=200){
 const objects=['',`<< /Type /Catalog /Pages 2 0 R >>`,`<< /Type /Pages /Count ${colors.length} /Kids [${colors.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] >>`];
 for(let i=0;i<colors.length;i++){const content=`${colors[i]} rg 20 20 50 50 re f\n`;objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} 200] /Resources << >> /Contents ${4+i*2} 0 R >>`,`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`);}
 let text='%PDF-1.4\n',offsets=[0];for(let i=1;i<objects.length;i++){offsets.push(Buffer.byteLength(text));text+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
 const start=Buffer.byteLength(text);text+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>`${String(offset).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;return text;
}
test('Poppler raster oracle detects content/size/page differences, ignores byte-only changes and CLI exits consistently',{timeout:120000},async t=>{
 const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-pdf-oracle-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const write=(name,data)=>{const file=path.join(root,name);fs.writeFileSync(file,data);return file;};const a=write('a 测试.pdf',pdf(['1 0 0'])),same=write('same.pdf',pdf(['1 0 0'])+'% changed bytes\n'),b=write('b.pdf',pdf(['0 0 1'])),two=write('two.pdf',pdf(['1 0 0','1 0 0'])),size=write('size.pdf',pdf(['1 0 0'],220));
 const equal=await comparePdfs(a,same);assert.equal(equal.equal,true);assert.equal(equal.scope,'raster');assert.equal(equal.pages[0].widthA,267);assert.equal(equal.pages[0].differentPixels,0);
 const different=await comparePdfs(a,b);assert.equal(different.equal,false);assert.ok(different.pages[0].differentPixels>100);assert.equal((await comparePdfs(a,b,{tolerance:255})).equal,true);
 assert.equal((await comparePdfs(a,two)).equal,false);assert.equal((await comparePdfs(a,size)).equal,false);
 await assert.rejects(comparePdfs(a,write('huge.pdf',pdf(['1 0 0'],1000000))),/dimensions/);
 for(const [other,status] of [[same,0],[b,1]]){const result=spawnSync(process.execPath,['dist/cli.js','pdf-compare','--a',a,'--b',other],{encoding:'utf8',timeout:30000});assert.equal(result.status,status,result.stderr);assert.equal(JSON.parse(result.stdout).equal,status===0);}
});

test('CLI verify --pdf combines live probes with an independent clean export',{skip:process.env.RTEX_TEST_PDF_WITH_TEX!=='1',timeout:120000},t=>{
 const root=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-cli-pdf-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}));fs.writeFileSync(path.join(root,'main.tex'),String.raw`\documentclass{article}
\usepackage{fontspec}\setmainfont{Latin Modern Roman}
\begin{document}
An ordinary paragraph for verification.
\end{document}`);
 const result=spawnSync(process.execPath,['dist/cli.js','verify','--project',root,'--main','main.tex','--pdf','--no-warm-background'],{encoding:'utf8',timeout:90000});assert.equal(result.status,0,result.stderr||result.stdout);const data=JSON.parse(result.stdout);assert.ok(data.verification.units.length);assert.ok(data.verification.units.every(unit=>unit.matched));assert.equal(data.pdfComparison.equal,true);assert.equal(data.pdfComparison.scope,'raster');
});
