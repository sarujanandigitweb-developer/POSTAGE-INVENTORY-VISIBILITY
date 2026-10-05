# docs/ — dated investigations, not current documentation

Everything under `performance/` is a **point-in-time record**. Each document states the
date it was written, what it measured and what it changed — usually nothing, because most
were read-only investigations. They are kept because the reasoning is worth more than the
conclusion, and because several of them record *why* an obvious-looking optimisation was
rejected.

**Do not treat their numbers as current.** The database link varies by more than 10×
between sessions: the same query has been measured at 1,770 ms and, hours later,
23,948 ms. Any figure here describes the day it was taken. Re-measure before you act.

For how the system works **today**, read the root `README.md` and the two app READMEs.

| Document | Date | What it concluded | Still true? |
|---|---|---|---|
| `postgres-loading-analysis.md` | 2026-09-07 | Cold loads were 6–17 s; the cost is row transfer over a ~170 ms link, not query execution | Yes — the link is unchanged |
| `postgres-loading-implementation.md` | 2026-09-07 | Introduced `lib/catalogue.js` so three routes share one read of `inventory.products` + `product_images` | **Implemented**, in both apps |
| `slow-moving-fallback-optimization.md` | 2026-09-07 | Narrowed two full scans of `order_management.order_item_info` (1.2 M rows) in the name/image fallback chains | **Implemented** |
| `slow-moving-remaining-bottleneck.md` | 2026-09-07 | What remained after the above: an 18.9 s cold build, 18 queries timed individually | Superseded in v2, which serves stale and rebuilds behind the reader |
| `lazy-page-loading-discovery.md` | 2026-09-07 | Per-page loading was reachable and mostly already present | **Implemented** — `lib/client-datasets.js`, and the warm list in `Shell.jsx` |
| `disk-cache-investigation.md` | 2026-09-07 | **There was no defect.** The dev server had been started with `LEDSONE_DATA_TTL=20` in its shell, so the disk cache correctly missed | Yes, and it is the most useful document here — see below |

`performance/evidence/*.json` holds the raw timings behind three of them.

## The one finding to carry forward

From `disk-cache-investigation.md`: a cache that "looks broken" is almost always a process
started with a different `LEDSONE_DATA_TTL` in its environment. The value is read **once at
module load, from the process environment** — not from `.env`, and not changeable in a
running server. Nothing in the repository shows it.

```bash
tr '\0' '\n' < /proc/<pid>/environ | grep LEDSONE
```

Run that before concluding anything about TTL, freshness or cache behaviour.

## What is not written up here

Two pieces of work from 2026-09-09 → 09-15 have no document in this folder:

* **v2's server-side pagination and the non-blocking cache** — documented in
  `../postage-inventory-v2/README.md` instead.
* **The carrier-coverage audit** (DHL, Evri, DPD and UPS have no rows at all in
  `shipment_tracking_log`) — summarised in the root `README.md` under Known Issues.
