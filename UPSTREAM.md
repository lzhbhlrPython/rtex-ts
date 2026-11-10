# Relationship to realtime-tex

rtex-ts is an independent, experimental TypeScript adaptation of [HenryXiaoYang/realtime-tex](https://github.com/HenryXiaoYang/realtime-tex). It is not an official release, endorsed port, or API-compatible replacement for the upstream Rust library.

## Code provenance

The reference checkout is **fcff7a5c7f33a288ecf40db886843754c62bbdfd** (workspace version 0.0.7). `vendor/realtime-tex/tex/` contains the upstream Lua and TeX support files, copied without modification. Their original MIT license is in `vendor/realtime-tex/LICENSE`. `vendor/realtime-tex/manifest.json` records every copied file's SHA-256. The package tests check these hashes.

The TypeScript host was written by closely studying the upstream implementation. It is a derivative adaptation, not a claim of independent invention. In particular:

| rtex-ts module | Upstream reference | Relationship |
| --- | --- | --- |
| `src/document.ts` | `crates/rtex-core/src/document.rs` | Reimplements byte edits, span identity and conservative paragraph segmentation; much narrower syntax support |
| `src/display-list.ts` | `crates/rtex-dl/src/binary.rs`, `tex/rtex-dl-bin.lua` | Ports revision 1 binary decoding and the drawing model |
| `src/engine.ts` | `crates/rtex-core/src/engine.rs`, `transport.rs` | Adapts the persistent TeX driver, context and framed response handling; replaces platform pipes with a response file |
| `src/process.ts` | `crates/rtex-core/src/texlive.rs` | Adapts support lookup, TeX environment, input-path hook and process ownership |
| `src/session.ts` | `session/`, `layout.rs`, `capture.rs`, `background.rs` | Reimplements the two-path session, capture contexts, paragraph probes, placements, revisions and snapshot passes |
| `vendor/realtime-tex/tex/` | upstream `tex/` | Unmodified copied source, retaining upstream authorship |

The project-level MIT license retains **Copyright (c) 2026 Henry Yang and the realtime-tex contributors**, alongside the rtex-ts contributors' notice. Distributors must retain these notices and the MIT permission and disclaimer text. The attribution file and vendored license are part of the npm archive.

## Research inspiration

The real-time paragraph typesetting technique follows **Clemens Lode**, [*Real-Time LuaTeX: Recompiling Large Documents in 1 ms*](https://www.tug.org/tug2026/preprints/lode-realtime.pdf), TUG 2026, as acknowledged by realtime-tex. rtex-ts credits both the research and Henry Yang's implementation. No paper text or benchmark source has been copied into this package. Upstream performance measurements are not rtex-ts measurements.

LuaTeX, LuaLaTeX, TeX Live, fonts, document classes and packages retain their own licenses. They are separate system dependencies and are not relicensed or bundled as part of rtex-ts. The npm package does not contain a TeX distribution or the Rust rtex executable.

## Differences and limits

Version 0.1 focuses on ordinary paragraphs and inline mathematics. It probes the old paragraph against full-layout rows before publishing a live result, and rejects unsafe or unsupported commands. Headings, block environments, unknown macros, structural changes, and preamble edits use background layout. Bibliography/index tools are not automatically run. Background passes are cold LuaLaTeX runs; the upstream warm background engine and picture-cache scheduler have not been ported.

The TypeScript API uses Node event listeners, camelCase configuration and explicit UTF-8 edits. Its JSON-lines API follows familiar upstream command/event names, but does not implement the entire upstream API, C ABI, math ownership interface, performance profile or compatibility guarantees. TeXPro is a separate host, not an upstream dependency.

The response-file transport avoids a platform-specific native module. It polls only while waiting for a reply, with a 2 ms interval. It is bounded and restarts on failure; this choice adds latency and is not equivalent to upstream's FIFO/named-pipe implementation.

Report issues to the rtex-ts repository. Please reproduce issues with upstream rtex before reporting them upstream as upstream failures.

## CI installer adaptation

`scripts/install-texlive.sh` and `scripts/texlive.profile` adapt the same revision's installer and profile under the retained MIT license. Local changes add CTeX/Fandol, XeTeX and index dependencies for rtex-ts CI. They are development tooling, not a bundled TeX distribution. The unmodified `vendor/realtime-tex/tex/` manifest is unchanged.
