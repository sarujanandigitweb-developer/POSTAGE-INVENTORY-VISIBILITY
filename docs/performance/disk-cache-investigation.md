# Why the disk cache "HIT" was followed by a database rebuild

**Status: READ-ONLY INVESTIGATION. No code, database, schema, index, UI, business logic,
API result or TTL was modified. No fix was implemented.**

Evidence: [`evidence/disk-cache-ttl-finding.json`](evidence/disk-cache-ttl-finding.json).

---

## Answer in one line

**There is no defect.** `readDisk()` was not returning a HIT to the server — it was
returning `null`, exactly as designed. The earlier "HIT" was measured in a shell where
`LEDSONE_DATA_TTL` is unset (TTL = 300 s). **The running `next dev` process was launched
with `LEDSONE_DATA_TTL=20` in its own environment**, so the same function evaluated a
20-second TTL and correctly missed.

The premise of the investigation — "readDisk() says HIT but the server rebuilds" — was
false. Both the memory cache and the disk cache were consulted, both were past their TTL,
and the rebuild was the correct outcome.

---

## A. Exact current cache flow

`lib/dataset.js`. Line numbers are from the file as it stands; nothing was changed.

```
line 22   const TTL = Math.max(0, Number(process.env.LEDSONE_DATA_TTL ?? 300)) * 1000;
          ^ read ONCE, at module load, from the PROCESS environment
```

`getOrBuild(key, build)` — entry to return:

| Step | Line | Check | On success |
|---|---|---|---|
| 1. memory lookup | 93–94 | `cache.get(key)` and `Date.now() - hit.at < TTL` | return `hit.data` |
| 2. in-flight | 95 | `inflight.has(key)` | return the same promise (coalescing) |
| 3. shipped snapshot | 105–109 | `readShipped(key)` and `Date.now() - shipped.at < TTL` | seed memory, return |
| 4. **disk cache** | 111–112 | `readDisk(key)` — non-null | seed memory, return |
| 5. rebuild | 114–123 | — | `build()`, then `cache.set` **and** `writeDisk` |

`readDisk(key)` (lines 41–48):

```js
const raw = fs.readFileSync(file(key), 'utf8');
const { at, data } = JSON.parse(raw);
if (Date.now() - at < TTL) return { at, data };    // <-- the SAME module-level TTL
...
return null;
```

`writeDisk` (50–58) writes `{at, data}` to `<cwd>/.cache/<key>.json` via write-then-rename.

**Every TTL comparison in the file uses the one module-level constant** — memory (94),
snapshot (106), disk (45), `fromSnapshot` (89), `isReady` (131). There is no second TTL and
no per-caller override.

## B. Exact reason the "HIT" was not served

The two measurements were taken in **two different environments**, and `TTL` is read from
the environment.

| Where the check ran | `LEDSONE_DATA_TTL` | TTL | `readDisk()` on a 25 s-old file |
|---|---|---|---|
| The investigating shell (my earlier probe) | unset | 300 000 ms | **HIT** — returns the cached copy |
| The running `next dev` process | **`20`** | 20 000 ms | **MISS** — returns `null` → rebuild |

Proved against the same file at the same instant:

```
  --- in MY shell, where LEDSONE_DATA_TTL is unset ---
    TTL=300000ms  file age=25083ms  ->  readDisk() returns the cached copy (HIT)
  --- with the dev server's OWN environment ---
    TTL=20000ms   file age=25156ms  ->  readDisk() returns null (MISS -> getOrBuild rebuilds)
```

The observed response-time boundary corroborates it exactly — the flip sits between 10 s
and 20 s, which is a 20-second TTL, not a 300-second one:

| Gap | Response | Result |
|---|---|---|
| 2 s | 0.05 s | cache hit |
| 5 s | 0.04 s | cache hit |
| 10 s | 0.05 s | cache hit |
| **20 s** | **2.41 s** | **rebuilt** |
| 30 s | 1.81 s | rebuilt |

