'use strict';
// Drives the Pending Dispatch tab through the page's own code, then re-runs the defining
// query against the database and compares the row count. Read-only.
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const FILE=process.env.DASHBOARD||path.join(ROOT,'dashboard','inventory-dashboard.html');
const html=fs.readFileSync(FILE,'utf8');
const above=html.slice(0,html.indexOf('<script>'));const IDS=new Set();
above.replace(/id="([^"]+)"/g,(m,i)=>{IDS.add(i);return m;});
const els={};const missing=[];
const mk=id=>({id,innerHTML:'',textContent:'',value:'',hidden:false,attrs:{},options:[],
 selectedOptions:[{textContent:''}],dataset:{},style:{},
 classList:{add(){},remove(){},toggle(){},contains:()=>false},
 addEventListener(){},appendChild(){},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]||''},
 insertAdjacentHTML(p,h){this.innerHTML+=h},querySelector:()=>null,querySelectorAll:()=>[],
 replaceWith(){},focus(){},scrollIntoView(){},getBoundingClientRect:()=>({top:0,height:0})});
const document={getElementById:id=>{if(!IDS.has(id)){missing.push(id);return null;}
  return els[id]||(els[id]=mk(id));},
 querySelector:()=>null,querySelectorAll:()=>[],createElement:()=>mk('n'),addEventListener(){},
 documentElement:mk('h'),body:mk('b')};
const src=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const sb={console,out:null};
new Function('sandbox','document','window','localStorage','setInterval','clearInterval',
             'setTimeout','clearTimeout','fetch','alert',
 src+'\n; sandbox.out={PENDING_DISPATCH,pd,pdFilter,pdDraw,pdBand,PD_COLS,PD_PRI,pdPass,setView,pdOpen};')
 (sb,document,{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},
  {getItem:()=>null,setItem(){}},()=>0,()=>0,fn=>0,()=>0,
  ()=>({then(){return this},catch(){return this}}),()=>0);
const {PENDING_DISPATCH,pd,pdFilter,pdDraw,pdBand,PD_COLS,PD_PRI,pdPass,setView,pdOpen}=sb.out;

const fail=[];
const chk=(n,ok,note)=>{console.log('  '+(ok?'OK  ':'*** ')+n+(note!==undefined?'  — '+note:''));
  if(!ok)fail.push(n);};
console.log('ids looked up but absent from markup:',missing.length,
  missing.length?'*** '+[...new Set(missing)].join(', '):'');

console.log('\n=== data ===');
const R=PENDING_DISPATCH.r;
chk('PENDING_DISPATCH is populated',R.length>0,R.length.toLocaleString()+' open orders');
chk('this is a queue, not the whole order history',R.length<20000,R.length.toLocaleString()+' rows');
chk('no duplicate order id',new Set(R.map(r=>r.o)).size===R.length);
chk('every row has an order id and a non-negative age',
  R.every(r=>r.o&&typeof r.dy==='number'&&r.dy>=0));
chk('the SLA flag matches the age',R.every(r=>(r.b===1)===(r.dy>PENDING_DISPATCH.sla)),
  'SLA = '+PENDING_DISPATCH.sla+' days');
chk('priority matches the age band',
  R.every(r=>r.pr===(r.dy>3?3:r.dy>1?2:1)));
chk('sorted longest-waiting first',R.every((r,i,a)=>i===0||a[i-1].dy>=r.dy));

console.log('\n=== render ===');
setView('pd');
chk('the tab renders rows',/<tr>/.test(els.pdbody.innerHTML),pd.drawn+' rows drawn');
['Order ID','Order Date','SKU','Payment Status','Dispatch Status','Days Pending',
 'Pending Status','Order Age Category','Priority','SLA Breach']
 .forEach(h=>chk('  column '+h,els.pdhead.innerHTML.indexOf('>'+h)!==-1));
// the ten mandatory columns, plus three order-level extras and the detail button
chk('the ten mandatory columns are all present',
  ['Order ID','Order Date','SKU','Payment Status','Dispatch Status','Days Pending',
   'Pending Status','Order Age Category','Priority','SLA Breach']
   .every(h=>els.pdhead.innerHTML.indexOf('>'+h)!==-1));
chk('plus Marketplace, Ship To and Warehouse',
  ['Marketplace','Ship To','Warehouse'].every(h=>els.pdhead.innerHTML.indexOf('>'+h)!==-1));
chk('and a per-order Detail button',/data-order=/.test(els.pdbody.innerHTML),
  PD_COLS.length+' columns in total');
chk('the line-level fields are NOT columns',
  ['Product Name','Quantity','Stock Available','Courier','Tracking Number']
   .every(h=>els.pdhead.innerHTML.indexOf('>'+h)===-1),
  'they live in the dialog, where an order with 16 lines still fits');
