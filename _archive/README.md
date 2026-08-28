# Archive — historical, not live

Nothing in here runs. Nothing in here is on the refresh path. Every file was a one-off
step that produced one change to `dashboard/inventory-dashboard.html`, and is kept as the
reproducible proof behind an `evidence/` document.

The live system is `sql/refresh/`. See the root `README.md`.

- `apply-scripts/` — one script per past dashboard change (Lamp Holder repopulation,
  price/Comments column, History v2, Received warehouse, UI alerts, Handles move, the
  freshness tag). `build-shopify-comments.v1.js` is superseded by the version in `sql/`.
- `extraction-queries/` — the ad-hoc SQL used to discover and extract each section.
- `extracted-snapshots/` — the JSON/txt those scripts consumed. `sql/refresh/out/` is
  the live equivalent and is regenerated every two hours.
- `one-off-checks/` — validation scripts, each written for a single task.

Paths inside these files point at the layout as it was when they ran. Re-running one
would need its paths updated first, and would in any case be overwritten by the next
scheduled refresh.
