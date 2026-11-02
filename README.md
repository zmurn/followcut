# FOLLOW/CUT

**A local-first Instagram following curator.** Import the export Meta gives you, review everyone you follow like a deck of cards, and work through a cleanup queue that only you can confirm.

No login. No upload. No unzipping. No automatic unfollowing.

---

## Why this exists

Instagram exports are confusing to request and miserable to read. Most cleanup tools either dump 1,700 rows into a spreadsheet or rely on a browser-console script that clicks Unfollow for you. FOLLOW/CUT does neither.

It makes the *review* fast and the *action* explicit:

- **Import** the ZIP exactly as Meta gives it to you.
- **Decide** with the arrow keys, a drag, or buttons: **Cut** (mark for cleanup), **Keep**, or **Maybe**.
- **Clean** by opening each queued profile yourself, unfollowing on Instagram, and then explicitly saying **“I unfollowed this account.”**

**Cut is not unfollowing.** It is a note to your future self. The app never talks to Instagram, never needs your password, and never performs an account action.

The example in this repository uses the brief's starting numbers: **1,733 following, 1,336 followers, 0.77:1, 397 confirmed removals needed for 1:1.** The demo deck reproduces them with fictional accounts.

### Why there is no unfollow button

Instagram has no public API for unfollowing. A browser-console script that clicks Unfollow needs your logged-in Instagram session, runs outside this app's consent and confirmation model, and is exactly the kind of automation that can trigger action blocks or account restrictions. It also breaks whenever Instagram changes its markup.

FOLLOW/CUT deliberately ships no console script, cookie access, private endpoint, or injected click. The cleanup queue is one-at-a-time: open the profile yourself, unfollow on Instagram, then confirm it here. **Cut is still not unfollowing.**

---

## Quick start

Requirements: **Node.js 22+** (developed on Node 24) and npm.

```bash
npm ci
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

To build the distributable:

```bash
npm run build
```

That produces **one self-contained file: `dist/index.html`** (~259 kB). You can double-click it, email it to yourself, or host it on any static server. It works from `file://` because all CSS and JavaScript are inlined; there is no service worker or module fetch.

> The dev server needs a slightly relaxed CSP for hot-module reload. The production single-file build ships `default-src 'none'` plus the one Instagram preview frame exception and is the artifact the tests exercise.

Try the demo from the welcome screen if you do not have an export yet. All demo accounts are invented.

To use the deck on a phone, run the optional local handoff instead:

```bash
npm run share
```

