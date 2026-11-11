/** Policy and source/context checks adapted from realtime-tex eligibility.rs (MIT). */
import { texTokens, groupAt } from './tex-syntax.js';
import { maskTeX } from './document.js';
import * as T from './eligibility-tables.js';
export interface PolicyOptions { eligibility?: 'probe' | 'allowlist'; trustedMacros?: string[]; unitEnvs?: string[]; mathOwnerAttribute?: number }
export interface Classification { kind: 'par' | 'env' | 'heading'; name?: string; reasons: string[] }
const PRIMITIVES = new Set('global gdef xdef directlua latelua write openout closeout read openin closein catcode shipout special output everypar aftergroup afterassignment csname endcsname input include subfile usepackage RequirePackage documentclass'.split(' '));
const PROVIDERS = new Map<string, string[]>();
for (const [pkg, names] of Object.entries(T.PACKAGE_MACROS)) for (const name of names) PROVIDERS.set(name, [...(PROVIDERS.get(name) || []), pkg]);
export class Policy {
  readonly packages = new Set<string>();
  readonly unitEnvs = new Set<string>();
  readonly trusted = new Set<string>();
  private definitions = new Map<string, string>();
  constructor(readonly preamble: string, readonly options: PolicyOptions = {}) {
    for (const name of options.trustedMacros || []) this.trusted.add(name.replace(/^\\/, ''));
    for (const name of options.unitEnvs || []) this.unitEnvs.add(name);
    for (const token of texTokens(preamble)) {
      if (token.kind !== 'command') continue;
      let from = token.end;
      if (preamble[from] === '*') from++;
      const optional = groupAt(preamble, from, '[', ']'); if (optional) from = optional.end;
      const arg = groupAt(preamble, from);
      if (!arg) continue;
      if (['usepackage', 'RequirePackage', 'documentclass'].includes(token.value)) for (const pkg of arg.value.split(',')) this.packages.add(pkg.trim());
      if (['newtheorem', 'newlist', 'newenvironment', 'NewDocumentEnvironment'].includes(token.value)) this.unitEnvs.add(arg.value);
      if (['newcommand', 'renewcommand', 'providecommand', 'DeclareRobustCommand', 'NewDocumentCommand', 'RenewDocumentCommand'].includes(token.value) && /^\\[A-Za-z@]+$/.test(arg.value)) {
        let offset = arg.end;
        for (let i = 0; i < 2; i++) { const optional = groupAt(preamble, offset, '[', ']'); if (optional) offset = optional.end; }
        if (token.value.endsWith('DocumentCommand')) { const signature = groupAt(preamble, offset); if (signature) offset = signature.end; }
        const body = groupAt(preamble, offset); if (body) this.definitions.set(arg.value.slice(1), body.value);
      }
    }
    if (this.packages.has('mathtools')) this.packages.add('amsmath');
    if (this.packages.has('unicode-math') || this.packages.has('amsfonts')) this.packages.add('amssymb');
  }
  classify(source: string, stack: Set<string> = new Set()): Classification {
    const text = maskTeX(source), reasons: string[] = [], env: string[] = [];
    let depth = 0, math = '', kind: Classification['kind'] = 'par', name: string | undefined;
    const tokens = texTokens(source); let next = tokens.next();
    while (!next.done && next.value.kind === 'text' && !next.value.value.trim()) next = tokens.next();
    const first = next.done ? undefined : next.value;
    if (first?.kind === 'begin') { kind = 'env'; name = first.value; }
    if (first?.kind === 'command' && T.HEADINGS.has(first.value)) { kind = 'heading'; name = first.value; }
    if (!source.trim()) reasons.push('Blank');
    if (name && ['paragraph', 'subparagraph'].includes(name)) reasons.push('RunInHeading');
    let consumed = 0;
    const vocabulary = (reason: string) => { if ((this.options.eligibility || 'allowlist') === 'allowlist') reasons.push(reason); };
    for (const token of (function* () { if (first) yield first; yield* tokens; })()) {
      if (token.start < consumed) continue;
      if (token.kind === 'open') { depth++; continue; }
      if (token.kind === 'close') { if (--depth < 0) reasons.push('UnbalancedBraces'); continue; }
      if (token.kind === 'math') {
        const close = token.value === ')' ? '(' : token.value === ']' ? '[' : token.value;
        if (math === close) math = ''; else if (!math && ![')', ']'].includes(token.value)) math = token.value; else reasons.push('UnbalancedMath');
        continue;
      }
      if (token.kind === 'begin') {
        env.push(token.value);
        if (!T.INNER_ENVS.has(token.value) && !T.DISPLAY_ENVS.has(token.value) && !T.AMSMATH_DISPLAY_ENVS.has(token.value) && !T.AMSMATH_INNER_ENVS.has(token.value) && !T.LIST_ENVS.has(token.value) && !this.unitEnvs.has(token.value) && !['figure', 'figure*', 'table', 'table*', 'quote', 'quotation', 'verse', 'center', 'flushleft', 'flushright', 'abstract', 'proof', 'tabbing', 'thebibliography'].includes(token.value)) vocabulary('DisallowedEnvironment:' + token.value);
        continue;
      }
      if (token.kind === 'end') { if (env.pop() !== token.value) reasons.push('UnbalancedEnvironment'); continue; }
      if (token.kind === 'opaque') {
        if (['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'alltt'].includes(token.value) && !source.slice(token.start, token.end).endsWith(`\\end{${token.value}}`)) reasons.push('UnbalancedEnvironment');
        continue;
      }
      if (token.kind !== 'command') continue;
      const command = token.value;
      const providers = PROVIDERS.get(command) || [];
      if (providers.length && !providers.some(pkg => this.packages.has(pkg))) vocabulary('NeedsPackage:' + providers[0]);
      const opaqueArgs = T.OPAQUE_ARGS[command];
      if (opaqueArgs) {
        let offset = token.end;
        if (source[offset] === '*') offset++;
        const optional = groupAt(source, offset, '[', ']'); if (optional) offset = optional.end;
        for (let i = 0; i < opaqueArgs; i++) { const arg = groupAt(source, offset); if (!arg) { reasons.push('IncompleteArgument:' + command); break; } offset = arg.end; }
        consumed = offset; continue;
      }
      if (this.definitions.has(command) && !this.trusted.has(command)) {
        if (stack.has(command) || stack.size >= 16) reasons.push('RecursiveMacro:' + command);
        else { const seen = new Set(stack); seen.add(command); reasons.push(...this.classify(this.definitions.get(command)!, seen).reasons); }
        continue;
      }
      if (PRIMITIVES.has(command)) { reasons.push('OutsideState:' + command); continue; }
      if (T.SETUP_MACROS.has(command) && !(T.GROUP_ONLY_SETTERS.has(command) && (depth || env.length))) { reasons.push('SetupStatement'); continue; }
      if (command === 'attribute') {
        const literal = /^\s*(\d+)\s*=\s*[+-]?\d+/.exec(source.slice(token.end));
        if (!literal || Number(literal[1]) !== this.options.mathOwnerAttribute) reasons.push('UnconfiguredAttribute');
        continue;
      }
      if (command === 'begingroup') { depth++; continue; }
      if (command === 'endgroup') { if (--depth < 0) reasons.push('UnbalancedBraces'); continue; }
      if ((T.GROUP_ONLY_DECLARATIONS.has(command) || T.GROUP_ONLY_SETTERS.has(command)) && !depth && !env.length) reasons.push('SizeDeclarationOutsideGroup:' + command);
      if (command === 'item' && !env.some(name => T.LIST_ENVS.has(name) || this.unitEnvs.has(name))) reasons.push('MacroOutsideContext:item');
      if (command === 'caption' && !env.some(name => /^figure|^table/.test(name))) reasons.push('MacroOutsideContext:caption');
      if (T.HEADINGS.has(command) && (kind !== 'heading' || first !== token)) reasons.push('HeadingOutsideUnit');
      if (!providers.some(pkg => this.packages.has(pkg)) && !this.trusted.has(command) && !T.TEXT_MACROS.has(command) && !T.MATH_MACROS.has(command) && !T.GROUP_ONLY_DECLARATIONS.has(command) && !T.GROUP_ONLY_SETTERS.has(command) && !T.HEADINGS.has(command) && !['item', 'caption', 'label', 'hline', 'cline', 'multicolumn', 'multirow', 'toprule', 'midrule', 'bottomrule', 'includegraphics'].includes(command)) vocabulary('DisallowedMacro:' + command);
    }
    if (depth) reasons.push('UnbalancedBraces');
    if (math) reasons.push('UnbalancedMath');
    if (env.length) reasons.push('UnbalancedEnvironment');
    if (/\b(?:resume|resume\*|series)\s*=/.test(text)) reasons.push('OutsideState:resumed list');
    return { kind, name, reasons: [...new Set(reasons)] };
  }
}
export function everyparAllowed(value: string): boolean {
  const text = value.replace(/^\\leftprotrusion /, '').replace(/\\leftprotrusion $/, '');
  return ['', String.raw`\if@nobreak \@nobreakfalse \clubpenalty \@M \if@afterindent \else {\setbox \z@ \lastbox }\fi \else \clubpenalty \@clubpenalty \everypar {}\fi `, String.raw`\if@nobreak \@nobreakfalse \clubpenalty \@M \setbox \z@ \lastbox \else \clubpenalty \@clubpenalty \everypar {}\fi `, String.raw`{\setbox \z@ \lastbox }\everypar {}\@endpefalse `, String.raw`\@minipagefalse \everypar {}`].includes(text);
}
