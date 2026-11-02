# FOLLOW/CUT — design notes

This is the contract the interface was built against. It names the subject, the
signature, the tokens, the states, and the tradeoffs. It is not a mood board.

---

## 0. Read the subject

**Three nouns:** index cards, warm paper, one red pencil.

Not “modern, clean, premium.” The material world is a stack of paper cards on a
desk, sorted by hand, with a single mark for “cut.” Instagram is only the source
of the list; the metaphor is editorial, not social.

**Audience and setting:** someone with roughly 1,700 follows, at a desk for the
first pass, then on a phone in short sessions, possibly interrupted. They want
to recognize the account, decide, and move on. They do not want a growth
dashboard or a lecture.

**The one thing to remember:** the **perforated cut line** and the split
**FOLLOW/CUT** wordmark. The deck card is the product; the line is its signature.

**Anti-patterns:**

- A social-growth dashboard with follower graphs, streaks, badges, or “unfollow
  397 people to win.”
- A neon/Instagram-gradient skin, glassmorphism, or generic SaaS cards.
- A grid of fake profile photos. The export does not contain photos; the app
  never pretends it does.
- Red for “bad person” and green for “good person.” Cut/Keep/Maybe are plans,
  not moral judgements, and color is never the only signal.
- Hiding the manual nature of unfollowing behind euphemisms like “cleaned.”

**Density and energy:** low during swiping, moderate in lists. Calm, deliberate,
slightly charged by the one accent. No bounce, no confetti for removals, no
punitive nudges.

---

## 1. Visual system

### Type

One family stack: `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica
Neue", Helvetica, Arial, sans-serif`. Labels and numbers use a system mono stack
for the editorial, index-card voice. No remote fonts; the production CSP blocks
them anyway.

| Role | Size | Notes |
|---|---|---|
| Body desktop | 18 px / 1.55 | 0.2° x-height floor at ~60 cm |
| Body phone | 16 px / 1.55 | close viewing distance |
| Micro label / mono | 10–12 px | uppercase, 0.08–0.14em tracking |
| Card handle | clamp(1.7rem, 7vw, 2.9rem) | tight −0.05em, wraps at 320 px |
| H1 welcome | clamp(2.7rem, 5.4vw, 4.9rem) | display voice |
| H2 screens | clamp(1.75rem, 3vw, 2.55rem) | |

One modular scale around 1.25–1.33. Two weights: 650-ish body emphasis and 750
display. Numbers are tabular wherever they update.

### Color

One accent hue — a vermilion “red pencil” — used for cut, focus, and one active
state. Warm neutral ramp with a trace of the accent. Semantic tokens only; no
component hard-codes hex.

| Token pair (light) | Ratio | Pair (dark) | Ratio |
|---|---:|---|---:|
| ink `#1a1813` on paper `#f4f0e7` | 15.6 | ink `#f5f0e6` on paper `#14120e` | 16.5 |
| ink-2 `#514b41` on paper | 7.0 | ink-2 `#c6bcac` on paper | 10.0 |
| muted `#6c6456` on paper | 5.1 | muted `#9a9080` on paper | 6.0 |
| accent `#c23a13` on paper | 4.7 | accent `#ff7a4d` on paper | 7.3 |
| accent-ink `#fff8f3` on accent | 5.1 | accent-ink `#1b0e07` on accent | 7.3 |
| confirm `#2f6b47` on paper | 5.6 | confirm `#7bd3a1` on paper | 10.4 |

Accent is 4.7:1 on paper, so it passes AA for normal text; the filled button is
5.1:1. The accent is not used for body paragraphs. Muted on the surface-2 tint
is the tightest pair (4.6:1) and is used only for small supporting labels.

Cut uses accent + a scissors icon + the word **Cut**. Keep uses ink + a bookmark
+ **Keep**. Maybe uses a clock + **Maybe**. Remove the color and every decision
is still legible.

### Space, radius, light

- 4 px base. Gaps come from 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96; adjacent
  groups differ by at least 1.5× in most cases.
- One radius family: 4 / 6 / 10 / 14 / 20 / 999. Nested panels use outer = inner
  + padding where practical.
