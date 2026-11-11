# Third-party notices

## realtime-tex

Source: https://github.com/HenryXiaoYang/realtime-tex

Reference revision: fcff7a5c7f33a288ecf40db886843754c62bbdfd (workspace version 0.0.7).

Copyright (c) 2026 Henry Yang and the realtime-tex contributors.

License: MIT. The complete permission and disclaimer text is retained in `LICENSE` and `vendor/realtime-tex/LICENSE` and distributed in the npm package. Lua/TeX support source is copied from upstream; the TypeScript host is a closely referenced derivative adaptation. See `UPSTREAM.md` for the module map, differences and research credit.

## Research credit

Clemens Lode, *Real-Time LuaTeX: Recompiling Large Documents in 1 ms*, TUG 2026, https://www.tug.org/tug2026/preprints/lode-realtime.pdf. This is an inspiration citation, not a claim of ownership, endorsement, or a sublicense to the paper.

## External dependencies

A separately installed LuaLaTeX/TeX Live or compatible distribution is required. TeX engines, classes, packages, fonts and user documents have their own licenses. This npm package neither installs nor redistributes them. Runtime JavaScript has no third-party npm dependencies; TypeScript and Node type declarations are development dependencies with their own licenses.

Optional PDF raster verification calls separately installed Poppler tools (`pdfinfo`, `pdftoppm`). They have their own licenses and are not installed or redistributed by this package.
