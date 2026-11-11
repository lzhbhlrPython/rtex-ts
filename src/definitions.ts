/** Balanced, top-level definition extraction adapted from realtime-tex eligibility.rs (MIT).
 * Unknown signatures stay unknown; definition bodies are never scanned as declarations.
 */
import { groupAt, texTokens, skipTexSpace } from './tex-syntax.js';
export interface Definition { start: number; end: number; name: string; body: string; endBody?: string; mathOnly?: boolean }
export function definitions(source: string): Definition[] {
  const result: Definition[] = []; let consumed = 0, depth = 0;
  for (const token of texTokens(source)) {
    if (token.start < consumed) continue;
    if (token.kind === 'open') { depth++; continue; }
    if (token.kind === 'close') { depth--; continue; }
    if (token.kind === 'command' && token.value === 'begingroup') { depth++; continue; }
    if (token.kind === 'command' && token.value === 'endgroup') { depth--; continue; }
    if (token.kind !== 'command' || depth) continue;
    const environment = ['newenvironment', 'renewenvironment', 'NewDocumentEnvironment', 'RenewDocumentEnvironment'].includes(token.value);
    if (!environment && !['newcommand', 'renewcommand', 'providecommand', 'DeclareRobustCommand', 'NewDocumentCommand', 'RenewDocumentCommand', 'ProvideDocumentCommand', 'DeclareMathOperator', 'def'].includes(token.value)) continue;
    let at = token.end; if (source[at] === '*') at++;
    at = skipTexSpace(source, at);
    const braced = groupAt(source, at), bare = /^\\([A-Za-z@]+)/.exec(source.slice(at));
    const name = environment ? braced?.value : braced ? /^\\([A-Za-z@]+)$/.exec(braced.value.trim())?.[1] : bare?.[1];
    if (!name) continue;
    at = braced?.end ?? at + bare![0].length;
    let supported = true, defaultBody = '';
    if (token.value.includes('Document')) {
      const signature = groupAt(source, at); if (!signature) continue;
      // Only mandatory arguments. Optional/delimited/verbatim xparse signatures need separate inference.
      supported = /^\s*m?(?:\s*m)*\s*$/.test(signature.value); at = signature.end;
    } else if (token.value !== 'def' && token.value !== 'DeclareMathOperator') {
      const count = groupAt(source, at, '[', ']');
      if (count) { supported = /^[0-9]$/.test(count.value.trim()); at = count.end; const fallback = groupAt(source, at, '[', ']'); if (fallback) { at = fallback.end; defaultBody = fallback.value; } }
    }
    const body = groupAt(source, at); if (!body) { result.push({ start: token.start, end: at, name, body: '\\rtexUnsupportedDefinition' }); continue; } // Parameterized/delimited def stays blocked.
    consumed = body.end;
    const end = environment ? groupAt(source, body.end) : undefined;
    if (environment && !end) continue;
    if (end) consumed = end.end;
    const substitute = (value: string) => value.replace(/#[1-9]/g, 'x');
    const content = substitute(body.value + (defaultBody ? '\n{' + defaultBody + '}' : '')), ending = end && substitute(end.value);
    result.push({ start: token.start, end: consumed, name, body: !supported || content.includes('#') || ending?.includes('#') ? '\\rtexUnsupportedDefinition' : token.value === 'DeclareMathOperator' ? '\\operatorname{' + content + '}' : content, endBody: ending, mathOnly: token.value === 'DeclareMathOperator' });
  }
  return result;
}
