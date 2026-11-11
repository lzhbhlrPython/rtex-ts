# rtex-ts maintenance rules

## Purpose and scope

rtex-ts is an independent MIT-licensed TypeScript adaptation of realtime-tex for Node.js. It retains the Lua/TeX runtime because LuaLaTeX executes that layer. It does not require the upstream Rust binary, VS Code, Electron or a hosted service. Do not describe it as an original invention, an official upstream port, feature-complete, or API-compatible without new evidence.

Read `README.md`, `UPSTREAM.md`, `docs/architecture.md`, and the relevant source before editing. User instructions take precedence over this file.

## Work and repository boundaries

- Check `git status --short --branch` and recent commits before changes; preserve other work.
- This repository is separate from TeXPro. Do not add desktop UI or TeXPro configuration here.
- Use npm and `package-lock.json`; do not add another package manager's lockfile.
- Keep private plans, tokens, logs, TeX caches, output PDFs and performance artifacts out of Git and npm archives.
- Every implementation/build update commit increments the package version and updates English/Simplified Chinese changelogs. Release independently verified improvements in small versions; never overwrite a published version.
- Performance is a core product requirement. Measure rtex-ts edit-to-event latency (including synchronous edit work), background latency and resource use; publish reproducible methodology and environment with claims. Keep the product site bilingual with locale-aware numbers, units and dates.
- Keep website source, dependencies and deployment artifacts outside the npm archive; assert this in tarball tests.
- Commit focused, tested changes. Push the task branch when authorized. Publishing or overwriting a release requires the corresponding user authorization; never replace an already published npm version.

## Authorship and licenses

- `UPSTREAM.md` is the authoritative provenance map. Retain Henry Yang/realtime-tex contributors' copyright and MIT permission text in the root license and vendored license.
- Credit Clemens Lode's paper as research inspiration; distinguish a citation from copied code and from an endorsement.
- `vendor/realtime-tex/tex/` is copied code. Do not silently rewrite it. A deliberate vendor update must record the upstream revision, any local modifications, hashes, reasons and regression results.
- Run the manifest/license tests after vendor or packaging changes. Distribute the upstream license, provenance map and third-party notices in the npm tarball.
- TeX engines, fonts, classes and packages are external dependencies with their own licenses. Do not bundle them or claim they are covered by this project's MIT license.

## Implementation contracts

- Public edit offsets are UTF-8 bytes. JavaScript string offsets are UTF-16. Validate range order, character boundaries, file identity and maximum size.
- Only publish a paragraph as live after context/probe validation. Unsupported syntax, ambiguous mappings, failed probes and state leaks use background layout.
- Carry source/context/engine/layout versions. A late process result must never overwrite a newer paragraph, another session or a closed project.
- Unsaved buffers belong to the caller. Snapshot compilation never overwrites project source. Export is a separate clean compile path.
- TeX parsing must account for balanced groups, comments, escapes and verbatim. Do not broaden syntax support with a regex that corrupts nested source.
- All external commands use argument arrays and a controlled cwd; no interpolated shell commands. LuaLaTeX executes document code with user privileges: this library is not a sandbox.
- Validate real paths and symlink escapes; bound messages, output, document size, snapshots and caches. Preserve last valid layouts after failure.
- Close owns and terminates all session processes with bounded waits. Windows process trees and POSIX process groups need separate handling.
- stdout in CLI serve mode contains JSON-lines only; diagnostics go to stderr. Respect output backpressure and reject unknown commands.
- Avoid new runtime dependencies unless they materially improve correctness. Optional rendering belongs in hosts; glyph IDs must not be substituted with browser text layout.

## Verification and compatibility

- Run `npm test`, `npm run typecheck`, `npm run test:tex` when LuaLaTeX is available, and `npm pack --dry-run` for package changes.
- Tests must cover UTF-8 boundaries, incomplete input, comments/verbatim, nested groups, span identity, stale results, crashes/timeouts, path boundaries, cleanup and a tarball-installed CLI/library.
- Test fixtures passed to TeX path helpers must use `RUNNER_TEMP` when available and `realpathSync.native`; Windows `os.tmpdir()` may contain an 8.3 alias with `~`, which TeX rejects. Do not bypass path validation for fixtures.
- Real TeX tests use temporary projects; never modify an author's working documents. Missing TeX is a skipped or blocked real integration check, not a pass.
- Keep Linux/macOS/Windows in CI. Do not report a platform as runtime-tested just because TypeScript builds or a workflow file exists.
- Measure rtex-ts latency separately. Never reuse upstream's ~1 ms claims as this package's performance numbers.
- Update English and Simplified Chinese READMEs and guides together. Document supported behavior, failure recovery and limits, not future plans as completed features.
