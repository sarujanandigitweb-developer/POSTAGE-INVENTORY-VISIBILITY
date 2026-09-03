'use strict';
// SMALL-SCREEN TAB MENU. Below 720px the five tabs are replaced by a menu. This CLICKS
// each menu item the way a person does and checks the view actually switches and the
// button label follows — the same reason check-tabs-wired exists, for the other control.
// Read-only.
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const html=fs.readFileSync(process.env.DASHBOARD||path.join(ROOT,'dashboard','inventory-dashboard.html'),'utf8');
const above=html.slice(0,html.indexOf('<script>'));const IDS=new Set();
above.replace(/id="([^"]+)"/g,(m,i)=>{IDS.add(i);return m;});
// The label is inside a <span class="vml">, not directly after the tag: the items
// carry an icon and a tick now. The old pattern matched nothing and the check
// passed over an empty list — a validator that tests nothing still says OK.
const items=[...above.matchAll(/data-go="(\w+)"[\s\S]*?<span class="vml">([^<]+)</g)]
  .map(m=>({v:m[1],label:m[2]}));
if(!items.length){console.error('*** no menu items parsed — the markup shape changed');process.exit(1);}
const handlers={};
const mk=id=>({id,innerHTML:'',textContent:'',value:'',hidden:false,attrs:{},options:[],
 selectedOptions:[{textContent:''}],dataset:{},style:{},
 classList:{add(){},remove(){},toggle(){},contains:()=>false},
 addEventListener(t,fn){(handlers[id]=handlers[id]||{})[t]=fn;},
 appendChild(){},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]||''},
 insertAdjacentHTML(p,h){this.innerHTML+=h},
 querySelector:()=>null,querySelectorAll:()=>[],
 replaceWith(){},focus(){},scrollIntoView(){},getBoundingClientRect:()=>({top:0,height:0})});
const els={};
const document={getElementById:id=>IDS.has(id)?(els[id]||(els[id]=mk(id))):null,
 querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>mk('n'),
 addEventListener(){},documentElement:mk('h'),body:mk('b')};
const src=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const sb={console:{log(){},warn(){},error(){}},out:null};
new Function('sandbox','document','window','localStorage','setInterval','clearInterval','setTimeout','clearTimeout','fetch','alert',
 src+'\n; sandbox.out={state,setView};')(sb,document,
 {innerWidth:600,addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},
 {getItem:()=>null,setItem(){}},()=>0,()=>0,fn=>0,()=>0,()=>({then(){return this},catch(){return this}}),()=>0);
const click=handlers['vmlist'] && handlers['vmlist'].click;
console.log('  menu items:',items.map(i=>i.label).join(' · '));
let bad=0;
items.forEach(it=>{
  click({target:{closest:sel=>sel==="button[data-go]"?{getAttribute:()=>it.v}:null}});
  const ok=sb.out.state.view===it.v;
  if(!ok)bad++;
  console.log('  '+(ok?'OK  ':'*** ')+it.label.padEnd(22)+'-> '+sb.out.state.view+
    '   label now: '+els.vmnow.textContent);
});

// The button names the tab you are on, so VM_LABEL needs an entry for every id in
// VIEWS. A missing one is not a blank — vmSync falls back to 'Inventory', so the
// button names the WRONG tab. Container Details was added to VIEWS and to the menu
// but not to VM_LABEL, and read as "Inventory".
{
  const ids=[...(/const VIEWS = \[([^\]]*)\]/.exec(src)||['',''])[1].matchAll(/'([a-z]+)'/g)].map(m=>m[1]);
  const map=(/const VM_LABEL = \{([\s\S]*?)\};/.exec(src)||['',''])[1];
  const missing=ids.filter(id=>!new RegExp('\\b'+id+'\\s*:').test(map));
  if(missing.length){bad++;console.log('  *** VM_LABEL missing: '+missing.join(', ')+
    ' — the button would name the wrong tab');}
  else console.log('  OK  every view has a menu label  — '+ids.length+' views');
  if(ids.length!==items.length){bad++;
    console.log('  *** menu lists '+items.length+' items for '+ids.length+' views');}
  else console.log('  OK  the menu lists exactly the views  — '+items.length);
}

console.log('\n'+(bad?'*** '+bad+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(bad?1:0);
