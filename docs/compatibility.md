# Compatibility and verification

[简体中文](compatibility.zh-CN.md)

Requires Node.js 22+ and separately installed LuaLaTeX, a LaTeX kernel from 2021 or later, document packages and fonts. `doctor` checks executable/support availability; it does not certify that every document dependency is installed.

| Platform | Implementation | Verified evidence (0.1.7) |
| --- | --- | --- |
| macOS ARM64 | Node filesystem/child processes; MacTeX fallback; POSIX process groups | Local unit, real CTeX/Fandol + inline math + multi-file + TikZ + clean export tests, TeX Live 2023 |
| Linux | PATH/configured engine; POSIX process groups | Node 22/24/26 unit/package matrix and real TeX Live integration passed in the linked run |
| Windows | `.exe` lookup; platform path delimiter; binary request/response pipes; taskkill process tree | Node 22/24/26 unit/package matrix and real TeX Live integration passed, including CTeX/Fandol, live math, export and owned-process cleanup |
| macOS Intel / other architectures | No native npm dependency or bundled architecture-specific executable | Not locally runtime-tested |

[CI run 43005073072](https://github.com/lzhbhlrPython/rtex-ts/actions/runs/43005073072) tested commit `cc78494` (0.1.7): all nine Node 22/24/26 unit/tarball-installation jobs and real TeX Live integration on Linux, macOS and Windows passed. Real fixtures include Lua live/CJK/math, binary Windows requests, standby freshness, BibTeX/Biber, makeindex/named imakeidx, XeLaTeX/pdfLaTeX nested-file PDF layout and clean export. Actions use Node 24 runtimes. This evidence applies to that commit and those fixtures; the 0.1.8 picture cache requires a fresh run.

MiKTeX is not verified. Local Biber 2.19 testing uses its extracted ARM64 executable because the installed universal launcher fails during its own `lipo` step; the TeX installation is unchanged. Paths containing TeX-special `% # { } ~ "` or line breaks are rejected. TeX syntax, classes and fonts may have additional path restrictions; prefer simple project names. Symlinked files outside the project are rejected and symlinked directories are not recursively copied. Existing absolute external paths in trusted documents remain the document author's responsibility.

Unit tests cover UTF-8/CJK/emoji/CRLF/control characters, balanced/incomplete input, comments/verbatim, binary corruption, source identities, paths, missing processes, process timeout/cleanup, vendor integrity and CLI protocol. The pack test installs the actual npm tarball without network dependencies and imports the ESM API/CLI/support files. Real TeX tests use temporary projects and assert live updates, background fallback, no source mutation and export.

Reproducible rtex-ts latency measurements, fixture details and limits are in [Performance](performance.md). The upstream paper and Rust project's figures are not measurements of this implementation. A one-off integration timing is functional evidence only.
