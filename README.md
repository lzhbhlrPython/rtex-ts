# rtex-ts

Experimental incremental LuaLaTeX sessions for Node.js, implemented in TypeScript.

[Product and documentation site](https://lzhbhlrpython.github.io/rtex-ts/) · [简体中文](README.zh-CN.md) · [Embedding guide](docs/embedding.md) · [Architecture](docs/architecture.md) · [Upstream and research credit](UPSTREAM.md)

**rtex-ts closely adapts [realtime-tex](https://github.com/HenryXiaoYang/realtime-tex) by Henry Yang and its contributors.** Its Lua/TeX runtime is retained from upstream under MIT. The technique follows [Clemens Lode's TUG 2026 paper](https://www.tug.org/tug2026/preprints/lode-realtime.pdf). This is an independent, narrower TypeScript adaptation, not an official upstream release or a feature-complete replacement.

0.1.11 adds balanced macro/environment inference, optional Poppler PDF raster comparison and reuse of the TeX installation font cache instead of rebuilding it for every session. Initial font generation can still be slow; see [verification tools](docs/verification.md) and [performance](docs/performance.md).

## What it does

A session keeps LuaLaTeX alive with your preamble loaded. Ordinary paragraph edits can be re-typeset using the captured paragraph context, returning positioned glyphs rather than browser-reflowed text. A separate background compilation updates whole pages, pagination and references from an immutable snapshot of the current buffers. Unsupported or uncertain edits wait for that layout.

The JavaScript runtime has **no npm dependencies** and does not use Rust, VS Code or Electron. You must install LuaLaTeX and the packages/fonts your document needs separately. No document data is sent to a hosted service.

## Install

Requires **Node.js 22+** and a LuaLaTeX distribution with a LaTeX kernel from 2021 or later. Current real integration tests use TeX Live; MiKTeX is not verified.

```sh
npm install rtex-ts@experimental
npx rtex-ts doctor
```

If LuaLaTeX is not on `PATH`, set `RTEX_TEXLIVE_BIN` to its binary directory, or pass `lualatex` in the library configuration. macOS also checks `/Library/TeX/texbin/lualatex`.

## Use from Node

```js
import { Session } from 'rtex-ts';

const session = await Session.open({
  projectRoot: '/path/to/project',
  mainFile: 'main.tex',
});
const unsubscribe = session.subscribe(event => {
  if (event.event === 'ParagraphUpdate') {
    // Replace this unit's old rows with event.dl at event.fragments.
  }
  if (event.event === 'LayoutUpdate') {
    // Install changed pages. event.pdf_path is an immutable layout PDF.
  }
});

// Whole unsaved buffer; the session calculates the minimal UTF-8 edit.
session.setDocument('main.tex', updatedSource);
// Or replace bytes 123..123. These are UTF-8 bytes, not JS string positions.
session.applyEdit('main.tex', { start: 123, end: 123, text: ' world' });

// At the end of the host's editing session:
unsubscribe();
session.close();
```

`setDocument` and `applyEdit` return routing information immediately; rendering and diagnostics arrive asynchronously. Neither writes the original source. Close the session to stop its local TeX processes. See [embedding](docs/embedding.md) for a complete buffer example, lifecycle, event ordering, rendering and clean PDF export.

## CLI

```sh
rtex-ts serve --project /path/to/project --main main.tex
```

Send one JSON object per stdin line:

```json
{"cmd":"set_document","path":"main.tex","text":"...complete buffer..."}
{"cmd":"edit","path":"main.tex","start":123,"end":123,"text":" world"}
{"cmd":"request_layout"}
{"cmd":"status"}
{"cmd":"quit"}
```

Stdout contains JSON replies and events only; diagnostics use stderr. Commands and differences from upstream are documented in the embedding guide.

## Current boundaries

- **LuaLaTeX** provides live glyphs. **XeLaTeX/pdfLaTeX** provide full PDF layouts and clean export only; their live glyph path is unavailable.
- Live candidates include paragraphs, inline/display math, headings and captured environments. Balanced syntax, context guards and an old-source comparison probe remain mandatory. `eligibility: "allowlist"` (default) requires known/package-provided or configured macros. Opt-in `"probe"` permits unknown vocabulary to reach the same old-source probe. Neither mode proves arbitrary TeX macros pure.
- Ambiguous mappings, failed probes, unsupported drawing and structural changes use the background path. A larger/shrinking unit has provisional vertical placement until the next layout. TikZ still uses PDF fallback. Unchanged standalone TikZ/circuitikz/PGF pictures can reuse bounded PDF page extracts; use `pictureCache: false` to disable this optimization.
- PDF fallback is required for drawings or glyph/font formats your host cannot render. rtex-ts returns display lists; it does not include a viewer.
- Background passes preload a standby LuaLaTeX preamble and automatically run BibTeX/Biber and index tools when their inputs change. Disable with `warmBackground: false`, `bibTool: "none"`, or `index: false`. This remains a partial adaptation of pinned upstream 0.0.7; [capability coverage](docs/upstream-parity.md) records the remaining gaps.
- Interior paragraph edits reuse the span index; replies arrive on POSIX FIFOs or Windows named pipes without response polling. [Performance methodology](docs/performance.md) measures edit-to-event latency; upstream timings do not describe this package.
- Linux/macOS/Windows use Node APIs and platform-aware process cleanup. A CI matrix is provided; see [compatibility](docs/compatibility.md) for what was actually exercised.
- LuaLaTeX runs document code with your permissions. This library is **not a sandbox**; a host opening untrusted projects must supply OS-level isolation.

## Development

```sh
npm ci
npm test
npm run typecheck
npm run test:tex
npm pack --dry-run
```

The real TeX suite requires LuaLaTeX, XeLaTeX, pdfLaTeX, `ctex` with Fandol fonts, `unicode-math`, TikZ, BibTeX/Biber, `biblatex`, makeindex and `imakeidx`. It uses temporary projects and fails explicitly if LuaLaTeX is missing. Unit tests do not require TeX. Repository maintenance rules are in [AGENTS.md](AGENTS.md).

## License and provenance

MIT. Keep the complete [license](LICENSE), upstream copyright and [third-party notices](THIRD_PARTY_NOTICES.md) when redistributing. [UPSTREAM.md](UPSTREAM.md) identifies copied files, adapted TypeScript modules, the upstream revision and research inspiration. External TeX engines and fonts retain their own licenses. No upstream affiliation or endorsement is implied.
