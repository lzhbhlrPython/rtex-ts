# Changelog

## 0.1.11

- Install the Linux CI oracle with checksum-pinned official micromamba and pinned conda-forge Poppler instead of failing Ubuntu mirror DNS; cache the tool prefix and bound install/test times.
- Include unpublished 0.1.9–0.1.10 features and the Windows fixture fix without adding npm runtime dependencies.

## 0.1.10 (unpublished)

- Normalize the new Windows font-cache test fixture with RUNNER_TEMP and realpathSync.native instead of passing an 8.3 temporary alias to TeX path validation.
- Include the unpublished 0.1.9 macro, PDF oracle, startup-cache and bilingual site changes; this fixture fix does not change the measured performance path.

## 0.1.9 (unpublished)

- Infer bare/braced macro names, parameterless def, math operators and conservative custom environments; reject deferred declaration pollution and retain old-source probes.
- Add optional Poppler `pdf-compare`, `verify --pdf` and a library API, with strict pixel defaults, bounds, exit codes and missing-tool failures.
- Reuse the TeX installation font cache by default; add explicit `fontCacheDir`, startup timings and an alternating startup benchmark. First font generation remains slow.
- Require PDF fallback for unresolvable font files/glyph IDs; retain unchanged span identity when custom block rules change.
- Keep bilingual verification docs/product pages synchronized and the website outside npm archives.

## 0.1.8

- Adapt ordered picture scanning, source/setup hashes, conservative effect guards, capture manifests, mismatch quarantine and cache eviction from pinned upstream 0.0.7.
- Extract only required PDF pages with the installed LuaTeX; bound session caches to 256 entries/64 MiB and four unused passes. Clean export remains uncached; cached drawings still require PDF rendering.
- Prevent auxiliary/cache continuations from spawning processes after their owner closes; retry a failed cached pass without cache and retain the last valid layout on mismatch.
- Report standby readiness only after the preamble is loaded; add a reproducible cache-on/off background benchmark and localized product measurements.
- Add scanner, cache lifecycle and real TikZ invalidation/pagination tests. Record the successful 0.1.7 three-platform multi-engine and auxiliary-tool CI.

## 0.1.7

- Adapt balanced source units, package vocabulary, opaque arguments, recursive macro guards, body setup and custom captured environments from pinned realtime-tex 0.0.7. Unknown syntax remains background-only in the default allow-list mode.
- Add preloaded background LuaLaTeX passes, BibTeX/Biber and whitelisted index scheduling, label refresh, math ownership records, background pause/resume, statistics and live-unit verification.
- Add XeLaTeX/pdfLaTeX PDF-only layout/export, including nested main-file lookup. LuaLaTeX remains the only live glyph engine.
- Move snapshot I/O off the synchronous edit path, bound copy concurrency and index layout/context lookups. Reuse installed live contexts.
- Use raw UTF-8 compile frames and binary Windows request pipes. Keep vendored Lua/TeX bytes unchanged.
- Include production website dependency licenses in the independently deployed site.
- Expand real-engine tests; platform claims require the new CI run. Picture-cache scheduling and full upstream parity are still outstanding.

## 0.1.6

- Record successful Linux, macOS and Windows real LuaLaTeX integration and the Node 22/24/26 package matrix for 0.1.5. MiKTeX remains unverified.
- Enable GitHub Pages for the bilingual bright-red Ant Design product/documentation site, independently of the npm archive.

## 0.1.5

- Wait for owned TeX processes to exit before removing real-integration fixtures. Windows cleanup asserts the process list is empty and retries transient file locks asynchronously.
- Correct architecture documentation for the streaming response transport.

## 0.1.4

- Normalize the Windows project-root environment before Lua inserts it into TeX input paths; fixes CTeX/fontspec parsing of backslashes.
- Save the installed TeX Live CI cache before integration tests, so a later failure does not force a fresh distribution install.

## 0.1.3

- Add a standalone React + Ant Design product/documentation site with English/Simplified Chinese routes, local themes, search, locale-aware measurements and repository Markdown.
- Build the site in GitHub Actions and deploy main to Pages; keep website source/dependencies/output outside npm archives.
- Stop background/export TeX on the first error to retain the original Windows failure diagnostic.

## 0.1.2

- Re-segment interior paragraph edits locally and maintain UTF-8/line offsets and stable IDs without quadratic scans. Structural edits retain full parsing.
- Replace response-file polling with bounded streaming POSIX FIFOs / Windows named pipes.
- Compile background/export driver files instead of passing TeX code through Windows argument quoting; improve missing-capture diagnostics.
- Add reproducible latency benchmarks and differential segmentation / fragmented-frame tests.

## 0.1.1

- Install background layouts atomically; failed artifacts and failed TeX passes retain the last valid layout.
- Remove export scratch data on success/failure, reject concurrent exports, and clean closed live-engine directories after process exit.
- Bound CLI input by UTF-8 bytes before receiving a newline, respect output backpressure, and keep status/quit responsive during export.
- Canonicalize native Windows paths and use the CI runner's temporary directory for TeX fixtures.
- Update official Actions to Node 24 and test Node 22/24/26 on Linux/macOS/Windows, including real TeX Live jobs.

## 0.1.0

Initial experimental TypeScript adaptation of realtime-tex, retaining the unmodified Lua/TeX runtime and MIT attribution.
