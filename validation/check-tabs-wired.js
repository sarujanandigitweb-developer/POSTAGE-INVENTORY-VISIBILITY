'use strict';
// EVERY TAB MUST ACTUALLY BE CLICKABLE. The Pending Dispatch tab shipped with markup, a
// view, a renderer and a first-paint entry — but no click handler, so pressing it did
// nothing. Every other check called setView() directly and sailed straight past it.
// This one CLICKS each tab button the way a person does. Read-only.
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const FILE=process.env.DASHBOARD||path.join(ROOT,'dashboard','inventory-dashboard.html');
const html=fs.readFileSync(FILE,'utf8');
const above=html.slice(0,html.indexOf('<script>'));

// the tabs the MARKUP offers, and the wrapper each one should reveal
const tabs=[...above.matchAll(/<button[^>]*class="vtab"[^>]*id="(v\w+)"[^>]*data-view="(\w+)"[^>]*>([^<]*)</g)]
  .map(m=>({id:m[1],view:m[2],label:m[3].trim()}));
const WRAP={inv:'invwrap',postage:'pgwrap',fx:'fxwrap',sm:'smwrap',pd:'pdwrap',cd:'cdwrap'};

const IDS=new Set(); above.replace(/id="([^"]+)"/g,(m,i)=>{IDS.add(i);return m;});
const handlers={};
const mk=id=>({id,innerHTML:'',textContent:'',value:'',hidden:false,attrs:{},options:[],
 selectedOptions:[{textContent:''}],dataset:{},style:{},
 classList:{add(){},remove(){},toggle(){},contains:()=>false},
 addEventListener(t,fn){ if(t==='click') (handlers[id]=handlers[id]||[]).push(fn); },
 appendChild(){},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]||''},
 insertAdjacentHTML(p,h){this.innerHTML+=h},querySelector:()=>null,querySelectorAll:()=>[],
 replaceWith(){},focus(){},scrollIntoView(){},getBoundingClientRect:()=>({top:0,height:0})});
const els={};
const document={getElementById:id=>IDS.has(id)?(els[id]||(els[id]=mk(id))):null,
 querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>mk('n'),addEventListener(){},
 documentElement:mk('h'),body:mk('b')};
const src=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const sb={console:{log(){},warn(){},error(){}},out:null};
new Function('sandbox','document','window','localStorage','setInterval','clearInterval',
             'setTimeout','clearTimeout','fetch','alert',
 src+'\n; sandbox.out={state};')(sb,document,
 {addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},
 {getItem:()=>null,setItem(){}},()=>0,()=>0,fn=>0,()=>0,
 ()=>({then(){return this},catch(){return this}}),()=>0);

const fail=[];
const chk=(n,ok,note)=>{console.log('  '+(ok?'OK  ':'*** ')+n+(note!==undefined?'  — '+note:''));
  if(!ok)fail.push(n);};

chk('the markup offers tabs',tabs.length>0,tabs.map(t=>t.label).join(' · '));
tabs.forEach(t=>{
  const hs=handlers[t.id]||[];
  chk('"'+t.label+'" has a click handler',hs.length>0,
      hs.length?t.id:'*** '+t.id+' is wired to nothing');
  if(!hs.length) return;
  hs.forEach(fn=>fn());                       // click it, exactly as a person would
  chk('  clicking it switches the view',sb.out.state.view===t.view,
      'landed on '+sb.out.state.view);
  const w=WRAP[t.view];
  chk('  and reveals its own panel',w&&els[w]&&els[w].hidden===false,w);
  chk('  and marks its own tab selected',els[t.id].getAttribute('aria-selected')==='true');
});

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
