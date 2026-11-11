import { test } from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import { ppmImage, comparePdfs } from '../dist/pdf-compare.js';
test('PPM parser preserves whitespace-valued first pixels and rejects truncated/oversized images',()=>{
 const bytes=Buffer.from([10,32,35]);assert.deepEqual(ppmImage(Buffer.concat([Buffer.from('P6\n# comment\n1 1\n255\n'),bytes])).pixels,bytes);
 for(const header of ['P6\n1 1\n255\n','P6\n90000 90000\n255\n','P5\n1 1\n255\n'])assert.throws(()=>ppmImage(Buffer.from(header)));
});
test('PDF comparison rejects invalid limits and never treats a missing oracle as equal',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'rtex-pdf-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'input.pdf');fs.writeFileSync(file,'%PDF-1.4');
 await assert.rejects(comparePdfs(file,file,{dpi:0}),/limits/);await assert.rejects(comparePdfs(file,file,{pdfinfo:path.join(root,'missing')}),/ENOENT/);
});
