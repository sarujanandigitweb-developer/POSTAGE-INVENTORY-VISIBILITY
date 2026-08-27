#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Verify the published Varman AIOS page against the local file, from a SEPARATE
# connection. publish.sh reports what the client believes; this reads the row back.
#
# Credentials are built at run time from the same gitignored .env publish.sh uses,
# never hardcoded and never printed — the connection string is redacted out of all
# output as a backstop.
#
# READ ONLY: only ever SELECTs from varman_aios.hub_pages for MEMBER_NAME below.
# ---------------------------------------------------------------------------
set -uo pipefail

PROJECT="/home/led-247/POSTAGE-INVENTORY-VISIBILITY"
ENV_FILE="/home/led-247/Returns-Reason-Hotspot-Report/.env"
PG_MODULES="/home/led-247/Returns-Reason-Hotspot-Report/scripts/node_modules"

MEMBER_NAME="sarujanan"
PAGE_SLUG="postage-inventory-visibility"
HTML="$PROJECT/dashboard/inventory-dashboard.html"

redact() { sed -u -E 's#(postgres(ql)?://[^:/@]+:)[^@]*@#\1***REDACTED***@#g'; }

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

if timeout --foreground 120 /usr/bin/node "$PROJECT/hub/verify_page.js" \
     "$MEMBER_NAME" "$PAGE_SLUG" "$HTML" 2>&1 | redact; then
  STATUS=0
else
  STATUS=1
fi

unset HUB_DB_URL
exit "$STATUS"
