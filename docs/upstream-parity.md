# Fixed upstream capability coverage

[简体中文](upstream-parity.zh-CN.md)

The acceptance reference is realtime-tex **0.0.7**, commit `fcff7a5c7f33a288ecf40db886843754c62bbdfd`. This is an engineering coverage map, not a claim of complete compatibility. The Node API is retained; Rust crates and the C ABI are outside the agreed scope.

| Capability | rtex-ts 0.1.10 | Evidence and limits |
| --- | --- | --- |
| Unsaved buffers, byte edits, stable unit identity | Implemented | UTF-8, nested groups, comments/verbatim, incomplete input and stale-result tests |
| Paragraph/math/heading/environment segmentation | Adapted | Balanced scanner and custom unit environments; ambiguous capture mappings remain background-only |
| Eligibility/package vocabulary/custom macros | Partial adaptation | Upstream tables, opaque arguments, recursive macro guards, setup/group/context checks; bare/braced names, parameterless def, math operators and checked custom environments; heading/class rules and advanced signatures remain incomplete |
| Persistent live engine and old-source validation | Implemented | Real CJK/math/multi-file tests; no unverified overlay, timeout and state leaks trigger fallback/restart |
| Binary transport and math ownership | Implemented | Bounded RTDL decoding, raw compile frames, POSIX FIFO and binary Windows named pipes; optional owner IDs supplied by host |
| Background snapshots and standby preamble | Implemented | Asynchronous bounded copies, immutable buffers, warm body refresh, pause/resume and cleanup tests |
| References and auxiliary tools | Adapted | BibTeX/Biber selection, signature reruns, labels, makeindex/named imakeidx and recorded whitelisted programs; other tool configurations require their own fixtures |
| Picture-cache scanner, PDF page extraction, cache scheduler | Adapted | Ordered source/definition hashes, state/line checks, LuaTeX page extracts, four-pass expiry and 256-entry/64 MiB bounds; PDF fallback, no live drawing claim or cross-session cache reuse |
| Clean PDF export | Implemented | Separate snapshot, selected engine, auxiliary convergence, scratch cleanup |
| CLI serve/doctor/export/verify/profile/dl2json | Adapted | JSON-lines/backpressure, live-unit probes, Node memory/CPU snapshot and binary conversion; verify covers eligible units, not the whole document |
| Upstream CLI benchmark/generator/PDF comparison suite | Partial | Live/background/startup benchmarks, optional Poppler pdf-compare and verify --pdf; generator, structural and PDF-glyph oracles remain unported |
| Rust ABI/API compatibility | Out of scope | Independent Node API; no Rust executable or native npm dependency |
| XeLaTeX/pdfLaTeX | Additional PDF-only paths | Full PDF layout/export; no Lua capture, glyph overlays or math-owner metadata |

The new request pipe, standby engine, auxiliary tools and multi-engine PDFs passed all three platform jobs for 0.1.7. Picture caching passed the separate 0.1.8 run; 0.1.10 changes require a new run. See [compatibility](compatibility.md) and [performance methodology](performance.md).
