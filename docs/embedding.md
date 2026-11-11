# Embedding rtex-ts

[简体中文](embedding.zh-CN.md)

Use Node.js 22+, a separately installed LuaLaTeX and the fonts/packages the project requires. Choose the main file explicitly: rtex-ts does not choose between candidate main files, change an editor tab, or reinterpret a host's project configuration. The host owns permission to run TeX.

## A complete buffer example

```js
import { readFile } from 'node:fs/promises';
import { Session } from 'rtex-ts';

const session = await Session.open({
  projectRoot: '/path/to/project',
  mainFile: 'main.tex',
  debounceMs: 300,
});
const stopListening = session.subscribe(event => {
  if (event.event === 'Diagnostics') console.error(event.items);
  // Send drawing events to your view, keyed by session + versions.
});
const source = await readFile('/path/to/project/main.tex', 'utf8');
session.setDocument('main.tex', source.replace('Hello', 'Hello world'));
// Keep this session for the editor's lifetime. When closing the project:
// stopListening(); session.close();
```

Open returns before the first background layout. Subscribe immediately. Unsaved buffers are supplied with `setDocument(path, text)`; disk files are loaded initially. Subsequent external file changes are not watched automatically: the host must supply changed source buffers, request a layout, or recreate the session when other dependencies change. Incomplete source is retained in memory and may produce diagnostics while the last usable layout stays visible.

## Library contract

`Session.open(config)` accepts `projectRoot`, `mainFile`, and optional `buildDir`, `lualatex`, `debounceMs` (300), `compileTimeoutMs` (5000), `passTimeoutMs` (120000), `maxPasses` (5), `maxSourceBytes` (4 MiB/file), and `fastBudgetMs` (50). Source buffers are additionally bounded to 64 MiB in total; snapshots to 256 MiB and 10,000 files. Invalid paths, limits and edits throw.


Additional options in 0.1.7: `engine` (`lualatex`, `xelatex`, `pdflatex`), `texExecutable`, `eligibility` (`allowlist` default or opt-in `probe`), `trustedMacros`, `unitEnvs`, `mathOwnerAttribute` (0..65535), `bibTool` (`auto` default, `bibtex`, `biber`, `none`), `index` (true), `warmBackground` (true for LuaLaTeX), and `fastOnStaleContext`. `auxExecutables` can override `bibtex`, `biber` or whitelisted index-program paths; all use argument arrays and controlled working directories. Package/macro inference remains conservative. Explicitly trusted macros are a host policy decision, not a sandbox.

Since 0.1.8, `pictureCache` defaults to true for LuaLaTeX (`--no-picture-cache` in the CLI). Standalone TikZ/circuitikz/PGF pictures reuse session-owned PDF page extracts when source, preceding command/setup hashes and captured font/color/width agree. References, counters, external data, remembered/overlay pictures, ambiguous keys and unsafe/indirect effects remain uncached. A skip-boundary mismatch quarantines the key and forces another pass; a mismatched final pass never replaces the last layout. Caches hold at most 256 entries/64 MiB and expire after four unused passes. LuaTeX page extraction falls back to a bounded whole-PDF copy if unavailable. This is a rendering optimization, not proof of arbitrary macro purity. Cached pages still require PDF fallback; `exportPdf()` always compiles without this cache. `stats().pictureCache.manifestHits` counts offered manifest entries, which runtime state checks may decline.

