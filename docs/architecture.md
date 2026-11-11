# Architecture

[简体中文](architecture.zh-CN.md)

The architecture closely adapts realtime-tex. Read [UPSTREAM.md](../UPSTREAM.md) for the source/module provenance and licenses.

## Two paths

`Session` loads bounded source buffers and segments them into conservative units. UTF-8 byte edits preserve unaffected span IDs. Edits never save original files. Every change schedules a background pass; eligible paragraphs may also take the live path.

The background path copies an immutable snapshot, adds the unmodified upstream capture package through the command line, and runs LuaLaTeX until auxiliary files stabilize or a pass limit is reached. It produces page display lists, a PDF and paragraph contexts. Uniquely mapped top-level source units may become live candidates. BibTeX/Biber and whitelisted index tools run when their inputs change; missing bibliography/index outputs do not count as convergence. LuaLaTeX preloads a one-shot standby preamble for a later background pass. XeLaTeX/pdfLaTeX use ordinary PDF-only passes.

The live path keeps a second LuaLaTeX process with the preamble loaded. It installs the captured context and first typesets the old paragraph, comparing positioned glyphs and rules with the background result. A matching probe permits typesetting the new paragraph. Errors, leaks, unsupported drawing, inserts, ambiguous mappings and exceeded latency budgets retain the background path. The comparison is conservative validation, not a proof that arbitrary TeX macros are pure.


The Lua background path can substitute unchanged standalone pictures using a session-owned page-extract cache. The scanner follows literal inputs in read order, hashes preceding commands/setup and rejects counter/reference/file/unsafe dependencies. Capture checks font/color/width and the skipped end line; a mismatch is quarantined and cannot be installed as the final layout. LuaTeX extracts required pages without a runtime npm dependency; cache capacity and four-pass retention are bounded. Cached drawing display lists still require the matching PDF, and clean export bypasses this optimization.

## Modules

| Module | Responsibility |
| --- | --- |
| `document.ts` | UTF-8 edits, masks for comments/verbatim, balanced segmentation and preamble boundaries |
| `display-list.ts` | Bounded RTDL v1 binary decoder; unknown records force degraded output |
| `process.ts` | LuaLaTeX discovery, support lookup, input path, argument-array execution and process trees |
| `engine.ts` | Persistent LuaLaTeX driver, serialized requests and framed response reader |
| `session.ts` | Buffer snapshots, contexts/probes, source/engine/layout versions, export and cancellation |
| `tex-syntax.ts`, `preamble.ts`, `eligibility.ts` | Balanced source analysis, effective preamble and conservative policy |
| `auxiliary.ts`, `background-engine.ts` | Controlled bibliography/index commands, labels and preloaded background processes |
| `cli.ts` | JSON-lines adapter with bounded output/backpressure |
| `vendor/realtime-tex/tex/` | Unmodified upstream Lua/TeX runtime and its tests/experiments |

Compile requests use the upstream raw UTF-8 length-delimited frame; context/control requests use JSON lines. POSIX writes requests to stdin; Windows uses a binary named request pipe. Responses use length-prefixed binary frames through a POSIX FIFO or Windows named pipe, read with Node streams. Individual response frames are capped at 32 MiB; unexpected queued replies trigger recovery. There is no response-file polling.

Snapshot traversal/copy and page-file reads use asynchronous I/O. Copies have an eight-operation concurrency bound; source buffers overwrite snapshot copies without saving original files. Page rows and paragraph sequence lookups use indexes, and context assembly yields between batches. These controls reduce event-loop stalls; they do not make TeX startup or arbitrary macros fast.

## Ordering and recovery

Every event carries relevant source/context/engine/layout versions. Live results whose source or context changed during work are discarded. A background snapshot may be older than current input: the host must retain newer overlays and mark provisional placement. A preamble edit closes the old engine. Failed background runs keep the last usable layout and emit diagnostics. Retry with `requestLayout()` after correcting source or installing missing dependencies.

The session owns its TeX processes and cancels them on close. Hosts own final cache deletion after releasing PDF/font handles. Recent snapshots/PDFs are bounded; the live engine's snapshot remains pinned. Source, snapshot, file count, depth, frame and process time limits are explicit. These bounds are resource controls, not an OS sandbox.

## Export and host rendering

Export runs the selected ordinary TeX engine over another snapshot, without capture hooks; an index-command hook records imakeidx tool requests for the host scheduler. The result includes convergence, which can be false after the pass limit or concurrent edits. A host may instead use its existing trusted build pipeline for bibliography/index/custom commands.

Display lists contain font files, glyph IDs and scaled-point geometry. The host draws them faithfully or falls back to the matching PDF. The library contains no browser renderer, SyncTeX implementation, font outline engine, editor, VS Code extension or Electron dependency. See [embedding](embedding.md) for positioning and distribution contracts.
