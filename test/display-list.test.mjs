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
