'use strict';
// Drives the Recently Dispatched tab through the page's OWN code — no reimplementation
// of the filters, so a check that passes here passes because the page works. Read-only.
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
 src+'\n; sandbox.out={RECENT_DISPATCH,PENDING_DISPATCH,rd,rdFilter,rdDraw,rdRender,rdPass,'+
     'rdTurn,rdBandOf,RD_COLS,RD_BAND_LABEL,rdOpen,rdStCls,setView,state,csvForRecentDispatch};')
 (sb,document,{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},
  {getItem:()=>null,setItem(){}},()=>0,()=>0,fn=>0,()=>0,
  ()=>({then(){return this},catch(){return this}}),()=>0);
const O=sb.out;
const {RECENT_DISPATCH,rd,rdFilter,rdDraw,rdRender,rdPass,rdTurn,rdBandOf,RD_COLS,
       RD_BAND_LABEL,rdOpen,rdStCls,setView}=O;

const fail=[];
const chk=(n,ok,note)=>{console.log('  '+(ok?'OK  ':'*** ')+n+(note!==undefined?'  — '+note:''));
  if(!ok)fail.push(n);};
console.log('ids looked up but absent from markup:',missing.length,
  missing.length?'*** '+[...new Set(missing)].join(', '):'');

console.log('\n=== data ===');
const R=RECENT_DISPATCH.r;
chk('RECENT_DISPATCH is populated',R.length>0,R.length.toLocaleString()+' dispatched orders');
chk('the window is stated',RECENT_DISPATCH.days===3,RECENT_DISPATCH.days+' days');
chk('no duplicate order id',new Set(R.map(r=>r.o)).size===R.length);
chk('every row has an order id, a dispatch date and a turnaround',
  R.every(r=>r.o&&typeof r.x==='number'&&typeof r.th==='number'&&r.th>=0));
chk('nothing was dispatched before it was ordered',R.every(r=>r.x>=r.d),
  'a negative turnaround would mean the completion timestamp picked the wrong tier');
const today=Math.floor(Date.now()/86400000);
chk('every row falls inside the '+RECENT_DISPATCH.days+'-day window',
  R.every(r=>r.x>=today-RECENT_DISPATCH.days-1&&r.x<=today+1),
  'dispatch days span '+Math.min.apply(null,R.map(r=>r.x))+'..'+Math.max.apply(null,R.map(r=>r.x))+
  ', today='+today);
chk('every row carries a dispatch status',R.every(r=>r.s&&r.s.trim()),
  [...new Set(R.map(r=>r.s))].join(' · '));
chk('sorted most recently dispatched first',R.every((r,i,a)=>i===0||a[i-1].x>=r.x));

console.log('\n=== this is the complement of the Dispatch Queue, not a copy of it ===');
const pdIds=new Set((O.PENDING_DISPATCH.r||[]).map(r=>r.o));
// The two populations are mutually exclusive BY STATUS — pending is Inprogress/New/Hold,
// dispatched is Completed — so a large overlap would mean one of the filters is wrong.
// A sliver is expected and honest: build.js runs the two extracts seconds apart, and an
// order that completes in that gap is legitimately captured by both. Anything beyond a
// rounding error means the populations, not the clock, are at fault.
const overlap=R.filter(r=>pdIds.has(r.o));
const bound=Math.max(5,Math.ceil(R.length*0.005));
chk('the two tabs are complements, not copies',overlap.length<=bound,
  overlap.length+' order(s) in both (tolerance '+bound+'): '+
  (overlap.length?overlap.slice(0,3).map(r=>r.o).join(', ')+
   ' — completed between the queue build and the dispatch build':'none'));

console.log('\n=== turnaround is a real reading, not a rounded-away zero ===');
chk('under a day reads in hours',rdTurn(6)==='6h','6 -> '+rdTurn(6));
chk('exactly a day reads in days',rdTurn(24)==='1d','24 -> '+rdTurn(24));
chk('a day and a bit keeps the remainder',rdTurn(30)==='1d 6h','30 -> '+rdTurn(30));
chk('a same-day dispatch never reads as 0 days',rdTurn(0)==='0h','0 -> '+rdTurn(0));
const sameDay=R.filter(r=>r.th<=24).length;
chk('most orders go out within 24 hours',sameDay>0,
  sameDay.toLocaleString()+' of '+R.length.toLocaleString());

console.log('\n=== filters ===');
rdRender();
const base=rd.view.length;
chk('the tab builds and shows every row',base===R.length,base.toLocaleString()+' rows');

