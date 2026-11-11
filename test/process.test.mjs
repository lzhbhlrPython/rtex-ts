import { test } from 'node:test';import assert from 'node:assert/strict';
import { Processes } from '../dist/process.js';
test('timeout terminates an owned process and close is idempotent', {timeout:10000}, async()=>{
 const owner=new Processes();
 await assert.rejects(owner.run(process.execPath,['-e','setInterval(()=>{},1000)'],process.cwd(),process.env,100),/interrupted/);
 owner.close();owner.close();
 assert.throws(()=>owner.spawn(process.execPath,['-e','process.exit()'],process.cwd(),process.env),/closed/);
 await new Promise(resolve=>setTimeout(resolve,500));assert.equal(owner.children.size,0);
});
