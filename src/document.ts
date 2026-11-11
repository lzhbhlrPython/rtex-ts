// Conservative span model inspired by realtime-tex's document.rs; positions are UTF-8 bytes.
import type { ByteEdit, Span } from './types.js';
import { texTokens, groupAt } from './tex-syntax.js';
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
  const chars = text.split(''); let cursor = 0;
  const blank = (from: number, to: number) => { for (let i = from; i < to; i++) if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' '; };
  for (const token of texTokens(text)) {
    if (token.start > cursor) blank(cursor, token.start); // comment gaps omitted by the scanner
    if (token.kind === 'opaque') blank(token.start, token.end);
    cursor = token.end;
  }
  if (cursor < text.length) blank(cursor, text.length);
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
export interface SegmentRules { blockEnvs?: string[]; runIn?: string[] }
const BLOCKS = new Set('itemize enumerate description quote quotation verse center flushleft flushright abstract figure figure* table table* tabbing proof verbatim verbatim* lstlisting Verbatim alltt spacing thebibliography IEEEkeywords IEEEdescription tikzpicture circuitikz pgfpicture'.split(' '));
const HEADINGS = new Set('chapter section subsection subsubsection part paragraph subparagraph tableofcontents'.split(' '));
export function splitSpans(text: string, main = false, rules: SegmentRules = {}): Span[] {
  let bounds = { preamble: '', bodyStart: 0, bodyEnd: text.length };
  if (main) { try { bounds = splitPreamble(text); } catch { bounds = { preamble: text, bodyStart: text.length, bodyEnd: text.length }; } }
  const regions: Array<{start: number; end: number; kind: Span['kind']}> = [];
  if (bounds.bodyStart) regions.push({ start: 0, end: bounds.bodyStart, kind: 'preamble' });
  let start = bounds.bodyStart, kind: Span['kind'] = 'paragraph', depth = 0, math = '', headingEnd = -1;
  const env: string[] = [], blocks = new Set([...BLOCKS, ...(rules.blockEnvs || [])]);
  const push = (end: number) => { if (end > start && text.slice(start, end).trim()) regions.push({ start, end, kind }); start = end; kind = 'paragraph'; headingEnd = -1; };
  for (const token of texTokens(text.slice(bounds.bodyStart, bounds.bodyEnd))) {
    const i = bounds.bodyStart + token.start, end = bounds.bodyStart + token.end;
    if (token.kind === 'open') depth++;
    else if (token.kind === 'close') { depth--; if (depth < 0) kind = 'unsupported'; }
    else if (token.kind === 'math') {
      const closing = token.value === ')' ? '(' : token.value === ']' ? '[' : token.value;
      if (math === closing) math = ''; else if (!math && ![')', ']'].includes(token.value)) math = token.value; else kind = 'unsupported';
    } else if (token.kind === 'begin') {
      if (!env.length && !depth && !math && blocks.has(token.value)) {
        const before = text.slice(start, i);
        const inlinePicture = ['tikzpicture', 'circuitikz', 'pgfpicture'].includes(token.value) && before.trim();
        if (!inlinePicture) { push(i); kind = 'environment'; }
      }
      env.push(token.value);
    } else if (token.kind === 'end') {
      if (env.pop() !== token.value) kind = 'unsupported';
      if (!env.length && !depth && !math && kind === 'environment' && blocks.has(token.value)) push(end);
    } else if (token.kind === 'opaque') {
      if (['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'alltt'].includes(token.value)) kind = 'unsupported';
    } else if (token.kind === 'command' && HEADINGS.has(token.value) && !env.length && !depth && !math) {
      push(i); kind = 'heading';
      if (!['paragraph', 'subparagraph', ...(rules.runIn || [])].includes(token.value)) {
        let offset = end;
        if (text[offset] === '*') offset++;
        const optional = groupAt(text, offset, '[', ']'); if (optional) offset = optional.end;
        const title = groupAt(text, offset); headingEnd = title?.end ?? end;
      }
    } else if (token.kind === 'text' && token.value === '\n' && !depth && !env.length && !math) {
      if (headingEnd >= 0 && i >= headingEnd) push(end);
      else { const gap = /^\n[\t \r]*\n/.exec(text.slice(i)); if (gap) push(i + gap[0].length); }
    }
  }
  if (depth || env.length || math) kind = 'unsupported';
  push(bounds.bodyEnd);
  if (bounds.bodyEnd < text.length) regions.push({ start: bounds.bodyEnd, end: text.length, kind: 'trailer' });
  let cursor = 0, byteOffset = 0, lineOffset = 1;
  const newlines = (value: string) => { let count = 0; for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 10) count++; return count; };
  return regions.map(region => {
    const gap = text.slice(cursor, region.start); byteOffset += Buffer.byteLength(gap); lineOffset += newlines(gap);
    const raw = text.slice(region.start, region.end);
    const content = raw.search(/\S/), trimmed = raw.trimEnd();
    const start = byteOffset, end = start + Buffer.byteLength(raw);
    const firstLine = lineOffset + newlines(raw.slice(0, Math.max(0, content))), lastLine = lineOffset + newlines(trimmed);
    cursor = region.end; byteOffset = end; lineOffset += newlines(raw);
    return { id: nextId++, start, end, firstLine, lastLine, text: trimmed, kind: region.kind };

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
/** Re-segment an interior paragraph edit, retaining the rest of the span index.
 * Edits to whitespace boundaries or changes in paragraph structure use the full scanner.
 */
export function editSpans(before: string, after: string, spans: Span[], edit: ByteEdit, main: boolean, rules: SegmentRules = {}): Span[] {
  const span = spans.find(s => s.kind === 'paragraph' && edit.start >= s.start && edit.end <= s.end);
  if (span) {
    const bytes = Buffer.from(before), raw = bytes.subarray(span.start, span.end).toString('utf8');
    const leading = raw.length - raw.trimStart().length;
    const first = span.start + Buffer.byteLength(raw.slice(0, leading)), last = span.start + Buffer.byteLength(raw.trimEnd());
    if (edit.start >= first && edit.end <= last) {
      const next = applyByteEdit(raw, { ...edit, start: edit.start - span.start, end: edit.end - span.start });
      const local = splitSpans(next, false, rules);
      if (local.length === 1 && local[0].kind === 'paragraph' && local[0].start === 0 && local[0].end === Buffer.byteLength(next)) {
        const lines = (value: string) => { let n = 0; for (let i = 0; i < value.length; i++) if (value.charCodeAt(i) === 10) n++; return n; };
        const delta = Buffer.byteLength(edit.text) - (edit.end - edit.start), lineDelta = lines(next) - lines(raw);
        const base = span.firstLine - 1 - lines(raw.slice(0, leading));
        const replacement = { ...local[0], id: span.id, start: span.start, end: span.end + delta, firstLine: base + local[0].firstLine, lastLine: base + local[0].lastLine };
        return spans.map(s => s === span ? replacement : s.start >= span.end ? { ...s, start: s.start + delta, end: s.end + delta, firstLine: s.firstLine + lineDelta, lastLine: s.lastLine + lineDelta } : s);
      }
    }
  }
  return splitSpans(after, main, rules);
}
