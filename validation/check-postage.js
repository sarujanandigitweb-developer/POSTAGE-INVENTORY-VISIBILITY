'use strict';
// POSTAGE INFORMATION comes live from a Google Sheet — two tabs of the workbook, fetched
// as CSV at view time. Nothing about it is embedded in the page, so the thing worth
// checking is the MAPPING: that each tab's real rows and columns are found, that the
// notes people type below and beside the tables are ignored, that the sheet's own
// headers are used verbatim, and that search still matches the columns that exist.
//
// It drives the page's own pgClip/pgParseCSV/pgTrim/pgAnalyse/pgMatches. Read-only.
// Drive the PAGE'S OWN postage code against the two live CSVs, exactly as the browser
// will. Nothing is reimplemented here.
const fs=require('fs'), path=require('path');
const ROOT=path.resolve(__dirname,'..');
const S=path.join(ROOT,'validation');
const html=fs.readFileSync(process.env.DASHBOARD||
  path.join(ROOT,'dashboard','inventory-dashboard.html'),'utf8');
// The two tabs as they stood when this was mapped. Fixtures, so the check is about the
// PAGE's parsing and not about the network or today's edits to the sheet — but see the
// last section: the live tabs are still reachable, and a shape change there should be
// noticed rather than silently absorbed.
const FIX={ '33893969':'fixture-postage-prices.csv',
            '1953526121':'fixture-international-prices.csv',
            '1966712240':'fixture-legacy-workbook.csv' };
const above=html.slice(0,html.indexOf('<script>'));const IDS=new Set();
above.replace(/id="([^"]+)"/g,(m,i)=>{IDS.add(i);return m;});
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
const src=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
const sb={console,out:null};
new Function('sandbox','document','window','localStorage','setInterval','clearInterval',
             'setTimeout','clearTimeout','fetch','alert',
 src+'\n; sandbox.out={PG_TABS,PG_BOOKS,pgUrl,pgEdit,pgClip,pgParseCSV,pgTrim,pgSplitSections,pgAnalyse,pgMatches,pgCells,pg,PG_NUM};')
 (sb,document,{addEventListener(){},matchMedia:()=>({matches:false,addEventListener(){}})},
  {getItem:()=>null,setItem(){}},()=>0,()=>0,fn=>0,()=>0,
  ()=>({then(){return this},catch(){return this}}),()=>0);
const O=sb.out;

let fail=0;
const chk=(n,ok,note)=>{console.log('  '+(ok?'OK  ':'*** ')+n+(note!==undefined?'  — '+note:'')); if(!ok)fail++;};

console.log('=== the workbook and its tabs ===');
chk('both workbooks are configured',
  !!O.PG_BOOKS && !!O.PG_BOOKS.live && !!O.PG_BOOKS.legacy,
  'live ' + String(O.PG_BOOKS.live).slice(0,12) + '… · legacy ' + String(O.PG_BOOKS.legacy).slice(0,12) + '…');
chk('the export URL is the direct-fetch CSV endpoint',
  /\/export\?format=csv&gid=33893969$/.test(O.pgUrl('33893969','live')),O.pgUrl('33893969','live'));
chk('each entry points at a workbook',O.PG_TABS.every(t=>O.PG_BOOKS[t.book]),
  O.PG_TABS.map(t=>(t.title||t.take.join('/'))+' <- '+t.book).join('  ·  '));

const secs=[];
O.PG_TABS.forEach(tab=>{
  const rows=O.pgParseCSV(fs.readFileSync(path.join(S,FIX[tab.gid]),'utf8'));
  if(!tab.take){ secs.push({title:tab.title,gid:tab.gid,rows:O.pgTrim(O.pgClip(rows,tab))}); return; }
  const found=O.pgSplitSections(rows);
  tab.take.forEach(want=>{
    const f=found.find(x=>x.title.toLowerCase()===want.toLowerCase());
    secs.push({title:want,gid:tab.gid,rows:f?f.rows:[],missing:!f});
  });
});
O.pg.secs=secs;

console.log('\n=== the tables that exist only in the original workbook ===');
['postage Dimensions','Contact Details','Box Sizes','Box Purchase History'].forEach(want=>{
  const s=secs.find(x=>x.title===want);
  chk(want+' was found and carried over',!!s&&!s.missing&&s.rows.length>0,
    s?s.rows.length+' rows':'*** missing');
});
chk('the legacy copies of the two price tables are NOT taken',
  O.PG_TABS.filter(t=>t.take).every(t=>t.take.every(n=>!/prices$/i.test(n))),
  'the legacy tab still holds its own postage/international prices; taking them too ' +
  'would list every price twice from two sources that can disagree');
chk('no section appears twice',
  new Set(secs.map(x=>x.title.toLowerCase())).size===secs.length,
  secs.length+' sections: '+secs.map(x=>x.title).join(' · '));

