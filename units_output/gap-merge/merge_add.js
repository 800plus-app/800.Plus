/* מאחד את פלטי הסוכנים ומכניס את המילים למאגר — TSV, MD, חריגי-שורש, וקובץ המצב.
 *
 * ⚠ הכנסה למאגר היא הפעולה ההרסנית הראשונה בעבודה הזאת. לכן **שערים לפני כתיבה**,
 * והסקריפט מסרב לכתוב אם אחד מהם נופל:
 *   1. 297 בקלט = 297 בפלט. שורה שנשמטה אינה "כמעט מסווגת".
 *   2. כל פירוש עובר את הכללים המכניים — אורך, מעגליות, ניקוד, נקודה, מקף ארוך.
 *   3. מילה שכבר במאגר נחסמת, **גם כשהיא מוסתרת מאחורי מקף**. שורש משותף חייב
 *      הכרעת `חריג` עם נימוק.
 *   4. פירוש זהה לפירוש קיים נחסם — 851 זוגות קרובים מדי היו הממצא הגדול בביקורות,
 *      ולא נכניס אותו מחדש ביודעין.
 *
 * הרצה: node merge_add.js          בדיקה בלבד
 *        node merge_add.js --write  כתיבה
 */
const fs = require('fs');
const REPO = 'C:/Users/03hag/Claude projects/800+/units_output/';
const WRITE = process.argv.includes('--write');
const NIQ = /[֑-ׇ]/g;
const norm = s => String(s).normalize('NFKC').replace(NIQ, '')
  .replace(/[־‐-―]/g, '-').replace(/\s+/g, ' ').trim();
/* ⛔ זהות ערך חייבת להתעלם מהמקף. `בֶּן-דְּמוּתוֹ` ו-`בן דמותו` הם אותו ערך, ובדיקת
   המילה בשערי הפרויקט הייתה עיוורת לזה — שלוש מועמדות נתפסו כאן בגללו. */
const ident = s => norm(s).replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const FIN = s => s.replace(/ך/g, 'כ').replace(/ם/g, 'מ').replace(/ן/g, 'נ')
  .replace(/ף/g, 'פ').replace(/ץ/g, 'צ');
const skel = s => FIN(norm(s)).replace(/[אוהי]/g, '');
const TAB = '\t';

/* ---- המצב הקיים ---- */
const units = {};
for (let u = 1; u <= 10; u++) {
  const tsv = fs.readFileSync(REPO + `unit-${u}-words.tsv`, 'utf8')
    .split('\n').filter(x => x.trim()).map(l => l.split(TAB));
  const mdPath = REPO + (u === 1 ? 'unit-1-flat.md' : `unit-${u}-hebrew.md`);
  units[u] = { tsv, md: fs.readFileSync(mdPath, 'utf8'), mdPath, n: tsv.length };
}
const usedW = new Set(), usedIdent = new Map(), usedRoot = new Map(), usedGloss = new Map();
for (let u = 1; u <= 10; u++) {
  units[u].tsv.forEach(p => {
    usedW.add(norm(p[1]));
    usedIdent.set(ident(p[1]), [norm(p[1]), u]);
    norm(p[2]).split(',').forEach(r => {
      r = r.trim();
      if (r) usedRoot.set(r, (usedRoot.get(r) || []).concat([[norm(p[1]), u]]));
    });
  });
  units[u].md.split(/\r?\n/).forEach(l => {
    const m = l.match(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|/);
    if (m) usedGloss.set(m[3].trim(), norm(m[2]));
  });
}
const exc = new Set(fs.readFileSync(REPO + 'root-exceptions.txt', 'utf8').split('\n')
  .filter(l => l.trim() && !l.startsWith('#')).map(l => norm(l.split(TAB)[0])));

/* מקור ההוכחה לכל מילה — כל שורה במאגר תישא את הראיה שלה */
const attSrc = new Map(), attRef = new Map();
fs.readFileSync(REPO + 'attestation/attestation-299-worth.tsv', 'utf8')
  .split(/\r?\n/).slice(1).filter(Boolean).forEach(l => {
    const c = l.split(TAB);
    attSrc.set(norm(c[0]), c[2]); attRef.set(norm(c[0]), c[3]);
  });

/* ---- הקלט שנשלח לסוכנים, לשער השלמות ---- */
const sent = new Set();
for (const f of fs.readdirSync('packets').filter(x => /^in-\d\.tsv$/.test(x)))
  fs.readFileSync('packets/' + f, 'utf8').split(/\r?\n/).slice(1).filter(Boolean)
    .forEach(l => sent.add(norm(l.split(TAB)[0])));

