'use strict';
// FIRST PAINT. The remembered tab must be applied by the tiny early script, BEFORE the
// browser parses the ~10 MB data script — otherwise Inventory paints and then flicks away.
// This runs ONLY that early script against the markup's own initial hidden state and
// asserts which wrapper is visible at first paint. Read-only.
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(process.env.DASHBOARD||path.join(ROOT,'dashboard','inventory-dashboard.html'),'utf8');
// deliberately the FIRST script — the early restore is exactly what is under test
const early=html.slice(html.indexOf('<script>')+8, html.indexOf('</script>'));
const IDS=new Set(); html.slice(0,html.indexOf('<script>')).replace(/id="([^"]+)"/g,(m,i)=>{IDS.add(i);return m;});
// initial hidden state straight from the markup
const WRAPS=[...(/var wrap = \{([\s\S]*?)\};/.exec(html)||['',''])[1]
  .matchAll(/:\s*'(\w+)'/g)].map(m=>m[1]);
const PANELS=['invwrap'].concat(WRAPS);
const initHidden={};
html.replace(new RegExp('<div class="[^"]*" id="('+PANELS.concat(['catbar']).join('|')+')"([^>]*)>','g'),
  (m,id,rest)=>{initHidden[id]=/\bhidden\b/.test(rest);return m;});
function paint(saved){
  const els={};
  IDS.forEach(id=>{els[id]={id,hidden:!!initHidden[id],attrs:{},
    setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||'';}};});
  const document={getElementById:id=>els[id]||null};
  const store=saved===null?{}:{'crv-view':saved};
  new Function('document','localStorage',early)(document,{getItem:k=>k in store?store[k]:null});
  const shown=PANELS.filter(id=>els[id]&&!els[id].hidden);
  return shown.join(',')||'(nothing)';
}
const fail=[];
console.log('  stored tab     visible at FIRST PAINT');
// EVERY view, not a sample. Pending Dispatch, Recently Dispatched and Container
// Details were absent from the early-restore map, so restoring onto one of them
// painted Inventory and then flicked away — precisely what this script prevents.
[[null,'invwrap'],['inv','invwrap'],['postage','pgwrap'],['fx','fxwrap'],['sm','smwrap'],
 ['pd','pdwrap'],['rd','rdwrap'],['cd','cdwrap'],['garbage','invwrap']]
 .forEach(([v,want])=>{
  const got=paint(v);
  const ok=got===want; if(!ok)fail.push(v);
  console.log('  '+(ok?'OK  ':'*** ')+String(v===null?'(none)':v).padEnd(12)+got.padEnd(12)+
    (ok?'':'expected '+want));
});
// a view added to VIEWS but forgotten here is the exact bug above, so name it
{
  const VIEWS=[...(/const VIEWS = \[([^\]]*)\]/.exec(html)||['',''])[1]
    .matchAll(/'([a-z]+)'/g)].map(m=>m[1]).filter(v=>v!=='inv');
  const mapped=[...(/var wrap = \{([\s\S]*?)\};/.exec(html)||['',''])[1]
    .matchAll(/(\w+)\s*:/g)].map(m=>m[1]);
  const missing=VIEWS.filter(v=>mapped.indexOf(v)===-1);
  const ok=missing.length===0;
  if(!ok)fail.push('early-restore map');
  console.log('\n  '+(ok?'OK  ':'*** ')+'every view is in the early-restore map  — '+
    (ok?mapped.length+' of '+VIEWS.length+' non-default views':'*** missing: '+missing.join(', ')));
}

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
