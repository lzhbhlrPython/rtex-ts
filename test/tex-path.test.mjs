import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import { environment } from '../dist/process.js';
test('Windows project paths are normalized before entering TeX input@path', () => {
 const cache=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP||os.tmpdir(),'rtex-path-'));
 try {const env=environment('C:\\Users\\Writer\\Project','chapters/main.tex',cache);assert.equal(env.RTEX_PROJECT_DIR,'C:/Users/Writer/Project');assert.equal(env.RTEX_MAIN_DIR,'chapters');}
 finally {fs.rmSync(cache,{recursive:true,force:true});}
});