- One warm light rig from above. Shadows are tinted brown-black, not neutral
  black; the same softness is used on the deck, dialogs, and sticky action bar.
- The only material flourish is a 1 px perforation line, drawn as a repeating
  dashed rule. It is a rule, not a texture.

### Motion

- 120 ms for state feedback, 200 ms for panels, 240 ms for the card flight.
- Ease-out on entrance, standard ease on exit. No springs, no bounce.
- The card follows the pointer 1:1; on release it either returns or exits.
- Under `prefers-reduced-motion` (or “Reduce” in settings), all transition and
  animation durations collapse to 0.01 ms. The deck still decides; it just
  changes immediately.
- Milestones are quiet text, not bursts. Completing a review is celebrated;
  removing a person is not.

---

## 2. Composition and signature

- The **deck is the feature singleton**: one large card, centered, with two faint
  cards behind it. The page is quiet around it.
- Desktop review: 246 px filter rail · deck · 274 px context rail. The rails
  carry dense controls; the card carries air.
- Mobile review: the card is dominant, the three decisions are in a fixed bar
  just above the bottom navigation, and the secondary actions live on the card.
  Nothing important requires a horizontal gesture; the buttons are always there.
- Dashboard: the review/cleanup progress panels are the hierarchy, not a wall of
  equal stat cards. The snapshot strip is deliberately secondary and always
  tagged **Not live data**.
- Edges are shared: the deck toolbar, card, action row, and hints share one
  centerline and width on desktop.
- Signature assets: split wordmark with an accent slash; index-card numbers
  (`CARD 042 / 1,733`); perforated rule; neutral monogram stamp.

The remove-the-logo test: the fanned index cards with `← CUT / ↓ MAYBE / KEEP →`
and the perforated rule still identify the product. The card is the identity,
not the logo.

**Profile preview.** The export has no media, so the card never pretends to show a profile. The opt-in In-app mode crops a low-resolution Instagram post grid into the card itself; the next card's iframe is preloaded behind it, and a decision simply reveals that already-loaded frame. The preview is visual only and pointer-transparent, so the deck still swipes. Off is the default; Open profile remains the full-resolution, no-opener path. No fake avatars or scraped media. One CSP exception (`frame-src https://www.instagram.com`) is the price of showing real content in place. On mobile the detail grid collapses to keep the decision bar visible.

**Window fit.** The review screen compacts against height, not just width: at short laptop heights the card keeps the content strip and two metadata rows while the decision bar stays in view; at 320 px wide and short it drops the strip to a labeled note rather than letting the fixed bar cover it. The header and fixed mobile bar are sized to the viewport, so the page never scrolls sideways. Preview swaps crossfade; reduced-motion removes that transition.

**Memory.** The app is explicit about being resumable: Overview says where the deck will open and when it was last active; reopening an in-progress view gives one quiet resume notice rather than a modal. The save happens after every card, so the interface never asks the user to save before leaving.

**Phone review.** On phones the deck is a single card with one toolbar row: Filters, compact position, Preview, Undo. The duplicated card index, explanatory subline, detail grid, cutline, opened timestamp and footer note are removed; only the follow-back badge and the actual preview remain. The preview grows with the viewport (28dvh, capped) so the fixed decision bar and bottom nav still fit. The star/lock pair stays at the top right, and the action bar never gains explanatory microcopy.

**Phone handoff.** The optional local handoff is a modal with one clear object:
a QR code on a paper-white tile, followed by the raw URL, a copy action, an
expiry countdown, and a live-sync sentence. Once paired, reopening the modal
shows an active-session panel with the retained link, a stop action, and a
"New code" path rather than generating a second code. In the standalone file
the same modal becomes honest setup instructions with the exact command and a
backup download, not a dead end. The QR is the only new visual object; it is
quiet, high-contrast, and never carries the accent hue.

---

## 3. Semantics (the most important decision)

The brief asks users to distinguish a **decision** from an **action**. The
interface uses two different vocabularies:

- **Cut** = mark for cleanup. Repeatedly explained as “a plan, not an action.”
- **“I unfollowed this account”** = a manual confirmation the user makes after
  acting on Instagram.