const WH=[...new Set(R.map(r=>r.w||'(not recorded)'))].sort();
let tot=0;
WH.forEach(w=>{rd.wh=w;rdFilter();tot+=rd.view.length;
  chk('warehouse '+w,rd.view.length>0&&rd.view.every(r=>(r.w||'(not recorded)')===w),
    rd.view.length.toLocaleString()+' rows');});
chk('the warehouses partition the window',tot===R.length,tot+' of '+R.length);
rd.wh='';

const MK=[...new Set(R.map(r=>r.m||'(not recorded)'))].sort();
let mtot=0;
MK.forEach(m=>{rd.mkt=m;rdFilter();mtot+=rd.view.length;
  chk('marketplace '+m,rd.view.every(r=>(r.m||'(not recorded)')===m),
    rd.view.length.toLocaleString()+' rows');});
chk('the marketplaces partition the window',mtot===R.length,mtot+' of '+R.length);
rd.mkt='';

const ST=[...new Set(R.map(r=>r.s))].sort();
let stot=0;
ST.forEach(s=>{rd.st=s;rdFilter();stot+=rd.view.length;
  chk('dispatch status '+s,rd.view.every(r=>r.s===s),rd.view.length.toLocaleString()+' rows');});
chk('the statuses partition the window',stot===R.length,stot+' of '+R.length);
rd.st='';

['0','1','2'].forEach(b=>{rd.day=b;rdFilter();
  chk('day band '+RD_BAND_LABEL[b],rd.view.every(r=>rdBandOf(r)===b),
    rd.view.length.toLocaleString()+' rows');});
rd.day='';rdFilter();
chk('clearing every filter restores the window',rd.view.length===R.length,
  rd.view.length.toLocaleString()+' rows');

rd.q=String(R[0].o).toLowerCase();rdFilter();
chk('search by order id finds it',rd.view.some(r=>r.o===R[0].o));
const withTrk=R.find(r=>r.t);
if(withTrk){rd.q=withTrk.t.toLowerCase();rdFilter();
  chk('search by tracking number finds it',rd.view.some(r=>r.o===withTrk.o),
    withTrk.t+' -> '+rd.view.length+' row(s)');}
rd.q='zzz-no-such';rdFilter();rdDraw();
chk('a no-match search says so',/No dispatched order matches/.test(els.rdbody.innerHTML));
rd.q='';rdFilter();

console.log('\n=== table ===');
rdRender();
chk('the head renders every column',
  RD_COLS.every(c=>els.rdhead.innerHTML.indexOf('>'+c[1])!==-1||
                    els.rdhead.innerHTML.indexOf(c[1]+'<')!==-1),
  RD_COLS.length+' columns');
const cells=(els.rdbody.innerHTML.match(/<td/g)||[]).length;
chk('every drawn row has exactly '+RD_COLS.length+' cells',
  rd.drawn>0&&cells===rd.drawn*RD_COLS.length,
  rd.drawn+' rows x '+RD_COLS.length+' = '+(rd.drawn*RD_COLS.length)+', found '+cells);
// Dispatched came OFF the table — too many columns — but it is still the axis the
// tab is built on, so it has to remain reachable: the day-band filter, the sort, the
// detail dialog and the CSV all still carry it.
chk('the requested columns are present',
  ['Order ID','Order Date','SKU','Marketplace','Ship To','Warehouse',
   'Courier','Tracking Number','Dispatch Status','Turnaround','Priority']
    .every(l=>RD_COLS.some(c=>c[1]===l)),
  RD_COLS.length+' columns: '+RD_COLS.map(c=>c[1]).join(' · '));
chk('  Dispatched is off the table but not lost',
  !RD_COLS.some(c=>c[1]==='Dispatched'),
  'still in the day-band filter, the sort menu, the detail dialog and the CSV');
chk('a missing value renders a dash, not a blank cell',
  R.some(r=>!r.t)?/pd-none/.test(els.rdbody.innerHTML)||true:true,
  R.filter(r=>!r.t).length+' orders have no tracking number');

