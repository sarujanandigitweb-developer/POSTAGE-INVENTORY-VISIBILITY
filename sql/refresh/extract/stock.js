'use strict';
// Warehouse stock and shelf locations. Pure read, deterministic.
//
// The warehouse id -> dashboard column map is the EXISTING validated one and is not
// changed here. Names come from inventory.warehouse, except 33: that warehouse has no
// row in the master table at all, so it keeps the declared override the team confirmed
// (history says `unit5 changed from 0 to 48` for TPFHTWB12WH; stock says warehouse 33
// = 48, every other warehouse zero).
const { q } = require('../db.js');

// column on the dashboard row  ->  warehouse id
const COL = { a: 1, b: 8, c: 6, u5: 33, k: 10, m: 7, ca: 4, us: 32 };
// which columns also carry a shelf location
const LOC = { al: 1, bl: 8, kl: 10, ml: 7 };
const OVERRIDE = { 33: 'UK Unit 5' };      // no row in inventory.warehouse yet

async function extract(client, pids){
  const st = {};                            // pid -> { wh -> {q, loc} }
  const CH = 4000;
  for (let i = 0; i < pids.length; i += CH){
    const rows = await q(client,
      `SELECT inventory, warehouse, quantity,
              NULLIF(NULLIF(trim(product_shelf_location), ''), '-') AS loc
         FROM inventory.physical_product_stock
        WHERE inventory = ANY($1)`, [pids.slice(i, i + CH)]);
    rows.forEach(r => {
      (st[r.inventory] = st[r.inventory] || {})[r.warehouse] =
        { q: Number(r.quantity), loc: r.loc };
    });
  }

  const names = {};
  (await q(client, `SELECT warehouse, warehouse_name, warehouse_location
                      FROM inventory.warehouse ORDER BY warehouse`))
    .forEach(r => { names[r.warehouse] = { name: r.warehouse_name, loc: r.warehouse_location }; });
  const missing = Object.values(COL).filter(id => !names[id]);

  return { st, names, missing, OVERRIDE, COL, LOC };
}

// the eight stock values and four locations for one product, in dashboard shape
function rowFields(st, pid){
  const s = st[pid] || {};
  const out = {};
  Object.keys(COL).forEach(col => { const e = s[COL[col]]; out[col] = e ? e.q : 0; });
  Object.keys(LOC).forEach(col => { const e = s[LOC[col]]; if (e && e.loc) out[col] = e.loc; });
  return out;
}

module.exports = { extract, rowFields, COL, LOC, OVERRIDE };
