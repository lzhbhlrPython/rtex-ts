# Architecture

[简体中文](architecture.zh-CN.md)

The architecture closely adapts realtime-tex. Read [UPSTREAM.md](../UPSTREAM.md) for the source/module provenance and licenses.

## Two paths

`Session` loads bounded source buffers and segments them into conservative units. UTF-8 byte edits preserve unaffected span IDs. Edits never save original files. Every change schedules a background pass; eligible paragraphs may also take the live path.

The background path copies an immutable snapshot, adds the unmodified upstream capture package through the command line, and runs LuaLaTeX until auxiliary files stabilize or a pass limit is reached. It produces page display lists, a PDF and paragraph contexts. Only uniquely mapped top-level paragraphs are eligible. Missing bibliography/index outputs do not count as convergence. No bibliography/index programs are automatically spawned.

The live path keeps a second LuaLaTeX process with the preamble loaded. It installs the captured context and first typesets the old paragraph, comparing positioned glyphs and rules with the background result. A matching probe permits typesetting the new paragraph. Errors, leaks, unsupported drawing, inserts, ambiguous mappings and exceeded latency budgets retain the background path. The comparison is conservative validation, not a proof that arbitrary TeX macros are pure.

## Modules

| Module | Responsibility |
| --- | --- |
| `document.ts` | UTF-8 edits, masks for comments/verbatim, balanced segmentation and preamble boundaries |
| `display-list.ts` | Bounded RTDL v1 binary decoder; unknown records force degraded output |
| `process.ts` | LuaLaTeX discovery, support lookup, input path, argument-array execution and process trees |
| `engine.ts` | Persistent LuaLaTeX driver, serialized requests and framed response reader |
| `session.ts` | Buffer snapshots, contexts/probes, source/engine/layout versions, export and cancellation |
| `cli.ts` | JSON-lines adapter with bounded output/backpressure |
| `vendor/realtime-tex/tex/` | Unmodified upstream Lua/TeX runtime and its tests/experiments |

Requests to Lua are JSON lines on stdin. Responses use upstream's length-prefixed binary frames through a POSIX FIFO or Windows named pipe, read with Node streams. This avoids response-file polling and its per-request delay. JSON escapes preserve UTF-8, CRLF and control characters across Windows text-mode stdin. Individual response frames are capped at 32 MiB, and unexpected queued replies trigger recovery.

## Ordering and recovery

Every event carries relevant source/context/engine/layout versions. Live results whose source or context changed during work are discarded. A background snapshot may be older than current input: the host must retain newer overlays and mark provisional placement. A preamble edit closes the old engine. Failed background runs keep the last usable layout and emit diagnostics. Retry with `requestLayout()` after correcting source or installing missing dependencies.

The session owns its TeX processes and cancels them on close. Hosts own final cache deletion after releasing PDF/font handles. Recent snapshots/PDFs are bounded; the live engine's snapshot remains pinned. Source, snapshot, file count, depth, frame and process time limits are explicit. These bounds are resource controls, not an OS sandbox.

## Export and host rendering

Export runs ordinary LuaLaTeX over another snapshot, without capture hooks. The result includes convergence, which can be false after the pass limit or concurrent edits. A host may instead use its existing trusted build pipeline for bibliography/index/custom commands.

Display lists contain font files, glyph IDs and scaled-point geometry. The host draws them faithfully or falls back to the matching PDF. The library contains no browser renderer, SyncTeX implementation, font outline engine, editor, VS Code extension or Electron dependency. See [embedding](embedding.md) for positioning and distribution contracts.
