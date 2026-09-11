---
date: 2026-09-08
developer: sarujanan
project: Postage Inventory Visibility
project_code: INV-PIV
phase: >-
  Phase-13 — the loading state given a mark per tab, so a cold open says WHICH page is
  assembling before the sentence beside it can be read
requirement_id: REQ-13
deliverable_id: D01
status: >-
  One commit (11:47). Two cron runs, both OK. Six marks drawn, all six verified rendering in
  a real browser. No data, no query and no business rule touched.
evidence_location: >-
  git 42153b3; logs/refresh.log; postage-inventory/components/Loading.jsx;
  postage-inventory/app/theme.css; the six tab components passing `kind`;
  dashboard/inventory-dashboard.html
blos_keys_used:
  - a_badge_cannot_wrap
  - reduced_motion_is_one_rule_not_six           (NEW — animate in CSS, never in SMIL)
  - the_first_skeleton_is_the_shell_not_the_tab  (NEW — booted gates before the tab exists)
hardcoded_thresholds:
  - mark viewBox = 40x24, rendered 34x22, stroke 1.9, round caps and joins
  - cube = 3 faces at 1.5 s; van 1.1 s; ship rock 2.6 s, swell 2.2 s; envelope 2 s;
    tag 2.4 s; clock sweep 2 s
  - the note under the bar appears at 6 s, the elapsed counter at 2 s
three_am_standard: TRUE
llm_queryable: TRUE
company_knowledge_candidate: TRUE
domain: Inventory — Postage & Warehouse — Next.js app presentation layer
User: Postage & Warehouse Team
Benefit status: >-
  Achieved. A cold open is the only time this component is on screen, and the mark is read
  before the sentence is — so the several seconds a build takes are now several seconds of
  knowing which page is coming.

---

## 1. SYSTEM STATE

Start: every tab drew the same cube while it loaded. The only way to tell which page was
assembling was to read the sentence beside it — and a cold open is precisely when a reader
is least willing to.

End: **six marks, one per tab**, each moving the way its subject moves, all animated from
one CSS block so a single reduced-motion rule turns every one of them off.

## 2. WHAT CHANGED TODAY

`Loading.jsx` gained a `MARKS` map and a `kind` prop. Six scenes were drawn and six tab
components now name the one they want.

| Tab | Mark | Motion |
|---|---|---|
| Inventory | the app's own cube | three faces arrive in turn — assembling, not waiting |
| Dispatch Queue · Recently Dispatched | courier van | wheels turn, body bobs, speed lines stream past |
| Container Details | container ship | swell slides beneath a rocking hull, boxes land bottom row first |
| Postage Information | envelope | the letter rises out and drops back |
| SKU Fixed Price | shelf tag | swings on its hole and settles |
| Slow-Moving Stock | clock | one sweep per cycle — the tab is entirely elapsed time |

**No data, no query, no rule was touched.** The commit is `Loading.jsx`, `theme.css`, one
`kind` prop in each of six tabs, and the dashboard.

## 3. WHY THEY ARE BUILT THE WAY THEY ARE

**One viewBox, one stroke weight, one colour.** 40×24, rendered 34×22, `currentColor`,
stroke 1.9 with round joins — the app's existing line weight. They are the app's own
drawing, not a borrowed icon set, so they sit in the bar without re-tuning it.

**Movement is CSS, never SMIL.** Every scene is animated from one `.skmark` block, so the
existing `prefers-reduced-motion` rule turns all six off in one place. A scene that animated
itself inside its own SVG would need its own exemption and would eventually be missed.

**Each moves the way its subject moves, and no faster.** The progress bar beside them is
already sliding; a mark that fidgets on top of it makes the wait feel longer, not shorter.
The ship rocks over 2.6 s, the clock sweeps once rather than ticking.

**Standing still they are still the right picture.** That is the whole reason the mark is a
picture and not a spinner — under reduced motion it still says which page is coming.

## 4. VERIFICATION

Driven in a real headless browser over CDP, one tab at a time, catching the skeleton while
it was on screen:

