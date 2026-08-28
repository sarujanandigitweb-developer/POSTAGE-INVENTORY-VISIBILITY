'use strict';
// Proves a refresh changed ONLY the generated data blocks and the freshness stamp.
//
// Every data block is masked out of both files, then the remainder — all the markup,
// CSS, classification rules, parser, renderers and event wiring — is compared byte for
// byte. If that remainder differs, the refresh touched logic it must not touch.
//
//   node validation/diff-dashboard.js <before.html> [after.html]
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const BEFORE = process.argv[2];
const AFTER = process.argv[3] || path.join(ROOT, 'dashboard', 'inventory-dashboard.html');
if (!BEFORE){ console.error('usage: diff-dashboard.js <before.html> [after.html]'); process.exit(2); }

const ARRAYS = ['DATA','LS_DATA','LS_EXTRA','PH_DATA','WA_DATA','LB_DATA','LB_EXTRA',
                'LH_DATA','LH_EXTRA','SPR_DATA','LGT_DATA','CSM_DATA','CLO_DATA',
                'HAP_DATA','RFB_DATA','INC_CONTAINER','INC_STAGE'];
const OBJECTS = ['WH5_STOCK','LAST_CONTAINER','HIST_RAW','RECEIVED','SHOPIFY_PRICE',
                 'SHOPIFY_ALT','SHOPIFY_COMMENT','INCOMING'];

function grab(src, name, open){
  const close = open === '[' ? ']' : '}';
  const re = new RegExp('const ' + name + '\\s*=\\s*\\' + open);
  const a = src.search(re);
  if (a < 0) return null;
  const s = src.indexOf(open, a);
  let d = 0;
  for (let p = s; p < src.length; p++){
    if (src[p] === open) d++;
    else if (src[p] === close){ d--; if (!d) return src.slice(s, p + 1); }
  }
  return null;
}

const A = fs.readFileSync(BEFORE, 'utf8');
const B = fs.readFileSync(AFTER, 'utf8');
console.log('before :', BEFORE, '(' + A.length.toLocaleString() + ' chars)');
console.log('after  :', AFTER, '(' + B.length.toLocaleString() + ' chars)');
console.log('\nblock                 before        after   status');

let a2 = A, b2 = B, changed = 0;
[[ARRAYS, '['], [OBJECTS, '{']].forEach(([list, open]) => {
  list.forEach(n => {
    const ga = grab(A, n, open), gb = grab(B, n, open);
    if (ga === null || gb === null){ console.log('  ' + n.padEnd(18) + '   *** not found'); return; }
    const same = ga === gb;
    if (!same) changed++;
    console.log('  ' + n.padEnd(18) + String(ga.length).padStart(9) +
                String(gb.length).padStart(13) + '   ' + (same ? 'unchanged' : 'regenerated'));
    a2 = a2.replace(ga, '<<' + n + '>>');
    b2 = b2.replace(gb, '<<' + n + '>>');
  });
});

const sa = (/const DATA_AS_OF = '([^']*)'/.exec(A) || [])[1];
const sb = (/const DATA_AS_OF = '([^']*)'/.exec(B) || [])[1];
console.log('\n  DATA_AS_OF        ' + sa + '  ->  ' + sb);
a2 = a2.replace(/const DATA_AS_OF = '[^']*';/, '<<STAMP>>');
b2 = b2.replace(/const DATA_AS_OF = '[^']*';/, '<<STAMP>>');

const clean = a2 === b2;
console.log('\n  blocks regenerated                    : ' + changed);
console.log('  EVERYTHING ELSE byte-identical        : ' + (clean ? 'YES' : '*** NO'));
if (!clean){
  for (let i = 0; i < Math.max(a2.length, b2.length); i++){
    if (a2[i] !== b2[i]){
      console.log('  first difference at char ' + i + ':');
      console.log('    before: ' + JSON.stringify(a2.slice(Math.max(0, i - 70), i + 70)));
      console.log('    after : ' + JSON.stringify(b2.slice(Math.max(0, i - 70), i + 70)));
      break;
    }
  }
}
process.exit(clean ? 0 : 1);