XeLaTeX/pdfLaTeX emit PDF-only `LayoutUpdate`: `pages_changed` and `eligible_paragraphs` are empty, `pdf_fallback` names the PDF. They do not start a live engine or emit live-engine `Ready`. Wait for `LayoutUpdate` in these modes.
- `setDocument(path, text)` computes one minimal replacement and returns an `EditResult`.
- `applyEdit(path, { start, end, text })` replaces **UTF-8 bytes** in `[start, end)`. A split character, reversed or out-of-range edit is rejected.
- `documentText(path)` reads the session's current buffer, including unsaved edits.
- `spans(path)` returns current span IDs, byte ranges, text and source lines; these are conservative host units, not a complete TeX AST.
- `versions()` and `status()` expose revisions and convergence.
- `stats()` reports versions, convergence, source bytes, eligible units, pending live work, owned processes and background state.
- `verify()` probes eligible captured units without editing source; returns `{ sourceRevision, stale, units }`. An empty unit list does not certify the document. It is LuaLaTeX-only.
- `pauseBackground(true)` defers later background work; `false` resumes a pending layout. An already running pass is not cancelled.
- `requestLayout()` schedules a full layout now, without writing original source.
- `exportPdf(out)` performs fresh ordinary LuaLaTeX passes without the capture package. It returns `{ path, converged }`; `converged: false` is not a successful convergence guarantee.
- `subscribe(listener)` returns an unsubscribe function. The equivalent Node EventEmitter channel is `event`.
- `processIds()` returns a momentary list of owned process IDs for host supervision; it is not stable identity or permission to kill unrelated/reused PIDs.
- `close()` is idempotent, cancels timers and kills session-owned process groups (POSIX) or process trees (Windows). It does not delete caller exports or original files.

The default build directory is `.rtex-ts/<session UUID>` inside the project. Supply a session-specific build directory if the host needs a different cache policy. Resources/layout PDFs are retained for recent layouts; background snapshots retain three recent runs and the live engine's pinned snapshot. Hosts own final cache deletion after closing the session and releasing image/font handles.

## Events and ordering

`ParagraphUpdate` replaces one `par_id`. `dl` is a positioned display list; `fragments` assigns rows to pages. Remove that unit's old rows before drawing new rows. A `removed` status means the source span was deleted. `pagination_stale`, `context_stale`, or a fragment's `approximate` flag means global positioning is provisional.

`LayoutUpdate` supplies `pages_changed`, `pages_total`, `placements`, `eligible_paragraphs`, compile status, convergence and `pdf_path`. The PDF is an immutable copy of that layout. `pdf_fallback` is set for lists with unsupported drawing operations, but hosts may also use `pdf_path` for font formats they cannot draw. Keep the previous valid pages on a failed pass. Drop pages beyond the new total. After three newer layouts, old PDF copies may be removed: read or copy the PDF before then.

`Diagnostics` replaces a source's earlier list; an empty list clears it. `EngineState` reports startup, ready, restarting or failure. `BackgroundScheduled` explains why an edit is waiting. `PdfExported` reports clean export. Log details may contain project paths and source excerpts; do not send them to a remote service without the author's permission.

Each drawing event carries `source_revision`, `context_revision`, `engine_generation`, and `layout_version`. Track your own session/project identity as well. Do not install an old paragraph over a newer edit, or a background snapshot over a newer live overlay. The session filters results whose paragraph changed again; the host still owns view ordering, cancellation and closed-project guards.

## Drawing

Coordinates are TeX scaled points: 65536 sp = 1 pt, and 65781.76 sp = 1 PDF point. Y grows downward. Draw glyph IDs from the named font file at the supplied sizes and positions; a browser `fillText()` call would re-shape the text and is not equivalent. Font collections, slant, extension, expansion, colour, rules and image transforms must be respected.

For each fragment, rows `first_line..last_line` are 1-based and inclusive. Translate row `j` by `fragment.xs[j] - line.x` horizontally and `fragment.baselines[j] - line.y` vertically. Background page `line.unit` values are capture IDs, **not** host `par_id` values. Use `placements` and row coordinates when replacing source units.

Pages with raw PDF literals or unsupported operations require PDF rendering. Type 1 fonts may have no glyph index; a host unable to decode them must also use PDF. Never silently drop unknown records or draw them with substitute fonts. This package does not include hit-testing, SyncTeX, an editor or PDF.js; hosts implement those against the matching layout snapshot.

