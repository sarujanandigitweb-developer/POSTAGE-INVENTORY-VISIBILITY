'use strict';
const fs=require('fs'), SP=process.env.SP;
const { parseLine } = require(SP+'/parse.js');

// region derived from the location the source line names - evidence/45
function region(tl){
  const t = String(tl || '').toLowerCase();
  if (/canada/.test(t)) return 'CA';
  if (/usa/.test(t)) return 'US';
  if (/netherland/.test(t)) return 'NL';
  if (/france/.test(t)) return 'FR';
  if (/german|tros|kronen|schmutter|duisburg|dusiberg|duis_de/.test(t)) return 'DE';
  if (/\bde$/.test(t)) return 'DE';
  return 'UK';
}
const CAP = 12;

function build(lines /* [[sku,line]] */){
  const bySku = {};
  lines.forEach(([s,l]) => { (bySku[s]=bySku[s]||[]).push(l); });
  const out = {};
  Object.keys(bySku).forEach(sku => {
    let mv = [];
    bySku[sku].forEach(l => { mv = mv.concat(parseLine(l)); });
    const byRg = {};
    mv.forEach(m => { const rg = region(m.tl); (byRg[rg]=byRg[rg]||[]).push(m); });
    out[sku] = byRg;
  });
  return out;
}
module.exports = { build, region, CAP };