/* ---- סבב 2: הכרעות שורש שהתקבלו אחרי שהוצגה ההתנגשות האמיתית ---- */
const p2 = new Map();
for (const f of fs.readdirSync('packets').filter(x => /^out-p2[ab]\.tsv$/.test(x)))
  fs.readFileSync('packets/' + f, 'utf8').split(/\r?\n/).filter(Boolean).forEach(l => {
    const c = l.split(TAB);
    if (c.length >= 2) p2.set(norm(c[0]), { v: c[1].trim(), note: (c[2] || '').trim() });
  });

/* ---- הפלטים ---- */
const rows = [], seen = new Set(), bad = [];
for (const f of fs.readdirSync('packets').filter(x => /^out-\d\.tsv$/.test(x)).sort()) {
  fs.readFileSync('packets/' + f, 'utf8').split(/\r?\n/).filter(Boolean).forEach(l => {
    const c = l.split(TAB);
    if (c.length < 5) { bad.push([f, 'עמודות: ' + c.length, l.slice(0, 50)]); return; }
    const [term, root, unit, sec, gloss, verdict, note] = c.map(x => (x || '').trim());
    const k = norm(term);
    if (!sent.has(k)) { bad.push([f, 'מילה שלא נשלחה', term]); return; }
    if (seen.has(k)) return;
    seen.add(k);
    const o = p2.get(k);
    rows.push({
      term, root, sec, k,
      unit: o && o.v === 'נפסל' ? 'נפסל' : unit,
      gloss,
      verdict: o ? o.v : (verdict || ''),
      note: o ? o.note : (note || ''),
    });
  });
}
const missing = [...sent].filter(w => !seen.has(w));
console.log('='.repeat(66));
console.log(`נשלחו ${sent.size} · חזרו ${rows.length} · הכרעות שורש בסבב 2: ${p2.size}`);
if (missing.length) console.log(`⛔ לא חזרו ${missing.length}: ${missing.slice(0, 12).join(' · ')}`);
if (bad.length) { console.log(`⛔ שורות פסולות: ${bad.length}`); bad.slice(0, 6).forEach(b => console.log('   ' + b.join(' | '))); }

/* ---- ולידציה ---- */
const rejected = rows.filter(r => /נפסל/.test(r.unit));
const accept = rows.filter(r => !/נפסל/.test(r.unit));
const errs = [];
for (const r of accept) {
  const u = Number(r.unit);
  if (!(u >= 2 && u <= 10)) { errs.push(`${r.term}: יחידה "${r.unit}" מחוץ ל-2–10`); continue; }
  const g = r.gloss;
  if (!g) errs.push(`${r.term}: פירוש ריק`);
  if (g.length > 60) errs.push(`${r.term}: פירוש באורך ${g.length} > 60 — "${g}"`);
  if (NIQ.test(g)) errs.push(`${r.term}: ניקוד בפירוש`);
  if (/\.$/.test(g)) errs.push(`${r.term}: נקודה מסיימת`);
  if (/[—·]/.test(g)) errs.push(`${r.term}: מקף ארוך או נקודה־אמצע`);
  if (!g.replace(/\([^)]*\)/g, '').trim()) errs.push(`${r.term}: הפירוש ריק בלי הסוגריים`);
  const ws = norm(r.term).split(/[\s-]+/).filter(x => x.length > 2);
  for (const w of ws) {
    const sk = skel(w);
    if (sk.length >= 2 && g.split(/[\s,;()]+/).some(x => x.length > 2 && skel(x) === sk))
      errs.push(`${r.term}: מעגליות — "${w}" בפירוש "${g}"`);
  }
  if (usedW.has(r.k)) errs.push(`${r.term}: המילה כבר במאגר`);
  else if (usedIdent.has(ident(r.term))) {
    const [w2, u2] = usedIdent.get(ident(r.term));
    errs.push(`${r.term}: כפילות מוסתרת-מקף — "${w2}" כבר בי${u2}`);
  }
  if (usedGloss.has(g)) errs.push(`${r.term}: פירוש זהה ל-"${usedGloss.get(g)}" שכבר במאגר`);
  if (!r.root) errs.push(`${r.term}: אין שורש`);
}
const gseen = new Map();
accept.forEach(r => {
  if (gseen.has(r.gloss)) errs.push(`${r.term}: פירוש זהה ל-${gseen.get(r.gloss)} בתוך התוספות`);
  gseen.set(r.gloss, r.term);
});
/* שורשים */
const newExc = [];
const rootSeen = new Map();
for (const r of accept) {
  for (const raw of r.root.split(',')) {
    const rt = norm(raw); if (!rt) continue;
    const clash = usedRoot.get(rt);
    const inner = rootSeen.get(rt);
    if ((clash || (inner && inner !== r.term)) && !exc.has(rt)) {
      const against = clash ? clash.map(c => c[0]).join('/') : inner;
      if (r.verdict !== 'חריג' || !r.note) {
        errs.push(`${r.term}: השורש "${rt}" מתנגש עם ${against} ואין הכרעת חריג עם נימוק`);
      } else newExc.push([rt, `${r.term} ↔ ${against} — ${r.note}`]);
    }
    rootSeen.set(rt, r.term);
  }
}

