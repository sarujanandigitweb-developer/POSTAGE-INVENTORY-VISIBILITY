#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Postage Inventory Visibility — publish to the Varman AIOS Hub.
#
# Credentials are read at run time from the existing gitignored .env on this
# machine. Never hardcoded here, never printed — the connection string is
# redacted out of all output as a backstop in case a driver error echoes it.
#
# Scope: only ever writes varman_aios.hub_pages for MEMBER_NAME below
# (upsert on (member_name, page_slug)). The credential can reach other tables;
# this must not.
# ---------------------------------------------------------------------------
set -uo pipefail

PROJECT="/home/led-247/POSTAGE-INVENTORY-VISIBILITY"
ENV_FILE="/home/led-247/Returns-Reason-Hotspot-Report/.env"
PG_MODULES="/home/led-247/Returns-Reason-Hotspot-Report/scripts/node_modules"

MEMBER_NAME="sarujanan"
PAGE_SLUG="postage-inventory-visibility"
PAGE_TITLE="Postage Inventory Visibility"
HTML="$PROJECT/dashboard/inventory-dashboard.html"
MIN_BYTES=100000          # a healthy dashboard is ~150KB; never publish a stub

# -u keeps this line-buffered. Without it sed holds the output until the pipe closes,
# so a successful publish shows nothing while the client is still connected — the run on
# 2026-08-26 looked hung for 15 minutes when the row had committed after about one.
redact() { sed -u -E 's#(postgres(ql)?://[^:/@]+:)[^@]*@#\1***REDACTED***@#g'; }

# --- pre-publish sanity: never ship a truncated or structurally broken page ---
if [ ! -r "$HTML" ]; then
  echo "SKIPPED — $HTML not readable"; exit 1
fi
BYTES=$(wc -c < "$HTML")
if [ "$BYTES" -lt "$MIN_BYTES" ]; then
  echo "SKIPPED — HTML only ${BYTES}B (< ${MIN_BYTES}B floor)"; exit 1
fi
for marker in '<html' '</html>' 'const DATA'; do
  if ! grep -qF "$marker" "$HTML"; then
    echo "SKIPPED — '$marker' missing from HTML"; exit 1
  fi
done
echo "pre-publish checks: OK (${BYTES} bytes)"

# --- build the connection string from .env (URL-encoded, never logged) --------
if [ ! -r "$ENV_FILE" ]; then
  echo "SKIPPED — $ENV_FILE not readable"; exit 1
fi
HUB_DB_URL="$(/usr/bin/python3 - "$ENV_FILE" <<'PY'
import sys, urllib.parse
env = {}
for line in open(sys.argv[1]):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k.strip()] = v.strip().strip('"').strip("'")
q = lambda v: urllib.parse.quote(v, safe="")
print("postgresql://%s:%s@%s:%s/%s" % (
    q(env["PGUSER"]), q(env["PGPASSWORD"]),
    env["PGHOST"], env["PGPORT"], env["PGDATABASE"]))
PY
)"
if [ -z "${HUB_DB_URL:-}" ]; then
  echo "SKIPPED — could not build HUB_DB_URL from .env"; exit 1
fi
export HUB_DB_URL
export NODE_PATH="$PG_MODULES"

# --- publish (upsert; re-running the same slug updates it in place) ----------
# The upsert commits well before the client finishes closing; cap the wait so a stuck
# connection cannot hold the shared credential open indefinitely.
if timeout --foreground 300 /usr/bin/node "$PROJECT/hub/push_to_hub.js" \
     "$MEMBER_NAME" "$PAGE_SLUG" "$PAGE_TITLE" "$HTML" 2>&1 | redact; then
  STATUS=0
else
  STATUS=1
fi

unset HUB_DB_URL
exit "$STATUS"
