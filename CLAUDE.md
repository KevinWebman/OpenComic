# CLAUDE.md

Guidance for working in the OpenComic repository.

## What this is

OpenComic is a cross-platform **Electron** desktop comic/manga/ebook reader (Windows, macOS, Linux). It reads image archives (`cbz/cbr/cb7/cbt`, raw `zip/rar/7z/tar/...`), `PDF`, and `EPUB`, with support for remote sources (SMB/FTP/SCP/SFTP/S3/WebDAV), OPDS catalogs, reading-progress tracking (AniList/MyAnimeList), image filters/AI upscaling, gamepad navigation, and i18n.

- Language: JavaScript (`.js`) + TypeScript (`.mts`) mixed, compiled together.
- License: GPL-3.0. Upstream: https://github.com/ollm/OpenComic

## Build / compilation model — read this first

**The app does not run from `scripts/`. It runs from `.dist/`.** TypeScript compiles `scripts/` → `.dist/` (`rootDir: ./scripts`, `outDir: ./.dist`, `allowJs: true`, so plain `.js` files are copied/emitted too). `.dist/` is git-ignored and is the actual runtime.

So **any source edit requires a `tsc` pass before it takes effect.** Either:
- `npm run watch` — `tsc --watch` in the background while you edit, or
- rely on `npm start`, which runs `prebuild-start` (which runs `tsc`) before launching Electron.

`prebuild-start` (`tsc && node .dist/build.js && generate-colors.js && fill-languages.js`) also generates files that are NOT plain TS output:
- `.dist/builded/templates.js` — all `templates/*.html` (and theme templates) **precompiled** by Handlebars (`scripts/build.js`). If you change a `.html` template, you must re-run the build for it to show up.
- `.dist/builded/package-lock.js`, `.dist/nightly.js` (git commit/nightly flag), `.dist/installed-from-store.js`, `.dist/folder-portable.js` (build-specific stubs).
- Material Design color CSS (`themes/material-design/colors/generate-colors.js`) and merged language files (`languages/fill-languages.js`).

## Commands

```bash
npm install        # also runs postinstall: electron-builder install-app-deps + zstd-copy-native.js
npm start          # prebuild-start (tsc + templates + colors + langs) then launches Electron
npm run watch      # tsc --watch only (no template/lang regen)

npm test           # eslint + unit tests + build test  (this is the full CI check)
npm run test-unit  # node --test on .dist/test/unit/*  (compile first!)
npm run eslint     # lint ./scripts

npm run build-<type>   # electron-builder packaging, e.g. build-mac-dmg, build-nsis,
                       # build-deb, build-snap, build-flatpak, build-appimage, build-7z
```

ESLint (`eslint.config.mts`) only targets **`scripts/**/*.mts`** (not `.js`). Stylistic rules: **tabs** for indentation, **single quotes**, **semicolons required**. Match this style in new `.mts` files. The codebase generally uses Allman-style braces (opening brace on its own line) and tab indentation throughout — follow surrounding code.

Tests live in `scripts/test/unit/*.mts` and run via `node:test`. `scripts/test/build.mts` validates the packaged build.

## Architecture

### Two processes
- **Main process**: `scripts/main.js` → `.dist/main.js` (the package.json `main` entry). Creates `BrowserWindow`s, handles window state, file associations, `open-file`/`open-url`, IPC, single-instance lock, multi-window sync. Uses `@electron/remote`.
- **Renderer**: `templates/index.html` loads `.dist/opencomic.js`. `opencomic.js` is the renderer entry point and bootstraps everything.

Windows are created with `nodeIntegration: true` and `contextIsolation: false` — the renderer has **full Node.js access** and uses `@electron/remote`. There is no preload/IPC sandbox boundary; renderer code calls Node APIs directly.

