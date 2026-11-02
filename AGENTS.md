# AGENTS.md — FOLLOW/CUT

Read this before changing the project. It records the commands, invariants, and
the mistakes that are easy to repeat.

## Fast commands

```bash
npm ci
npm run dev          # Vite dev server, relaxed CSP for HMR
npm run build        # vite build + single-file dist/index.html
npm run preview      # serves dist
npm run typecheck
npm test             # Vitest, pure logic
npx playwright install chromium   # once, if needed
npm run test:e2e     # build + Playwright against file://dist/index.html
npm run qa           # typecheck + unit + E2E
npm run share        # build + optional local phone-handoff server on :4173
```

## Invariants (do not break these)

1. **Cut ≠ unfollow.** `choice: 'unfollow'` is only a plan. `cleanup.state:
   'confirmed'` is the user's own manual record. Never auto-confirm from opening
   a profile, clicking a link, or importing. Never add Instagram automation.
2. **No network during normal use.** The production build must keep
   `default-src 'none'`. Any new remote font, image, SDK, analytics call, or
   `fetch` is a regression, even if it seems harmless.
3. **No Instagram credentials, cookies, private endpoints, scraping, or
   password fields.** External links are user-clicked only.
4. **Never store the raw archive.** The dataset contains normalized accounts,
   followers, pending requests, and snapshot metadata only. Backups contain the
   same, not the ZIP.
5. **The snapshot's counts are immutable.** `confirmed`, `estimated`, and
   `projected` are derived. Do not “correct” `snapshot.followingCount` after a
   confirmation. Lowering it hides the plan-vs-action distinction.
6. **Follow-back comparison has three states.** Missing/incomplete must leave
   `followsMe` undefined and disable the comparison; never label everyone as
   “not following back.”
7. **Reimport matches exact normalized usernames only.** No fuzzy matching, no
   ordinal pairing, no decision transfer across a rename.
8. **The single-file build matters.** Keep `dist/index.html` working from
   `file://`. The build script moves the inline script to the end of `<body>`
   because Vite emits it in `<head>`, where a classic inline script would run
   before `#app`. Do not remove that step.
9. **Accessibility is part of done.** One h1 per screen, focus-visible rings,
   native dialogs, 44 px touch targets on phone, reduced-motion support, and no
   hue-only meaning.
10. **Demo accounts are fictional.** Keep the demo deterministic and clearly
    labelled. Do not paste real handles into fixtures.

## Map

- `src/lib/types.ts` — data model; start here.
- `src/lib/parse.ts` — export discovery/normalization; upstream attribution in
  the header. Keep future parser changes behind unit tests in
  `tests/unit/parse.test.ts`.
- `src/lib/zip.ts` — defensive ZIP reader (limits, CRC, traversal).
- `src/lib/selectors.ts` — all derived numbers and deck/queue ordering. If a
  number is not derived here, it probably should be.
- `src/lib/store.ts` — mutations, persistence, undo, merge, backup restore.
- `src/lib/backup.ts` — untrusted input validation; rebuilds every URL.
- `src/components/ImportPanel.tsx` — drop/pick/parse/error UX.
- `src/components/ImportFlow.tsx` — first import vs merge dialog.
- `src/views/Review.tsx` — deck, gestures, keyboard, filters.
- `src/views/Cleanup.tsx` — focus/list queue and explicit confirmations.
- `src/components/PhoneHandoff.tsx` — QR/instructions modal; stores the active code and shows the connected state.
- `src/components/SyncBridge.tsx` — phone PUT / computer poll bridge for the live handoff session.
- `src/lib/store.ts` — localStorage persistence, cursor, `saveUi()`, `flush()`, backup/restore/remote apply.
- `src/components/CardProfilePreview.tsx` — low-resolution, pointer-transparent Instagram post strip inside the active card; prefetches the next profile.
- `src/lib/profileLink.ts` — no-opener full-profile tab fallback.
- `scripts/share-server.mjs` — optional local LAN handoff server; no disk writes, in-memory sessions, ten-minute QR expiry, twelve-hour live session after it is opened, and GET/PUT sync endpoints.
- `src/styles/tokens.css` + `app.css` — one accent, one radius family, one
  light rig. Use tokens; do not add one-off hex values.

## Testing gotchas

- The E2E suite runs against the **built single file** over `file://`, not the
  dev server. Run `npm run test:e2e` (it builds first).
- LocalStorage is per test context. Each Playwright test starts empty.
- The demo-load toast can overlay controls. `dismissToast(page)` clicks its
  close button.
- A decision animates for ~168 ms; wait ~300 ms before reading the next card.
- The mobile review action bar is fixed above the bottom nav. Page bottom
  padding compensates; do not remove it.
- The desktop `nav` count is 2 elements in the DOM (header + mobile), but only
  one is visible. Use `nav:visible` in assertions.
- `#choose-zip` is the import button; the file input is visually hidden but
  labelled, so `setInputFiles` on the labelled input is the reliable route.
- Restore a backup from the welcome screen when the session is empty; the
  Settings route is only rendered when a dataset exists.

## Common regressions to avoid

- Adding a second modal without a unique `id` (duplicate `modal-title` IDs).
- Forgetting to restore `document.body.style.overflow` when a dialog closes.
- Filtering to “Maybe”/“Kept” with `ensureCursor` that only looks for
  unreviewed cards — state filters must fall back to their first reviewed card.
- Re-cutting a deferred/uncertain account without returning it to the active
  queue.
- Setting `webkitdirectory` only through JSX; Preact does not reliably write it,
  so the ref effect in `ImportPanel` is intentional.
- Building a single-file artifact where the inline script runs before `#app`.
- Making a comparison label depend on color alone.
- Turning the optional handoff server into a cloud backend or a required dependency. The standalone single-file app must keep working with no server and its one-frame-limited CSP.
- Persisting handoff sessions to disk or logging their bodies/codes. The server holds normalized data in memory only, expires the QR in ten minutes, and keeps an opened live session for twelve hours while running.
- Adding a service worker/PWA to phone handoff over plain LAN HTTP. It is not a secure context; the phone page must load from the running server.
- Treating the skip link’s `#main` as a route. `App` handles `#main` before the hash router so it focuses main instead of navigating to the dashboard.

## Documentation

`README.md` is for a user. `IMPLEMENTATION_NOTES.md` is the audit and evidence.
`DESIGN.md` is the visual contract and tradeoff ledger. Update all three when a
promise or limitation changes.
