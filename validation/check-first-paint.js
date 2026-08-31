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
const initHidden={};
html.replace(/<div class="[^"]*" id="(pgwrap|fxwrap|smwrap|invwrap|catbar)"([^>]*)>/g,
  (m,id,rest)=>{initHidden[id]=/\bhidden\b/.test(rest);return m;});
function paint(saved){
  const els={};
  IDS.forEach(id=>{els[id]={id,hidden:!!initHidden[id],attrs:{},
    setAttribute(k,v){this.attrs[k]=v;},getAttribute(k){return this.attrs[k]||'';}};});
  const document={getElementById:id=>els[id]||null};
  const store=saved===null?{}:{'crv-view':saved};
  new Function('document','localStorage',early)(document,{getItem:k=>k in store?store[k]:null});
  const shown=['invwrap','pgwrap','fxwrap','smwrap'].filter(id=>els[id]&&!els[id].hidden);
  return shown.join(',')||'(nothing)';
}
const fail=[];
console.log('  stored tab     visible at FIRST PAINT');
[[null,'invwrap'],['inv','invwrap'],['postage','pgwrap'],['fx','fxwrap'],['sm','smwrap'],['garbage','invwrap']]
 .forEach(([v,want])=>{
  const got=paint(v);
  const ok=got===want; if(!ok)fail.push(v);
  console.log('  '+(ok?'OK  ':'*** ')+String(v===null?'(none)':v).padEnd(12)+got.padEnd(12)+
    (ok?'':'expected '+want));
});
console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
