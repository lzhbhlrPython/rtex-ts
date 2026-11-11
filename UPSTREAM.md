# Relationship to realtime-tex

rtex-ts is an independent, experimental TypeScript adaptation of [HenryXiaoYang/realtime-tex](https://github.com/HenryXiaoYang/realtime-tex). It is not an official release, endorsed port, or API-compatible replacement for the upstream Rust library.

## Code provenance

The reference checkout is **fcff7a5c7f33a288ecf40db886843754c62bbdfd** (workspace version 0.0.7). `vendor/realtime-tex/tex/` contains the upstream Lua and TeX support files, copied without modification. Their original MIT license is in `vendor/realtime-tex/LICENSE`. `vendor/realtime-tex/manifest.json` records every copied file's SHA-256. The package tests check these hashes.

The TypeScript host was written by closely studying the upstream implementation. It is a derivative adaptation, not a claim of independent invention. In particular:

| rtex-ts module | Upstream reference | Relationship |
| --- | --- | --- |
| `src/document.ts` | `crates/rtex-core/src/document.rs` | Reimplements byte edits, span identity and conservative paragraph segmentation; much narrower syntax support |
| `src/display-list.ts` | `crates/rtex-dl/src/binary.rs`, `tex/rtex-dl-bin.lua` | Ports revision 1 binary decoding and the drawing model |
| `src/engine.ts` | `crates/rtex-core/src/engine.rs`, `transport.rs` | Adapts the persistent TeX driver, context and framed response handling; adapts POSIX FIFOs and Windows named pipes through Node streams |
| `src/transport.ts` | `crates/rtex-core/src/transport.rs` | Adapts bounded framed FIFO / Windows named-pipe responses to Node streams |
| `src/tex-syntax.ts`, `src/preamble.ts` | `document.rs`, `eligibility.rs` | Adapt balanced scanning, buffer-aware preamble inputs and setup statements |
| `src/eligibility.ts`, `src/eligibility-tables.ts`, `src/definitions.ts` | `eligibility.rs` | Copy/adapt MIT allow-list/package/opaque-argument tables and reimplement context guards and macro analysis; not a line-for-line policy port |
| `src/auxiliary.ts`, `src/background-engine.ts` | `background.rs`, `tex/rtex-bg.lua`, `tex/latex/rtex-capture.sty` | Adapt bibliography/index signatures and tool selection, labels, one-shot standby engine and plain-export index recording |
| `src/picture-cache.ts` | `crates/rtex-core/src/piccache.rs` | Adapts ordered picture hashes, guards, manifests, quarantine and eviction; replaces lopdf extraction with installed LuaTeX page embedding, without modifying vendored runtime |
| `src/pdf-compare.ts` | `crates/rtex-verify/src/raster.rs`, CLI verification design | Adapts the raster-oracle workflow using optional external Poppler and a bounded Node PPM comparator; does not copy or port the full structural/glyph PDF suite |
| `src/process.ts` | `crates/rtex-core/src/texlive.rs` | Adapts support lookup, TeX environment, input-path hook and process ownership |
| `src/session.ts` | `session/`, `layout.rs`, `capture.rs`, `background.rs` | Reimplements the two-path session, capture contexts, paragraph probes, placements, revisions and snapshot passes |
| `vendor/realtime-tex/tex/` | upstream `tex/` | Unmodified copied source, retaining upstream authorship |

The project-level MIT license retains **Copyright (c) 2026 Henry Yang and the realtime-tex contributors**, alongside the rtex-ts contributors' notice. Distributors must retain these notices and the MIT permission and disclaimer text. The attribution file and vendored license are part of the npm archive.

## Research inspiration

The real-time paragraph typesetting technique follows **Clemens Lode**, [*Real-Time LuaTeX: Recompiling Large Documents in 1 ms*](https://www.tug.org/tug2026/preprints/lode-realtime.pdf), TUG 2026, as acknowledged by realtime-tex. rtex-ts credits both the research and Henry Yang's implementation. No paper text or benchmark source has been copied into this package. Upstream performance measurements are not rtex-ts measurements.

LuaTeX, LuaLaTeX, TeX Live, fonts, document classes and packages retain their own licenses. They are separate system dependencies and are not relicensed or bundled as part of rtex-ts. The npm package does not contain a TeX distribution or the Rust rtex executable.

## Differences and limits

Versions 0.1.7–0.1.8 expand source units and eligibility, body setup, warm background passes, bibliography/index scheduling, math ownership, picture-cache scheduling and CLI verification. [Capability coverage](docs/upstream-parity.md) records the remaining gaps. It is not a feature-complete or API-compatible upstream port. No C ABI/Rust crate is provided.

The response transport follows upstream's framed FIFO / Windows named-pipe design through Node streams, without a native npm module. Compile requests use upstream raw UTF-8 frames, and Windows uses a second binary named pipe to avoid text-mode transformations. JSON is retained for context/control commands. Frames and queued replies are bounded and pending readers are aborted on cleanup.

The default allow-list policy also performs old-source probes; a host may explicitly choose vocabulary probing. Macro and package inference is conservative and narrower than the entire upstream policy. PDF-only XeLaTeX/pdfLaTeX paths are an rtex-ts extension, not the Lua live engine. The TypeScript API uses Node listeners, camelCase configuration and explicit UTF-8 edits. TeXPro is a separate host, not a dependency.

Report issues to the rtex-ts repository. Please reproduce issues with upstream rtex before reporting them upstream as upstream failures.

## CI installer adaptation

`scripts/install-texlive.sh` and `scripts/texlive.profile` adapt the same revision's installer and profile under the retained MIT license. Local changes add CTeX/Fandol, XeTeX and index dependencies for rtex-ts CI. They are development tooling, not a bundled TeX distribution. The unmodified `vendor/realtime-tex/tex/` manifest is unchanged.
