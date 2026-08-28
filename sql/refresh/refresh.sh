#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Postage Inventory Visibility — 2-hourly refresh from the LEDSone database.
#
# Runs: pre-flight validation -> extract+build -> price/comments -> atomic apply.
# Publishes ONLY if every stage passes. On any failure the dashboard is left exactly
# as it was, and the exit code is non-zero.
#
# Overlap is prevented with flock. NO pkill: `pkill -f` has twice matched the killing
# shell's own command line in this project and killed the run it was meant to protect
# (exit 144, logged 2026-08-26 and again 2026-08-28). A lock file is the correct tool.
#
# Credentials are read only by sql/refresh/db.js from the gitignored .env. They are
# never passed on the command line, never printed, and never reach the dashboard.
# ---------------------------------------------------------------------------
set -uo pipefail

PROJECT="/home/led-247/POSTAGE-INVENTORY-VISIBILITY"
NODE="/usr/bin/node"
NODE_MODULES="/home/led-247/Returns-Reason-Hotspot-Report/scripts/node_modules"
LOCK="$PROJECT/logs/refresh.lock"
LOGDIR="$PROJECT/logs"
LOG="$LOGDIR/refresh.log"
OUT="$PROJECT/sql/refresh/out"

mkdir -p "$LOGDIR"
export NODE_PATH="$NODE_MODULES"
cd "$PROJECT" || { echo "cannot cd $PROJECT"; exit 1; }

START=$(date -u +%s)
RUN=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# every line the run prints is timestamped and appended to the log
say(){ printf '%s | %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$LOG"; }
# the connection string can only appear via a driver error; scrub it as a backstop
redact(){ sed -u -E 's#(postgres(ql)?://[^:/@]+:)[^@]*@#\1***REDACTED***@#g'; }

finish(){
  local status="$1" note="${2:-}"
  local dur=$(( $(date -u +%s) - START ))
  local rows bytes
  rows=$($NODE "$PROJECT/validation/smoke-render.js" 2>/dev/null | sed -n 's/.*total rows rendered *: *\([0-9,]*\).*/\1/p')
  bytes=$(wc -c < "$PROJECT/dashboard/inventory-dashboard.html" 2>/dev/null)
  say "RESULT $status | ${dur}s | rows ${rows:-?} | bytes ${bytes:-?} ${note:+| $note}"
  say "----------------------------------------------------------------"
  [ "$status" = "OK" ] && exit 0 || exit 1
}

# ---- one run at a time -----------------------------------------------------
exec 9>"$LOCK"
if ! flock -n 9; then
  printf '%s | SKIPPED — a refresh is already running\n' "$RUN" >> "$LOG"
  exit 0
fi

say "================================================================"
say "REFRESH $RUN  (pid $$)"

# ---- Phase 6: pre-flight validation ----------------------------------------
# NOTE ON THE PIPELINES BELOW. `cmd | tee -a "$LOG" | grep -q X` looks natural and is
# wrong under `set -o pipefail`: grep -q exits on the FIRST match and closes the pipe,
# tee then dies of SIGPIPE, and pipefail fails the whole pipeline even though the grep
# succeeded. That raced through two clean runs and then rolled back a perfectly good
# third one. Output is captured to a file first, then searched.
STEP_OUT="$LOGDIR/.step.$$"
run_step(){                      # run_step <needle> <command...>
  local needle="$1"; shift
  "$@" > "$STEP_OUT" 2>&1
  local rc=$?
  redact < "$STEP_OUT" >> "$LOG"
  redact < "$STEP_OUT" | tail -n 3
  [ $rc -eq 0 ] || return 1
  [ -z "$needle" ] && return 0
  grep -q "$needle" "$STEP_OUT"
}
trap 'rm -f "$STEP_OUT"' EXIT

say "pre-flight: query equivalence"
if ! run_step 'QUERY-EQUIVALENCE: PASS' $NODE "$PROJECT/sql/refresh/query-equivalence.js"; then
  finish FAILED "query equivalence did not pass — a query fault, nothing published"
fi

# ---- extract + build --------------------------------------------------------
say "build: extracting and assembling"
if ! run_step '' $NODE "$PROJECT/sql/refresh/build.js"; then
  finish FAILED "build failed"
fi
[ -s "$OUT/_meta.json" ] || finish FAILED "build produced no _meta.json"

# the SKU list the price builder must price
$NODE -e '
const fs=require("fs"),p=process.argv[1];
const m=JSON.parse(fs.readFileSync(p+"/_meta.json","utf8"));
let out=[]; Object.keys(m.sections).forEach(a=>{
  JSON.parse(fs.readFileSync(p+"/array_"+a+".json","utf8")).forEach(r=>out.push(a+"\t"+r.s));});
fs.writeFileSync(p+"/dashboard-skus.txt", out.join("\n")+"\n");' "$OUT" 2>&1 | tee -a "$LOG"

say "build: Shopify price and comments"
if ! LISTING="$OUT/_listing.json" SKUFILE="$OUT/dashboard-skus.txt" OUTDIR="$OUT" \
     run_step '' $NODE "$PROJECT/sql/build-shopify-comments.js"; then
  finish FAILED "price/comment build failed"
fi

# ---- Phase 7 + 8: validate a temporary file, then swap atomically -----------
say "apply: validating a temporary file, then swapping"
if ! run_step '' $NODE "$PROJECT/sql/refresh/apply.js"; then
  finish FAILED "apply refused to publish, or rolled back"
fi

# ---- post-apply -------------------------------------------------------------
say "post-apply: smoke render"
if ! run_step 'sections rendering the wrong count : 0' $NODE "$PROJECT/validation/smoke-render.js"; then
  say "post-apply smoke render FAILED — restoring the backup"
  cp "$PROJECT/dashboard/inventory-dashboard.html.bak" "$PROJECT/dashboard/inventory-dashboard.html"
  finish FAILED "restored from backup"
fi

finish OK "published"
