/** Public host protocol, modeled after realtime-tex 0.0.7. */
export interface Versions { source_revision: number; context_revision: number; engine_generation: number; layout_version: number }
export interface FontDescription { id: number; size: number; filename: string; subfont: number; slant: number; extend: number; squeeze: number; [key: string]: unknown }
export type DrawItem = [string, ...unknown[]];
export interface DisplayLine { par: number; i: number; x: number; y: number; w: number; h: number; d: number; unit?: number; row?: number; items: DrawItem[] }
export interface MathOwners { glyphs: Array<{ owner: number; font: number; char: number; bbox: [number, number, number, number] }>; fields: Array<{ owner: number; role: 'num' | 'den' | 'radicand' | 'sup' | 'sub' | 'degree' | 'cell' | 'math'; empty: boolean; bbox: [number, number, number, number] }> }
export interface DisplayList { math_owners?: MathOwners; kind: 'paragraph' | 'page'; unit: 'sp'; width: number; height: number; depth: number; page: number; page_width: number; page_height: number; origin: [number, number]; fonts: Record<string, FontDescription>; flags: Record<string, number>; images_info: Record<string, { file: string; page: number; pages: number }>; lines: DisplayLine[]; other: DrawItem[]; glyphs: number; inserts: number }
export interface Fragment { page: number; first_line: number; last_line: number; x: number; xs: number[]; baselines: number[]; approximate: boolean }
export interface Diagnostic { severity: 'error' | 'warning'; message: string; file?: string; line?: number; context?: string }
export interface Placement { par_id: number; fragments: Fragment[]; lines: number; kind: string }
export type SessionEvent =
  | { event: 'EngineState'; state: string; engine_generation: number; reason?: string }
  | { event: 'Diagnostics'; source: string; items: Diagnostic[] }
  | { event: 'BackgroundScheduled'; par_id: number | null; reasons: string[]; edit_id: number }
  | { event: 'ParagraphUpdate'; versions: Versions; par_id: number; edit_id: number; status: 'ok' | 'error' | 'removed'; reasons: string[]; fragments: Fragment[]; pagination_stale: boolean; context_stale: boolean; dl: DisplayList; diagnostics: Diagnostic[]; timing: { total_us: number; tex_us: number; traversal_us: number } }
  | { event: 'LayoutUpdate'; versions: Versions; compile: { state: 'Ok' | 'CompiledWithErrors' | 'Failed'; count?: number }; convergence: { state: 'Converged' | 'Converging' | 'Stale' | 'PassLimitReached' }; pages_total: number; pages_changed: Array<{ page: number; exact: boolean; hash: string; dl: DisplayList }>; placements: Placement[]; eligible_paragraphs: number[]; pdf_fallback: string | null; pdf_path: string; wall_ms: number; passes: number }
  | { event: 'PdfExported'; job_id: number; path: string | null; status: { state: string }; converged: boolean; passes: number };
export type AuxiliaryProgram = 'bibtex' | 'biber' | 'makeindex' | 'texindy' | 'xindy' | 'truexindy' | 'upmendex' | 'mendex';
export interface SessionConfig { auxExecutables?: Partial<Record<AuxiliaryProgram, string>>; engine?: 'lualatex' | 'xelatex' | 'pdflatex'; texExecutable?: string; eligibility?: 'probe' | 'allowlist'; trustedMacros?: string[]; unitEnvs?: string[]; mathOwnerAttribute?: number; bibTool?: 'auto' | 'bibtex' | 'biber' | 'none'; index?: boolean; warmBackground?: boolean; pictureCache?: boolean; fastOnStaleContext?: boolean; projectRoot: string; mainFile: string; buildDir?: string; lualatex?: string; debounceMs?: number; compileTimeoutMs?: number; passTimeoutMs?: number; maxPasses?: number; maxSourceBytes?: number; fastBudgetMs?: number }
export interface EditResult { edit_id: number; source_revision: number; routed: 'fast' | 'background' | 'preamble'; reasons: string[] }
export interface ByteEdit { start: number; end: number; text: string }
export interface Span { id: number; start: number; end: number; firstLine: number; lastLine: number; text: string; kind: 'paragraph' | 'environment' | 'heading' | 'preamble' | 'unsupported' | 'trailer' }
export interface CapturedRow { page: number; row: number; par: number; line: number; x: number; y: number; w: number; h: number; d: number }
export interface CapturedUnit {
  uid: number; kind: string; name?: string; file?: string; begin_line: number; end_line?: number; nest: number; seqs: number[]; placements: CapturedRow[]; rows: number;
  counters: Record<string, number>; thefmt: Record<string, string>; macros: Record<string, string>;
  everypar: string; nobreak: boolean; afterindent: boolean; noskipsec: boolean;
  nfss: Record<string, unknown>; color?: string; ints: Record<string, number>; dims: Record<string, number>; glues: Record<string, number[]>; parshape?: unknown;
  context?: Record<string, unknown>;
}
export interface Capture { pics?: Record<string, import('./picture-cache.js').RecordedPic> | unknown[]; pic_mismatch?: string[]; pages: number; units: CapturedUnit[]; paragraphs: Array<{ seq: number; ints: unknown; dims: unknown; glues: unknown; parshape?: unknown; begin?: { nfss: unknown; color?: unknown } }>; counters: string[] }
