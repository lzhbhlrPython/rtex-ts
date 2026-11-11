/** Picture scanning/cache adapted from realtime-tex 0.0.7 piccache.rs (MIT).
 * PDF extraction uses the separately installed LuaTeX, not a bundled PDF library.
 */
import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { splitPreamble } from './document.js';
import { effectivePreamble, inputTarget, resolveInput, stripComments } from './preamble.js';
import { groupAt, texTokens } from './tex-syntax.js';
import { Processes, texPath } from './process.js';

export interface PictureRef { key: string; env: string; hash: string; cacheable: boolean; end_line: number }
export interface RecordedPic { env: string; page: number; x: number; y: number; w: number; h: number; d: number; page_height: number; state: string }
interface Entry { env: string; state: string; pdf: string; page: number; bbox: number[]; w: number; h: number; d: number; lastUsed: number }
const ENVS = new Set(['tikzpicture', 'circuitikz', 'pgfpicture']);
const INNER_ENVS = new Set(['scope', 'pgfscope', 'axis', 'semilogxaxis', 'semilogyaxis', 'loglogaxis', 'groupplot', 'pgfonlayer', 'pgfinterruptboundingbox', 'aligned', 'alignedat', 'gathered', 'matrix', 'pmatrix', 'bmatrix', 'smallmatrix']);
const FORBIDDEN = new Set(('label ref pageref eqref footnotemark footnotetext href hyperref hyperlink hypertarget url autoref cref Cref vref nameref the value arabic roman Roman alph Alph fnsymbol today newcounter stepcounter refstepcounter addtocounter setcounter verb input pgfimage includesvg includepdf lstinputlisting include footnote index marginpar write immediate pgfmathrandom random pgfmathsetseed pdfsavepos savepos global xdef gdef savebox sbox pgfdeclarelayer newbox newsavebox usebox setbox catcode makeatletter makeatother ExplSyntaxOn obeylines obeyspaces scantokens lstinline mintinline Verb directlua luaexec luadirect csname expandafter').split(' '));
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function uncacheablePicture(source: string): boolean {
  const text = stripComments(source);
  if (/remember\s+picture|overlay|trim\s+(?:left|right|axis)|legend\s+to\s+name|\b(?:table|file)\s*[\[{]/.test(text)) return true;
  for (const token of texTokens(text)) {
    if (token.kind === 'opaque') return true;
    if (token.kind === 'begin' && !ENVS.has(token.value) && !INNER_ENVS.has(token.value)) return true;
    if (token.kind === 'command' && (FORBIDDEN.has(token.value) || /^(?:cite|footcite|includegraphics|pgfplotstable)/.test(token.value) || /^the/.test(token.value) && !['theta', 'therefore'].includes(token.value))) return true;
  }
  return false;
}
/** Follow literal inputs in read order; ambiguous/repeated source keys cannot be cached. */
export function scanPictures(files: Map<string, { text: string }>, main: string): PictureRef[] {
  if (![...files.values()].some(file => /\\begin\s*\{\s*(?:tikzpicture|circuitikz|pgfpicture)\s*\}/.test(file.text))) return [];
  const output: PictureRef[] = [], visits = new Map<string, number>(), stack = new Set<string>();
  const remembered = [...files.values()].some(file => /remember\s+picture/.test(stripComments(file.text)));
  // Include hidden counter/reference effects in user macro bodies, not just the literal picture.
  const definitions = new Map<string, string[]>();
  for (const { text } of files.values()) for (const token of texTokens(text)) {
    if (token.kind !== 'command' || !['def', 'edef', 'gdef', 'xdef', 'newcommand', 'renewcommand', 'providecommand', 'DeclareRobustCommand', 'NewDocumentCommand', 'RenewDocumentCommand', 'let'].includes(token.value)) continue;
    const tail = text.slice(token.end).replace(/^\s*\*?\s*/, ''), target = /^(?:\{\s*)?\\([A-Za-z@]+)/.exec(tail); if (!target) continue;
    const offset = text.length - tail.length;
    let body: string | undefined;
    if (token.value === 'let') body = /^\s*=?\s*(\\[A-Za-z@]+)/.exec(tail.slice(target[0].length))?.[1];
    else if (['def', 'edef', 'gdef', 'xdef'].includes(token.value)) { const at = text.indexOf('{', offset + target[0].length); if (at >= 0) body = groupAt(text, at)?.value; }
    else {
      const argument = groupAt(text, offset); let from = argument?.end ?? offset + target[0].length;
      for (let n = 0; n < 2; n++) { const options = groupAt(text, from, '[', ']'); if (options) from = options.end; }
      if (token.value.endsWith('DocumentCommand')) { const signature = groupAt(text, from); if (signature) from = signature.end; }
      body = groupAt(text, from)?.value;
    }
    if (body !== undefined) definitions.set(target[1], [...(definitions.get(target[1]) || []), body]);
  }
  const dangerous = new Set<string>(), callers = new Map<string, Set<string>>();
  for (const [name, bodies] of definitions) for (const body of bodies) {
    if (uncacheablePicture(body)) dangerous.add(name);
    for (const token of texTokens(body)) if (token.kind === 'command' && definitions.has(token.value)) {
      let names = callers.get(token.value); if (!names) callers.set(token.value, names = new Set()); names.add(name);
    }
  }
  const queue = [...dangerous];
  for (let n = 0; n < queue.length; n++) for (const name of callers.get(queue[n]) || []) if (!dangerous.has(name)) { dangerous.add(name); queue.push(name); }
  let prelude = digest(effectivePreamble(files, main, false)), uncertain = false;
  const walk = (file: string, depth: number) => {
    if (depth > 12 || stack.has(file)) return;
    const data = files.get(file); if (!data) return;
    stack.add(file); visits.set(file, (visits.get(file) || 0) + 1);
    let start = 0, end = data.text.length;
    if (file === main) { const bounds = splitPreamble(data.text); start = bounds.bodyStart; end = bounds.bodyEnd; }
    const text = data.text, tokens = texTokens(text); let consumed = start, groups = 0;
    for (const token of tokens) {
      if (token.start < consumed || token.start >= end) continue;
      if (token.kind === 'open') { groups++; continue; }
      if (token.kind === 'close') { groups--; continue; }
      if (groups) continue; // A definition/macro argument is not an executed source picture.
      if (token.kind === 'begin' && ENVS.has(token.value)) {
        let nesting = 1, balanced = 0, nested = false, stop = token.end, complete = false;
        for (let next = tokens.next(); !next.done; next = tokens.next()) {
          const inner = next.value;
          if (inner.kind === 'open') balanced++;
          if (inner.kind === 'close') balanced--;
          if (balanced < 0) nested = true;
          if (inner.kind === 'begin' && ENVS.has(inner.value)) { nesting++; nested = true; }
          if (inner.kind === 'end' && ENVS.has(inner.value) && --nesting === 0) { stop = inner.end; complete = inner.value === token.value && balanced === 0; break; }
        }
        const body = text.slice(token.start, stop), lineStart = text.lastIndexOf('\n', token.start - 1) + 1;
        const ownLine = !text.slice(lineStart, token.start).trim() && text.slice(token.start, token.end) === `\\begin{${token.value}}`;
        let indirect = false;
        for (const t of texTokens(body)) if (t.kind === 'command' && dangerous.has(t.value)) { indirect = true; break; }
        if (output.length < 4096) output.push({ key: file + ':' + (text.slice(0, token.start).split('\n').length), env: token.value, hash: digest(prelude + '\0' + stripComments(body)), cacheable: !remembered && !uncertain && ownLine && complete && !nested && !indirect && !uncacheablePicture(body) && !body.slice(0, body.indexOf('\n') < 0 ? body.length : body.indexOf('\n')).includes('\\end{'), end_line: text.slice(0, stop).split('\n').length });
        consumed = stop; continue;
      }
      if (!['command', 'begin', 'end'].includes(token.kind)) continue;
      if (['input', 'include', 'subfile'].includes(token.value)) {
        const arg = inputTarget(text, token.end), target = arg && resolveInput(files, file, arg.value);
        if (target) walk(target, depth + 1);
        else uncertain = true;
      }
      if (/^(?:directlua|latelua|luaexec|luadirect|pgfmathrandom|random|pgfmathsetseed|pdfextension|pdfvariable)$/.test(token.value) || dangerous.has(token.value) || token.kind === 'begin' && token.value === 'landscape') uncertain = true;
      {
        // Upstream hashes setup statements. Also hash other executed command lines:
        // a user macro call can change a later picture's definitions indirectly.
        let balance = 0, lines = 0, finish = text.length;
        for (const part of texTokens(text.slice(token.start))) {
          if (part.kind === 'open') balance++;
          if (part.kind === 'close') balance--;
          if (part.kind === 'text' && part.value === '\n' && (++lines >= 64 || balance <= 0)) { finish = token.start + part.end; break; }
        }
        if (balance !== 0) uncertain = true;
        prelude = digest(prelude + '\0' + stripComments(text.slice(token.start, finish))); consumed = finish;
      }
    }
    stack.delete(file);
  };
  walk(main, 0);
  for (const picture of output) if ((visits.get(picture.key.slice(0, picture.key.lastIndexOf(':'))) || 0) > 1) picture.cacheable = false;
  return output;
}

/** Session-owned, immutable page extracts. Entries expire after four unwanted passes. */
export class PictureCache {
  private serial = 0;
  private entries = new Map<string, Entry>();
  private bad = new Map<string, number>();
  private hits = 0;
  constructor(private dir: string, private processes: Processes, private executable: string, private timeout: number) {}
  stats(): { entries: number; manifestHits: number } { return { entries: this.entries.size, manifestHits: this.hits }; }
  async manifest(pictures: PictureRef[], destination: string): Promise<void> {
    this.serial++; this.hits = 0; const manifest: Record<string, unknown> = {};
    for (const picture of pictures) {
      if (this.hits >= 256) break;
      const entry = this.entries.get(picture.hash);
      if (!picture.cacheable || !entry || entry.env !== picture.env || (this.bad.get(picture.key) || 0) >= this.serial) continue;
      try { await fs.access(path.join(this.dir, entry.pdf)); } catch { this.entries.delete(picture.hash); continue; }
      entry.lastUsed = this.serial;
      manifest[picture.key] = { ...entry, pdf: texPath(path.join(this.dir, entry.pdf)), end_line: picture.end_line }; this.hits++;
    }
    if (this.hits) {
      const data = JSON.stringify(manifest); if (Buffer.byteLength(data) > 8 * 1024 * 1024) throw new Error('Picture manifest too large');
      const temp = destination + '.' + randomUUID();
      try { await fs.writeFile(temp, data); await fs.rename(temp, destination); } finally { await fs.rm(temp, { force: true }); }
    }
    else await fs.rm(destination, { force: true });
  }
  async absorb(pictures: PictureRef[], recorded: Record<string, RecordedPic> | unknown[], mismatched: string[], pdf: string, env: NodeJS.ProcessEnv, closed: () => boolean): Promise<void> {
    for (const [key, until] of this.bad) if (until < this.serial) this.bad.delete(key);
    for (const key of mismatched) { const picture = pictures.find(p => p.key === key); if (picture) this.entries.delete(picture.hash); this.bad.set(key, this.serial + 4); }
    while (this.bad.size > 4096) this.bad.delete(this.bad.keys().next().value!);
    const fresh: Array<{ picture: PictureRef; record: RecordedPic }> = [];
    for (const picture of pictures) {
      if (!picture.cacheable || this.bad.has(picture.key) || Array.isArray(recorded)) continue;
      const record = recorded[picture.key]; if (!record || record.env !== picture.env || typeof record.state !== 'string' || record.state.length > 8192) continue;
      if (![record.page, record.x, record.y, record.w, record.h, record.d, record.page_height].every(Number.isSafeInteger) || record.page < 1 || record.page > 1000 || record.w <= 0 || record.h + record.d <= 0 || record.page_height <= 0) continue;
      if (this.entries.get(picture.hash)?.state === record.state) continue;
      fresh.push({ picture, record }); if (fresh.length >= 256) break;
    }
    if (fresh.length && !closed()) {
      await fs.mkdir(this.dir, { recursive: true });
      const pages = [...new Set(fresh.map(item => item.record.page))].sort((a, b) => a - b), name = 'p-' + randomUUID() + '.pdf', destination = path.join(this.dir, name);
      const work = path.join(this.dir, 'extract-' + randomUUID()); await fs.mkdir(work);
      let remap = new Map(pages.map((page, i) => [page, i + 1]));
      try {
        const driver = path.join(work, 'extract.tex');
        const source = '\\pdfvariable horigin=0pt\n\\pdfvariable vorigin=0pt\n' + pages.map(page => `\\saveimageresource page ${page} {${texPath(pdf)}}\n\\setbox0=\\hbox{\\useimageresource \\lastsavedimageresourceindex}\n\\pagewidth=\\wd0 \\pageheight=\\dimexpr\\ht0+\\dp0\\relax\n\\shipout\\box0\n`).join('') + '\\end\n';
        await fs.writeFile(driver, source); if (closed()) return;
        const binary = path.join(path.dirname(this.executable), process.platform === 'win32' ? 'luatex.exe' : 'luatex');
        try {
          const result = await this.processes.run(binary, ['-interaction=nonstopmode', '-halt-on-error', '--output-directory=' + texPath(work), texPath(driver)], work, env, this.timeout);
          if (closed()) return;
          if (result.code !== 0) throw new Error('PDF page extraction failed');
          await fs.rename(path.join(work, 'extract.pdf'), destination);
        } catch (error) {
          if (closed()) return;
          if ((await fs.stat(pdf)).size > 64 * 1024 * 1024) throw error;
          await fs.copyFile(pdf, destination); remap = new Map(pages.map(page => [page, page]));
        }
        if ((await fs.stat(destination)).size > 64 * 1024 * 1024) await fs.rm(destination, { force: true });
        else for (const { picture, record: r } of fresh) this.entries.set(picture.hash, { env: r.env, state: r.state, pdf: name, page: remap.get(r.page)!, bbox: [r.x, r.page_height - r.y - r.d, r.x + r.w, r.page_height - r.y + r.h], w: r.w, h: r.h, d: r.d, lastUsed: this.serial });
      } finally { await fs.rm(work, { recursive: true, force: true, maxRetries: 5 }); }
    }
    for (const [key, entry] of this.entries) if (entry.lastUsed + 4 < this.serial) this.entries.delete(key);
    while (this.entries.size > 256) this.entries.delete(this.entries.keys().next().value!);
    const files = await fs.readdir(this.dir).catch(() => []);
    const sizes = new Map<string, number>();
    for (const name of files.filter(name => /^p-[a-f0-9-]+\.pdf$/.test(name))) sizes.set(name, (await fs.stat(path.join(this.dir, name))).size);
    let total = [...sizes.values()].reduce((a, b) => a + b, 0);
    for (const [key, entry] of this.entries) { if (total <= 64 * 1024 * 1024) break; this.entries.delete(key); if (![...this.entries.values()].some(e => e.pdf === entry.pdf)) total -= sizes.get(entry.pdf) || 0; }
    const referenced = new Set([...this.entries.values()].map(e => e.pdf));
    for (const name of sizes.keys()) if (!referenced.has(name)) await fs.rm(path.join(this.dir, name), { force: true }).catch(() => {});
  }
}
