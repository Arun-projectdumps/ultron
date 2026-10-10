/** Subsequence match: every char of `q` appears in order in `s`. Returns a score (higher is better) or -1. */
function subseq(q: string, s: string): number {
  let si = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const found = s.indexOf(ch, si);
    if (found < 0) return -1;
    streak = found === si ? streak + 1 : 0;
    score += 1 + streak * 2 - Math.min(found - si, 10) * 0.1;
    si = found + 1;
  }
  return score;
}

/** Each whitespace-separated term must match title, category or body. */
export function fuzzyScore(query: string, fields: { title: string; category: string; body: string }): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  const title = fields.title.toLowerCase();
  const cat = fields.category.toLowerCase();
  const body = fields.body.toLowerCase();
  let total = 0;
  for (const t of terms) {
    let best = -1;
    if (title.includes(t)) best = 100 + (title.startsWith(t) ? 20 : 0);
    else if (cat.includes(t)) best = 80;
    else if (body.includes(t)) best = 50;
    else best = Math.max(subseq(t, title) * 2, subseq(t, cat) * 1.5, subseq(t, body) * 0.5);
    if (best < 0) return -1;
    total += best;
  }
  return total;
}
