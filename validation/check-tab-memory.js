'use strict';
// TAB MEMORY. Reloading the page used to drop you back on Inventory whatever tab you were
// reading. The page now stores the chosen tab and restores it. This boots the page once
// per stored value — including a missing one and a corrupt one — and checks where it
// lands, that the right tab is marked selected, and that the restored view actually BUILT
// its data rather than only switching the highlight. Read-only.
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const FILE=process.env.DASHBOARD||path.join(ROOT,'dashboard','inventory-dashboard.html');
const html=fs.readFileSync(FILE,'utf8');
const above=html.slice(0,html.indexOf('<script>'));const IDS=new Set();
above.replace(/id="([^"]+)"/g,(m,i)=>{IDS.add(i);return m;});
const src=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));

function boot(saved){
  const store={}; if(saved!==null) store['crv-view']=saved;
  const els={};
  const mk=id=>({id,innerHTML:'',textContent:'',value:'',hidden:false,attrs:{},options:[],
   selectedOptions:[{textContent:''}],dataset:{},style:{},
   classList:{add(){},remove(){},toggle(){},contains:()=>false},
   addEventListener(){},appendChild(){},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]||''},
   insertAdjacentHTML(p,h){this.innerHTML+=h},querySelector:()=>null,querySelectorAll:()=>[],
   replaceWith(){},focus(){},scrollIntoView(){},getBoundingClientRect:()=>({top:0,height:0})});
  const document={getElementById:id=>IDS.has(id)?(els[id]||(els[id]=mk(id))):null,
   querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>mk('n'),addEventListener(){},
   documentElement:mk('h'),body:mk('b')};
  const sb={console:{log(){},warn(){},error(){}},out:null};
  new Function('sandbox','document','window','localStorage','setInterval','clearInterval','setTimeout','clearTimeout','fetch','alert',
    src+'\n; sandbox.out={state,sm,fx};')(sb,document,
    {addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},
    {getItem:k=>(k in store?store[k]:null),setItem(k,v){store[k]=v;}},
    ()=>0,()=>0,fn=>0,()=>0,()=>({then(){return this},catch(){return this}}),()=>0);
  return {view:sb.out.state.view, els, stored:store['crv-view'],
          smBuilt:sb.out.sm.built, fxBuilt:sb.out.fx.built};
}
const tabs={inv:'vinv',postage:'vpost',fx:'vfx',sm:'vsm'};
const fail=[];
const chk=(n,ok,note)=>{console.log('  '+(ok?'OK  ':'*** ')+n+(note!==undefined?'  — '+note:''));
  if(!ok)fail.push(n);};

[['fx','SKU Fixed Price'],['sm','Slow-Moving Stock'],['postage','Postage Information']]
 .forEach(([v,label])=>{
  const r=boot(v);
  chk('reload on '+label+' stays there', r.view===v, 'landed on '+r.view);
  chk('  its tab is the selected one',
      r.els[tabs[v]] && r.els[tabs[v]].getAttribute('aria-selected')==='true');
  if(v==='fx') chk('  and the view built its data', r.fxBuilt===true);
  if(v==='sm') chk('  and the view built its data', r.smBuilt===true);
});
const none=boot(null);
chk('a first visit opens on Inventory', none.view==='inv', 'landed on '+none.view);
const bad=boot('garbage');
chk('a corrupt stored value falls back to Inventory', bad.view==='inv', 'landed on '+bad.view);
const kept=boot('sm');
chk('the choice is written back to storage', kept.stored==='sm', 'crv-view = '+kept.stored);

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
