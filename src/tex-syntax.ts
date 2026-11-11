/** Balanced TeX scanning adapted from realtime-tex document.rs/eligibility.rs (MIT). */
export interface Group { value: string; start: number; end: number }
export function groupAt(text: string, from: number, open = '{', close = '}'): Group | undefined {
  let i = from; while (/\s/.test(text[i] || '') && i < text.length) i++;
  if (text[i] !== open) return;
  const start = i++, body = i; let depth = 1, braces = 0;
  for (; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] === '%') { const end = text.indexOf('\n', i); if (end < 0) return; i = end; continue; }
    if (open === '[') { if (text[i] === '{') braces++; if (text[i] === '}') braces--; if (braces) continue; }
    if (text[i] === open) depth++;
    if (text[i] === close && --depth === 0) return { value: text.slice(body, i), start, end: i + 1 };
    if (text[i] !== close) { /* depth changes only at delimiters */ }
  }
}
export interface Token { kind: 'command' | 'open' | 'close' | 'math' | 'begin' | 'end' | 'opaque' | 'text'; value: string; start: number; end: number }
const OPAQUE = new Set(['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'alltt']);
export function* texTokens(text: string): Generator<Token> {
  let i = 0;
  while (i < text.length) {
    const start = i, c = text[i++];
    if (c === '%') { const end = text.indexOf('\n', i); i = end < 0 ? text.length : end; continue; }
    if (c === '\\') {
      let value = text[i++] || '';
      if (/[A-Za-z@]/.test(value)) { while (/[A-Za-z@]/.test(text[i] || '') && i < text.length) value += text[i++]; }
      if (['verb', 'lstinline', 'Verb', 'mintinline'].includes(value)) {
        if (text[i] === '*') i++;
        if (value !== 'verb') { const options = groupAt(text, i, '[', ']'); if (options) i = options.end; }
        if (value === 'mintinline') { const language = groupAt(text, i); if (language) i = language.end; }
        if (value === 'mintinline' && text[i] === '{') { const body = groupAt(text, i); i = body?.end ?? text.length; yield { kind: 'opaque', value, start, end: i }; continue; }
        const delim = text[i++], stop = delim ? text.indexOf(delim, i) : -1;
        i = stop < 0 ? text.length : stop + 1;
        yield { kind: 'opaque', value, start, end: i }; continue;
      }
      if (value === 'begin' || value === 'end') {
        const arg = groupAt(text, i);
        if (arg) {
          i = arg.end;
          if (value === 'begin' && OPAQUE.has(arg.value)) {
            const ending = `\\end{${arg.value}}`, stop = text.indexOf(ending, i);
            i = stop < 0 ? text.length : stop + ending.length;
            yield { kind: 'opaque', value: arg.value, start, end: i }; continue;
          }
          yield { kind: value, value: arg.value, start, end: i }; continue;
        }
      }
      yield { kind: ['(', ')', '[', ']'].includes(value) ? 'math' : 'command', value, start, end: i }; continue;
    }
    if (c === '$') { if (text[i] === '$') i++; yield { kind: 'math', value: text.slice(start, i), start, end: i }; }
    else yield { kind: c === '{' ? 'open' : c === '}' ? 'close' : 'text', value: c, start, end: i };
  }
}
