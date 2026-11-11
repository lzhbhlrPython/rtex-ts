// Port of realtime-tex's rtex-dl binary revision 1 decoder. See UPSTREAM.md.
import type { DisplayList, DisplayLine, DrawItem } from './types.js';
export const SP_PER_BP = 65536 * 72.27 / 72;
export function decodeDisplayList(data: Uint8Array): DisplayList {
  const b = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (b.length < 16 || b.toString('ascii', 0, 4) !== 'RTDL' || b.readUInt16LE(4) !== 1 || b.readUInt32LE(8) !== b.length) throw new Error('Invalid display-list header');
  const dl: DisplayList = { kind: b.readUInt16LE(6) & 1 ? 'page' : 'paragraph', unit: 'sp', width: 0, height: 0, depth: 0, page: 0, page_width: 0, page_height: 0, origin: [0, 0], fonts: {}, flags: {}, images_info: {}, lines: [], other: [], glyphs: 0, inserts: 0 };
  let p = 16, limit = 16, line: DisplayLine | undefined, ended = false;
  const check = (n: number) => { if (p + n > limit) throw new Error('Truncated display-list record'); };
  const u8 = () => { check(1); return b[p++]; };
  const u16 = () => { check(2); const v = b.readUInt16LE(p); p += 2; return v; };
  const u32 = () => { check(4); const v = b.readUInt32LE(p); p += 4; return v; };
  const i32 = () => { check(4); const v = b.readInt32LE(p); p += 4; return v; };
  const f64 = () => { check(8); const v = b.readDoubleLE(p); p += 8; if (!Number.isFinite(v)) throw new Error('Non-finite coordinate'); return v; };
  const str = () => { const len = u16(); check(len); const v = b.toString('utf8', p, p + len); p += len; return v; };
  const add = (item: DrawItem) => (line ? line.items : dl.other).push(item);
  while (p < b.length) {
    limit = b.length; const tag = u8(), len = u32(); limit = p + len;
    if (limit > b.length) throw new Error('Invalid display-list record length');
    if (tag === 0x01) {
      dl.width = i32(); dl.height = i32(); dl.depth = i32(); dl.page = i32(); dl.page_width = i32(); dl.page_height = i32(); dl.origin = [i32(), i32()]; dl.glyphs = u32(); u32();
      if (dl.kind === 'paragraph') dl.inserts = dl.origin[1];
    } else if (tag === 0x02) {
      const id = u32(), size = i32(), kind = u8(); u8();
      const subfont = u16(), slant = i32(), extend = i32(), squeeze = i32(), designsize = i32();
      dl.fonts[id] = { id, size, kind, subfont, slant, extend, squeeze, designsize, filename: str(), psname: str(), name: str(), fullname: str(), format: str() };
    } else if (tag === 0x03) { const key = str(); dl.flags[key] = i32(); }
    else if (tag === 0x10) {
      line = { par: i32(), i: i32(), x: i32(), y: i32(), w: i32(), h: i32(), d: i32(), items: [] }; f64(); u8(); u8(); dl.lines.push(line);
    } else if (tag === 0x11) line = undefined;
    else if (tag === 0x12) { const unit = i32(), row = i32(); if (line) { line.unit = unit; line.row = row; } }
    else if (tag === 0x20) {
      const font = u32(), y = i32(), expansion = i32(), count = u32();
      if (count > (limit - p) / 16) throw new Error('Invalid glyph count');
      for (let i = 0; i < count; i++) { const char = u32(), index = u32(), x = i32(), advance = i32(); add(['g', font, char, index === 0xffffffff ? null : index, x, y, advance, expansion]); }
    } else if (tag === 0x21) add(['r', i32(), i32(), i32(), i32()]);
    else if (tag === 0x22) { const cmd = u8(); u8(); const stack = u16(); add(['c', stack, cmd, str()]); }
    else if (tag === 0x23) add(['l', i32(), str()]);
    else if (tag === 0x24) add(['u', str(), str()]);
    else if (tag === 0x25) add(['m', u8() ? 'on' : 'off', i32()]);
    else if (tag === 0x26) add(['i', i32(), i32(), i32(), i32(), i32()]);
    else if (tag === 0x27) { const index = u32(); dl.images_info[index] = { page: u32(), pages: u32(), file: str() }; }
    else if (tag === 0x28) { const op = u8(); add(['M', ['save', 'set', 'restore'][op], i32(), i32(), str()]); }
    else if (tag === 0x29) {
      const glyphs: NonNullable<DisplayList['math_owners']>['glyphs'] = [], fields: NonNullable<DisplayList['math_owners']>['fields'] = [];
      const bbox = (): [number, number, number, number] => [i32(), i32(), i32(), i32()];
      const ng = u32(); if (ng > (limit - p) / 28) throw new Error('Invalid math glyph count');
      for (let i = 0; i < ng; i++) glyphs.push({ owner: i32(), font: u32(), char: u32(), bbox: bbox() });
      const nf = u32(); if (nf > (limit - p) / 24) throw new Error('Invalid math field count');
      const roles = ['num', 'den', 'radicand', 'sup', 'sub', 'degree', 'cell', 'math'] as const;
      for (let i = 0; i < nf; i++) {
        const owner = i32(), role = u8(), empty = u8(); u16();
        if (role < 1 || role > roles.length || empty > 1) throw new Error('Invalid math ownership field');
        fields.push({ owner, role: roles[role - 1], empty: Boolean(empty), bbox: bbox() });
      }
      if (p !== limit) throw new Error('Trailing math ownership bytes');
      dl.math_owners = { glyphs, fields };
    }
    else if (tag === 0xff) { ended = true; break; }
    else dl.flags.unknown_record = 1; // Never silently claim fidelity for new drawing operations.
    p = limit;
  }
  if (!ended) throw new Error('Display list has no end record');
  return dl;
}
export function isExact(dl: DisplayList): boolean {
  if (Object.values(dl.flags).some(Boolean)) return false;
  const supported = (item: DrawItem) => {
    if (['l', 'u'].includes(item[0])) return false;
    if (item[0] === 'g') return !!dl.fonts[String(item[1])]?.filename && Number.isSafeInteger(item[3]) && Number(item[3]) >= 0;
    return true;
  };
  return dl.other.every(supported) && dl.lines.every(line => line.items.every(supported));
}