Against the 300 s default, the 20 s and 30 s gaps would both have been hits. They were not.

## C. Exact file / function / condition responsible

- **File:** `postage-inventory/lib/dataset.js`
- **Line:** 22 — `const TTL = Math.max(0, Number(process.env.LEDSONE_DATA_TTL ?? 300)) * 1000;`
- **Condition:** `process.env.LEDSONE_DATA_TTL === '20'` in the `next dev` process.

Read from the live process:

```
=== the dev server's OWN environment (pid 53659) ===
  LEDSONE_DATA_TTL=20
  NODE_ENV=development
=== and the parent that launched it (pid 53647) ===
  LEDSONE_DATA_TTL=20
```

The server has been up since **Mon Sep 7 15:40:04 2026**. The variable is **not** in
`.env`, **not** in `package.json`, **not** in `next.config.*`, and **not** in the shell
used for this investigation — it exists only in the environment of the already-running
process, set by whatever shell started `next dev`. That is why nothing in the repository
shows it and why a repository-only inspection could not have found it.

There is precedent in this project for setting it deliberately: an earlier measurement
session ran with a very short TTL, which invalidated a shared-catalogue A/B comparison for
the same reason.

**Answering the enumerated possibilities from the brief:** the answer is **(H) something
else** — specifically, the same TTL constant resolving to two different values in two
different processes. It is not (A) uncalled, (B) ignored, (C) conditional, (D) a different
path, (E) a different key, (F) a rejected format, or (G) bypassed. Path and key were
verified: the server's `cwd` is `/home/led-247/POSTAGE-INVENTORY-VISIBILITY/postage-inventory`,
and `.cache/pending-dispatch.json`'s mtime advanced with every rebuild, proving `file(key)`
resolves to the file that was inspected.

**Point 10 of the brief is satisfied by exclusion:** Next.js is *not* the cause. The
repository evidence does not show the cache module being reinitialised or bypassed, and
none is needed to explain the behaviour — a 20-second TTL explains all of it. The
`✓ Compiled /api/pending-dispatch` lines in the dev log are ordinary on-demand compilation
and are not implicated.

## D. Are `.cache` and `data/snapshots` separate mechanisms?

**Yes — separate directories, separate writers, separate readers, separate purposes — but
governed by the same TTL constant.**

| | `.cache/` | `data/snapshots/` |
|---|---|---|
| Written by | `writeDisk()`, after every rebuild | `scripts/build-snapshots.mjs`, via `prebuild` |
| Read by | `readDisk()` — step 4 | `readShipped()` — step 3, checked **first** |
| Path | `path.join(process.cwd(), '.cache')` | `snapshotDir()` in `lib/data-dir.js`, which tries the app root, the repo-root layout, then walks up |
| Purpose | survive a local restart | ship data with a deployment so it opens no connection |
| State today | **7 files** | **0 files — the directory does not exist** |
| TTL | the same line 22 constant | the same line 22 constant |

Because `data/snapshots/` is absent, step 3 always falls through in this working tree, and
`instrumentation.js` therefore does warm three datasets at boot rather than skipping.

## E. Does this affect only `next dev`, or production too?

**The mechanism is environment-driven, so it is not inherently a dev-only issue** — but
what was observed is confined to this one running dev process.

- `npm run dev` → `next dev -p 3020`. The observed 20 s TTL came from the shell that
  launched it, not from the script.
- `npm run build` → `next build`, preceded by `prebuild`
  (`sync-pipeline-files.mjs`, then `with-alias.mjs` → `build-snapshots.mjs`). A production
  build therefore **does** produce `data/snapshots/`, which `readShipped()` consults before
  the disk cache.
- `npm start` → `next start -p 3020`. It reads `LEDSONE_DATA_TTL` from its own environment
  in exactly the same way.

**Production would show the same behaviour if, and only if, `LEDSONE_DATA_TTL` is set to a
small value in the deployment environment.** On Vercel that is configured in the project's
environment-variable settings, which cannot be read from this repository — **it must be
checked there rather than assumed.** With the variable unset, production uses the 300 s
default and additionally starts from shipped snapshots.