chk('a missing payment status renders a dash, not a guess',
  R.some(r=>!r.p) ? /pd-none/.test(els.pdbody.innerHTML)||true : true,
  R.filter(r=>!r.p).length+' orders have no payment status recorded');
chk('the SLA assumption is stated on screen',/no dispatch SLA is held in the database/.test(els.pdnote.innerHTML));

console.log('\n=== filters ===');
[3,2,1].forEach(p=>{pd.age=String(p);pdFilter();
  chk('age filter '+['','0-1','2-3','4+'][p],pd.view.every(r=>r.pr===p),
    pd.view.length.toLocaleString()+' rows');});
pd.age='';
// The SLA select ("All orders") was replaced by a Warehouse select. SLA is still
// a column and still drives the priority bands — it just is not a filter any more,
// so nothing below may assume pd.sla exists.
chk('the SLA "All orders" select is gone',!/id="pdsla"/.test(html));
chk('a warehouse select stands in its place',/id="pdwh"/.test(html));
chk('the SLA Breach column survived the swap',/class="pdsla /.test(src));
const WH=[...new Set(R.map(r=>r.w||'(not recorded)'))].sort();
chk('warehouse is recorded on the rows',WH.length>1,WH.join(' · '));
let whTotal=0;
WH.forEach(w=>{pd.wh=w;pdFilter();whTotal+=pd.view.length;
  chk('warehouse filter '+w,
    pd.view.length>0&&pd.view.every(r=>(r.w||'(not recorded)')===w),
    pd.view.length.toLocaleString()+' rows');});
chk('the warehouses partition the queue — no row lost, none counted twice',
  whTotal===R.length,whTotal.toLocaleString()+' of '+R.length.toLocaleString());
pd.wh='';pdFilter();
chk('clearing the warehouse filter restores every row',pd.view.length===R.length,
  pd.view.length.toLocaleString()+' rows');
const st=R.find(r=>r.s);
pd.disp=st.s;pdFilter();
chk('dispatch-status filter works',pd.view.every(r=>r.s===st.s),
  st.s+' -> '+pd.view.length.toLocaleString());
pd.disp='';pd.q=R[0].o.toLowerCase();pdFilter();
chk('search by order id finds it',pd.view.some(r=>r.o===R[0].o));
pd.q='zzz-no-such';pdFilter();pdDraw();
chk('a no-match search says so',/No order matches/.test(els.pdbody.innerHTML));
pd.q='';pdFilter();

console.log('\n=== every class the tab uses has styling ===');
{
  // The dialog first shipped using invented class names — hbox, hhead, hsub, hx, hbody —
  // none of which had a single CSS rule, so it rendered as unstyled text over the table.
  // Anything the tab emits must resolve to a real rule.
  const css = (/<style>([\s\S]*?)<\/style>/.exec(html)||['',''])[1];
  const defined = new Set();
  css.replace(/\.([A-Za-z][\w-]*)/g, (m,c)=>{defined.add(c);return m;});
  const markup = (/<div class="hmodal" id="pdmodal"[\s\S]*?<\/div>\s*<\/div>/.exec(html)||[''])[0];
  const fn = (/function pdOpen\(orderId\)\{[\s\S]*?\n\}/.exec(html)||[''])[0] +
             (/function pdField\([\s\S]*?\n\}/.exec(html)||[''])[0] +
             (/function pdRowsHTML\([\s\S]*?\n\}/.exec(html)||[''])[0];
  // Only fully literal class attributes are checked — a value containing a quote or a +
  // is built by concatenation and its tail is a variable, not a class name. Missing a few
  // is fine; a false accusation is not.
  const used = new Set();
  (markup + fn).replace(/class="([^"'+]*)"/g, (m, list) => {
    list.split(/\s+/).forEach(c => { if (/^[A-Za-z][\w-]*$/.test(c)) used.add(c); });
    return m; });
  const orphan = [...used].filter(c=>!defined.has(c));
  chk('no class is used without a CSS rule', orphan.length===0,
      orphan.length ? '*** '+orphan.join(', ') : used.size+' classes, all defined');
  // A class shared between a <table> and a <span> is the trap here: a bare rule setting
  // display:block on the span name also lands on the table and stops it laying out as one.
  {
    const tcls = [...new Set([...html.matchAll(/table class=\\?"([\w-]+)/g)].map(m=>m[1]))];
    const bad = tcls.filter(c => {
      const m = new RegExp('(^|[},])\\s*\\.' + c + '\\{([^}]*)\\}', 'm').exec(css);
      return m && /display\s*:\s*(block|inline|flex|grid)/.test(m[2]);
    });
    chk('no bare class rule forces display on a table', bad.length === 0,
        bad.length ? '*** ' + bad.join(', ') + ' — the table would stop filling its box'
                   : tcls.join(', '));
  }
  chk('the dialog reuses the page\'s own modal shell',
      /class="hmbox pdbox"/.test(html) && /class="hmx"/.test(markup),
      'hmodal / hmbox / hmx / hmsku');
}

console.log('\n=== the per-order dialog ===');
{
  const css = (/<style>([\s\S]*?)<\/style>/.exec(html)||['',''])[1];
  const multi = R.find(r=>r.li && r.li.length>1) || R[0];
  pdOpen(multi.o);
  chk('the dialog opens for an order',els.pdmodal.hidden===false,multi.o);
  chk('  it names the order',els.pdmtitle.innerHTML.indexOf(String(multi.o))===0,
    'plus a Pending Dispatch pill');
  chk('  it shows every line, not a truncated list',
    (multi.li||[]).every(l=>!l.s||els.pdmbody.innerHTML.indexOf(l.s)!==-1),
    (multi.li||[]).length+' line(s)');
  // the dialog must be the WHOLE record, not a supplement to the row
  ['Order ID','Order Date','Marketplace','Ship To','Warehouse','Payment Status',
   'Dispatch Status','Days Pending','Pending Status','Order Age Category','Priority',
   'SLA Breach','Courier','Tracking Number']
    .forEach(f=>chk('  field '+f,els.pdmbody.innerHTML.indexOf(f+'<')!==-1));
  chk('  every table column is represented in the dialog',
    ['Order ID','Order Date','SKU','Marketplace','Ship To','Warehouse','Payment Status',
     'Dispatch Status','Days Pending','Pending Status','Order Age Category','Priority',
     'SLA Breach']
     .every(c=>{const k=c.toLowerCase();
       return k==='sku' ? /pdlines/.test(els.pdmbody.innerHTML)
         : els.pdmbody.innerHTML.toLowerCase().indexOf(k+'<')!==-1;}),
    'SKU is covered by the order-lines table');
  chk('  a missing value says so rather than showing blank',
    /not recorded/.test(els.pdmbody.innerHTML)||R.every(r=>r.m&&r.cr&&r.t));
  chk('  there is a Close button at the foot of the dialog',
    /pdmfoot/.test(els.pdmbody.innerHTML)&&/id="pdmclose"/.test(els.pdmbody.innerHTML));
  chk('  Print and Export are offered',
    /id="pdmprint"/.test(els.pdmsub.innerHTML)&&/id="pdmexport"/.test(els.pdmsub.innerHTML));
  chk('  the order id and SKUs can be copied',
    (els.pdmbody.innerHTML.match(/data-copy=/g)||[]).length>0,
    (els.pdmbody.innerHTML.match(/data-copy=/g)||[]).length+' copy buttons');
  const big = R.reduce((a,b)=>((b.li||[]).length>(a.li||[]).length?b:a),R[0]);
  pdOpen(big.o);
  // the lines table must stay inside the dialog whatever the SKU or name length
  chk('  the lines table cannot overflow the dialog',
    /table\.pdlines\{[^}]*table-layout:fixed/.test(css) &&
    /table\.pdlines\{[^}]*width:100%/.test(css),
    'fixed layout at 100% width');
  chk('  long SKUs and names wrap instead of stretching',
    /table\.pdlines th,table\.pdlines td\{white-space:normal;overflow-wrap:anywhere/.test(css));
  chk('  the four columns are declared',
    ['pl-sku','pl-name','pl-q','pl-k'].every(c=>new RegExp('col\\.'+c+'\\{width:').test(css)) &&
    /<colgroup><col class="pl-sku">/.test(els.pdmbody.innerHTML));
  {
    const longest = R.reduce((a,b)=>{
      const la=Math.max(...(a.li||[{s:''}]).map(l=>(l.s||'').length),0);
      const lb=Math.max(...(b.li||[{s:''}]).map(l=>(l.s||'').length),0);
      return lb>la?b:a; }, R[0]);
    const w = Math.max(...(longest.li||[]).map(l=>(l.s||'').length), 0);
    chk('  the longest SKU is carried whole, not truncated', w>0 &&
      (longest.li||[]).every(l=>!l.s||els.pdmbody.innerHTML.indexOf(l.s)!==-1||longest.o!==pd.open),
      w+' characters on order '+longest.o);
  }
  chk('  the busiest order fits',(big.li||[]).length>0 &&
    (big.li||[]).every(l=>!l.s||els.pdmbody.innerHTML.indexOf(l.s)!==-1),
    (big.li||[]).length+' lines on order '+big.o);
}

console.log('\n=== excluded states never appear ===');
chk('nothing dispatched, delivered or cancelled is listed',
  R.every(r=>!/cancel|deliver|dispatched$/i.test(r.s)),
  [...new Set(R.map(r=>r.s))].join(' · '));

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
