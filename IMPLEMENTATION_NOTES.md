# FOLLOW/CUT — implementation notes

**Date:** 2 November 2026  
**Deliverable:** working local-first web application, tests, fixtures, single-file build, documentation  
**Built from:** [Mahmooodsaeed/IG-Cleanup-Tool](https://github.com/Mahmooodsaeed/IG-Cleanup-Tool) (MIT), inspected and adapted; not a blind rebuild

---

## 1. Audit of the starting point

I cloned the upstream repository and inspected its `index.html` (1,133 lines), `README.md`, `package.json`, `sample-data/`, Playwright end-to-end test, and `LICENSE` before changing anything.

- **License:** MIT, Copyright (c) 2026 Mahmood Saeed. Preserved in [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- **Commit inspected:** `7a7fba61177ca28eeb585c41c15e67e379d4857f` (21 Sep 2026).
- **Existing test:** `npm install && npx playwright install chromium && npm test` → **✓ All checks passed** against the project's mock Instagram site. No real account was touched.
- **Reusable parts:** the tolerant filename classifier, recursive entry walker, `string_list_data` / `label_values` / `string_map_data` handling, split `followers_N.json` merging, and the localStorage-first persistence instinct.
- **Not carried over:** the generated console script that opens Instagram profiles and clicks Unfollow automatically, the batch speed controls, and any suggestion that automation is risk-free. FOLLOW/CUT has **no Instagram account actions**.
- **Privacy idea retained:** the upstream page uses `default-src 'none'`. FOLLOW/CUT keeps a strict production CSP with one narrow Instagram `frame-src` exception for the opt-in profile preview and verifies it in build + tests.

The parser was **rewritten** in TypeScript rather than pasted: separate dataset grouping, conservative follow-back state, invalid/duplicate accounting, anonymized schema reports, ZIP limits, CRC checks, and explicit failure codes. The upstream license notice is kept at the head of `src/lib/parse.ts`.

---

## 2. What was delivered

### P0 — complete

| Brief area | Status | Evidence |
|---|---|---|
| Welcome / official export route | ✅ | Two official Meta links, 5-step checklist, “You do not need to unzip anything,” fallback links, “I have the ZIP,” demo | 
| ZIP import without unzipping | ✅ | Defensive central-directory reader, stored + deflate, nested paths, split files, renamed copies |
| Drag/drop, file picker, folder | ✅ | Drop zone + two labelled pickers; `webkitdirectory` set imperatively and verified in E2E |
| JSON files / unzipped folder | ✅ | Individual JSON selection and folder picker; unzipped path tested with multiple JSON files |
| Auto-detection, no archive browsing | ✅ | Filename + top-level key classification; unrelated export files skipped |
| Import progress + summary | ✅ | Reading state, counts, export date, warnings, snapshot summary |
| Multiple accounts in one archive | ✅ | Separate dataset picker; E2E asserts two candidates and no merge |
| Missing/truncated follower data | ✅ | Follower comparison off/incomplete; filters disabled; “Follow-back unknown” |
| HTML / corrupt / oversized / encrypted / ZIP64 | ✅ | Specific, actionable errors; parser fails closed |
| Schema-change report | ✅ | Copy/download anonymized file categories + keys only |
| Local persistence | ✅ | Decisions, favorites, locks, notes, cleanup, cursor, filters, settings; synchronous localStorage |
| Dashboard | ✅ | Snapshot metrics, ratio, mutuals, not-following-back, reviewed/planned/confirmed, “Not live data,” goal, projection |
| Goal selector | ✅ | User-set integer, 1:1 suggestion, 1,500/1,200/1,000 presets, confirmed-only remaining math |
| Swipe deck | ✅ | Pointer drag left/right/down, buttons, keyboard, stamps, no fake photos |
| Keyboard | ✅ | `← → ↓ Space S L Z ?`; guards for inputs/dialogs; verified in E2E |
| Undo / Back / Next | ✅ | Deck undo stack; navigation without decision changes; cursor persistence |
| Filters + search + sort | ✅ | 9 filters, composed with search; date/A–Z/stable shuffle; decisions independent |
| Resume after reload | ✅ | Cursor and UI persisted; E2E reload test |
| Maybe + completion state | ✅ | “Every card reviewed,” Maybes and cleanup offered; fixed reviewed-filter cursor |
| Cleanup queue | ✅ | Focus + list, explicit manual confirmation, skip/keep/uncertain/requeue/undo |
| Confirmation semantics | ✅ | Opening ≠ confirming; “I unfollowed this account” is the only confirmation |
| CSV / JSON export | ✅ | Decisions CSV, cleanup CSV, cleanup JSON with summary |
| Backup / restore | ✅ | Portable normalized session; preview; welcome-screen restore for empty sessions |
| Reimport / merge | ✅ | Exact-username matching, preview counts, archived removed confirmations, rename warning |
| Clear session | ✅ | Confirmation dialog; storage keys removed; appearance retained |
| Theme / reduced motion | ✅ | System/light/dark; system/reduce; tested |
| Privacy promise | ✅ | No login, no cloud server, no analytics, no app fetch/upload; one opt-in Instagram frame; network test |
| Demo | ✅ | 1,733 following / 1,336 followers / 397 gap, fictional, deterministic |
| Single-file build | ✅ | `dist/index.html`, ~259 kB, works from `file://` |
| Tests / fixtures / README | ✅ | 60 unit, 37 E2E, synthetic fixtures, build instructions |

### P1 — partially implemented

- **Two-pass review:** available manually through **Not following back** and **Mutuals** filters; not offered as a guided two-step wizard.
- **Protected list:** star and lock exist, with Starred/Locked filters. There are no bulk operations to protect against yet, so “lock” is currently a personal marker.
- **Labels:** not implemented.
- **Bulk triage:** deliberately not implemented; no bulk live action exists.
- **Smart resumption:** cursor, filters, and Maybe are persisted. No explicit “continue from last account” banner beyond the dashboard’s “Pick up at @handle.”
- **Follow-age exploration:** dates are shown and sortable; no histogram.
- **Snapshot compare:** merge preview shows added/removed counts and preservation; no per-account diff list.
- **CSV/JSON:** implemented.
- **Direct handoff:** new tab per click with `noopener noreferrer`; no browser-extension tab reuse.
- **Phone handoff (added after the brief):** implemented as an optional local companion, not a cloud backend. It is a real working feature and is tested; see section 6 for the architecture and limitations. It is not required for any core P0 flow.
- **Profile preview:** implemented as an in-app review mode with Instagram's first-party profile embed, Cut/Maybe/Keep auto-advancing, and a no-opener full-profile new-tab path. No scraped media. The embed is undocumented and may break; the full-profile link remains.
- **Browser-extension side panel:** not attempted. The in-card preview covers the content-viewing need; an extension would add install and permission complexity for little gain.
- **Native wrapper:** not attempted.

### P2 — deferred

Review timer, personal notes across devices, comparison charts, a dedicated list-only accessibility mode, and any browser extension. No AI classification, paid scaffolding, login, or multi-platform scraping.

---

## 3. Verified Meta routes (as of 2 Nov 2026)

| URL | Observed |
|---|---|
| `https://accountscenter.instagram.com/info_and_permissions/dyi/` | HTTP 302 → `https://www.instagram.com/accounts/login/?next=…accountscenter…dyi%2F…` when unauthenticated. Valid official route, requires login; does not accept an export request without the user. |
| `https://accountscenter.facebook.com/info_and_permissions/dyi/` | HTTP 400 to an unauthenticated curl request. Kept as the brief's documented fallback, with copy that Meta may change labels/routes. Not claimed to work headlessly. |
| `https://help.instagram.com/181231772500920` | Meta help article “Review and export a copy of your Instagram information,” found via search; kept as a human fallback. |
| [Meta data-portability deep-link guide](https://developers.prod.facebook.com/documentation/data-portability/deep-link-guide) | Confirms the Accounts Center EYI routes and `format=JSON` / `date_range=ALL_TIME` parameters. Deep links require `import_service`; FOLLOW/CUT deliberately uses the plain route and does not claim to pre-select options. |

The app never says the button requests an export or retrieves a finished download. It opens the official settings after a user click.

---

## 4. Test evidence

Environment: macOS arm64, Node **24.15.0**, npm 11.12, Chromium from Playwright; production single-file build.

```text
npm run typecheck   → passed (tsc --noEmit)
npm test            → 60 unit tests passed (6 files)
npx playwright test → 37 E2E tests passed (10 files, ~46 s)
npm run build       → dist/index.html ~259 kB, single file, CSP locked
```

Upstream baseline (separate audit folder): `npm test` → **✓ All checks passed**.

### Unit coverage (59)

- Export parsing: classic `string_list_data`, `title` fallback, `href` extraction, `label_values`, `string_map_data`, bare arrays, split follower files, renamed copies, duplicates, invalid handles, Unicode URL construction.
- ZIP safety: stored/deflate, CRC mismatch, encrypted flag, oversized entry, entry-count cap, ZIP64 refusal, path traversal, non-ZIP.
- Metrics: 1,733 / 1,336 / 0.77 / 397; 100 planned ≠ 100 confirmed; 100 confirmed → estimated 1,633 with snapshot still 1,733; goals; archived confirmations; filters do not alter totals.
- Store: persistence round-trip, undo, re-cut requeues deferred/uncertain accounts, reviewed-state filters open correctly, clear, quota failure, corrupt saved data.
- Merge: added/removed, exact matching, rename does not transfer a decision, archived confirmations, earlier-date warning.
- Backup: validation, URL rebuild, unknown decisions dropped, hostile `__proto__` key does not pollute prototypes.
- CSV/JSON: escaping, formula-injection prefix, deduplicated queue rows, summary counts.

### E2E coverage (37)

- Save the complete fixture ZIP through the real file input, verify counts and export date, start review.
- Individual JSON files, HTML file, HTML inside ZIP, non-ZIP, two-dataset picker, missing follower data.
- Official link attributes, folder input attribute, “I have the ZIP” focus movement, no password field.
- Keyboard decisions, undo, reload resume, search guard, help dialog and scroll restoration, filters, mouse swipe, profile popup does not confirm, Back/Next, completion offers Maybe/cleanup, star/lock persistence.
- Cleanup: plan vs confirmation, skip/keep/uncertain/requeue/undo, CSV/JSON downloads, reload persistence.
- Backup: download, clear, restore from the welcome screen, invalid backup error.
- Reimport: merge dialog, decisions kept, cancel keeps old snapshot.
- Mobile 390×844: fixed action bar above nav, no horizontal overflow, all views.
- Privacy: zero external requests during normal flow; the app cannot fetch or upload; the only external frame is the opt-in Instagram preview, mounted only when preview opens and never read by the app.
- Theme persistence; accessible names; landmarks; one `h1`; unique DOM IDs; skip-link focus without route change; native dialog focus trap; reduced motion.
- Phone handoff: local server bootstrap, QR generation, import on the computer origin, live phone-to-computer sync of the active card and cleanup count, and a clean full-browser context resuming the retained `/p/<code>` URL. Also verifies the standalone file explains the optional server without making a network request.
- Profile preview: the in-app mode frames Instagram's first-party profile embed, marks "Profile opened" without a decision, and advances to the next profile without closing the panel.

### Manual QA

- 1440×900 desktop: welcome, dashboard, review, cleanup empty/focus, settings, help, completion.
- 390×844 and 320×800 mobile: deck actions reachable above bottom nav, no horizontal overflow at 320.
- Dark theme: dashboard, review, help.
- 200% root text (equivalent text-scaling check at 1440): no horizontal overflow; goal input and controls remain reachable.
- Reduced motion: E2E asserts computed transition duration ≤0.01 s and deck still changes.
- Production `file://` load with strict CSP; no console errors.

---

## 5. Acceptance-criteria mapping

| Brief criterion | Result |
|---|---|
| Complete mock ZIP without unzipping | ✅ E2E + unit |
| `following.json` nested several directories deep | ✅ fixture root is nested; parser test |
| Classic and newer formats | ✅ `string_list_data`, `title`, `label_values`, `string_map_data` |
| `label_values` without confusing unrelated files | ✅ classifier + fixtures |
| Split followers merged/deduped | ✅ unit + fixture |
| Unrelated data ignored, renamed files handled | ✅ unit |
| Missing follower file disables classification, review works | ✅ unit + E2E |
| Partial/malformed/HTML exports fail or are supported | ✅ unit + E2E |
| Bad/very large ZIP fails safely | ✅ unit (limits, CRC, ZIP64) |
| No network while parsing/managing | ✅ E2E request monitor + CSP |
| Gestures and keyboard both work | ✅ E2E mouse + keyboard |
| Buttons equal gestures | ✅ same `commit()` path |
| Filter changes do not lose decisions | ✅ E2E + store |
| Undo reverses a decision | ✅ E2E + unit |
| Refresh/restart preserves position | ✅ E2E reload |
| Maybe/protected available separately | ✅ filters, cards, tests |
| Profile opens valid Instagram HTTPS and does not unfollow | ✅ E2E popup + count unchanged |
| Shortcuts not active while typing/dialog | ✅ E2E |
| Swipe-left queues without confirming | ✅ E2E |
| Explicit manual confirmation only | ✅ E2E; no auto-confirm path |
| Skip/undo confirmation work | ✅ E2E |
| No hidden account actions | ✅ no automation code; CSP |
| Queue intact across refresh/import | ✅ E2E reload; merge test |
| Ratio 0.77, 397 needed | ✅ unit |
| 100 planned ≠ confirmed | ✅ unit + E2E |
| 100 confirmed → estimated 1,633, snapshot 1,733 | ✅ unit |
| Snapshot count remains | ✅ unit + E2E |
| Counts under filters/duplicates/imports | ✅ unit |
| Tests local, no login | ✅ |
| 1440 and 390 layouts | ✅ Playwright |
| Dark/light contrast | ✅ measured tokens; tests for theme persistence |
| Reduced motion + keyboard | ✅ E2E |
| No tracking | ✅ no dependencies/URLs; request monitor |
| Demo full flow | ✅ E2E |

---

## 6. Architecture decisions worth knowing

- **Vite + TypeScript + Preact.** Plain enough to read, small enough for a single file (Preact is the only runtime dependency), with typed state and real component boundaries. No router library; a tiny hash router keeps `file://` and reloads working.
- **localStorage instead of IndexedDB.** The brief permits the original architecture; synchronous writes mean a decision is durable immediately even if the tab closes. Keys are split so importing a dataset does not rewrite all decisions. Quota/private-mode failures are surfaced and backups are offered. See DESIGN.md for the tradeoff.
- **The cleanup queue is derived.** `decisions.choice === 'unfollow'` plus a `cleanup` record. Confirmed is a local state, never an Instagram claim. There is no second list to fall out of sync.
- **Manual confirmation is a separate explicit button** and a separate verb. Opening, starring, or opening a profile never confirms.
- **Conservative identity.** Usernames are provisional export IDs. Reimport matches exact normalized usernames only; renamed accounts lose their old decision and are reported. No fuzzy or ordinal matching.
- **Defensive ZIP reader.** No third-party archive dependency, explicit limits, CRC verification, path-traversal rejection, and no extraction to disk.
- **Single-file build.** `scripts/build-singlefile.mjs` inlines CSS and JS and moves the script to the end of `<body>` (Vite emits it in `<head>`; a classic inline script there would run before `#app`). It also refuses to produce a file that still references external assets, lacks the strict CSP, or unexpectedly allows `connect-src`.
- **CSP.** `default-src 'none'` blocks the app's network access; `'unsafe-inline'` is required by the single-file architecture. One deliberate `frame-src https://www.instagram.com` exception allows the card-preview iframe. There is no `connect-src`. The iframe is mounted only for the current and next profile when In-app is enabled, and is never read by the app.

---

### Profile preview (optional first-party embed)

The export has no profile media, and the app does not scrape. Instagram does serve a first-party profile page at `https://www.instagram.com/<username>/embed/` that renders the profile header and a recent-post grid. I tested it unauthenticated with several public accounts.

- Card previews are **off by default**. When enabled, a low-resolution post-grid strip is cropped into the active card and the next card's iframe is loaded in the same card component. The iframe is pointer-transparent, so swiping still works.
- The iframe is mounted only for the current and next profile (two at most), not all 1,733. The active card component is deliberately not re-keyed; the hidden next iframe survives the decision and becomes visible without a cold load.
- The strip uses a narrow iframe width (360 px desktop, 300 px mobile) before scaling/cropping, so Instagram chooses smaller image renditions.
- The main app has one narrow CSP exception, `frame-src https://www.instagram.com`; there is no `connect-src`, so the app itself still cannot fetch or upload. The app never reads, copies, or stores the iframe.
- Open profile remains a no-opener full-profile tab. Phones use the same card strip; mobile hides the detail grid to keep the decision bar visible.
- The embed is not a documented public API; it can change or be limited. Private accounts may show less.
- Automated coverage mocks Instagram and verifies the current iframe, the preloaded next iframe, and the post-decision active iframe, with no dialog or extra windows. The real embed was also checked manually against public accounts.

---

### Session memory

- `UiState.lastActiveAt` is written by `saveUi()` on decisions, cursor moves, filters, cleanup actions and view changes. The existing dataset/session/ui localStorage split remains the source of truth.
- `FollowCutStore.flush()` saves the session and UI on `pagehide` and hidden `visibilitychange`, covering the final cursor or note when the tab closes.
- Overview exposes **“Pick up at @… Last active …”**. `App` shows a one-time “Resumed … Last saved …” notice when reopening Review or Cleanup after more than a minute.
- The unit store test asserts the last-active timestamp, view and cursor survive a new store instance. The existing Playwright reload test covers the cursor/URL behavior.
- The phone uses the same local session; live sync and the retained `/p/<code>` URL are separate layers on top.

### Phone handoff (optional local companion)

Cross-device handoff cannot be done browser-to-browser without a cloud signaling service or a local server. To keep the data off the internet, FOLLOW/CUT adds an **opt-in** local Node server (`scripts/share-server.mjs`, started with `npm run share`) rather than a hosted backend.

- It refuses non-local peer addresses, reads the built `dist/index.html`, replaces that response's CSP with a same-origin-only variant (`connect-src 'self'`, `img-src 'self'`, and the same Instagram preview `frame-src`), and injects `window.__FOLLOWCUT_SHARE_MODE__`.
- The computer's app POSTs `store.exportBackup()` to `/api/handoff`. The server stores the normalized backup string in memory, returns a random 24-character code, a LAN URL, a revision, and a QR data URL generated server-side with `qrcode`. The computer stores the code/URL/revision in localStorage and starts polling `/api/handoff/<code>`.
- A phone opening `/p/<code>` gets the same app with `window.__FOLLOWCUT_HANDOFF__` (base64) from the server's latest revision. `src/main.tsx` validates/restores it before the first render, forces the review view, and leaves the `/p/<code>` path intact. The path is the session key and makes the full-browser handoff work.
- `src/components/SyncBridge.tsx` detects the role from the path. On the phone, it subscribes to the store and PUTs a complete backup after changes (320 ms debounce). On the computer, it polls the same code every 1.2 s and calls `store.applyRemoteBackup`, which replaces phone-owned data but preserves the computer's view, filter, sort, query and theme. The first remote update shows a one-time toast.
- The QR pairing code expires after ten minutes. Opening `/p/<code>`, the phone PUT, or the computer poll extends the live session to twelve hours. At most 20 sessions are retained; the server writes nothing to disk and logs neither session bodies nor codes. Sessions are pruned every minute.
- The phone page is `Cache-Control: no-store`. It is not a service worker/PWA because plain HTTP on a LAN is not a secure context.
- The standalone `dist/index.html` keeps `default-src 'none'` plus the single Instagram `frame-src` exception and never calls the handoff server. The handoff page only adds same-origin `connect-src` for the live API.

Test: `tests/e2e/handoff.spec.ts` starts the real server, imports on the computer origin, extracts the QR URL, opens it in a phone-sized context, cuts a card on the phone, checks that the computer's active card and cleanup count update, then opens the retained `/p/<code>` URL in a clean full-browser context and checks that it resumes the phone's latest card.

---

## 7. Known limitations and risks

1. **No live Instagram data or actions.** Confirmations are local records, not verified platform state. The app cannot know what you actually did on Instagram.
2. **Profile photos/bios/posts are unavailable** in the export and are not scraped. Cards show initials.
3. **Username changes are not inferred.** A rename loses the old decision rather than transferring it to someone else.
4. **Follower count is assumed complete** when the export includes a follower list. If the export is truncated in a way the parser cannot detect, comparisons are still presented with a caveat.
5. **Export date is inferred from folder name.** If absent, the app labels the snapshot with the import date and says the export date is unknown.
6. **ZIP64, encrypted archives, and unusual compression methods are not supported.** Large full-account archives are rejected with guidance to export only Followers and following.
7. **Folder picker depends on `webkitdirectory`.** Chrome/Edge support it; drag-and-drop of folders is not reliable and is not offered as the primary path.
8. **localStorage quota/private browsing.** A blocked write shows a persistent warning, but progress may be lost when the tab closes. Portable backup is the recovery path.
9. **No cross-tab synchronization.** Two tabs editing the same session can overwrite each other. Documented rather than half-implemented.
10. **Only Chromium was tested.** Safari and Firefox are not in the automated matrix. The app uses `DecompressionStream` and native `<dialog>`; current versions should work, but this is unverified here.
11. **RTL is not deliberately mirrored.** The layout mixes physical and logical properties.
12. **The deck’s fixed mobile action bar can overlay a tall card** on a 320 px-wide, short viewport. The card scrolls; actions stay reachable.
13. **The export schema can change.** The parser is tolerant and fails with a schema report, but a future Meta change may still need a code update.
14. **The demo is fictional and dated.** Its fixed October 2026 snapshot will look old over time; the “Not live data” label remains correct.
15. **No guarantee that any unfollowing pattern is risk-free.** The app only removes the friction around the user's own manual actions.

---

## 8. What was not verified

- A real Instagram/Meta export downloaded by this author in this environment. The fixtures are synthetic and cover the documented shapes, but real archives vary.
- The Facebook Accounts Center route while authenticated; unauthenticated it returned HTTP 400 from curl, so only the Instagram route could be observed redirecting to login.
- Actual Instagram UI behavior, rate limits, or the consequences of unfollowing. No real account was accessed, and no automated action exists in the product.
- Any claim that the local handoff is secure on an untrusted network. The session travels unencrypted over the LAN and the URL code is the only access control; anyone with the code can read or write the live session. Use trusted Wi-Fi; the standalone file remains the strictest mode.
- Safari, Firefox, or older browser behavior.
- A physical phone camera scanning the QR. The handoff test opens the QR URL programmatically in phone-sized Chromium contexts, including a clean full-browser context. The QR image is generated and checked, but a real camera scan, iOS Safari, Android Chrome, firewall behavior, and a mixed VPN/LAN configuration were not tested.
- HTTPS/WSS for the handoff. It is plain HTTP on the LAN by design; there is no certificate, no service worker, and no offline phone app.
- Screen-reader output with VoiceOver/NVDA. Semantics and names were audited in Chromium and with automated name checks, not a manual screen-reader session.
- Lab Core Web Vitals. The artifact is a static single file with no remote requests; no performance trace was recorded.

---

## 9. Suggested next steps

1. Per-account snapshot diff lists after reimport (added, removed, changed follow-back) with explicit “not live” framing.
2. Optional IndexedDB migration and cross-tab conflict handling for very large sessions.
3. Guided two-pass review (non-mutuals, then mutuals) and personal labels.
4. Safari/Firefox automated matrix and a VoiceOver pass.
5. PWA/installable wrapper for hosted use; keep the single-file artifact as the offline canonical build.
6. A read-only accessibility list mode for people who prefer not to gesture.
7. If a native wrapper is ever considered: Tauri with explicit OS permission for the Downloads folder, never background monitoring. No account-action automation.
8. Computer-to-phone edits or a two-way conflict policy. The current live channel is phone-to-computer only; a computer-side edit is replaced by the next phone update. A two-way merge needs per-record vector clocks or explicit conflict UI.
