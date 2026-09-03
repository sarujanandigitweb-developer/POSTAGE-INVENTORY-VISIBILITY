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
const WRAP={inv:'invwrap',postage:'pgwrap',fx:'fxwrap',sm:'smwrap',pd:'pdwrap',cd:'cdwrap',
            rd:'rdwrap'};

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
 src+'\n; sandbox.out={state,setView};')(sb,document,
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
  if(!w){ chk('  the checker knows this tab\'s panel',false,
    '*** no WRAP entry for view \''+t.view+'\' — add it to this file, the page may be fine'); return; }
  chk('  and reveals its own panel',w&&els[w]&&els[w].hidden===false,w);
  chk('  and marks its own tab selected',els[t.id].getAttribute('aria-selected')==='true');
});

// ---- the grouped views ------------------------------------------------------
// Two views now live under one top-level tab, so the loop above can only ever reach
// ONE of them. Dispatch Queue is no longer clickable from the strip at all, and
// without this it would be exactly the untested tab this file was written to catch.
console.log('\n=== the Orders group ===');
{
  const setView=sb.out.setView, state=sb.out.state;
  const sub=[...above.matchAll(/<button[^>]*class="subtab"[^>]*id="(s\w+)"[^>]*data-sub="(\w+)"[^>]*>([^<]*)</g)]
    .map(m=>({id:m[1],view:m[2],label:m[3].trim()}));
  chk('the group offers sub-tabs',sub.length===2,sub.map(x=>x.label).join(' · '));

  // pressing Orders from outside the section opens Recently Dispatched
  setView('inv');
  (handlers['vord']||[]).forEach(fn=>fn());
  chk('pressing Orders opens Recently Dispatched',state.view==='rd','landed on '+state.view);
  chk('  the group tab lights up',els.vord.getAttribute('aria-selected')==='true');
  chk('  the sub-strip appears',els.ordbar.hidden===false);

  // and pressing it again does NOT throw you out of the queue you were reading
  setView('pd');
  (handlers['vord']||[]).forEach(fn=>fn());
  chk('pressing Orders from inside the section leaves you where you are',
      state.view==='pd','still on '+state.view);

  sub.forEach(t=>{
    setView(t.view);
    const w=WRAP[t.view];
    chk('"'+t.label+'" reveals its own panel',!!w&&els[w]&&els[w].hidden===false,w);
    chk('  it is marked selected',els[t.id].getAttribute('aria-selected')==='true');
    chk('  the other sub-tab is not',
        sub.filter(o=>o!==t).every(o=>els[o.id].getAttribute('aria-selected')==='false'));
    chk('  and the one top-level tab stays lit',els.vord.getAttribute('aria-selected')==='true');
  });

  // every view must still be reachable somehow — strip, sub-strip or menu
  const VIEWS=[...(/const VIEWS = \[([^\]]*)\]/.exec(html)||['',''])[1]
    .matchAll(/'([a-z]+)'/g)].map(m=>m[1]);
  const reachable=new Set(tabs.map(t=>t.view).concat(sub.map(t=>t.view)));
  const orphans=VIEWS.filter(v=>!reachable.has(v));
  chk('no view is unreachable from a control',orphans.length===0,
      orphans.length?'*** '+orphans.join(', ')+' can only be reached from the menu':
        VIEWS.length+' views across '+tabs.length+' tabs and '+sub.length+' sub-tabs');
}

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