secs.slice(0,2).forEach((sec,n)=>{
  console.log('\n=== '+sec.title+' ===');
  const a=O.pgAnalyse(sec);
  const body=[];a.groups.forEach(g=>g.rows.forEach(r=>body.push(r)));
  console.log('  header rows : '+a.head.length+'   columns: '+a.width+'   groups: '+a.groups.length);
  console.log('  headers     : '+a.head.map(hr=>O.pgCells(hr).join(' | ')).join('   //   ').slice(0,150));
  console.log('  groups      : '+a.groups.map(g=>g.title||'(none)').join(' · ').slice(0,160));
  console.log('  data rows   : '+body.length);
  chk('the section has rows',body.length>0,body.length+' rows');
  chk('a header was identified',a.head.length>0,a.head.length+' header row(s)');
  // the headers must be the SHEET'S OWN, untouched
  const first=O.pgCells(a.head[0]);
  if(n===0) chk('the sheet’s own header is used verbatim',
    first.join(',')==='carrier_name,WEIGHT,Price(Excluded VAT),VAT,Price(Included VAT)',first.join(' | '));
  if(n===0) chk('only columns A-E are carried',a.width<=5,a.width+' columns');
  // nothing from the notes below the table
  const flat=body.map(r=>O.pgCells(r).join(' ')).join(' | ');
  ['120 X 60 X 45','100 X 60 X 60','61 X 46 X 46','3.91   4.69'].forEach(junk=>{
    if(n===0) chk('  the scratch note "'+junk+'" is not shown',flat.indexOf(junk)===-1);
  });
  if(n===1){
    chk('the last real row survived the clip',/Extra Compensation/.test(flat),
      'its label sits at column 28 with an empty column A');
    ['EVRI 6.75','ROYAL MAIL 23.4','UPS 47'].forEach(j=>
      chk('  the carrier note "'+j+'" is not shown',flat.indexOf(j)===-1));
  }
});

console.log('\n=== search works against the real columns ===');
[[0,'evri','a carrier in Postage Prices'],
 [0,'2kg','a weight'],
 [0,'5.46','a price'],
 [1,'germany','a country in International Prices'],
 [1,'iceland','a country far down the table']].forEach(([n,q,what])=>{
  const sec=secs[n], a=O.pgAnalyse(sec);
  let hits=0; a.groups.forEach(g=>g.rows.forEach(r=>{ if(O.pgMatches(r,q,null)) hits++; }));
  chk('search "'+q+'" in '+sec.title,hits>0,hits+' row(s) — '+what);
});
{
  const sec=secs[0],a=O.pgAnalyse(sec);
  let hits=0;a.groups.forEach(g=>g.rows.forEach(r=>{if(O.pgMatches(r,'zzzznothing',null))hits++;}));
  chk('a search that matches nothing returns nothing',hits===0);
}

// ---- optional: is the LIVE sheet still shaped the way it was mapped? ---------
// Off by default. The 2-hourly pipeline runs validators against a temp file and must
// never fail on a network blip, so this needs POSTAGE_LIVE=1 to run:
//     POSTAGE_LIVE=1 node validation/check-postage.js
// To re-capture the fixtures after a deliberate sheet change:
//     curl -sL "<the pgUrl printed above>" -o validation/fixture-<name>.csv
if (process.env.POSTAGE_LIVE === '1') {
  console.log('\n=== the live tabs, compared with the fixtures ===');
  const https = require('https');
  const get = url => new Promise((res, rej) => {
    https.get(url, r => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location)
        return get(r.headers.location).then(res, rej);
      if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode));
      let b = ''; r.on('data', d => b += d); r.on('end', () => res(b));
    }).on('error', rej);
  });
  // each entry must be fetched from ITS OWN workbook — the legacy gid does not exist
  // in the current one, and asking for it there is an HTTP 400
  Promise.all(O.PG_TABS.map(tab => get(O.pgUrl(tab.gid, tab.book))
    .then(csv => {
      const rows = O.pgParseCSV(csv);
      if (!tab.take) return [{ title: tab.title, rows: O.pgTrim(O.pgClip(rows, tab)) }];
      const found = O.pgSplitSections(rows);
      return tab.take.map(want => {
        const f = found.find(x => x.title.toLowerCase() === want.toLowerCase());
        return { title: want, rows: f ? f.rows : [] };
      });
    })))
    .then(chunks => {
      const live = chunks.reduce((a, b) => a.concat(b), []);
      live.forEach(L => {
        const was = (secs.find(s => s.title === L.title) || { rows: [] }).rows.length;
        const now = L.rows.length;
        chk('live "' + L.title + '" still parses to about the same size',
          now > 0 && Math.abs(now - was) <= Math.max(5, was * 0.25),
          now + ' rows live vs ' + was + ' in the fixture');
      });
      console.log('\n' + (fail ? '*** ' + fail + ' CHECK(S) FAILED' : 'ALL CHECKS PASSED (live)'));
      process.exit(fail ? 1 : 0);
    })
    .catch(e => { console.log('  -- live check skipped: ' + e.message); process.exit(fail ? 1 : 0); });
} else {
  console.log('\n'+(fail?'*** '+fail+' CHECK(S) FAILED':'ALL CHECKS PASSED'));
  process.exit(fail?1:0);
}
