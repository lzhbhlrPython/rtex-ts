# Changelog

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
