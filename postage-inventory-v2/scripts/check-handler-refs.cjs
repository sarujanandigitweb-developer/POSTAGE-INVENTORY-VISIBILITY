// Every bare identifier a JSX handler references must be DEFINED in the same file or
// imported into it. `next build` does not catch this — an undefined reference inside a
// component body is a runtime error, and the component only runs when its tab is opened,
// so a page that answers HTTP 200 can still be broken.
const fs = require('fs'), path = require('path');
const dir = 'components';
const GLOBALS = new Set(['window','document','console','Math','JSON','Date','Number','String',
  'Boolean','Array','Object','Set','Map','navigator','URL','URLSearchParams','Intl','undefined',
  'null','true','false','fetch','setTimeout','clearTimeout','AbortSignal','Blob','Promise','isFinite']);
let bad = 0, checked = 0;
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.jsx'))) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  // names this file defines or imports
  const defined = new Set([...GLOBALS]);
  for (const re of [
    /\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g,
    /\bimport\s+([A-Za-z_$][\w$]*)\s+from/g,
    /\bimport\s*\{([^}]*)\}/g,
    /const\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\]/g,
    /\bfunction\s+\w+\s*\(([^)]*)\)/g,
    /\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/g,
  ]) { let m; while ((m = re.exec(src))) for (const g of m.slice(1))
         if (g) g.split(/[,\s]+/).forEach(n => n && defined.add(n.replace(/\s|as.*/g,''))); }
  // bare identifiers passed straight to a handler prop
  const used = [...src.matchAll(/\bon[A-Z]\w*=\{([A-Za-z_$][\w$]*)\}/g)].map(m => m[1]);
  checked++;
  for (const n of new Set(used)) {
    if (!defined.has(n)) { console.log('  *** ' + f + ': handler references undefined `' + n + '`'); bad++; }
  }
}
console.log(bad ? `\n*** ${bad} undefined handler reference(s) across ${checked} components`
                : `all handler references are defined — ${checked} components checked`);
process.exit(bad ? 1 : 0);