The queue is labelled “Not confirmed” until that explicit click. Opening a
profile shows “Profile opened” but never changes confirmation state. Dashboard
metrics split **planned**, **confirmed**, **estimated**, and **projected**.
Nothing says “unfollowed” until the user confirms it, and even then it is
“confirmed manually,” not “verified live.”

This is why the main action is not called “Unfollow.” One verb for the plan, one
sentence for the act.

---

## 4. State matrix

| State | Where it is designed |
|---|---|
| default | All screens; warm surface + ink hierarchy |
| hover | Buttons, filter rows, cards’ actions, profile links |
| focus | 2 px accent ring, 3 px offset; never `:focus` alone |
| active / pressed | 1 px downward shift; segmented state; `aria-pressed` |
| selected | Filter chips in ink; action toggles with accent-soft background |
| disabled | 45% opacity + `not-allowed`; not-follow-back filters disabled with explanation |
| loading | Reading archive line with text; no indefinite spinner without status |
| empty | Deck clear; queue clear; no filter results; no confirmations |
| error | Import error with title, reason, re-export route, schema report |
| offline | Single-file build works offline; external links are the only network use |
| long text | Usernames wrap (`overflow-wrap:anywhere`), 320 px font step, card max width |
| no image | Monogram + “Initials, not a photo”; no fake avatar |
| one item | Deck shows one card and no behind-stack; queue shows one focus row |
| 10,000 items | Import capped; queue paginated 50; rails and filters computed, not rendered as rows |
| RTL | Not explicitly mirrored in this build; logical properties are mixed. Known limitation. |
| 200% zoom | Root text doubled in manual QA; no horizontal overflow on dashboard; inputs remain reachable |
| reduced motion | Media query + explicit setting; card snaps; no flight |
| forced colors | Border and Highlight rules; controls remain distinguishable |

---

## 5. Accessibility contract

- Semantic `header`, `nav`, `main`, one `h1` per screen, real buttons and links.
- All visible buttons have an accessible name (text or `aria-label`), verified in
  Playwright.
- Dialogs are native `<dialog>` with `showModal()`, focus containment, Escape,
  and body-scroll restoration.
- Keyboard: arrows/space/S/L/Z/? in review; Enter/C/S/K/U/Z in cleanup. Shortcuts
  never fire in text fields, selects, contenteditable, or open dialogs.
- Live region announces each decision and navigation change; toasts are status,
  not alerts, unless an error.
- 44 px touch targets for primary actions and icon controls on phone; 24 px
  minimum elsewhere.
- Reduced motion honored at the media-query and app-setting level.
- Forced-colors mode keeps borders and uses `Highlight`.
- Color is never the only carrier of meaning.

---

## 6. Audit (measured)

| Check | Target | Measured |
|---|---|---|
| Body size | ≥18 px @60 cm desktop | 18 px; 16 px phone |
| Measure | 45–75 ch | Hero ~52 ch; page copy ~62 ch |
| Line-height | 1.4–1.6 | 1.55 body, 1.08–1.3 headings |
| Type scale | one ratio ≤1.333 | ~1.25–1.33 |
| Contrast | 4.5:1 body / 3:1 UI | 5.1:1 muted, 4.7:1 accent, 5.1:1 filled accent, 15.6:1 ink |
| Accent count | one hue family | one vermilion + semantic confirm/warn |
| CVD | no hue-only meaning | every status has words + icon |
| Spacing | one scale, gaps ≥1.5× | 4 px base |
| Targets | 24 AA, 44 touch | icon 42–44 phone, buttons 44+ |
| Reflow | 320 px, no 2-D scroll | 320 px measured 320/320 |
| 200% text | no loss, no 2-D scroll | 1440/1440 with root 32 px |
| Motion | reduced-motion honored | tested; 0.01 ms under reduce |
| Hierarchy | one dominant per view | deck / progress panels |
| Performance | LCP 2.5 s INP 200 CLS 0.1 | static single file, no remote requests; not lab-measured |
| States | all 18 | see matrix; RTL explicit limitation |
| Signature | remove-the-logo test | deck + cut line + wordmark survive |

