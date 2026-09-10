// The Price Comment column carries a full sentence — "Combined with Chrome Vintage
// Ceiling Rose (CRSF100CH)" — which is far more than a column of its importance can
// show. The published page clips it to one line with an ellipsis; this reduces it to
// the one word that says WHICH KIND of listing it is, and puts the sentence itself in
// a dialog behind a click, the way that page puts the comment behind its own `.cmb`.
//
// VERIFIED AGAINST THE WHOLE CATALOGUE, not a sample: all 6,181 comments across the
// twelve categories fall into exactly these four, none into the fallback. The order of
// the tests matters — "Standalone — no extra item — not on LEDSone, Voltacon" carries
// both a Standalone prefix and a "not on" clause, and the prefix is the truth of it.
export function commentLabel(pc) {
  if (!pc) return null;
  if (/^Combined with/i.test(pc)) return 'Combined';
  if (/^Sold as/i.test(pc))       return 'Pack';
  if (/^Standalone/i.test(pc))    return 'Standalone';
  if (/not listed/i.test(pc))     return 'Unlisted';
  return 'Note';
}

// Combined is the one worth noticing — it means this SKU's price is tied to another
// listing — so it carries the accent. The rest are stated, not flagged.
const TONE = { Combined: 'jo', Pack: 'pk', Standalone: 'sa', Unlisted: 'un', Note: 'sa' };
export function commentTone(label) { return TONE[label] || 'sa'; }
