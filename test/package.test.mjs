import { test } from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
test('vendored sources match the recorded upstream revision and retain MIT notices',()=>{
 const vendor=path.join(root,'vendor/realtime-tex'), manifest=JSON.parse(fs.readFileSync(path.join(vendor,'manifest.json')));
 assert.equal(manifest.revision,'fcff7a5c7f33a288ecf40db886843754c62bbdfd');
 for(const [file,digest] of Object.entries(manifest.files))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(vendor,file))).digest('hex'),digest,file);
 for(const file of ['LICENSE','vendor/realtime-tex/LICENSE','UPSTREAM.md','THIRD_PARTY_NOTICES.md'])assert.match(fs.readFileSync(path.join(root,file),'utf8'),/Henry Yang/);
});
test('CLI stdout is JSON-only in serve mode and help requires no TeX installation',()=>{
 const result=spawnSync(process.execPath,[path.join(root,'dist/cli.js'),'--help'],{encoding:'utf8'});
 assert.equal(result.status,0);assert.match(result.stdout,/rtex-ts serve/);assert.equal(result.stderr,'');
});
test('installed CLI serves JSON replies, rejects malformed requests and closes on quit',()=>{
 const osRoot=fs.mkdtempSync(path.join((process.env.TEMP||process.env.TMPDIR||'/tmp'),'rtex-cli-'));
 try{
  fs.writeFileSync(path.join(osRoot,'main.tex'),'\\documentclass{article}\n\\begin{document}Hello.\\end{document}');
  const r=spawnSync(process.execPath,[path.join(root,'dist/cli.js'),'serve','--project',osRoot,'--main','main.tex','--lualatex',path.join(osRoot,'missing')],{encoding:'utf8',timeout:10000,input:'null\n{"cmd":"status","id":7}\n{"cmd":"quit","id":8}\n'});
  assert.equal(r.status,0,r.stderr);const messages=r.stdout.trim().split('\n').map(line=>JSON.parse(line));
  assert.ok(messages.some(m=>m.reply==='error'));assert.ok(messages.some(m=>m.reply==='status'&&m.id===7));assert.ok(messages.some(m=>m.reply==='quit'&&m.id===8));
 }finally{fs.rmSync(osRoot,{recursive:true,force:true})}
});
