// A SKU's stock is the sum of EVERY warehouse column — that is the number a
// picker acts on, and what the header alerts count and filter by. Getting this
// wrong (summing only the UK columns) changes both alert counts.
export const STOCK_KEYS = ['a', 'b', 'c', 'u5', 'k', 'm', 'ca', 'us'];
export const stockTotal = r =>
  STOCK_KEYS.reduce((t, k) => t + (typeof r[k] === 'number' ? r[k] : 0), 0);
export const stockLevel = r => {
  const t = stockTotal(r);
  return t <= 0 ? 'out' : (t <= 10 ? 'low' : 'ok');
};
