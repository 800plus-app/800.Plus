/* לכל מילה שקיימת במאגר הישן ואינה בחדש — מה הקרוב לה בחדש, ובכמה.
 *
 * המטרה אינה להכריע אלא **להביא ראיה** לכל שורה, כדי שההכרעה "לא שווה כי כבר יש
 * דומה" תישען על משהו ולא על תחושה. שתי ראיות נפרדות:
 *   1. **משפחה לשונית** — מילה בחדש שחולקת את שלושת העצורים הראשונים אחרי הסרת
 *      אותיות שימוש ואמות קריאה. `הסמיך` ו-`סמך` הם אותה משפחה.
 *   2. **חפיפת פירוש** — כמה ממילות התוכן של הפירוש הישן מופיעות בפירוש של מילה
 *      כלשהי בחדש. פירוש שחופף ב-60% ומעלה פירושו שהמשמעות כבר מכוסה.
 *
 * ⚠ שתי הראיות נפרדות בכוונה. משפחה לשונית **אינה** אותה משמעות (`ספר` מול
 * `סיפר`), וחפיפת פירוש אינה אותה מילה. הסיווג נשען עליהן יחד ולא על אחת.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '')
  .replace(/["'׳״]/g, '').replace(/[־‐-―]/g, ' ').replace(/\s+/g, ' ').trim();
const fin = s => s.replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ').replace(/ף/g, 'פ').replace(/ץ/g, 'צ');
const PRE = ['כשה', 'שה', 'וה', 'לה', 'מה', 'בה', 'כה', 'ה', 'ו', 'ב', 'ל', 'כ', 'מ', 'ש'];
const shed = w => { for (const p of PRE) if (w.startsWith(p) && w.length - p.length >= 3) return w.slice(p.length); return w; };
/* שלושת העצורים הראשונים = חתימת משפחה */
const sig = w => { const s = fin(shed(norm(w).split(' ')[0])).replace(/[אוהי]/g, ''); return s.slice(0, 3); };

const STOP = new Set(('של את על מן אל עם או גם לא אין יש כל מי מה זה זו הוא היא הם בין לפי כמו ' +
  'אחרי לפני בתוך בלי מאוד רק כבר עוד היה הייתה היו להיות אדם דבר משהו מישהו כדי בדרך ' +
  'בעיקר למשל וכן וגם אך אבל כן').split(' '));
const words = g => norm(g).split(/[\s,;:()\/]+/).filter(x => x.length >= 2 && !STOP.has(x));

/* המאגר החדש */
const nrows = fs.readFileSync('C:/Users/03hag/Claude projects/800+/units_output/gloss-phase/gloss-status.tsv',
  'utf8').split(/\r?\n/).slice(1).filter(Boolean).map(l => l.split('\t'));
/* פירושי החדש מקובצי היחידות */
const gloss = new Map();
for (let u = 1; u <= 10; u++) {
  const f = `C:/Users/03hag/Claude projects/800+/units_output/${u === 1 ? 'unit-1-flat' : 'unit-' + u + '-hebrew'}.md`;
  if (!fs.existsSync(f)) continue;
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(l => {
    const m = l.match(/^\|\s*\d+\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/);
    if (m) { const k = norm(m[1]); if (k && !gloss.has(k)) gloss.set(k, m[2]); }
  });
}
const nb = nrows.map(r => ({ term: r[3], unit: r[0], root: r[4], sig: sig(r[3]), gl: gloss.get(norm(r[3])) || '' }));
const bySig = new Map();
nb.forEach(x => { if (!bySig.has(x.sig)) bySig.set(x.sig, []); bySig.get(x.sig).push(x); });

/* המילים החסרות */
const miss = fs.readFileSync('missing-from-new.tsv', 'utf8').split(/\r?\n/)
  .filter(Boolean).map(l => l.split('\t'));

const out = [];
for (const [term, unit, gl] of miss) {
  const s = sig(term);
  const family = (bySig.get(s) || []).slice(0, 3);
  /* חפיפת פירוש: מול כל המאגר החדש, הטוב ביותר */
  const ow = words(gl);
  let best = null, bestScore = 0;
  if (ow.length) for (const x of nb) {
    if (!x.gl) continue;
    const xw = new Set(words(x.gl));
    const hit = ow.filter(w => xw.has(w)).length;
    const sc = hit / ow.length;
    if (sc > bestScore) { bestScore = sc; best = x; }
  }
  out.push({
    term, unit, gl,
    family: family.map(f => f.term).join(' · '),
    familyN: (bySig.get(s) || []).length,
    near: best ? best.term : '', nearGl: best ? best.gl : '',
    overlap: Math.round(bestScore * 100),
  });
}

/* חלוקה לשלוש קבוצות, על סמך שתי הראיות */
const bucket = r => {
  if (r.overlap >= 60 && r.familyN) return 'לא שווה';
  if (r.overlap >= 60 || r.familyN) return 'אולי';
  return 'שווה';
};
out.forEach(r => r.bucket = bucket(r));
const tally = {};
out.forEach(r => tally[r.bucket] = (tally[r.bucket] || 0) + 1);

fs.writeFileSync('gap-analysis.tsv',
  'מילה\tיחידה בישן\tפירוש\tקבוצה מכנית\tחפיפת פירוש %\tהקרוב בחדש\tפירושו\tמשפחה בחדש\n' +
  out.map(r => [r.term, r.unit, r.gl, r.bucket, r.overlap, r.near, r.nearGl, r.family].join('\t')).join('\n') + '\n',
  'utf8');
console.log('='.repeat(58));
console.log(`${miss.length} מילים בישן שאינן בחדש`);
Object.entries(tally).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
console.log('='.repeat(58));
console.log('⚠ זו חלוקה מכנית בלבד. ההכרעה נעשית בקריאה, על הראיות שבטבלה.');
out.filter(r => r.bucket === 'לא שווה').slice(0, 5).forEach(r =>
  console.log(`  [לא שווה] ${r.term} (${r.gl}) ← ${r.near} (${r.nearGl}) · ${r.overlap}%`));