```
Container Details      skmark sk-ship     || viewBox 0 0 40 24 ||  6 nodes
Dispatch Queue         skmark sk-truck    || viewBox 0 0 40 24 || 12 nodes
Recently Dispatched    skmark sk-truck    || viewBox 0 0 40 24 || 12 nodes
Postage Information    skmark sk-envelope ||                   ||  5 nodes
SKU Fixed Price        skmark sk-tag      || viewBox 0 0 40 24 ||  4 nodes
Slow-Moving Stock      skmark sk-clock    || viewBox 0 0 40 24 ||  2 nodes
Inventory              skmark sk-cube     || viewBox 0 0 24 24 ||  3 nodes
```

Screenshots taken of each bar and inspected. **6 of 6 render as drawn.**

## 5. FAILURE MODE OR EDGE CASE

**The first probe caught the wrong skeleton, seven times.** Every tab reported `sk-cube`.
The cause is real and worth recording: `Shell` gates the body on `booted` while it reads the
saved tab out of `localStorage`, and that gate renders **its own** `Loading` — with no
`kind`, so the cube. The tab's own mark only exists once the tab component mounts.

So a cold open shows the cube for a fraction of a second, then the tab's mark. Brief, but
real, and the probe had to wait for the header to name the tab before measuring.

**Postage was missed by the first pass entirely** — it loads in about a second from a warm
60 s sheet cache, faster than a 120 ms poll could catch. It was confirmed by throttling the
network until the skeleton stayed on screen.

## 6. DECISIONS MADE TODAY

| Decision | Why |
|---|---|
| Both dispatch tabs share the van | They are the same subject at two stages; two vehicles would imply two domains |
| Inventory keeps the cube | It is the app's own mark, and the three faces already read as assembling |
| Animate in CSS, not in the SVG | One reduced-motion rule, not six exemptions to remember |
| The `!booted` cube left as it is | Fixing it means giving the shell a mark for a tab it does not yet know |

## 7. COMPANY KNOWLEDGE EXTRACT

1. **The mark is read before the sentence.** On a screen whose only job is to say "wait",
   the picture carries the information, not the text beside it.
2. **Animate loading states in CSS, never in SMIL** — so one `prefers-reduced-motion` rule
   covers every scene and none is forgotten.
3. **A loading probe must wait for the tab, not for the first skeleton.** The shell renders
   its own while it works out which tab to show.
4. **A fast tab can be missed by a poll.** Throttle the network to hold the state on screen
   rather than concluding it never appears.

## 8. LLM STANDARD CHECK

Every claim is reproducible: the mark per tab by opening each with `piv.view` preset and
reading `.skmark`'s class, viewBox and node count out of the live DOM; the `!booted` finding
by watching the class change from `sk-cube` to the tab's own within one page load; the
Postage mark by applying CDP network throttling until the skeleton persisted. Screenshots of
each bar are in the session scratch, not committed.

## RESULT

| | Start of day | End of day |
|---|---|---|
| Distinct loading marks | 1 | **6** |
| Tabs whose mark names their subject | 1 of 7 | **7 of 7** |
| Marks verified rendering in a browser | 0 | **6 of 6** |
| Reduced-motion rules needed | 1 | **1** |
| Queries changed | — | **0** |
| Rows changed | — | **0** |

Cron runs on 2026-09-08: **two, both OK**, 6,183 rows each, published to hub 218.

**Carried into 9 September:**
1. The `!booted` shell skeleton still shows the cube for a moment before the tab's mark.
2. Everything carried out of REQ-12 remains open — the 93% database share of the cold load,
   the empty local `data/snapshots/`, and the seven REQ-11 cross-check findings.

## BLOS GOVERNANCE NOTE

| Value | Where it lives now | Why it must be governed |
|---|---|---|
| The mark set | `postage-inventory/components/Loading.jsx` `MARKS` | A tab added without a `kind` silently falls back to the cube |
| Scene animations | `postage-inventory/app/theme.css`, `.skmark` block | Animating inside an SVG would escape the reduced-motion rule |
| Shared line weight | viewBox 40×24, stroke 1.9, `currentColor` | A mark drawn to different values will not sit in the bar |