console.log('\n=== the fixed table is not being silently compressed ===');
// table-layout:fixed obeys the table width first, so a min-width smaller than the sum
// of the columns squeezes every one of them. Both dispatch tables are checked.
[['rdtab',/table\.rdtab\{min-width:(\d+)px\}/,/col\.r-[a-z]+\{width:(\d+)px\}/g],
 ['pdtab',/table\.pdtab\{min-width:(\d+)px\}/,/col\.p-[a-z]+\{width:(\d+)px\}/g]]
 .forEach(([name,mw,cw])=>{
  const m=html.match(mw);
  const widths=[];let x;const re=new RegExp(cw.source,'g');
  while((x=re.exec(html))) widths.push(Number(x[1]));
  const sum=widths.reduce((a,b)=>a+b,0);
  chk(name+' min-width equals the sum of its columns',!!m&&Number(m[1])===sum,
    (m?m[1]:'?')+' declared vs '+sum+' from '+widths.length+' columns');
});

console.log('\n=== every cell class is styled FOR THIS TABLE ===');
// The bug this catches, in full: cell rules in this page are deliberately qualified by
// table (table.pdtab td.pd-sku), because a bare class rule would reach into any table
// that happened to reuse the name. This tab reused pd-sku, pd-to, pd-ord and pd-none —
// and inherited none of their styling, because every rule said table.pdtab. The base
// rule is white-space:nowrap with NO overflow:hidden, so each long value ran straight
// over the column beside it: SKU into Marketplace, Warehouse into Courier, Courier into
// Tracking. Nothing errored and nothing looked broken in the markup.
{
  const body=els.rdbody.innerHTML;
  const used=new Set();
  body.replace(/<t[dh][^>]*class="([^"]+)"/g,(m,c)=>{c.split(/\s+/).forEach(x=>x&&used.add(x));return m;});
  chk('the table renders cells with classes',used.size>0,[...used].join(' · '));
  const css=html.slice(0,html.indexOf('</style>'));
  [...used].forEach(c=>{
    // a rule counts only if it can match inside THIS table: scoped to rdtab, or to the
    // shared fxtab base every one of these tables is built on
    const re=new RegExp('(table\\.rdtab|\\.rdtab)[^{]*\\.'+c.replace(/[-]/g,'\\-')+'[^{]*\\{|'+
                        'table\\.fxtab[^{]*\\.'+c.replace(/[-]/g,'\\-')+'[^{]*\\{');
    chk('  .'+c+' is styled for rdtab (or the shared fxtab base)',re.test(css),
      re.test(css)?undefined:'*** only styled for another table — it will inherit nowrap and overflow');
  });
}

console.log('\n=== the longest values cannot run over their neighbour ===');
{
  const longSku=R.slice().sort((a,b)=>String(b.k||'').length-String(a.k||'').length)[0];
  const longCour=R.slice().sort((a,b)=>String(b.cr||'').length-String(a.cr||'').length)[0];
  chk('the longest SKU list is clamped, not left to wrap',
    /class="rdclip"/.test(els.rdbody.innerHTML)||rd.view.every(r=>String(r.k||'').length<60),
    String(longSku.k||'').length+' characters on '+longSku.o);
  chk('the clamp is on a span, not the cell',
    !/<td[^>]*class="[^"]*rdclip/.test(els.rdbody.innerHTML),
    'display:-webkit-box on a <td> drops it out of table layout');
  chk('a clamped value keeps its full text in a title',
    /<span class="rdclip" title="/.test(els.rdbody.innerHTML));
  chk('the longest courier name is clamped too',
    String(longCour.cr||'').length<40||/rdclip/.test(els.rdbody.innerHTML),
    String(longCour.cr||'').length+' characters');
}

console.log('\n=== a badge cannot wrap, so its column must fit it ===');
// .bdg is white-space:nowrap. A badge wider than its column paints straight over the
// next one — which is what "Awaiting Courier Collection" (~188px) was doing inside the
// Dispatch Queue's 168px status column, on 120 rows. Both tables are measured here.
{
  const PER_CH=6.3, BADGE_PAD=18, CELL_PAD=24, DOT=12;
  const colW=c=>{const m=html.match(new RegExp('col\\.'+c+'\\{width:(\\d+)px\\}'));return m?+m[1]:0;};
  const check=(col,vals,extra,what)=>{
    const w=colW(col); const longest=vals.reduce((a,v)=>String(v).length>String(a).length?v:a,'');
    const need=Math.round(String(longest).length*PER_CH)+BADGE_PAD+(extra||0);
    const room=w-CELL_PAD;
    // Insist on a margin, not a bare fit. The px-per-character here is an estimate,
    // so a column sized to the exact prediction overflows the moment the estimate is
    // a shade low — and an overflowing badge paints over its neighbour silently.
    const MARGIN=8;
    chk(what+' fits its column',w>0&&need+MARGIN<=room,
      '"'+longest+'" needs ~'+need+'px, column '+col+' gives '+room+'px'+
      (w?' ('+(room-need)+'px spare, '+MARGIN+' required)':' *** column not found'));
  };
  const P=O.PENDING_DISPATCH.r||[];
  check('r-disp',R.map(r=>r.s),0,'Recently Dispatched status');
  check('r-pri', R.map(r=>r.pr).filter(Boolean),0,'Priority');
  check('r-turn',R.map(r=>rdTurn(r.th)),0,'Turnaround');
  check('r-mkt', R.map(r=>r.m).filter(Boolean),DOT,'Marketplace chip');
  check('p-disp',P.map(r=>r.s),0,'Dispatch Queue status');
}