### The "global module" pattern (important)
`scripts/opencomic.js` `require`s every feature module into top-level `const`s (see its lines ~279–311). Because the renderer runs without isolation, these become effectively **global** and modules reference each other by bare name (`app`, `dom`, `reading`, `settings`, `cache`, `storage`, `events`, `ebook`, `fileManager`, `template`, `language`, `gamepad`, etc.) plus shared globals like `appDir`, `config`, `handlebarsContext`. Each module ends with `module.exports = {...}`. When adding a module, register it in `opencomic.js` the same way.

### Key modules (`scripts/`)
Large files concentrate most logic — expect big single files:
- `reading.js` (~146KB) — the reader view: page rendering, navigation, double-page, scroll/slide, filters. Subfeatures in `reading/` (`render/`, `view.mts`, `double-page.js`, `filters.js`, `music.js`, `page-transitions/`, `ai.js`, `discord.js`, `progress.js`, `context-menu.js`, `sidebar.js`).
- `file-manager.js` (~94KB) + `file-manager/` — opening/reading archives, PDFs, compressed-stream reading, disk type, passwords, file access requests.
- `dom.js` (~78KB) + `dom/` — library/index UI: posters, boxes, header, history, labels, search, sort.
- `settings.js`, `storage.js` (+ `storage/` driver/backup/safe/sync-windows), `cache.js`, `migration.js` — config & persistence.
- `server-client.js` — remote protocols (SMB/FTP/SCP/SFTP/S3/WebDAV).
- `opds.js` + `opds/` — OPDS catalogs.
- `tracking.js` + `tracking/` — AniList & MyAnimeList. To add a site: copy `tracking/example/example.js`, implement it, and register in `tracking/tracking-sites.js` and `tracking-sites-keys.js` (see CONTRIBUTING.md).
- `ebook.js` + `ebook/` — EPUB rendering (foliate-js / epubjs / pdfjs-dist).
- `gamepad.js`, `shortcuts.js` (+ `shortcuts/`), `tabs.mts` (+ `tabs/`) — input & tabs.
- `template.js` + `templates.js` (handlebars) — UI is rendered from precompiled Handlebars templates in `templates/*.html`.

### Concurrency
- `threads.js` — JS-side task queue / worker pool keyed by job type (`os.cpus().length` workers).
- `worker.js` + `worker/convert-image.js` — Web Worker for image conversion (sharp).
- `child-fork.js` + `fork.js` + `workers.js` — Node `child_process` forks for heavy/native work (image processing, AI via `opencomic-ai-bin`).

### Native dependencies (matter for builds)
`sharp` (image processing, with custom `@img-custom/*` overrides pinned in package.json), `node-7z` + `7zip-bin-full` (archives), `opencomic-ai-bin` (AI upscale/descreen/artifact removal), `@toondepauw/node-zstd`, `pdfjs-dist`. These are `asarUnpack`ed and arch/OS-filtered in the `build.files` section. If a build fails with `Not exists` on Linux/macOS, run `npm install --force` in `./build/node-zstd-native-dependencies` then `npm install` again (see README).

## UI assets
- `templates/*.html` — Handlebars views (precompiled into `.dist/builded/templates.js`; not loaded at runtime as raw HTML).
- `themes/material-design/` — the theme (CSS + color generation + its own templates).
- `languages/*.json` + `fill-languages.js` — i18n; see TRANSLATE.md. The example webcomic in `Pepper & Carrot/` is bundled sample content (CC BY 4.0).

## Conventions & gotchas
- Edit files in `scripts/`, never in `.dist/` (regenerated, git-ignored).
- After editing templates or languages, a full `prebuild-start` (or `npm start`) is needed, not just `tsc`.
- New `.mts` files are linted; keep tabs + single quotes + semicolons.
- Persisted data lives under Electron `userData/storage` (or next to the executable for portable builds — see `folder-portable` handling in `main.js`). `migration.js` handles schema/version migrations of stored data.
- Commit messages in history use prefixes like `New:`, `Fix:`, `Upd:`.
