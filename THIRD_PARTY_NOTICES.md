# Third-party notices

FOLLOW/CUT is MIT licensed. It adapts parser ideas and some logic from the
MIT-licensed **IG Cleanup Tool** and bundles **Preact** at runtime. All other
dependencies are development/build tools and are not shipped inside the
single-file production artifact.

---

## IG Cleanup Tool (adapted)

- Repository: https://github.com/Mahmooodsaeed/IG-Cleanup-Tool
- Commit inspected: `7a7fba61177ca28eeb585c41c15e67e379d4857f`
- Used for: export filename classification, recursive entry collection, and
  tolerant `string_list_data` / `label_values` / `string_map_data` handling.
- Not used: the live-unfollow console script and its automation behavior.
- File with the adaptation notice: `src/lib/parse.ts`.
- License: MIT, reproduced below.

```text
MIT License

Copyright (c) 2026 Mahmood Saeed

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Preact (bundled runtime)

- Version: 11.1.1
- License: MIT
- URL: https://preactjs.com/

```text
The MIT License (MIT)

Copyright (c) 2015-present Jason Miller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Build and test dependencies (not shipped in `dist/index.html`)

| Package | Version | License |
|---|---|---|
| vite | 8.3.5 | MIT |
| typescript | 7.0.2 | Apache-2.0 |
| vitest | 5.0.5 | MIT |
| @playwright/test | 1.64.1 | Apache-2.0 |
| @preact/preset-vite | 2.10.6 | MIT |
| @types/node | 26.6.6 | MIT |
| rolldown (transitive) | 1.2.16 | MIT |
| qrcode | 1.5.4 | MIT |

The single-file build is produced by Vite and Rollup/Rolldown tooling. No
development dependency code is included in the distributable beyond any small
runtime helper that the bundler emits; Preact is the only declared runtime
dependency.

`qrcode` is used only by the optional local handoff server
(`scripts/share-server.mjs`), never by `dist/index.html`. It is MIT licensed
(https://github.com/soldair/node-qrcode) and is installed as a development
dependency with its transitive dependencies (`dijkstrajs`, `pngjs`, `yargs`);
none of that code ships in the single-file app.

---

## Interaction reference

[Sift](https://siftbeta.abacusai.app/) was reviewed only as an interaction
reference for swipe-to-sort. No Sift code, assets, branding, or visual design
was copied or reused.

---

## Trademarks

Instagram and Meta are trademarks of Meta Platforms, Inc. FOLLOW/CUT is an
independent project and is not affiliated with, endorsed by, or sponsored by
Instagram or Meta.