Contrast values were computed from the token hex pairs with the WCAG 2.x
relative-luminance formula. They are not a substitute for an APCA review of
every state; the filled accent and muted pairs are the ones to re-check if the
palette changes.

---

## 7. Where the engineer and designer disagreed

**1. Mobile action bar.**
- *Designer:* let the whole card breathe; keep the primary card content visible.
- *Engineer:* the three decisions must be reachable without scrolling, especially
  with a thumb, or the swipe flow dies on a phone.
- *Synthesis:* fixed action bar above the bottom nav with page bottom padding.
  Tradeoff: on a 320×800 screen the bar covers part of the card while scrolled to
  the top. Buttons remain reachable; the card scrolls. Recorded as a known
  limitation.

**2. localStorage vs IndexedDB.**
- *Engineer:* IndexedDB scales better and is asynchronous.
- *Designer:* a saved decision must survive an immediate reload, and the original
  architecture already used localStorage.
- *Synthesis:* localStorage with an explicit quota warning and a portable backup.
  Tradeoff: ~5 MB browser-dependent ceiling; no cross-tab merge. Documented.

**3. Single-file build vs strict module CSP.**
- *Engineer:* external hashed modules would avoid `'unsafe-inline'`.
- *Designer:* “double-click one HTML file and it works offline” is the promise.
- *Synthesis:* keep the single file, inline script/style, and lock the network
  with `default-src 'none'`. Tradeoff: `'unsafe-inline'` is necessary for the
  inline artifact; the app renders only text nodes from imports and has no
  injection sink. Tests assert no network.

**4. Photos vs monograms.**
- *Designer:* faces make a deck human.
- *Engineer:* the export has no photos, and scraping is out of bounds.
- *Synthesis:* neutral monogram stamps with an explicit “Initials, not a photo”
  caption. No fake avatars, no scraped images.

**5. Gamification.**
- *Growth instinct:* milestones, streaks, and a “397 to go” counter could drive
  completion.
- *Product/Designer:* the product is curation, not a removal contest; completion
  of review is the milestone.
- *Synthesis:* quiet 50/100/250/… review notices, no streaks, no punitive
  copy. The goal is optional and called “a threshold, not a score.”

---

## 8. Known limitations

- RTL is not mirrored deliberately; the layout uses a mix of physical and logical
  properties.
- The app is not a PWA and has no service worker; offline use is the single-file
  artifact, not an installed app.
- No profile photos, bios, or posts.
- The mobile fixed action bar can overlay a tall card on very short screens.
- The help dialog is long and scrolls on a 900 px-tall desktop viewport.
- The demo's fixed export date (18 Oct 2026) will age; the “not live” label
  remains true and the demo suppresses the stale-export nag.
- The single accent hue is warm red; if the palette changes, re-check the 4.7:1
  accent-on-paper and 5.1:1 filled-button pairs.


---

## 9. Post-build critique

A late review against the anti-homogenization checklist found two generic
editorial tells that the brief did not require. Both were removed:

- Four decorative all-caps kickers (“Overview · your snapshot,” etc.) repeated the
  screen title in smaller type. The H1 and the content already did that job. The
  deck and the cut line are the signature; the kickers were competing chrome.
- The welcome headline highlighted one phrase in vermilion. That is the default
  “accent one word” move, not a decision derived from the subject. The headline is
  now one ink statement; the accent lives on the cut action, the progress marks,
  and the wordmark slash.
- The card subline became two plain sentences instead of a middle-dot meta
  string.

A dark-mode contrast review also found that warning/error toasts used near-white
text on amber/salmon (1.9:1 and 2.2:1). They now use the paper token as ink
(9.5:1 and 8.1:1). The rest of the theme was designed, not inverted; the
semantic success/warning tokens are not the accent hue.

**Keep:** the oversized card as the one feature-singleton; the warm paper with a
single red-pencil accent; the distinction between *Cut* and *I unfollowed this
account*.

**The one change:** if only one thing survives the next pass, it is the card,
the perforated line, and the two-verb semantics. Do not replace the deck with a
generic table.

**Open question:** should the two-pass review (non-mutuals, then mutuals) become a
guided flow or remain a filter the user chooses? That is a product decision, not
a styling one.
