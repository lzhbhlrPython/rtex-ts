# Performance

[简体中文](performance.zh-CN.md)

Performance is a core requirement. rtex-ts measures its own latency, including synchronous buffer processing; the upstream paper's approximately 1 ms result is not this package's benchmark.

## Reproduce

```sh
npm ci
npm run benchmark -- --pages 10,100,300 --samples 50 --output .ai-notes/performance/local.json
```

Install LuaLaTeX, fontspec and Latin Modern Roman first. The synthetic article has explicit page breaks and four paragraphs per page. Each sample changes one character in the first paragraph. The persistent engine is warm; the first old-paragraph validation probe is excluded. Timing starts before `setDocument()` and ends at the `ParagraphUpdate` event. It includes synchronous document processing, transport, TeX and display-list decoding. It excludes editor/renderer IPC, glyph drawing and screen presentation. This is not a measurement of TeXPro.

Structural edits, unsupported syntax, PDF fallback, startup and background convergence have different costs. The script records startup and Node RSS as well; it does not measure the TeX process tree's memory. Run without concurrent builds or applications doing heavy work. Percentiles describe these samples, not a latency guarantee. Store raw results outside Git/npm archives.

## Local 0.1.7 measurement

Measured 2026-11-11 (Asia/Shanghai), Apple M1 Pro, macOS ARM64, Node 26.5.0, LuaHBTeX 1.16.0 / TeX Live 2023, 50 measured edits per document:

| Pages | Source bytes | Edit → event p50 | p95 | p99 | Synchronous edit p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 19,321 | 1.80 ms | 2.39 ms | 2.56 ms | 0.39 ms |
| 100 | 192,571 | 2.66 ms | 3.27 ms | 3.80 ms | 1.33 ms |
| 300 | 578,171 | 4.80 ms | 5.61 ms | 6.12 ms | 3.38 ms |

These are synthetic Latin prose results on one machine. They do not establish the same latency for CJK, mathematics, custom classes, all operating systems or hosts. The initial layouts took approximately 11.6 / 13.3 / 18.5 seconds with a fresh per-session font cache. Cold start and full-layout work remain optimization targets.

Before optimization, a preliminary 20-sample run of the 0.1.1 implementation on the same synthetic documents measured approximately 6.43 / 32.41 / 190.75 ms median edit-to-event. The different sample counts make this a diagnostic comparison, not a controlled statistical claim.

## Why local edits cost less

Interior paragraph edits re-segment that paragraph and shift subsequent UTF-8/line positions. Structural/boundary edits use the full balanced scanner. Stable span matching uses maps/sets instead of repeated linear searches, and offset calculation walks source regions once. Framed replies arrive through Node streams over POSIX FIFOs or Windows named pipes, removing the response-file polling interval and accumulating response file. Old-paragraph probes and stale-result checks remain mandatory.

0.1.7 reuses installed live contexts. Background snapshots use bounded asynchronous I/O; page rows and paragraph contexts use indexed lookups with cooperative batching. The live table excludes complete background and cold-start time and cannot describe an entire application's responsiveness.

## Picture-cache background comparison (0.1.8)

```sh
npm run benchmark:pictures -- --pictures 12 --strokes 150 --samples 20 --output .ai-notes/performance/pictures.json
```

Measured on the same M1 Pro/macOS/Node 26.5.0/TeX Live 2023 environment on 2026-11-11. The fixture contains 12 TikZ pictures (150 translucent strokes each), one per page, followed by one text page: 13 pages total. Each mode uses a separate session and fresh font cache. After startup, each of 20 samples changes one character after all pictures, explicitly requests full layout, and waits for `LayoutUpdate`. The standby preamble is confirmed ready before each sample. Timing includes snapshot I/O, both TeX/auxiliary passes, cache work and layout installation; host drawing is excluded.

| Picture cache | Full-layout p50 | p95 | Initial layout | Offered cache entries |
| --- | ---: | ---: | ---: | ---: |
| Off | 3.62 s | 5.15 s | 13.80 s | 0 |
| On | 1.05 s | 1.43 s | 14.65 s | 12 |

The median decreased by about 71% in this preliminary 20-sample comparison. Cold start did not improve. The table includes every sample; no outlier was removed. These figures do not describe arbitrary drawings or prove a cross-platform speedup. Cached drawings remain PDF fallback, not live glyph overlays. A separate local visual fixture kept pagination/positioning and differed at 117 antialiasing pixels along one cropped border at 144 dpi; cache reuse is not a pixel-identity guarantee. Clean export bypasses the cache.