const tally = {};
accept.forEach(r => tally[r.unit] = (tally[r.unit] || 0) + 1);
console.log('='.repeat(66));
console.log(`נכנסות: ${accept.length} · נפסלו: ${rejected.length}`);
Object.keys(tally).sort((a, b) => a - b).forEach(u => console.log(`   יחידה ${u}: +${tally[u]}`));
console.log(`חריגי-שורש חדשים: ${newExc.length}`);
if (errs.length) {
  console.log('='.repeat(66));
  console.log(`⛔ ${errs.length} כשלי ולידציה:`);
  errs.slice(0, 60).forEach(e => console.log('   ' + e));
  if (errs.length > 60) console.log(`   ... ועוד ${errs.length - 60}`);
}
fs.writeFileSync('validation.txt', errs.join('\n') + '\n', 'utf8');
fs.writeFileSync('accepted.tsv', accept.map(r =>
  [r.term, r.root, r.unit, r.sec, r.gloss, r.verdict, r.note].join(TAB)).join('\n') + '\n', 'utf8');
fs.writeFileSync('rejected.tsv', rejected.map(r =>
  [r.term, r.note || r.gloss || ''].join(TAB)).join('\n') + '\n', 'utf8');

if (!WRITE) { console.log('\n(בדיקה בלבד — הוסף --write לכתיבה)'); process.exit(errs.length ? 1 : 0); }
if (errs.length || missing.length || bad.length) { console.log('\n⛔ לא נכתב — יש כשלים.'); process.exit(1); }

/* ---- כתיבה ---- */
const statusLines = [];
for (let u = 2; u <= 10; u++) {
  const add = accept.filter(r => Number(r.unit) === u);
  if (!add.length) continue;
  let n = units[u].n;
  fs.appendFileSync(REPO + `unit-${u}-words.tsv`,
    add.map(r => [++n, norm(r.term), r.root].join(TAB)).join('\n') + '\n', 'utf8');
  let m = units[u].n;
  const mdLines = add.map(r => {
    const i = ++m;
    const k = norm(r.term);
    statusLines.push([u, i, r.term, k, r.root, attSrc.get(k) || '', 'ממתין', '',
      `תוספת ממילות הפער · ${attRef.get(k) || ''} · פירוש נכתב מחדש, ממתין לשער הפירושים`].join(TAB));
    return `| ${i} | ${r.term} | ${r.gloss} |`;
  });
  let md = units[u].md.replace(/\s*$/, '\n') + mdLines.join('\n') + '\n';
  /* מספר בכותרת שאינו נכון נקרא כמו שקר — מעדכנים אותו */
  md = md.replace(/^# יחידה (\d+) · רמה ([\d/]+) · \d+ מילים/m, `# יחידה $1 · רמה $2 · ${m} מילים`);
  fs.writeFileSync(units[u].mdPath, md, 'utf8');
}
/* ⚠ gloss-status.tsv הוא קובץ המצב לכל מילה. בלי עדכון הוא ידווח 2,073 בזמן
   שבמאגר יש יותר, וקובץ שמתעד מציאות ישנה נקרא כמו שקר. */
fs.appendFileSync(REPO + 'gloss-phase/gloss-status.tsv', statusLines.join('\n') + '\n', 'utf8');
if (newExc.length) {
  const seenE = new Set();
  const lines = newExc.filter(e => !seenE.has(e[0]) && seenE.add(e[0])).map(e => e.join(TAB));
  fs.appendFileSync(REPO + 'root-exceptions.txt',
    `# --- ${accept.length} תוספות ממילות הפער (הוכחת מקור: attestation-299-worth.tsv) ---\n` +
    lines.join('\n') + '\n', 'utf8');
}
console.log(`\n✓ נכתב · ${statusLines.length} שורות ל-gloss-status.tsv · ${newExc.length} חריגי-שורש`);
console.log('הרץ עכשיו: python check_all.py');