It builds the app, starts a server on your computer, and prints a localhost URL. See [Use the deck on your phone](#use-the-deck-on-your-phone-optional-local-handoff).

---

## Getting your Instagram export

1. Open **[Instagram Accounts Center → Your information and permissions](https://accountscenter.instagram.com/info_and_permissions/dyi/)**.
2. Choose your Instagram profile.
3. Choose **Export to device** / **Download to device**.
4. Select **Followers and following** only. Some accounts label it under **Connections**.
5. Set **Date range: All time** and **Format: JSON**.
6. Submit the request. Meta builds the archive in the background and makes the ZIP available for download.

The fallback route is [Accounts Center for Facebook](https://accountscenter.facebook.com/info_and_permissions/dyi/); Meta's labels and routing can change. The app opens the official page in a new tab after you click. It cannot submit the request or fetch a finished download for you, and it never sees your login.

**You do not need to unzip anything.** Drag the ZIP onto step 2.

If Meta gives you only HTML, re-request the export with **JSON** selected. HTML is not silently accepted or guessed at.

---

## Using it

### The review deck

| Action | Key | Gesture | Meaning |
|---|---|---|---|
| **Cut** | `←` | drag left | Mark for the cleanup queue. **Does not unfollow.** |
| **Keep** | `→` | drag right | Keep following. |
| **Maybe** | `↓` | drag down | Revisit later; not queued. |
| **Open profile** | `Space` | card link | Opens the full profile in a new tab and marks it opened. The optional card preview is visual only. Never confirms anything. |
| **Star** | `S` | star button | Personal priority / filter. |
| **Lock** | `L` | lock button | Protect from bulk operations. |
| **Undo** | `Z` | Undo button | Reverses the last deck decision in this session. |
| **Help** | `?` | help button | Keyboard and semantics. |

Back and Next move through the current filtered view without changing a decision. A decision is saved immediately; reloading returns to the same card.

**Filters and order** include All following, Unreviewed, Not following back, Mutuals, Marked for cut, Maybe, Kept, Starred, Locked, and search. They compose with date order, A–Z, and a stable shuffle. Filtering never loses a decision.

**Follow-back status** is only shown when the export included a usable follower list. If the list is missing or incomplete, those filters are disabled rather than mislabelling everyone.

### Profile previews

The export contains usernames and profile URLs, **not** profile photos, bios, or posts. Grey-area downloaders such as Instaloader can fetch media, but they rely on sessions/cookies/private endpoints, break often, and are outside this app's no-login model. I did not use them.

I did find a first-party route: Instagram serves an **embeddable profile page** at `https://www.instagram.com/<username>/embed/`. It shows the profile header and a recent-post grid without login for public accounts. FOLLOW/CUT uses it as a **card preview strip**:

- **In-app** (opt-in): click **Load previews** in the deck toolbar (or choose In-app in the rail/settings) and a low-resolution strip of the current profile's post grid appears inside the card. The next profile's iframe is preloaded in the same card, so advancing is not a cold load. No popup, no separate window, and no closing per profile. The iframe is pointer-transparent, so the card still swipes.
- **Off** (default): no preview iframes are mounted at all. **Open profile** still opens the full profile in a `noopener noreferrer` tab.
- **On phones:** the same card strip works in the phone deck. The phone pass removes the duplicated card index, subline, detail grid, cutline, opened timestamp and footer note; the toolbar becomes one row (Filters, position, Preview, Undo), and the preview grows to use the available height. The decision bar stays fixed above the bottom nav.

The strip asks Instagram for the embed in a **narrow iframe** (360 px desktop, 300 px mobile), then crops/zooms it to the post grid. Instagram therefore serves smaller image renditions; this is a preview, not a high-resolution copy. It is visual only—use **Open profile** for full scrolling and interaction.

The app never reads, copies, or stores the iframe. Only the username goes into the frame URL—no export data. The current card and next profile are the only prefetched frames. The first-party embed is **undocumented**, not a public API: public accounts work best, private accounts may be limited, and the page can change.

This requires one deliberate CSP exception: `frame-src https://www.instagram.com`. The app's own code still has no `connect-src`, no remote scripts, no remote fonts, and no upload path. **In-app is off by default**; when enabled, the card preview requests Instagram for the current and next profile. Normal import, review, cleanup, and settings flows with Off remain external-request-free. Switch it in the review rail or **Data & settings**.

### Window fit

The review screen is tuned to the window, not just the breakpoint:

- Header tools collapse before the navigation clips on 768–900 px tablet/desktop widths.
- Short laptop windows use a compact card: the visual preview plus two key metadata rows, with the decision bar kept in view at 1366×768 and 1024×768.
- At 320×700 the strip uses a compact 120 px crop and the Preview control becomes an icon so the card and fixed decision bar still fit.
- At phone widths the fixed decision bar is inset with the viewport width, not `100% + padding`, so it no longer causes horizontal overflow.
- Preview swaps crossfade; loading uses a quiet skeleton, and reduced-motion disables those transitions.

### Session memory

You can stop after any card, close the tab, and come back later. The session is already local to the browser origin; the memory layer makes that visible and flushes it on the way out:

- The dataset, decisions, cleanup queue, notes, review cursor, last view, filters, and a `lastActiveAt` checkpoint are stored under `followcut:v1:*`.
- Every decision, cursor move, filter change, and view change saves immediately. `pagehide` and a hidden `visibilitychange` flush the final cursor/state, so a tab close does not lose the current place.
- Reopening returns to the stored view and card. The Overview panel shows **“Pick up at @handle”** and the last active time; reopening a review or cleanup after more than a minute shows a short “Resumed … Last saved …” notice.
- The phone handoff uses the same local session and live sync; the server retains the latest phone state, and the full browser link resumes it. If browser storage is cleared or the origin changes, use **Download backup** and restore it.
- This is still local memory, not cloud sync. It is per browser origin, so `file://`, `localhost`, and the LAN URL each have their own storage. The backup is the portable copy.

### The cleanup queue

The queue contains accounts marked **Cut** that have not been confirmed. For each one:

1. Open the Instagram profile.
2. Unfollow on Instagram if you still want to.
3. Return and click **I unfollowed this account**.

Other actions: **Skip for now** (defer to the back of the queue), **Actually keep** (remove from the queue), **Mark uncertain** (move out of the active queue), and **Undo confirmation**.

Opening a profile records “Profile opened” but never counts as a confirmation. There is no automatic click, hidden script, or rate-limit evasion. Confirmations are your own local records; they are not read back from Instagram.

Queue progress shows **confirmed / intended**. Pending cuts are never counted as removals.

### Data & settings

- Download a portable session backup (JSON) containing normalized accounts, decisions, notes, cleanup states, snapshot metadata, and settings. It does **not** contain the raw Instagram archive or photos.
- Restore a backup from **Data & settings**, or from **Restore a saved backup** on the welcome screen if the current session is empty.
- Import a newer export. Decisions are matched by exact username only; the merge dialog shows what will be kept, dropped, or archived before you confirm. Usernames change, so the app never guesses.
- Export decisions and cleanup as CSV, or the queue plan as JSON.
- Theme: System / Light / Dark. Motion: System / Reduce. Card previews: In-app / Off.
- Clear the local session with confirmation.

---

## Use the deck on your phone (optional local handoff)

Browsers cannot hand a session to another device by themselves without a cloud service or a local server. FOLLOW/CUT uses a **local companion server on your computer**, so there is no cloud account and no data leaves your network.

```bash
npm run share
```

The command builds the app and starts a local server. It prints:

```text
On this computer:  http://localhost:4173/
Local network:     http://192.168.x.x:4173/
```

Then:

1. Open the printed **localhost URL on the computer**. Browsers keep `file://` and `http://` storage separate, so import the ZIP there, or restore a backup from the standalone app. (The phone button in the standalone app explains this and can download that backup for you.)
2. In the localhost app, click the phone icon in the header, or **Continue on phone** on the dashboard.
3. Scan the QR code with your phone camera. Both devices must be on the same trusted Wi-Fi.
4. The phone opens directly on the review deck, continuing from the same card. Decisions, cleanup state and the current card sync back to the computer as you review. The URL stays `/p/<code>`, so reopening it in Safari or Chrome resumes the same live session.

What this mode is, and is not:

- **Live, phone-to-computer.** After the phone loads, its session changes are PUT to the local server (debounced) and the computer polls roughly every 1.2 s. The computer's deck cursor, decisions, cleanup queue and metrics update live; its own view and theme are preserved. The computer does not write back, so a computer-side edit is replaced by the next phone update. There is no conflict merge.
- **Local only.** The server holds the normalized session in memory, refuses requests from non-local addresses, and never writes it to disk. The QR pairing code expires after ten minutes; once a phone or computer opens the code, the live session is extended to twelve hours while the server keeps running.
- **Full browsers work.** The phone URL is not rewritten to `/`. The `/p/<code>` path is retained after import, so the iOS “Open in Safari” / Android “Open in Chrome” action keeps the session key and resumes from the server's latest state. The same link can be reopened later (within the session lifetime) or copied from the active handoff panel.
- **Not a PWA.** Plain HTTP on a LAN is not a secure browser context, so there is no service worker or offline install. Keep the server running; the phone's localStorage still holds its local copy.
- **Not encrypted on the LAN.** The handoff is HTTP on your local network. Use trusted Wi-Fi, not public or guest Wi-Fi.
- **IP-address bound.** The phone's localStorage belongs to `http://<computer-ip>:4173`. If the computer's IP changes, the old origin will not have the data; use the retained link while the server is alive, or export a backup first.
- The standalone `dist/index.html` still ships `default-src 'none'` plus the single Instagram `frame-src` exception for the optional card preview; it never talks to the handoff server.

If the printed LAN IP is the wrong interface, restart with `PUBLIC_HOST=192.168.x.y npm run share`. Use `PORT=4174` for a different port. macOS may ask for firewall permission the first time.

> The QR code is generated by the local server (`qrcode`, a server-only dependency). The standalone app has no QR library; its only external frame is the opt-in Instagram card preview.

---

## Privacy and security model

- **The core single-file app has no server, cloud sync, analytics, remote scripts, fonts, image CDNs, or SDKs.** The optional phone handoff is a local Node process that runs only when you start `npm run share`; it is not a cloud service and is not running otherwise. The optional card preview is Instagram's own sandboxed embed; it is off by default and loads only after you enable In-app.
- The single-file production build's **Content Security Policy blocks the app's own network requests**: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; frame-src https://www.instagram.com; base-uri 'none'; form-action 'none'`. There is no `connect-src`; the only external frame is Instagram's opt-in card preview. The app never reads that frame.
- The handoff-served page relaxes only that page's CSP to allow `connect-src 'self'` (for the local handoff API), `img-src 'self'`, and the same Instagram preview frame; it still blocks other external origins.
- The ZIP is read in the tab with a small defensive reader. It is never uploaded and never written to disk by the app.
- Normalized data is stored in this browser's **localStorage**, under `followcut:v1:*`. Raw archive bytes are not stored.
- External navigation happens only when you click an Instagram or Meta link or open a full profile. With card previews Off (the default), the tests assert zero external requests while importing, reviewing, cleaning, and changing settings. Enabling In-app mounts the current and next Instagram frames; the preview test mocks them. The handoff test asserts only the local server is contacted.
- The single-file architecture requires `'unsafe-inline'` for the one inline script and stylesheet. That is a deliberate tradeoff for a double-clickable artifact; there is no `eval`, no remote script, and no HTML injection path from imported data.
- The local handoff server holds normalized account data in memory, never writes it to disk, does not log codes, and expires the QR pairing window after ten minutes. An opened live session is extended to twelve hours while the server runs. HTTP over the LAN is not encrypted; use a trusted network.
- Never enter your Instagram password into FOLLOW/CUT. It has no login field and no way to use one.

---

## Supported export data

The importer:

- Accepts **ZIP**, **individual JSON files**, and an **unzipped folder** (directory picker, where the browser supports it). ZIP is the happy path.
- Finds files by normalized basename, nested to any depth, including renamed copies such as `following (1).json`.
- Merges split `followers_1.json`, `followers_2.json`, … and deduplicates.
- Understands `string_list_data` (`value` / `href` / `timestamp`), `relationships_following`, bare arrays, `title` fallbacks, `string_map_data`, and newer `label_values` entries with `Username` / `URL` fields.
- Ignores unrelated export files such as followed hashtags, received follow requests, recently unfollowed profiles, close friends, and blocked/restricted lists.
- Separates multiple account datasets inside one archive and asks you to choose; it never merges different people across accounts.
- Keeps pending follow requests separate from following.
- Preserves display casing while comparing case-insensitively, and validates every profile URL it builds.
- Treats a missing follower list as **unknown**, not as “everyone unfollowed you.” A partial follower list disables comparison and says so.
- Fails safely on HTML exports, invalid JSON, corrupt/encrypted ZIPs, oversized files, and ZIP64. Parser failures offer an **anonymized schema report** (file categories and JSON keys only, no usernames or values) that you can copy or download.

### Safety limits

| Limit | Value |
|---|---:|
| ZIP archive | 256 MB |
| ZIP entries | 12,000 |
| One decompressed JSON file | 64 MB |
| Total decompressed JSON | 192 MB |
| Following accounts | 100,000 |
| Individual JSON / backup | 32 MB |
| Encrypted or ZIP64 archives | Not supported |

Large full-account Meta archives can exceed the archive limit. Request **Followers and following** only; those files are small.

---

## Tests

```bash
npm ci
npx playwright install chromium   # once, for E2E
npm run typecheck
npm test                          # unit: parser, ZIP, metrics, store, merge, backup, CSV
npm run test:e2e                  # builds the single file, then runs Playwright
npm run qa                        # all of the above
```

Results from the final local run are recorded in [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md): **60 unit tests** and **37 Playwright tests**, plus a **passing run of the upstream IG Cleanup Tool test suite** during the audit.

The E2E suite loads `dist/index.html` over `file://`, imports synthetic ZIPs, mocks Instagram for profile-link tests, and asserts there are no external requests during normal use. It covers keyboard, mouse swipe, mobile layout, dark/light theme, reduced motion, dialog focus, backup/restore, merge safety, missing follower data, session memory/reload resume, and the numerical examples from the brief. One spec starts the local handoff server, imports on the computer origin, opens the QR URL in a phone-sized context, verifies the phone's Cut updates the computer's active card and cleanup count, and opens the retained `/p/<code>` URL in a clean browser context to confirm it resumes the phone's latest card. Another enables card previews, verifies the current Instagram frame and the preloaded next frame, then cuts and checks that the preloaded next frame becomes active without a popup. A responsive spec checks the review deck and decision bar at 1366×768, 1024×768, and 320×700 for horizontal overflow and vertical clipping.

Fixtures live in [`tests/fixtures/`](tests/fixtures/) and are entirely fictional.

---

## Project layout

```
src/
  lib/         parser, ZIP reader, metrics, selectors, store, backup, CSV, demo, profile link
  components/  icons, modal, import, merge, account card, goal editor, phone handoff, card profile preview
  views/       Welcome, Dashboard, Review, Cleanup, Settings
  styles/      tokens.css (design tokens) + app.css
scripts/
  build-singlefile.mjs   strict single-file artifact
  share-server.mjs       optional local phone handoff server
tests/
  unit/        Vitest
  e2e/         Playwright
  fixtures/    synthetic export files
  helpers/     ZIP writer + fixture loading
```

**Key invariants**

- `cut` and `confirmed` are separate states. The queue is derived, never a second source of truth.
- `getMetrics` derives confirmed/estimated/projected numbers from the current snapshot and manual confirmations; the snapshot's own counts never change without a new import.
- The production CSP is checked by `scripts/build-singlefile.mjs` and by tests. It allows exactly one external frame, Instagram's profile preview.
- The single-file build moves the inline script to the end of `<body>`; Vite otherwise emits it in `<head>`, where a classic script would run before `#app` exists.
- No external network calls and no Instagram automation. The optional handoff server is the only server, runs locally, and is not used by the standalone artifact.
- No scraping. The opt-in card preview frames Instagram's own profile page; the app never reads, copies, or stores it. The frame exception is limited to `https://www.instagram.com`; the full-profile path uses `noopener noreferrer`.

See [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) for the audit, verified behavior, and limitations, and [DESIGN.md](DESIGN.md) for the visual system and its rationale.

---

## Known limitations

- **No profile photos, bios, or recent posts in the export.** Instagram's export does not contain them, and the app never scrapes the site. Cards use initials. The opt-in card strip frames Instagram's first-party profile embed (recent posts) at low resolution; it requires internet, works best for public accounts, is undocumented and may change. **Open profile** still opens the full profile with strict no-opener isolation. Card previews are off by default.
- **Not live data.** Every snapshot is a point-in-time export. “Estimated” and “projected” figures are local arithmetic, not Instagram counts.
- **Username renames are not matched.** Matching is exact and conservatively drops the old decision rather than transferring it to a different person. The merge dialog explains this.
- **No Instagram actions, ever.** Every unfollow is manual and user-confirmed. No claim is made that unfollowing or any cleanup pattern is risk-free.
- **localStorage, not IndexedDB.** This keeps persistence synchronous and the original architecture simple; quota is browser-limited. Download a backup if the session matters. There is no cross-tab sync.
- **Export date is inferred from the archive folder name.** If absent, the snapshot is labelled with its import date and the UI says the export date is unknown.
- **Folder selection is browser-dependent.** Chrome/Edge support `webkitdirectory`; drag-and-drop of folders is not reliable and is not supported. The ZIP and file pickers always remain.
- **Chromium-tested.** Safari and Firefox were not part of this test run. The app uses `DecompressionStream('deflate-raw')`, available in current Safari and Firefox; older browsers show a specific compatibility error.
- **ZIP64, encrypted archives, and non-deflate compression** are rejected rather than guessed at.
- **Meta's UI and export schema can change.** The importer is deliberately tolerant and fails with a schema report instead of inventing data.
- **One session per browser origin.** Keep the single-file artifact in a stable location if you want a stable `file://` storage origin.
- **Phone handoff is local and temporary.** The phone loads the app from your computer over HTTP, so it needs the server to open or reload the page. Live sync is phone-to-computer only; there is no conflict merge, no PWA/offline install, and no encryption on the LAN. The phone's storage is bound to the computer's IP and port.
- **Real phone hardware was not used in the automated run.** The E2E test opens the handoff URL in phone-sized Chromium contexts (including a clean full-browser context) and verifies sync; the QR image is generated and checked, but a physical camera scan, iOS Safari, and Android Chrome were not tested.
- **The app is not affiliated with Instagram or Meta.**

---

## Attribution and license

FOLLOW/CUT is **MIT licensed**. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Substantial portions of the export discovery/normalization approach are adapted from **[IG Cleanup Tool](https://github.com/Mahmooodsaeed/IG-Cleanup-Tool)** by Mahmood Saeed, also MIT licensed. Its live-unfollow console script was **not** carried over; the parser ideas, filename classification, and tolerant entry handling were. The original project was inspected at commit `7a7fba61177ca28eeb585c41c15e67e379d4857f`; its Playwright suite passed during the audit.

[Sift](https://siftbeta.abacusai.app/) was an interaction reference only. No Sift code, assets, branding, or visual design was used.
