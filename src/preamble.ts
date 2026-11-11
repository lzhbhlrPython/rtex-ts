/** Buffer-aware preamble inputs/body setup, adapted from realtime-tex document.rs (MIT). */
import path from 'node:path';
import { groupAt, texTokens } from './tex-syntax.js';
import { SETUP_MACROS } from './eligibility-tables.js';
import { splitPreamble, splitSpans } from './document.js';
export function stripComments(text: string): string {
  let out = '', from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (text[i] !== '%') continue;
    out += text.slice(from, i); const end = text.indexOf('\n', i);
    if (end < 0) return out;
    from = end; i = end;
  }
  return out + text.slice(from);
}
export function inputTarget(text: string, from: number): { value: string; end: number } | undefined {
  const arg = groupAt(text, from); if (arg) return arg;
  const bare = /^\s*([^\s%{}\\]+)/.exec(text.slice(from));
  return bare ? { value: bare[1], end: from + bare[0].length } : undefined;
}
export function resolveInput(files: Map<string, { text: string }>, file: string, target: string): string | undefined {
  if (/[\\{}#]/.test(target)) return;
  const name = /\.(tex|ltx)$/.test(target) ? target : target + '.tex';
  return [path.posix.normalize(path.posix.join(path.posix.dirname(file), name)), path.posix.normalize(name)].find(name => files.has(name));
}
/** Complete setup-only chunks; definitions nested in arguments/environments are never hoisted. */
export function setupStatements(source: string): string | undefined {
  const text = stripComments(source); let i = 0, any = false;
  while (i < text.length) {
    while (/\s/.test(text[i] || '') && i < text.length) i++;
    if (i === text.length) break;
    const command = /^\\([A-Za-z@]+)/.exec(text.slice(i));
    if (!command || !SETUP_MACROS.has(command[1])) return;
    i += command[0].length;
    while (i < text.length) {
      while (/[ \t]/.test(text[i] || '') && i < text.length) i++;
      if (i >= text.length || text[i] === '\n' || text[i] === '\r') break;
      if (text[i] === '*' || text[i] === '=') { i++; continue; }
      if (text[i] === '{' || text[i] === '[') {
        const arg = groupAt(text, i, text[i], text[i] === '[' ? ']' : '}'); if (!arg) return; i = arg.end; continue;
      }
      if (text[i] === '#') { i++; while (/\d/.test(text[i] || '') && i < text.length) i++; continue; }
      if (text[i] === '\\') {
        const arg = /^\\([A-Za-z@]+|.)/s.exec(text.slice(i)); if (!arg) return;
        if (SETUP_MACROS.has(arg[1])) break;
        i += arg[0].length; continue;
      }
      return;
    }
    any = true;
  }
  return any ? text.trim() : undefined;
}
export function effectivePreamble(files: Map<string, { text: string }>, main: string, bodySetup = true): string {
  const seen = new Set<string>([main]);
  const expand = (text: string, file: string, depth: number): string => {
    if (depth > 12) throw new Error('Preamble input nesting limit exceeded');
    const edits: Array<{ start: number; end: number; text: string }> = [];
    let consumed = 0, groups = 0, environments = 0;
    for (const token of texTokens(text)) {
      if (token.start < consumed) continue;
      if (token.kind === 'open') groups++;
      if (token.kind === 'close') groups--;
      if (token.kind === 'begin') environments++;
      if (token.kind === 'end') environments--;
      if (groups || environments || token.kind !== 'command' || token.value !== 'input') continue;
      const arg = inputTarget(text, token.end); if (!arg) continue;
      const target = resolveInput(files, file, arg.value); if (!target) continue;
      if (seen.has(target)) throw new Error('Cyclic preamble input');
      seen.add(target); const expanded = expand(files.get(target)!.text, target, depth + 1); seen.delete(target);
      edits.push({ start: token.start, end: arg.end, text: expanded }); consumed = arg.end;
    }
    for (const edit of edits.reverse()) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    if (Buffer.byteLength(text) > 4 * 1024 * 1024) throw new Error('Expanded preamble size limit exceeded');
    return text;
  };
  const source = files.get(main)!.text;
  let bounds; try { bounds = splitPreamble(source); } catch { return source; }
  let preamble = expand(bounds.preamble, main, 0);
  if (!bodySetup) return preamble;
  const visited = new Set<string>();
  const walk = (file: string, depth: number) => {
    if (visited.has(file) || depth > 12) return; visited.add(file);
    const data = files.get(file); if (!data) return;
    const text = file === main ? data.text.slice(bounds.bodyStart, bounds.bodyEnd) : data.text;
    for (const span of splitSpans(text)) {
      if (['environment', 'heading'].includes(span.kind)) continue;
      const statement = setupStatements(span.text);
      if (statement) { preamble += '\n' + statement; continue; }
      let groups = 0, environments = 0;
      for (const token of texTokens(span.text)) {
        if (token.kind === 'open') groups++;
        if (token.kind === 'close') groups--;
        if (token.kind === 'begin') environments++;
        if (token.kind === 'end') environments--;
        if (groups || environments || token.kind !== 'command' || !['input', 'include', 'subfile'].includes(token.value)) continue;
        const arg = inputTarget(span.text, token.end), target = arg && resolveInput(files, file, arg.value);
        if (target) walk(target, depth + 1);
      }
    }
  };
  walk(main, 0); return preamble;
}
