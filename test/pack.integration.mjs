import { spawnSync } from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';
const root=process.cwd(), temp=fs.mkdtempSync(path.join(os.tmpdir(),'rtex-ts-pack-'));
const npm=process.platform==='win32'?'npm.cmd':'npm';
// Windows .cmd launch uses a shell only for our fixed npm command/temporary paths.
const run=(exe,args,cwd)=>{const r=spawnSync(exe,args,{cwd,encoding:'utf8',shell:process.platform==='win32'&&exe===npm,timeout:120000});assert.equal(r.status,0,r.stderr||r.stdout||String(r.error));return r.stdout};
try{
 const pack=JSON.parse(run(npm,['pack','--json','--pack-destination',temp],root))[0];
 fs.writeFileSync(path.join(temp,'package.json'),JSON.stringify({name:'pack-consumer',private:true,type:'module'}));
 run(npm,['install','--ignore-scripts','--offline','--no-audit','--no-fund',path.join(temp,pack.filename)],temp);
 const pkg=path.join(temp,'node_modules','rtex-ts');
 for(const file of ['dist/index.js','dist/index.d.ts','dist/cli.js','vendor/realtime-tex/tex/rtex-serve.lua','vendor/realtime-tex/LICENSE','vendor/realtime-tex/manifest.json','LICENSE','UPSTREAM.md','AGENTS.md','docs/embedding.zh-CN.md'])assert.ok(fs.existsSync(path.join(pkg,file)),file);
 fs.writeFileSync(path.join(temp,'check.mjs'),"import { Session, applyByteEdit } from 'rtex-ts';if(typeof Session.open!=='function'||applyByteEdit('你好',{start:0,end:3,text:'您'})!=='您好')throw Error('API import failed');");
 run(process.execPath,['check.mjs'],temp);assert.match(run(process.execPath,[path.join(pkg,'dist/cli.js'),'--help'],temp),/rtex-ts serve/);
 console.log('Tarball ESM API, CLI, support files and attribution verified:',pack.filename);
}finally{fs.rmSync(temp,{recursive:true,force:true})}
