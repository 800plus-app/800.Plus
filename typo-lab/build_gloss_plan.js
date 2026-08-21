'use strict';
/* בונה תוכנית תיקוני פירוש אחת משלושה מקורות, ומעביר אותה בשער.
 *
 * ⛔ הכשל שהכלי הזה קיים בשבילו (19.8.2026): החלתי את שני קובצי ההצעות באותו
 * קוד, בהנחה ששניהם באותו פורמט. הם לא. ב-gloss-fixes עמודת «ההצעה» מכילה את
 * **הפירוש החדש**; ב-gloss-audit היא מכילה **מה לעשות** (`להסיר ניקוד`), ולכן
 * המילה lie קיבלה את הפירוש "להסיר ניקוד". 4 בדיקות האדימו לפני הקומיט.
 *
 * לכן: כל מקור נקרא בכללים שלו, ואף פירוש חדש אינו נכתב בלי לעבור את השער.
 *
 *   node typo-lab/build_gloss_plan.js            → out/gloss-plan.tsv
 *   node typo-lab/build_gloss_plan.js --selftest → מוכיח שהשער נושך
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'typo-lab/out');

const NIQQUD = /[֑-ׇ]/g;
const stripNiqqud = s => s.replace(NIQQUD, '');

/* ===== השער ===== */
/* מילות פתיחה של הוראה. אלה שהופיעו בפועל בעמודת «ההצעה» של gloss-audit.
   ⛔ בלי `\b` — הוא מוגדר על תווי ASCII, ואחרי אות עברית אין גבול-מילה.
   זו בדיוק השגיאה שהכשילה את הגלאי שכתבתי ב-19.8, וה-selftest תפס אותה כאן שוב
   לפני שנגעתי במאגר. העוגן הוא רווח, נקודתיים, סוף מחרוזת או פיסוק. */
/* ⚠ ביטויים שלמים, לא פעלים בודדים. הגרסה הראשונה חסמה `למחוק` — שהוא הפירוש
   האמיתי של delete — ולכן סירבה לכתוב. פועל בודד הוא פירוש לגיטימי; "להסיר
   ניקוד" אינו פירוש של שום מילה. */
const INSTRUCTION = /^(להסיר ניקוד|להחליף במילה|להצר ל|להוסיף מובן|לפצל ל|למחוק ערך|לאחד עם)(?=$|[\s:,.·])/;

function gateOne(row) {
  const bad = m => ({ ok: false, why: m });
  if (!row.term) return bad('אין מילה');
  if (!row.to || !row.to.trim()) return bad('הפירוש החדש ריק');
  if (INSTRUCTION.test(row.to.trim())) return bad('הפירוש החדש הוא הוראה: "' + row.to + '"');
  if (row.to.includes('—')) return bad('מקף ארוך בפירוש');
  if (row.to === row.from) return bad('אין שינוי');
  if (/^\s|\s$/.test(row.to)) return bad('רווח בקצה');
  if (/\t/.test(row.to)) return bad('טאב בתוך הפירוש');
  return { ok: true };
}

/* ===== קריאת המאגר ===== */
function readBank() {
  const w = {};
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'data-en.js'), 'utf8'), { window: w });
  const cur = new Map();
  for (const u of Object.keys(w.UNIT_DATA_EN))
    for (const p of w.UNIT_DATA_EN[u]) cur.set(p[0], { gloss: p[1], unit: u });
  return cur;
}

function tsv(file) {
  const lines = fs.readFileSync(path.join(OUT, file), 'utf8').split(/\r?\n/).filter(Boolean);
  const head = lines.shift().split('\t');
  return lines.map(l => { const c = l.split('\t'); const o = {}; head.forEach((h, i) => o[h] = c[i]); return o; });
}

