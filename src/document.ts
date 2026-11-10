// Conservative span model inspired by realtime-tex's document.rs; positions are UTF-8 bytes.
import type { ByteEdit, Span } from './types.js';
let nextId = 1;
export function applyByteEdit(text: string, edit: ByteEdit): string {
  const bytes = Buffer.from(text);
  for (const offset of [edit.start, edit.end]) {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > bytes.length || (offset < bytes.length && (bytes[offset] & 0xc0) === 0x80)) throw new Error('Edit splits UTF-8 or exceeds document');
  }
  if (edit.start > edit.end) throw new Error('Reversed edit range');
  return Buffer.concat([bytes.subarray(0, edit.start), Buffer.from(edit.text), bytes.subarray(edit.end)]).toString('utf8');
}
/** Replace comments and verbatim contents without moving UTF-16 offsets. */
export function maskTeX(text: string): string {
  const chars = text.split('');
  let i = 0;
  const blank = (a: number, b: number) => { for (let k = a; k < b; k++) if (chars[k] !== '\n' && chars[k] !== '\r') chars[k] = ' '; };
  while (i < text.length) {
    if (text[i] === '%') { const end = text.indexOf('\n', i); blank(i, end < 0 ? text.length : end); i = end < 0 ? text.length : end; }
    else if (text[i] === '\\') {
      const rest = text.slice(i), env = /^\\begin\{(verbatim\*?|lstlisting|minted)\}/.exec(rest);
      if (env) { const start = i + env[0].length, end = text.indexOf(`\\end{${env[1]}}`, start); const stop = end < 0 ? text.length : end + env[1].length + 6; blank(i, stop); i = stop; }
      else if (/^\\verb\*?[^a-zA-Z\s]/.test(rest)) { const prefix = /^\\verb\*?/.exec(rest)![0]; const delimiter = text[i + prefix.length]; const end = text.indexOf(delimiter, i + prefix.length + 1); const stop = end < 0 ? text.length : end + 1; blank(i, stop); i = stop; }
      else i += 2;
    } else i++;
  }
  return chars.join('');
}
export function splitPreamble(text: string): { preamble: string; bodyStart: number; bodyEnd: number } {
  const masked = maskTeX(text);
  let start = -1, end = -1, depth = 0;
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] === '\\') {
      if (depth === 0 && masked.startsWith('\\begin{document}', i) && start < 0) { start = i; i += 15; }
      else if (depth === 0 && masked.startsWith('\\end{document}', i) && start >= 0) { end = i; break; }
      else i++;
    } else if (masked[i] === '{') depth++;
    else if (masked[i] === '}') depth--;
  }
  if (start < 0) throw new Error('Main file has no document environment');
  return { preamble: text.slice(0, start), bodyStart: start + '\\begin{document}'.length, bodyEnd: end > start ? end : text.length };
}
export function splitSpans(text: string, main = false): Span[] {
  const masked = maskTeX(text), regions: Array<{ start: number; end: number; kind: Span['kind'] }> = [];
  let bounds = { preamble: '', bodyStart: 0, bodyEnd: text.length };
  if (main) { try { bounds = splitPreamble(text); } catch { bounds = { preamble: text, bodyStart: text.length, bodyEnd: text.length }; } }
  if (bounds.bodyStart) regions.push({ start: 0, end: bounds.bodyStart, kind: 'preamble' });
  let start = bounds.bodyStart, depth = 0, env = 0;
  const push = (end: number) => { if (end > start && text.slice(start, end).trim()) regions.push({ start, end, kind: 'paragraph' }); start = end; };
  for (let i = start; i < bounds.bodyEnd; i++) {
    const ch = masked[i];
    if (ch === '\\') {
      const command = /^\\(begin|end)\{([^}]+)\}/.exec(masked.slice(i));
      if (command) { env += command[1] === 'begin' ? 1 : -1; i += command[0].length - 1; }
      else i++; // escaped punctuation must not affect nesting
    } else if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '\n' && depth === 0 && env === 0) {
      const gap = /^\n[\t \r]*\n/.exec(masked.slice(i));
      if (gap) { push(i + gap[0].length); i += gap[0].length - 1; }
    }
  }
  push(bounds.bodyEnd);
  if (bounds.bodyEnd < text.length) regions.push({ start: bounds.bodyEnd, end: text.length, kind: 'trailer' });
  return regions.map(region => {
    const raw = text.slice(region.start, region.end), clean = maskTeX(raw);
    const firstContent = region.start + (raw.search(/\S/) < 0 ? 0 : raw.search(/\S/));
    const unsupported = region.kind === 'paragraph' && (/\\(?:begin|end|section|subsection|chapter|paragraph|newcommand|renewcommand|def|gdef|setlength|setcounter|input|include|directlua|verb)\b/.test(clean) || depth !== 0 || env !== 0 || /\\begin\{(?:verbatim|lstlisting|minted)/.test(raw));
    return { id: nextId++, start: Buffer.byteLength(text.slice(0, region.start)), end: Buffer.byteLength(text.slice(0, region.end)), firstLine: text.slice(0, firstContent).split('\n').length, lastLine: text.slice(0, region.end).trimEnd().split('\n').length, text: raw.trimEnd(), kind: unsupported ? 'unsupported' : region.kind };
  });
}
export function minimalEdit(before: string, after: string): ByteEdit | null {
  if (before === after) return null;
  let start = 0, end = before.length, next = after.length;
  while (start < end && start < next && before[start] === after[start]) start++;
  if (start && /[\uD800-\uDBFF]/.test(before[start - 1])) start--;
  while (end > start && next > start && before[end - 1] === after[next - 1]) { end--; next--; }
  if (end < before.length && /[\uDC00-\uDFFF]/.test(before[end])) { end++; next++; }
  return { start: Buffer.byteLength(before.slice(0, start)), end: Buffer.byteLength(before.slice(0, end)), text: after.slice(start, next) };
}
