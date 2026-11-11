import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FrameDecoder, ResponseChannel } from '../dist/transport.js';
const frame = text => { const body = Buffer.from(text), header = Buffer.alloc(4); header.writeUInt32LE(body.length); return Buffer.concat([header, body]); };
test('response decoder handles fragmented/coalesced frames and rejects corrupt lengths', () => {
  const decoder = new FrameDecoder(), received = [];
  for (const byte of Buffer.concat([frame('你好'),frame('abc')])) decoder.push(Buffer.from([byte]), body => received.push(body.toString()));
  assert.deepEqual(received,['你好','abc']);
  for (const length of [0, 32 * 1024 * 1024 + 1, 0xffffffff]) { const header = Buffer.alloc(4); header.writeUInt32LE(length); assert.throws(() => new FrameDecoder().push(header, () => {}), /Invalid/); }
});
test('response pipe delivers without polling and aborts pending reads on close/timeout', async t => {
  const root = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'rtex-pipe-'));
  const channel = new ResponseChannel();
  t.after(() => { channel.close(); fs.rmSync(root,{recursive:true,force:true}); });
  await channel.open(root);
  const waiting = channel.read(1000);
  // Async open also covers Windows named-pipe connection; no shell commands.
  await fs.promises.writeFile(channel.address,frame('ready'));
  assert.equal((await waiting).toString(),'ready');
  // The Windows writer disconnects above; POSIX retains the host's FIFO handle.
  if (process.platform !== 'win32') {
    const timeout = channel.read(10); await assert.rejects(timeout,/timed out/);
    const pendingChannel = new ResponseChannel();
    const second = path.join(root, 'second'); fs.mkdirSync(second); await pendingChannel.open(second);
    const pending = pendingChannel.read(1000); pendingChannel.close(); await assert.rejects(pending,/closed/);

  }
});
