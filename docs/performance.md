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

## Local 0.1.2 candidate measurement

Measured 2026-11-11 (Asia/Shanghai), Apple M1 Pro, macOS ARM64, Node 26.5.0, LuaHBTeX 1.16.0 / TeX Live 2023, 50 measured edits per document:

| Pages | Source bytes | Edit → event p50 | p95 | p99 | Synchronous edit p50 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 19,321 | 2.02 ms | 2.88 ms | 3.18 ms | 0.25 ms |
| 100 | 192,571 | 3.05 ms | 3.68 ms | 4.06 ms | 1.25 ms |
| 300 | 578,171 | 5.28 ms | 7.64 ms | 9.51 ms | 3.32 ms |

These are synthetic Latin prose results on one machine. They do not establish the same latency for CJK, mathematics, custom classes, all operating systems or hosts. The initial layouts took approximately 13.5 / 14.7 / 19.6 seconds with a fresh per-session font cache. Cold start and full-layout work remain optimization targets.

Before optimization, a preliminary 20-sample run of the 0.1.1 implementation on the same synthetic documents measured approximately 6.43 / 32.41 / 190.75 ms median edit-to-event. The different sample counts make this a diagnostic comparison, not a controlled statistical claim.

## Why local edits cost less

Interior paragraph edits re-segment that paragraph and shift subsequent UTF-8/line positions. Structural/boundary edits use the full balanced scanner. Stable span matching uses maps/sets instead of repeated linear searches, and offset calculation walks source regions once. Framed replies arrive through Node streams over POSIX FIFOs or Windows named pipes, removing the response-file polling interval and accumulating response file. Old-paragraph probes and stale-result checks remain mandatory.
