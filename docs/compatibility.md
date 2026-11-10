# Compatibility and verification

[简体中文](compatibility.zh-CN.md)

Requires Node.js 22+ and separately installed LuaLaTeX, a LaTeX kernel from 2021 or later, document packages and fonts. `doctor` checks executable/support availability; it does not certify that every document dependency is installed.

| Platform | Implementation | Evidence before first release |
| --- | --- | --- |
| macOS ARM64 | Node filesystem/child processes; MacTeX fallback; POSIX process groups | Local unit, real CTeX/Fandol + inline math + multi-file + TikZ + clean export tests, TeX Live 2023 |
| Linux | PATH/configured engine; POSIX process groups | CI unit/package matrix and a separate TeX Live job are configured; consult the actual run result |
| Windows | `.exe` lookup; platform path delimiter; JSON stdin; taskkill process tree | CI unit/package matrix is configured; real TeX integration has not been verified |
| macOS Intel / other architectures | No native npm dependency or bundled architecture-specific executable | Not locally runtime-tested |

The CI matrix runs unit and tarball-installation tests on Linux, macOS and Windows. A Linux job installs LuaLaTeX/Chinese/TikZ packages and runs the real TeX integration suite. A configured workflow is not a passed run. The release report must link actual results and retain any failing/skipped platform boundary.

MiKTeX is not verified. No XeLaTeX/pdfLaTeX support is claimed. Paths containing TeX-special `% # { } ~ "` or line breaks are rejected. TeX syntax, classes and fonts may have additional path restrictions; prefer simple project names. Symlinked files outside the project are rejected and symlinked directories are not recursively copied. Existing absolute external paths in trusted documents remain the document author's responsibility.

Unit tests cover UTF-8/CJK/emoji/CRLF/control characters, balanced/incomplete input, comments/verbatim, binary corruption, source identities, paths, missing processes, process timeout/cleanup, vendor integrity and CLI protocol. The pack test installs the actual npm tarball without network dependencies and imports the ESM API/CLI/support files. Real TeX tests use temporary projects and assert live updates, background fallback, no source mutation and export.

No rtex-ts benchmark baseline is published. The upstream paper and Rust project's latency figures are not measurements of this implementation. A one-off local timing is functional evidence only.