## CLI protocol

```sh
rtex-ts serve --project /path/to/project --main main.tex --build /path/to/session-cache
```

Commands are `set_document`, `edit`, `spans`, `status`, `stats`, `ping`, `pause_background`, `verify`, `request_layout`, `export_pdf`, and `quit`. `pause_background` requires a boolean `paused`; `verify` runs asynchronously and only one verification may run at once. They use the fields shown in README; `export_pdf` requires `out`, `spans` takes `path`. Optional `id` values are echoed on successful replies. Failures use `{ "reply": "error", "message": "..." }`; unknown commands are rejected. Drawing events use an `event` discriminator. Do not assume replies and events alternate; drain stdout continuously.

The server closes the session when stdin closes. Stdout is JSON-lines only. It bounds output queued for a slow consumer to 64 MiB. This protocol resembles upstream rtex but intentionally implements a subset; there is no C ABI, Rust dependency or upstream API-compatibility promise. Standalone commands also include `export --out FILE`, `verify`, `profile` and `dl2json --input FILE`. `profile` reports a Node memory/CPU snapshot, plus startup wall times, not TeX process-tree resource use. `verify` without `--pdf` checks eligible live units only. Configuration flags include `--engine`, `--tex`, `--eligibility`, `--trusted-macros`, `--unit-envs`, `--math-owner-attribute`, `--bib-tool`, `--no-index`, and `--no-warm-background`.

## Security and distribution

Project paths and source symlink escapes are validated, and processes use argument arrays. These checks protect the host interface; they do not sandbox LuaLaTeX. Documents can execute Lua and read/write with the user's permissions. Use OS-level isolation for untrusted projects.

Ship `dist/`, the vendored Lua/TeX support directory, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `UPSTREAM.md`, and the vendored license/manifest. Electron hosts should unpack the support files outside ASAR so LuaLaTeX can read them; keep Node capability behind preload/IPC and run the session off the renderer thread. Retain upstream attribution. No Rust binary, TeX distribution or fonts are included in the npm package.

## Recovery and resource limits

A background layout is installed atomically after its display lists, contexts and PDF are available. Failed compilations retain the previous valid layout. Export scratch directories are removed after success or failure; only one export per session runs at a time. Closed live engines release their work directories after their processes exit.

CLI requests are limited to 8 MiB of UTF-8 bytes before a newline is received. Input consumption follows output backpressure without an unbounded request queue. Export runs asynchronously, so `status` and `quit` remain available; a second concurrent export is rejected.

Auxiliary tools run on trusted document requests. `auto` chooses Biber when a `.bcf` exists, otherwise BibTeX for `\bibdata`; index programs are restricted to makeindex/texindy/xindy/truexindy/upmendex/mendex. The tool programs and document dependencies must be installed separately. Failure preserves the previous valid layout.

## Startup cache and policy inference (0.1.9)

The default follows the TeX installation font cache, including an existing `TEXMFCACHE`, instead of forcing a fresh cache per session. TeX/the host owns this cache; `close()` does not delete it. Restricted or isolated hosts can set `fontCacheDir` (`--font-cache DIR` in the CLI), outside project sources or inside this session’s build directory. It may be reused across sessions; initial generation still costs time and requires writable cache directories.

Inference supports braced/bare new/renew/providecommand names, parameterless `\def`, DeclareMathOperator, xparse definitions with mandatory `m` arguments only, and checked custom inner/block environments. Balanced definition bodies cannot introduce deferred declarations as top-level facts. Unsupported signatures, recursion, unknown and global-effect definitions stay on the background path. Heading wrappers, class-specific rules and full text/math-mode inference remain unported. Newly eligible units still require old-source probes and context checks.

`stats().startup` reports first-layout and live-ready durations. See [verification tools](verification.md) for `verify --pdf` and `pdf-compare`.
