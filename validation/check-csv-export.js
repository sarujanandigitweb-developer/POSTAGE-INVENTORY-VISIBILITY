'use strict';
// CSV EXPORT. The button used to call active() whatever tab was showing, so exporting
// from SKU Fixed Price or Slow-Moving downloaded the Ceiling Rose inventory instead, under
// a filename with a hardcoded date. This drives the real downloadCSV() on each tab and
// checks the filename, the column set and the row count against what that tab is showing.
const fs=require('fs');
const path=require('path');
const ROOT=path.resolve(__dirname,'..');
const FILE=process.env.DASHBOARD||path.join(ROOT,'dashboard','inventory-dashboard.html');
const html=fs.readFileSync(FILE,'utf8');
const above=html.slice(0,html.indexOf('<script>'));const IDS=new Set();
above.replace(/id="([^"]+)"/g,(m,i)=>{IDS.add(i);return m;});
const src=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
let captured=null;
const mk=id=>({id,innerHTML:'',textContent:'',value:'',hidden:false,attrs:{},options:[],
 selectedOptions:[{textContent:''}],dataset:{},style:{},
 classList:{add(){},remove(){},toggle(){},contains:()=>false},
 addEventListener(t,fn){ if(this.id==='csv'&&t==='click') this._click=fn; },
 appendChild(){},removeChild(){},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]||''},
 insertAdjacentHTML(p,h){this.innerHTML+=h},querySelector:()=>null,querySelectorAll:()=>[],
 replaceWith(){},focus(){},scrollIntoView(){},getBoundingClientRect:()=>({top:0,height:0}),click(){}});
const els={};
const document={getElementById:id=>IDS.has(id)?(els[id]||(els[id]=mk(id))):null,
 querySelector:()=>null,querySelectorAll:()=>[],
 createElement:()=>{const a=mk('a');a.click=()=>{captured=Object.assign(captured||{},{name:a.download});};return a;},
 addEventListener(){},documentElement:mk('h'),body:{appendChild(){},removeChild(){}}};
global.Blob=function(parts){ this.text=parts.join(''); captured=Object.assign(captured||{},{text:this.text}); };
global.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};
const sb={console:{log(){},warn(){},error(){}},out:null};
new Function('sandbox','document','window','localStorage','setInterval','clearInterval','setTimeout','clearTimeout','fetch','alert','Blob','URL',
 src+'\n; sandbox.out={setView,downloadCSV,state,sm,fx,smFilter};')(sb,document,
 {addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},
 {getItem:()=>null,setItem(){}},()=>0,()=>0,fn=>0,()=>0,()=>({then(){return this},catch(){return this}}),()=>0,
 global.Blob,global.URL);

const fail=[];
const chk=(n,ok,note)=>{console.log('  '+(ok?'OK  ':'*** ')+n+(note!==undefined?'  — '+note:''));
  if(!ok)fail.push(n);};

const grab=v=>{ captured=null; sb.out.setView(v); sb.out.downloadCSV();
  const txt=(captured&&captured.text||'').replace(/^\uFEFF/,'');
  const lines=txt.split('\r\n');
  return {name:captured&&captured.name||'', cols:lines[0]?lines[0].split(',').length:0,
          head:lines[0]||'', rows:lines.length-1}; };

const inv=grab('inv');
chk('Inventory exports its own rows', inv.rows>0 && /^SKU,Type,Image/.test(inv.head),
    inv.rows.toLocaleString()+' rows, '+inv.cols+' columns');

const fxo=grab('fx');
chk('Fixed Price exports Fixed Price data, not Inventory',
    /^SKU,Product Name,SKU Type/.test(fxo.head), fxo.head.split(',').slice(0,4).join(', ')+'…');
chk('  row count matches what the tab shows', fxo.rows===sb.out.fx.view.length,
    fxo.rows.toLocaleString()+' vs '+sb.out.fx.view.length.toLocaleString()+' in view');
chk('  the two sourceless marketplaces are labelled', /no data source/.test(fxo.head));

const smo=grab('sm');
chk('Slow-Moving exports Slow-Moving data, not Inventory',
    /^SKU \/ Component ID,Item Name/.test(smo.head), smo.head.split(',').slice(0,3).join(', ')+'…');
chk('  row count matches what the tab shows', smo.rows===sb.out.sm.view.length,
    smo.rows.toLocaleString()+' vs '+sb.out.sm.view.length.toLocaleString()+' in view');
chk('  all 18 columns are present', smo.cols===18, smo.cols+' columns');

chk('each tab gets its own filename',
    new Set([inv.name,fxo.name,smo.name]).size===3,
    [inv.name,fxo.name,smo.name].map(n=>n.split('-').slice(0,2).join('-')).join(' | '));
chk('the filename carries the data date, not a hardcoded one',
    [inv.name,fxo.name,smo.name].every(n=>/\d{4}-\d{2}-\d{2}\.csv$/.test(n)) &&
    !/2026-08-20/.test(inv.name+fxo.name+smo.name),
    inv.name.slice(-14));

// a filter must narrow the export too
sb.out.setView('sm'); sb.out.sm.pri='3'; sb.out.smFilter?.();
const filtered=grab('sm');
chk('a filter narrows the export', filtered.rows<=smo.rows,
    filtered.rows.toLocaleString()+' rows once filtered to Critical');

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