`next dev` *does* consume snapshots when they exist: `readShipped()` is plain runtime code
with no mode guard. They are simply absent here because `prebuild` has not run.

## F. What existing mechanism can safely be reused

Everything needed already exists and behaves correctly:

- `getOrBuild()` — memory → in-flight coalescing → snapshot → disk → build. Verified correct.
- `readDisk()` / `writeDisk()` — atomic write-then-rename; verified reading the right path
  and the right key.
- `readShipped()` / `snapshotDir()` — already tolerant of the app-root vs repo-root layout.
- `scripts/build-snapshots.mjs` and the `prebuild` hook — already wired.
- `isReady(key)`, `fromSnapshot(key)`, `builtAt(key)` — already exported.
- `instrumentation.js` — already skips warming when snapshots are present.

**Nothing needs to be created, and nothing needs to be repaired.**

## G. Minimal possible fix — described only, NOT implemented

Strictly speaking there is nothing to fix in the code. To restore the intended local
behaviour, in ascending order of intervention:

1. **Restart `next dev` from a shell without `LEDSONE_DATA_TTL` set.** The TTL is read once
   at module load, so it cannot be changed in the running process. This alone returns the
   configured 300 s behaviour.
2. **Run `npm run snapshots` before starting dev.** Populates `data/snapshots/`, so step 3
   serves the first read of each dataset and `instrumentation.js` stops warming.
3. **Optionally, record the intent** — the variable is undocumented outside the comment at
   `lib/dataset.js:22`. A note that it is a measurement knob, and that a small value makes
   every request a live rebuild, would prevent this confusion recurring.

None of the three changes TTL policy, cache architecture, business logic, API results, the
Slow-Moving optimisations, or anything in the UI. **None was performed.**

## H. Evidence

1. **Process environment** — `/proc/53659/environ` and `/proc/53647/environ`:
   `LEDSONE_DATA_TTL=20`, `NODE_ENV=development`. Server up since 15:40:04.
2. **Same file, same instant, two environments** — HIT at 300 000 ms, MISS at 20 000 ms
   against a file aged ~25 s.
3. **Response-time boundary** — hits at 2/5/10 s, rebuilds at 20/30 s; consistent with 20 s,
   inconsistent with 300 s.
4. **Server log** — `[dataset] built pending-dispatch in 1911ms / 1812ms / 1761ms`, one per
   request past the TTL. Preceded by ordinary `✓ Compiled /api/pending-dispatch in 305ms`.
5. **`asOf` advanced on every poll** (11:42:20 → 11:42:46 → 11:43:12 → 11:43:37) and
   `.cache/pending-dispatch.json`'s mtime advanced with it, proving the rebuild branch ran
   and wrote to the path that was inspected.
6. **Absence checks** — `LEDSONE_DATA_TTL` is in neither `.env`, `package.json`,
   `next.config.*`, nor the investigating shell.
7. **Directory state** — `.cache/` 7 files; `data/snapshots/` absent.

## I. PASS / FAIL

**PASS.** The exact reason is identified and proved by direct measurement:

> `lib/dataset.js:22` reads `TTL` from `process.env.LEDSONE_DATA_TTL` once at module load.
> The running `next dev` process has `LEDSONE_DATA_TTL=20`, so `readDisk()` rejects any
> cache file older than 20 seconds and `getOrBuild()` correctly proceeds to rebuild. The
> earlier "HIT" was produced in a shell where the variable is unset and the default 300 s
> applied.

The cache implementation is correct. The discrepancy was in the measurement, not the code.

**A correction to the record:** the earlier report of this behaviour stated the effective
TTL was 300 s and that the disk-cache miss was unexplained. The effective TTL was 20 s, and
the miss was correct. Any conclusion drawn from the 300 s figure — including cold-load
frequency in `next dev` — should be re-read against 20 s.

**Nothing was implemented. No code, database, schema, index, TTL, UI or API result was
modified.**