/* ===== המקורות ===== */
function build(cur) {
  const plan = [], skipped = [];
  const push = (term, to, src, why) => {
    const c = cur.get(term);
    if (!c) { skipped.push({ term, src, why: 'לא נמצא במאגר' }); return; }
    const row = { term, from: c.gloss, to, unit: c.unit, src, why };
    const g = gateOne(row);
    if (!g.ok) { skipped.push({ term, src, why: g.why }); return; }
    plan.push(row);
  };

  /* מקור 1 · gloss-fixes · עמודת «ההצעה» היא הפירוש החדש עצמו */
  for (const r of tsv('gloss-fixes.tsv')) {
    if ((r['מי צריך להשתנות'] || '').trim() !== 'פירוש') continue;
    push((r['מילה'] || '').trim(), (r['ההצעה'] || '').trim(), 'gloss-fixes', r['למה'] || '');
  }

  /* מקור 2 · gloss-audit · ניקוד · הפירוש החדש **מחושב**, לא נקרא מהקובץ */
  for (const r of tsv('gloss-audit.tsv')) {
    if (!/^להסיר ניקוד/.test((r['ההצעה'] || '').trim())) continue;
    const term = (r['מילה'] || '').trim(), c = cur.get(term);
    if (!c) { skipped.push({ term, src: 'ניקוד', why: 'לא נמצא במאגר' }); continue; }
    push(term, stripNiqqud(c.gloss), 'ניקוד', 'עקביות · 22 מתוך 3,946 מנוקדים');
  }

  /* מקור 3 · 50 הצעות «להחליף במילה», אחרי הכרעה פרטנית.
     ⚠ הכלל שהוליד את ההכרעות: **פירוש נותן את המילה, לא הגדרה שלה.** איפה
     שהפירוש הקיים הוא משפט מסביר והשופט נתן את המילה עצמה — מחליפים. איפה
     שהפירוש הקיים עשיר יותר (מובן שני, הבחנה) — משאירים. 12 מתוך 50 עברו. */
  for (const r of tsv('gloss-decisions-50.tsv'))
    push((r['מילה'] || '').trim(), (r['הפירוש החדש'] || '').trim(), 'הכרעה', r['נימוק'] || '');

  /* מקור 4 · 449 ממצאי הפאנל שעברו **פה אחד 3/3** בשלב 3 של הביקורת העיוורת.
     ⭐ הפאנל דחה 898 הצעות אחרות (62%), ולכן אלה אינן חותמת גומי.
     נמדד ש-99% מהם פותחים תשובה שנפסלת היום: typo-lab/measure_audit_impact.js */
  for (const r of tsv('gloss-decisions-panel.tsv'))
    push((r['מילה'] || '').trim(), (r['הפירוש החדש'] || '').trim(), 'פאנל', r['נימוק'] || '');

  return { plan, skipped };
}

/* ===== selftest · מוכיח שהשער נושך ===== */
function selftest() {
  const cases = [
    ['הוראה · להסיר', { term: 'lie', from: 'לשקר', to: 'להסיר ניקוד' }, false],
    ['הוראה · להחליף', { term: 'own', from: 'לרכוש', to: 'להחליף במילה' }, false],
    ['הוראה · להצר', { term: 'road', from: 'דרך', to: 'להצר ל: כביש' }, false],
    ['פירוש ריק', { term: 'x', from: 'א', to: '   ' }, false],
    ['מקף ארוך', { term: 'x', from: 'א', to: 'ב — ג' }, false],
    ['אין שינוי', { term: 'x', from: 'שפע', to: 'שפע' }, false],
    ['רווח בקצה', { term: 'x', from: 'א', to: ' הר קרח' }, false],
    ['פירוש תקין', { term: 'iceberg', from: 'קרחון', to: 'הר קרח' }, true],
    ['פירוש תקין · פסיק', { term: 'made', from: 'עשה', to: 'עשה, הכין' }, true],
  ];
  let bad = 0;
  for (const [name, row, want] of cases) {
    const got = gateOne(row).ok;
    const ok = got === want;
    if (!ok) bad++;
    console.log('  ' + (ok ? '✅' : '⛔') + ' ' + name.padEnd(22) + ' ציפינו ' + (want ? 'לעבור' : 'להיחסם') + ', קיבלנו ' + (got ? 'עבר' : 'נחסם'));
  }
  console.log(bad ? '\n⛔ ' + bad + ' כשלים' : '\n✅ 9/9 · השער נושך');
  process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--selftest')) selftest();

const cur = readBank();
const { plan, skipped } = build(cur);
const head = ['מילה', 'יחידה', 'פירוש היום', 'הפירוש החדש', 'מקור', 'נימוק'];
fs.writeFileSync(path.join(OUT, 'gloss-plan.tsv'),
  [head.join('\t')].concat(plan.map(r => [r.term, r.unit, r.from, r.to, r.src, r.why].join('\t'))).join('\n') + '\n', 'utf8');

const bySrc = {};
plan.forEach(r => bySrc[r.src] = (bySrc[r.src] || 0) + 1);
console.log('=== תוכנית התיקונים ===');
Object.entries(bySrc).forEach(([k, v]) => console.log('  ' + k.padEnd(12) + ' ' + v));
console.log('  ' + 'סה"כ'.padEnd(12) + ' ' + plan.length);
console.log();
console.log('=== נחסמו בשער: ' + skipped.length + ' ===');
const byWhy = {};
skipped.forEach(s => byWhy[s.why] = (byWhy[s.why] || 0) + 1);
Object.entries(byWhy).forEach(([k, v]) => console.log('  ' + v + '  ' + k));
console.log('\nנכתב: typo-lab/out/gloss-plan.tsv');
