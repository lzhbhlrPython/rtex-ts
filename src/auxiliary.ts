/** Auxiliary tools and balanced aux labels, adapted from realtime-tex background.rs (MIT). */
import fs from 'node:fs';
import type { AuxiliaryProgram } from './types.js';
import path from 'node:path';
import { groupAt, texTokens } from './tex-syntax.js';
import { inside, Processes, texPath } from './process.js';
export type BibTool = 'auto' | 'bibtex' | 'biber' | 'none';
const INDEX_PROGRAMS = new Set(['makeindex', 'texindy', 'xindy', 'truexindy', 'upmendex', 'mendex']);
export function indexCommand(recorded: string, idx: string): { program: string; args: string[] } {
  for (const line of recorded.split('\n')) {
    const words = line.trim().split(/\s+/), program = words[0];
    if (words.length < 2 || words.at(-1) !== idx || !INDEX_PROGRAMS.has(program)) continue;
    const args = words.slice(1); if (program === 'makeindex' && !args.includes('-q')) args.unshift('-q');
    return { program, args };
  }
  return { program: 'makeindex', args: ['-q', idx] };
}
/** Adapted from the upstream capture package; export records tools without capture callbacks. */
export const INDEX_HOOK = String.raw`\makeatletter
\AddToHook{package/imakeidx/after}{\newwrite\rtexindexcommands\immediate\openout\rtexindexcommands=\jobname.rtex-idxcmd
\def\imki@exec#1{\immediate\write\rtexindexcommands{#1}}%
\def\imki@finalmessage#1{\immediate\write\rtexindexcommands{\imki@program\imki@options#1.idx}}}
\makeatother
`;
export class AuxiliaryTools {
  private bibliography = '';
  private indexed = new Map<string, string>();
  constructor(private processes: Processes, private executable: string, private timeout: number, private bib: BibTool = 'auto', private index = true, private executables: Partial<Record<AuxiliaryProgram, string>> = {}) {}
  private tool(name: string): string {
    const configured = this.executables[name as AuxiliaryProgram]; if (configured) return configured;
    const folder = path.dirname(this.executable);
    return folder === '.' ? name : path.join(folder, name + (process.platform === 'win32' ? '.exe' : ''));
  }
  async run(root: string, main: string, output: string, env: NodeJS.ProcessEnv): Promise<void> {
    const job = path.basename(main, path.extname(main));
    const aux = read(path.join(output, job + '.aux')), bcf = read(path.join(output, job + '.bcf'));
    const selected = this.bib === 'auto' ? bcf ? 'biber' : /\\bibdata\s*\{/.test(aux) ? 'bibtex' : 'none' : this.bib;
    const signature = selected === 'biber' ? bcf : [...aux.matchAll(/\\(?:citation|bibdata|bibstyle)\{[^}]*\}/g)].map(match => match[0]).join('\n');
    const mainDir = path.join(root, path.dirname(main));
    const sep = process.platform === 'win32' ? ';' : ':';
    const searches = texPath(mainDir) + sep + texPath(root) + '//' + sep;
    if (selected !== 'none' && signature && (this.bibliography !== signature || !fs.existsSync(path.join(output, job + '.bbl')))) {
      const args = selected === 'biber' ? ['--input-directory=' + texPath(output), '--output-directory=' + texPath(output), job] : [texPath(path.join(output, job))];
      const result = await this.processes.run(this.tool(selected), args, mainDir, { ...env, BIBINPUTS: searches, BSTINPUTS: searches }, this.timeout);
      if (result.code) throw new Error(selected + ' failed: ' + result.log.slice(-2000));
      this.bibliography = signature;
    }
    if (!this.index) return;
    let files = 0;
    const visit = async (dir: string, depth = 0): Promise<void> => {
      if (depth > 12) throw new Error('Index output nesting limit exceeded');
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (++files > 10000) throw new Error('Index output file limit exceeded');
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) { await visit(file, depth + 1); continue; }
        if (!entry.isFile() || !entry.name.endsWith('.idx')) continue;
        const text = read(file), ind = file.replace(/\.idx$/, '.ind');
        if (!text || (this.indexed.get(file) === text && fs.existsSync(ind))) continue;
        const { program, args } = indexCommand(read(path.join(output, job + '.rtex-idxcmd')), path.relative(output, file).replaceAll('\\', '/'));
        const result = await this.processes.run(this.tool(program), args, output, { ...env, INDEXSTYLE: searches }, this.timeout);
        if (result.code) throw new Error('makeindex failed: ' + result.log.slice(-2000));
        this.indexed.set(file, text);
      }
    };
    await visit(output);
  }
}
function read(file: string): string { if (!fs.existsSync(file)) return ''; if (fs.statSync(file).size > 8 * 1024 * 1024) throw new Error('Auxiliary file too large'); return fs.readFileSync(file, 'utf8'); }
export function readAuxLabels(file: string): Array<[string, string]> {
  const root = path.dirname(file), labels = new Map<string, string>(), seen = new Set<string>();
  const visit = (target: string, depth: number) => {
    if (depth > 12 || seen.has(target) || !inside(root, target) || !fs.existsSync(target)) return;
    if (!inside(fs.realpathSync(root), fs.realpathSync(target))) throw new Error('Auxiliary symlink escapes output');
    seen.add(target); const text = read(target);
    if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('Auxiliary file too large');
    for (const token of texTokens(text)) {
      if (token.kind !== 'command' || !['newlabel', 'bibcite', '@input'].includes(token.value)) continue;
      const key = groupAt(text, token.end); if (!key) continue;
      if (token.value === '@input') { visit(path.resolve(root, key.value), depth + 1); continue; }
      const body = groupAt(text, key.end); if (body) labels.set((token.value === 'newlabel' ? 'r@' : 'b@') + key.value, body.value);
    }
  };
  visit(file, 0); return [...labels];
}
