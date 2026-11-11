import { test } from 'node:test';import assert from 'node:assert/strict';
import { decodeDisplayList,isExact } from '../dist/index.js';
function encoded(records){const body=Buffer.concat(records),head=Buffer.alloc(16);head.write('RTDL');head.writeUInt16LE(1,4);head.writeUInt32LE(16+body.length,8);return Buffer.concat([head,body])}
function record(tag,data=Buffer.alloc(0)){const h=Buffer.alloc(5);h.writeUInt8(tag);h.writeUInt32LE(data.length,1);return Buffer.concat([h,data])}
test('binary decoder validates magic, version, record lengths and missing terminators',()=>{
 const valid=encoded([record(0xff)]);assert.equal(decodeDisplayList(valid).kind,'paragraph');
 assert.throws(()=>decodeDisplayList(Buffer.from('invalid')));
 const wrong=Buffer.from(valid);wrong.writeUInt16LE(999,4);assert.throws(()=>decodeDisplayList(wrong));
 const truncated=encoded([record(0x01)]);assert.throws(()=>decodeDisplayList(truncated));
 assert.throws(()=>decodeDisplayList(encoded([])));
});
test('unknown drawing records force PDF fallback instead of silently dropping content',()=>{
 assert.equal(isExact(decodeDisplayList(encoded([record(0x70),record(0xff)]))),false);
 assert.equal(isExact(decodeDisplayList(encoded([record(0xff)]))),true);
});
test('math ownership decodes glyph/field roles and rejects corrupt counts/roles',()=>{
 const bytes=Buffer.alloc(60);bytes.writeUInt32LE(1,0);bytes.writeInt32LE(17,4);bytes.writeUInt32LE(9,8);bytes.writeUInt32LE(120,12);bytes.writeUInt32LE(1,32);bytes.writeInt32LE(17,36);bytes[40]=1;bytes[41]=1;
 const dl=decodeDisplayList(encoded([record(0x29,bytes),record(0xff)]));assert.equal(dl.math_owners.glyphs[0].owner,17);assert.deepEqual(dl.math_owners.fields[0],{owner:17,role:'num',empty:true,bbox:[0,0,0,0]});
 bytes[40]=99;assert.throws(()=>decodeDisplayList(encoded([record(0x29,bytes),record(0xff)])),/Invalid math ownership/);
 bytes.writeUInt32LE(0xffffffff,0);assert.throws(()=>decodeDisplayList(encoded([record(0x29,bytes),record(0xff)])),/count/);
});
