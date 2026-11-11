/** TypeScript host/session port of realtime-tex's two-path architecture. See UPSTREAM.md. */
import { EventEmitter } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { applyByteEdit, editSpans, maskTeX, minimalEdit, splitPreamble, splitSpans } from './document.js';
import { LiveEngine } from './engine.js';
import { isExact } from './display-list.js';
import { environment, findLuaLaTeX, INPUT_PATH_HOOK, inside, Processes, sourcePath, texPath } from './process.js';
import type { ByteEdit, Capture, CapturedRow, CapturedUnit, DisplayList, EditResult, Fragment, Placement, SessionConfig, SessionEvent, Span, Versions } from './types.js';

interface FileState { text: string; spans: Span[] }
interface Context { file: string; span: Span; unit: CapturedUnit; rows: Array<{ dl: DisplayList; index: number }>; verified: boolean; revision: number }
const IGNORED = new Set(['.git', '.texpro', '.rtex-ts', 'node_modules', 'dist', 'build']);
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const asObject = <T>(value: T | unknown[]): T => (Array.isArray(value) ? {} : value) as T;
const SAFE = new Set(('emph textbf textit texttt textrm textsf textnormal textsc underline mbox hbox fbox ensuremath frac dfrac tfrac sqrt left right big Big bigg Bigg sum prod int iint iiint oint lim sin cos tan log ln exp min max sup inf alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega infty partial nabla cdot times div pm mp leq geq neq approx equiv sim simeq propto in notin subset supset subseteq supseteq cup cap land lor neg forall exists to mapsto rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow hat widehat bar vec dot ddot tilde widetilde overline underbrace overbrace mathbf mathit mathrm mathsf mathtt mathcal mathbb mathfrak operatorname limits nolimits displaystyle textstyle scriptstyle scriptscriptstyle text ref eqref cite pageref autoref label footnote quad qquad thinspace enspace hspace vspace smallskip medskip bigskip TeX LaTeX ldots cdots vdots ddots colon lbrace rbrace langle rangle vert Vert backslash ell hbar emptyset angle degree det gcd bmod pmod binom dbinom tbinom').split(' '));
function eligible(text: string): boolean {
  const masked = maskTeX(text);
  if (/\\(?:begin|end)\b/.test(masked)) return false;
  for (const command of masked.matchAll(/\\([A-Za-z@]+|.)/gs)) if (command[1].length > 1 && !SAFE.has(command[1])) return false;
  return true;
}
function fragments(rows: CapturedRow[]): Fragment[] {
  const result: Fragment[] = [];
  for (const row of rows) {
    let f = result.at(-1);
    if (!f || f.page !== row.page) { f = { page: row.page, first_line: row.row, last_line: row.row, x: row.x, xs: [], baselines: [], approximate: false }; result.push(f); }
    f.last_line = row.row; f.xs.push(row.x); f.baselines.push(row.y);
  }
  return result;
}
function fingerprint(rows: Array<{ dl: DisplayList; index: number }>): string {
  return JSON.stringify(rows.map(({ dl, index }) => {
    const line = dl.lines[index];
    return [Math.round(line.w), Math.round(line.h), Math.round(line.d), line.items.map(item => {
      const [kind, ...v] = item;
      if (kind === 'g') {
        const f = dl.fonts[String(v[0])];
        return ['g', f?.filename, f?.size, f?.subfont || 0, f?.slant || 0, f?.extend || 0, v[1], v[2], Math.round(Number(v[3]) - line.x), Math.round(Number(v[4]) - line.y), v[5], v[6]];
      }
      if (kind === 'm') return ['m', v[0], Math.round(Number(v[1]) - line.x)];
      if (kind === 'r') return ['r', Math.round(Number(v[0]) - line.x), Math.round(Number(v[1]) - line.y), v[2], v[3]];
      return item;
    })];
  }));
}
export class Session extends EventEmitter {
  readonly projectRoot: string;
  readonly mainFile: string;
  readonly buildDir: string;
  private files = new Map<string, FileState>();
  private processes = new Processes();
  private executable: string;
  private env: NodeJS.ProcessEnv;
  private config: Required<Pick<SessionConfig, 'debounceMs' | 'compileTimeoutMs' | 'passTimeoutMs' | 'maxPasses' | 'maxSourceBytes' | 'fastBudgetMs'>>;
  private revision = 0; private layoutVersion = 0; private contextRevision = 0; private generation = 0; private editId = 0;
  private closed = false; private backgroundRunning = false; private backgroundPending = false;
  private timer?: NodeJS.Timeout; private engine?: LiveEngine; private preambleHash = '';
  private contexts = new Map<number, Context>(); private pageHashes = new Map<number, string>();
  private fastQueue = new Map<number, { file: string; span: Span; revision: number; editId: number }>(); private fastRunning = false;
  private backgroundDirs: string[] = []; private liveSnapshot = '';
  private convergence = 'Stale'; private lastPdf: string | null = null; private exports = 0;
  private exporting = false;
  private constructor(config: SessionConfig) {
    super();
    this.projectRoot = realpathSync.native(config.projectRoot);
    const main = sourcePath(this.projectRoot, config.mainFile); this.mainFile = path.relative(this.projectRoot, main).replaceAll('\\', '/');
    this.buildDir = path.resolve(config.buildDir || path.join(this.projectRoot, '.rtex-ts', randomUUID()));
    if (inside(this.buildDir, this.projectRoot)) throw new Error('Build directory cannot contain project root');
    mkdirSync(this.buildDir, { recursive: true });
    if (inside(this.projectRoot, this.buildDir) && !inside(this.projectRoot, realpathSync.native(this.buildDir))) throw new Error('Build directory escapes project');
    this.executable = findLuaLaTeX(config.lualatex);
    this.config = { debounceMs: config.debounceMs ?? 300, compileTimeoutMs: config.compileTimeoutMs ?? 5000, passTimeoutMs: config.passTimeoutMs ?? 120000, maxPasses: config.maxPasses ?? 5, maxSourceBytes: config.maxSourceBytes ?? 4 * 1024 * 1024, fastBudgetMs: config.fastBudgetMs ?? 50 };
    for (const value of Object.values(this.config)) if (!Number.isFinite(value) || value < 1) throw new Error('Invalid session limit');
    this.env = environment(this.projectRoot, this.mainFile, path.join(this.buildDir, 'font-cache'));
    this.readProject(this.projectRoot, 0);
    if (!this.files.has(this.mainFile)) this.addFile(this.mainFile, readFileSync(main, 'utf8'));
    splitPreamble(this.files.get(this.mainFile)!.text);
  }
  static async open(config: SessionConfig): Promise<Session> {
    const session = new Session(config);
    // Callers can attach listeners before any engine events arrive.
    session.timer = setTimeout(() => { void session.background(); }, 0);
    return session;
  }
  private event(event: SessionEvent): void { if (!this.closed) this.emit('event', event); }
  subscribe(listener: (event: SessionEvent) => void): () => void { this.on('event', listener); return () => this.off('event', listener); }
  versions(): Versions { return { source_revision: this.revision, context_revision: this.contextRevision, engine_generation: this.generation, layout_version: this.layoutVersion }; }
  processIds(): number[] { return [...this.processes.children].map(child => child.pid).filter((pid): pid is number => pid !== undefined); }
  status(): { versions: Versions; convergence: string } { return { versions: this.versions(), convergence: this.convergence }; }
  private readProject(dir: string, depth: number): void {
    if (depth > 12) throw new Error('Project nesting limit exceeded');
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED.has(entry.name) || entry.name.startsWith('.') || inside(this.buildDir, path.join(dir, entry.name))) continue;
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) { if (!inside(this.projectRoot, realpathSync.native(file))) throw new Error('Project symlink escapes root'); continue; }
      if (entry.isDirectory()) this.readProject(file, depth + 1);
      else if (/\.(tex|ltx)$/i.test(entry.name)) {
        if (this.files.size >= 500 || statSync(file).size > this.config.maxSourceBytes) throw new Error('Project source limit exceeded');
        this.addFile(path.relative(this.projectRoot, file).replaceAll('\\', '/'), readFileSync(file, 'utf8'));
      }
    }
  }
  private addFile(file: string, text: string): void {
    const bytes = [...this.files.values()].reduce((sum, value) => sum + Buffer.byteLength(value.text), 0);
    if (bytes + Buffer.byteLength(text) > 64 * 1024 * 1024) throw new Error('Project buffer limit exceeded');
    this.files.set(file, { text, spans: splitSpans(text, file === this.mainFile) }); }
  documentText(file: string): string { return this.files.get(this.key(file))!.text; }
  spans(file: string): Span[] { return this.files.get(this.key(file))!.spans.map(span => ({ ...span })); }
  private key(file: string): string {
    const real = sourcePath(this.projectRoot, file), key = path.relative(this.projectRoot, real).replaceAll('\\', '/');
    if (!this.files.has(key)) {
      if (this.files.size >= 500 || statSync(real).size > this.config.maxSourceBytes) throw new Error('Project source limit exceeded');
      this.addFile(key, readFileSync(real, 'utf8'));
    }
    return key;
  }
  applyEdit(file: string, edit: ByteEdit): EditResult { return this.setDocument(file, applyByteEdit(this.documentText(file), edit)); }
  setDocument(file: string, text: string): EditResult {
    if (this.closed) throw new Error('Session is closed');
    if (typeof text !== 'string' || Buffer.byteLength(text) > this.config.maxSourceBytes) throw new Error('Document size limit exceeded');
    const key = this.key(file), old = this.files.get(key)!;
    const total = [...this.files.values()].reduce((sum, value) => sum + Buffer.byteLength(value.text), 0);
    if (total - Buffer.byteLength(old.text) + Buffer.byteLength(text) > 64 * 1024 * 1024) throw new Error('Project buffer limit exceeded');
    const edit = minimalEdit(old.text, text);
    if (!edit) return { edit_id: this.editId, source_revision: this.revision, routed: 'background', reasons: ['unchanged'] };
    const spans = editSpans(old.text, text, old.spans, edit, key === this.mainFile), delta = Buffer.byteLength(text) - Buffer.byteLength(old.text);
    const affected = old.spans.find(span => edit.start >= span.start && edit.end <= span.end);
    const oldByStart = new Map(old.spans.map(span => [span.start, span]));
    for (const next of spans) {
      const unchanged = oldByStart.get(next.start), shifted = oldByStart.get(next.start - delta);
      const previous = unchanged?.end === next.end && unchanged.text === next.text ? unchanged
        : shifted && shifted.start >= edit.end && shifted.end + delta === next.end && shifted.text === next.text ? shifted : undefined;
      if (previous) next.id = previous.id;
    }
    const replacement = affected && spans.find(span => span.start === affected.start && span.end === affected.end + delta);
    if (replacement) replacement.id = affected!.id;
    this.files.set(key, { text, spans }); this.revision++; this.editId++;
    const retainedIds = new Set(spans.map(span => span.id));
    for (const span of old.spans) if (!retainedIds.has(span.id) && this.contexts.has(span.id)) {
      const context = this.contexts.get(span.id)!;
      this.event({ event: 'ParagraphUpdate', versions: this.versions(), par_id: span.id, edit_id: this.editId, status: 'removed', reasons: [], fragments: fragments(context.unit.placements), pagination_stale: true, context_stale: true, dl: context.rows[0]?.dl || emptyDrawing(), diagnostics: [], timing: { total_us: 0, tex_us: 0, traversal_us: 0 } });
      this.contexts.delete(span.id);
    }
    const routed = affected?.kind === 'preamble' ? 'preamble' : replacement?.kind === 'paragraph' && eligible(replacement.text) && this.contexts.has(replacement.id) && this.engine ? 'fast' : 'background';
    const reasons = routed === 'fast' ? [] : [routed === 'preamble' ? 'preamble changed' : 'unit requires full layout'];
    if (routed === 'preamble') { this.engine?.close(); this.engine = undefined; this.preambleHash = ''; this.generation++; }
    if (routed === 'fast') {
      this.fastQueue.set(replacement!.id, { file: key, span: replacement!, revision: this.revision, editId: this.editId }); void this.fast();
    } else this.event({ event: 'BackgroundScheduled', par_id: affected?.id || null, edit_id: this.editId, reasons });
    this.schedule(); return { edit_id: this.editId, source_revision: this.revision, routed, reasons };
  }
  private schedule(): void { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.background(); }, this.config.debounceMs); }
  requestLayout(): void { clearTimeout(this.timer); void this.background(); }
  private async fast(): Promise<void> {
    if (this.fastRunning || this.closed) return;
    this.fastRunning = true;
    try {
      while (this.fastQueue.size && this.engine && !this.closed) {
        const [id, task] = this.fastQueue.entries().next().value!; this.fastQueue.delete(id);
        const context = this.contexts.get(id), engine = this.engine, generation = this.generation;
        if (!context || !task.span || !eligible(task.span.text)) continue;
        const started = performance.now();
        try {
          await engine.request({ op: 'context', id, ctx: context.unit.context });
          if (!context.verified) {
            const probe = await engine.request({ op: 'compile', req: task.editId, ctx: id, source: context.span.text });
            if (probe.status !== 'ok' || !probe.dl || (probe.leaks || []).length || !isExact(probe.dl) || fingerprint(probe.dl.lines.map((_, index) => ({ dl: probe.dl!, index }))) !== fingerprint(context.rows)) {
              this.event({ event: 'BackgroundScheduled', par_id: id, edit_id: task.editId, reasons: ['probe differed from full layout'] }); continue;
            }
            context.verified = true;
          }
          const result = await engine.request({ op: 'compile', req: task.editId, ctx: id, source: task.span.text });
          if (this.closed || engine !== this.engine || generation !== this.generation || this.contexts.get(id) !== context || this.files.get(task.file)?.spans.find(span => span.id === id) !== task.span) continue;
          if (result.status !== 'ok' || !result.dl || (result.leaks || []).length || !isExact(result.dl) || result.dl.inserts > 0 || performance.now() - started > this.config.fastBudgetMs) {
            this.event({ event: 'BackgroundScheduled', par_id: id, edit_id: task.editId, reasons: ['live result needs full layout'] }); continue;
          }
          const placement = placeRows(context.unit.placements, result.dl);
          this.event({ event: 'ParagraphUpdate', versions: { ...this.versions(), source_revision: task.revision }, par_id: id, edit_id: task.editId, status: 'ok', reasons: [], fragments: placement.fragments, pagination_stale: placement.stale, context_stale: context.revision < task.revision - 1, dl: result.dl, diagnostics: [], timing: { total_us: (performance.now() - started) * 1000, tex_us: Number(result.t_tex_us || 0), traversal_us: Number(result.t_traverse_us || 0) } });
        } catch (error) {
          if (this.closed || engine !== this.engine) continue;
          engine.close(); this.engine = undefined; this.preambleHash = ''; this.generation++;
          this.event({ event: 'EngineState', engine_generation: this.generation, state: 'Restarting', reason: String(error) }); this.schedule();
        }
      }
    } finally { this.fastRunning = false; }
  }
  private snapshot(destination: string, files: Map<string, FileState>): void {
    mkdirSync(destination, { recursive: true }); let count = 0, bytes = 0;
    const visit = (from: string, to: string, depth: number) => {
      if (depth > 12) throw new Error('Snapshot nesting limit exceeded');
      for (const entry of readdirSync(from, { withFileTypes: true })) {
        const source = path.join(from, entry.name);
        if (IGNORED.has(entry.name) || entry.name.startsWith('.') || inside(this.buildDir, source)) continue;
        if (++count > 10000) throw new Error('Snapshot file limit exceeded');
        const target = path.join(to, entry.name);
        if (entry.isSymbolicLink()) { if (!inside(this.projectRoot, realpathSync.native(source))) throw new Error('Project symlink escapes root'); if (statSync(source).isDirectory()) continue; }
        if (entry.isDirectory()) { mkdirSync(target, { recursive: true }); visit(source, target, depth + 1); }
        else if (entry.isFile() || entry.isSymbolicLink()) {
          const size = statSync(source).size; bytes += size;
          if (size > 64 * 1024 * 1024 || bytes > 256 * 1024 * 1024) throw new Error('Snapshot size limit exceeded');
          copyFileSync(source, target);
        }
      }
    };
    visit(this.projectRoot, destination, 0);
    for (const [file, data] of files) { const target = path.join(destination, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, data.text); }
  }
  private async background(): Promise<void> {
    if (this.closed) return;
    if (this.backgroundRunning) { this.backgroundPending = true; return; }
    this.backgroundRunning = true;
    const revision = this.revision, files = new Map(this.files), dir = path.join(this.buildDir, 'background-' + randomUUID());
    const snapshot = path.join(dir, 'snapshot'), output = path.join(dir, 'output'), job = path.basename(this.mainFile, path.extname(this.mainFile));
    const started = performance.now();
    try {
      this.backgroundDirs.push(dir);
      this.snapshot(snapshot, files); mkdirSync(output, { recursive: true });
      // \include writes aux files below the output directory as well.
      for (const file of files.keys()) mkdirSync(path.join(output, path.dirname(file)), { recursive: true });
      let signature = '', passes = 0, code = 0, log = '', converged = false;
      const driver = path.join(dir, 'rtex-background.tex');
      writeFileSync(driver, INPUT_PATH_HOOK + '\\RequirePackage{rtex-capture}\\input{' + texPath(this.mainFile) + '}');
      const args = ['-interaction=nonstopmode', '-file-line-error', '--jobname=' + job, '--output-directory=' + texPath(output), texPath(driver)];
      const env = { ...environment(snapshot, this.mainFile, path.join(this.buildDir, 'font-cache')), RTEX_CAPTURE_DIR: texPath(output) };
      for (; passes < this.config.maxPasses; passes++) {
        const result = await this.processes.run(this.executable, args, snapshot, env, this.config.passTimeoutMs); code = result.code; log = result.log;
        if (this.closed) return;
        const next = auxiliarySignature(output);
        if (next === signature && code === 0 && !/Rerun to get|Please \(re\)run|There were undefined references|No file .+\.(?:bbl|ind)\./.test(log)) { converged = true; passes++; break; }
        signature = next;
        // Bibliography/index processes are deliberately not spawned implicitly in v0.1.
        if (code !== 0) { passes++; break; }
      }
      if (code !== 0 || !existsSync(path.join(output, job + '.rtex.json'))) throw new Error('Background capture failed: ' + log.slice(-6000));
      const capture = JSON.parse(readFileSync(path.join(output, job + '.rtex.json'), 'utf8')) as Capture;
      const errors = parseErrors(log);
      this.event({ event: 'Diagnostics', source: 'background', items: errors });
      if (code !== 0) throw new Error('Background compilation failed; retaining the last valid layout');
      const pages: Array<{ page: number; exact: boolean; hash: string; dl: DisplayList }> = [];
      const allPages = new Map<number, DisplayList>();
      const nextHashes = new Map<number, string>();
      if (!Number.isSafeInteger(capture.pages) || capture.pages < 0 || capture.pages > 1000) throw new Error('Page limit exceeded');
      for (let page = 1; page <= capture.pages; page++) {
        const data = readFileSync(path.join(output, `${job}.rtex-page${page}.json`), 'utf8');
        if (Buffer.byteLength(data) > 32 * 1024 * 1024) throw new Error('Page display list too large');
        const dl: DisplayList = JSON.parse(data); allPages.set(page, dl); const digest = hash(data);
        if (this.pageHashes.get(page) !== digest) pages.push({ page, exact: isExact(dl), hash: digest, dl });
        nextHashes.set(page, digest);
      }
      const { placements, contexts } = this.buildContexts(capture, files, allPages, revision);
      const pdf = path.join(this.buildDir, `layout-${this.layoutVersion + 1}.pdf`);
      copyFileSync(path.join(output, job + '.pdf'), pdf);
      // Publish a complete layout transaction only after every artifact is available.
      this.pageHashes = nextHashes; this.contexts = contexts;
      this.layoutVersion++; this.lastPdf = pdf; this.contextRevision++;
      this.convergence = revision !== this.revision ? 'Stale' : code !== 0 ? 'PassLimitReached' : converged ? 'Converged' : 'PassLimitReached';
      this.event({ event: 'LayoutUpdate', versions: { ...this.versions(), source_revision: revision }, compile: { state: code === 0 ? 'Ok' : 'CompiledWithErrors', count: errors.length }, convergence: { state: this.convergence as 'Converged' | 'Stale' | 'PassLimitReached' }, pages_total: capture.pages, pages_changed: pages, placements, eligible_paragraphs: [...this.contexts.keys()], pdf_fallback: [...allPages.values()].some(dl => !isExact(dl)) ? pdf : null, pdf_path: pdf, wall_ms: performance.now() - started, passes });
      if (this.closed) return;
      const preamble = splitPreamble(files.get(this.mainFile)!.text).preamble;
      if (hash(splitPreamble(this.files.get(this.mainFile)!.text).preamble) !== hash(preamble)) return;
      if (!this.engine || hash(preamble) !== this.preambleHash) {
        this.engine?.close(); const generation = ++this.generation;
        this.event({ event: 'EngineState', engine_generation: generation, state: 'Starting' });
        const engine = new LiveEngine(this.processes, this.executable, snapshot, path.join(this.buildDir, 'live-' + generation), environment(snapshot, this.mainFile, path.join(this.buildDir, 'font-cache')), this.config.compileTimeoutMs);
        this.engine = engine;
        try {
          await engine.start(preamble, path.join(output, job + '.aux'));
          if (this.closed || engine !== this.engine) { engine.close(); return; }
          this.preambleHash = hash(preamble); this.liveSnapshot = dir;
          this.event({ event: 'EngineState', engine_generation: generation, state: 'Ready' });
        } catch (error) {
          engine.close(); if (engine === this.engine) this.engine = undefined;
          this.event({ event: 'EngineState', engine_generation: generation, state: 'Failed', reason: String(error) });
        }
      }
      // Keep enough immutable layouts for hosts that are reading the previous one.
      if (this.layoutVersion > 3) rmSync(path.join(this.buildDir, `layout-${this.layoutVersion - 3}.pdf`), { force: true });
    } catch (error) {
      if (!this.closed) {
        this.convergence = 'Stale'; this.event({ event: 'Diagnostics', source: 'background', items: [{ severity: 'error', message: String(error) }] });
        this.event({ event: 'EngineState', engine_generation: this.generation, state: 'Failed', reason: String(error) });
      }
    } finally {
      this.backgroundRunning = false;
      const retained = this.backgroundDirs.slice(-3);
      this.backgroundDirs = this.backgroundDirs.filter(folder => { if (retained.includes(folder) || folder === this.liveSnapshot) return true; try { rmSync(folder, { recursive: true, force: true }); } catch { return true; } return false; });
      if (!this.closed && (this.backgroundPending || revision !== this.revision)) { this.backgroundPending = false; this.schedule(); }
    }
  }
  private buildContexts(capture: Capture, files: Map<string, FileState>, pages: Map<number, DisplayList>, revision: number): { placements: Placement[]; contexts: Map<number, Context> } {
    const contexts = new Map<number, Context>(), placements: Placement[] = [];
    const counters: Record<string, number> = {}, formats: Record<string, string> = {}, macros: Record<string, string> = {};
    const matches = new Map<number, number>();
    for (const unit of capture.units) {
      Object.assign(counters, asObject(unit.counters)); Object.assign(formats, asObject(unit.thefmt)); Object.assign(macros, asObject(unit.macros));
      const rawFile = (unit.file || this.mainFile).replaceAll('\\', '/').replace(/^\.\//, '');
      const file = path.isAbsolute(rawFile) ? path.relative(this.projectRoot, rawFile).replaceAll('\\', '/') : rawFile;
      const spans = files.get(file)?.spans || [];
      const span = spans.find(s => unit.begin_line >= s.firstLine && unit.begin_line <= s.lastLine)
        || spans.find(s => s.firstLine > unit.begin_line && (unit.end_line || 0) >= s.firstLine);
      if (!span || span.kind !== 'paragraph' || unit.kind !== 'par' || unit.nest !== 1 || !eligible(span.text)) continue;
      matches.set(span.id, (matches.get(span.id) || 0) + 1);
      const first = capture.paragraphs.find(p => unit.seqs.includes(p.seq) && p.begin);
      unit.context = { kind: unit.kind, name: unit.name, ints: first?.ints || unit.ints, dims: first?.dims || unit.dims, glues: first?.glues || unit.glues, parshape: first?.parshape || unit.parshape, everypar: unit.everypar || '', nobreak: unit.nobreak || false, afterindent: unit.afterindent || false, noskipsec: unit.noskipsec || false, counters: { ...counters }, thefmt: { ...formats }, macros: { ...macros }, begin: { nfss: first?.begin?.nfss || unit.nfss, color: first?.begin?.color || unit.color } };
      const rows: Context['rows'] = [];
      for (const row of unit.placements) {
        const dl = pages.get(row.page); if (!dl) continue;
        const index = dl.lines.findIndex(line => line.unit === unit.uid && line.row === row.row);
        if (index >= 0) rows.push({ dl, index });
      }
      if (!rows.length || rows.length !== unit.placements.length) continue;
      contexts.set(span.id, { file, span, unit, rows, verified: false, revision });
      placements.push({ par_id: span.id, fragments: fragments(unit.placements), lines: rows.length, kind: 'par' });
    }
    for (const [id, count] of matches) if (count !== 1) contexts.delete(id);
    return { placements: placements.filter(p => contexts.has(p.par_id)), contexts };
  }
  async exportPdf(out: string): Promise<{ path: string; converged: boolean }> {
    if (this.closed) throw new Error('Session is closed');
    if (this.exporting) throw new Error('A PDF export is already running');
    this.exporting = true;
    // Export is a fresh ordinary LuaLaTeX pass over an immutable buffer snapshot.
    const id = ++this.exports, revision = this.revision, dir = path.join(this.buildDir, 'export-' + id), source = path.join(dir, 'snapshot'), output = path.join(dir, 'output');
    try {
    const target = path.resolve(out);
    if (inside(dir, target)) throw new Error('Export destination cannot be inside its temporary directory');
    this.snapshot(source, new Map(this.files)); mkdirSync(output, { recursive: true });
    for (const file of this.files.keys()) mkdirSync(path.join(output, path.dirname(file)), { recursive: true });
    const job = path.basename(this.mainFile, path.extname(this.mainFile)); let signature = '', converged = false, passes = 0;
    const driver = path.join(dir, 'rtex-export.tex');
    writeFileSync(driver, INPUT_PATH_HOOK + '\\input{' + texPath(this.mainFile) + '}');
    for (; passes < this.config.maxPasses; passes++) {
      const result = await this.processes.run(this.executable, ['-interaction=nonstopmode', '-file-line-error', '--jobname=' + job, '--output-directory=' + texPath(output), texPath(driver)], source, environment(source, this.mainFile, path.join(this.buildDir, 'font-cache')), this.config.passTimeoutMs);
      if (this.closed || result.code) throw new Error('PDF export failed: ' + result.log.slice(-2000));
      const next = auxiliarySignature(output);
      if (signature === next && !/Rerun to get|Please \(re\)run|There were undefined references|No file .+\.(?:bbl|ind)\./.test(result.log)) { converged = revision === this.revision; passes++; break; } signature = next;
    }
    mkdirSync(path.dirname(target), { recursive: true }); copyFileSync(path.join(output, job + '.pdf'), target);
    this.event({ event: 'PdfExported', job_id: id, path: target, status: { state: 'Ok' }, converged, passes }); return { path: target, converged };
    } finally {
      this.exporting = false;
      rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    }
  }
  close(): void { this.closed = true; clearTimeout(this.timer); this.engine?.close(); this.processes.close(); this.fastQueue.clear(); this.removeAllListeners(); }
}
function emptyDrawing(): DisplayList { return { kind: 'paragraph', unit: 'sp', width: 0, height: 0, depth: 0, page: 0, page_width: 0, page_height: 0, origin: [0, 0], fonts: {}, flags: {}, images_info: {}, lines: [], other: [], glyphs: 0, inserts: 0 }; }
function placeRows(original: CapturedRow[], dl: DisplayList): { fragments: Fragment[]; stale: boolean } {
  if (!original.length) return { fragments: [], stale: true };
  const rows = dl.lines.map((line, i) => {
    const known = original[i]; if (known) return { ...known, row: i + 1 };
    const last = original.at(-1)!, prev = original.at(-2), step = prev && prev.page === last.page ? last.y - prev.y : Math.max(line.h + line.d, 12 * 65536);
    return { ...last, row: i + 1, y: last.y + step * (i - original.length + 1) };
  });
  const f = fragments(rows);
  for (const item of f) item.approximate = dl.lines.length !== original.length;
  return { fragments: f, stale: dl.lines.length !== original.length };
}
function parseErrors(log: string): Array<{ severity: 'error'; message: string }> {
  return log.split('\n').filter(line => /^!|^.+:\d+:/.test(line)).slice(0, 100).map(message => ({ severity: 'error', message }));
}

function auxiliarySignature(dir: string): string {
  const items: string[] = [];
  const visit = (folder: string) => { for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(aux|toc|lof|lot|out|bcf|bbl|idx|ind)$/.test(entry.name)) items.push(path.relative(dir, file), readFileSync(file).toString('base64'));
  } };
  visit(dir); return hash(items.join('|'));
}