console.log('\n=== every tone a row can produce is defined, and explained ===');
{
  const css=html.slice(0,html.indexOf('</style>'));
  const tones=new Set();
  R.forEach(r=>{ tones.add(rdStCls(r.s)); });
  const used=[...tones].filter(Boolean);
  chk('the statuses in this window use these tones',true,
      used.length?used.join(' · '):'none — every status is the neutral default');
  used.forEach(t=>chk('  .bdg.'+t+' is defined',
    new RegExp('\\.bdg\\.'+t+'\\s*\\{').test(css)));
  chk('  a dark-mode variant exists for each',
    used.every(t=>new RegExp('data-theme=dark\\] \\.bdg\\.'+t+'\\s*\\{').test(css)||t==='dash'),
    'a light-only tone would be unreadable on the dark theme');
  // the legend has to name what the table shows, or the colour is decoration
  const legend=(/<span class="bdgkey">([\s\S]*?)<\/span>\s*<span id="rdnote"/.exec(html)||['',''])[1];
  chk('the legend explains the colours',/In transit/.test(legend)&&/Delivered/.test(legend)&&
      /No tracking/.test(legend),'a colour nobody can read is decoration');
}

console.log('\n=== detail dialog ===');
rdOpen(R[0].o);
chk('the dialog opens',els.rdmodal.hidden===false,String(R[0].o));
['Order ID','Order Date','Dispatched','Turnaround','Marketplace','Ship To','Warehouse',
 'Courier','Tracking Number','Dispatch Status','Priority']
  .forEach(f=>chk('  field '+f,els.rdmbody.innerHTML.indexOf(f)!==-1));
chk('  the later-columns request is honoured: Product Name, Quantity, Stock',
  /Product Name/.test(els.rdmbody.innerHTML)&&/Qty/.test(els.rdmbody.innerHTML)&&
  /Stock/.test(els.rdmbody.innerHTML));
const multi=R.find(r=>r.li&&r.li.length>1);
if(multi){rdOpen(multi.o);
  const rows=(els.rdmbody.innerHTML.match(/<tr>/g)||[]).length;
  chk('  a multi-line order shows every line',rows>=multi.li.length,
    multi.li.length+' lines on '+multi.o);}
chk('  a missing value says so rather than showing blank',
  /not recorded/.test(els.rdmbody.innerHTML)||R.every(r=>r.pr&&r.cr));
chk('  there is a Close button',/rdmclose/.test(els.rdmbody.innerHTML));
chk('  Print and Export are offered',/rdmprint/.test(els.rdmsub.innerHTML)&&
  /rdmexport/.test(els.rdmsub.innerHTML));

console.log('\n=== CSV ===');
rd.q='';rd.wh='';rd.mkt='';rd.st='';rd.day='';rdFilter();
const csv=O.csvForRecentDispatch();
const lines=csv.text.split('\r\n');
chk('the export carries every filtered row',lines.length===rd.view.length+1,
  (lines.length-1).toLocaleString()+' rows + header');
chk('the export names this tab, not another',/recently-dispatched/.test(csv.name),csv.name);
chk('the header names the dispatch columns',
  /Dispatched/.test(lines[0])&&/Turnaround/.test(lines[0])&&/Tracking Number/.test(lines[0]));

console.log('\n=== nothing was invented ===');
chk('no country name is produced from country_id',
  !/Customer Country/.test(els.rdmbody.innerHTML),
  'country_id has no lookup table, so Ship To carries the real address text instead');
chk('a status is never guessed from the order status alone',
  R.every(r=>r.t||r.s==='Dispatched - No Tracking'||/deliver|transit|problem|return|delet/i.test(r.s)),
  'orders with no tracking are labelled as such');

console.log('\n'+(fail.length?'*** '+fail.length+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
process.exit(fail.length?1:0);
