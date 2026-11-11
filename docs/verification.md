# CLI and PDF verification

[简体中文](verification.zh-CN.md)

`verify` probes eligible LuaLaTeX units against the captured layout. Every unit must match, the result must not be stale, and an empty candidate list fails the CLI. This is not whole-document verification.

```sh
rtex-ts verify --project ./paper --main main.tex
rtex-ts verify --project ./paper --main main.tex --pdf
rtex-ts pdf-compare --a baseline.pdf --b candidate.pdf --dpi 144
rtex-ts profile --project ./paper --main main.tex
```

Since 0.1.9, `verify --pdf` also compares the captured PDF with a separate, converged ordinary export of the same buffers. `pdf-compare` works with PDFs produced by any engine. Both use **optional external Poppler** (`pdfinfo`, `pdftoppm`); install it separately or supply `--pdfinfo PATH --pdftoppm PATH`. Missing tools, invalid PDFs, timeout and exceeded limits fail with diagnostics on stderr. They never count as a pass. JSON results go to stdout; exit status is 0 for a match and 1 for a mismatch or failure.

The oracle compares RGB rendered pixels page by page, at 96 dpi by default (36–300). It ignores byte/metadata differences that do not affect rendering. Page-count or raster-dimension changes always fail. `--tolerance N` allows a per-pixel maximum channel delta (0–255); `--max-different-ratio R` allows a fraction of pixels above that tolerance (0–1). Both default to **zero**. The JSON records thresholds, page sizes in pixels, differing-pixel counts/ratios and maximum channel differences. A threshold is an explicit acceptance policy, not proof of equivalence. Cached-picture borders can show antialiasing differences; do not silently relax a failing test.

This is a **raster** oracle, not the complete upstream PDF suite: no decoded-content/resource/font comparison or PDF glyph-to-display-list oracle yet. Rendering at finite resolution cannot establish mathematical or structural equivalence, text accessibility, or identity at every zoom level. Live-unit probes remain separate.

Inputs are at most 64 MiB each and 100 pages; each page at most 20 million pixels, 200 million pixels across compared pages, with bounded process output and a 30-second timeout per command. Temporary rendered pages are deleted after comparison. Poppler parses PDFs with the caller's privileges; the tool is not a sandbox. Hosts may use the exported `comparePdfs(a, b, options)` API, including executable overrides and `timeoutMs`.

`profile` reports Node memory/CPU snapshots and `startup.first_layout_ms` / `startup.ready_ms`. Startup durations begin at session construction and include source loading. XeLaTeX/pdfLaTeX have no live `ready_ms`. Measurements exclude host drawing and do not report the TeX process tree's memory. Reproduce startup comparisons with `npm run benchmark:startup -- --samples 5 --out .ai-notes/startup.json`.
