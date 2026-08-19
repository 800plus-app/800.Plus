'use strict';
/* ⭐ כריית סטי כיול · typo-lab/calib_mine.js
 *
 *   node typo-lab/calib_mine.js --near-neg   → out/near-neg-blind.tsv   (‏24 · עברית · שלילי קרוב)
 *   node typo-lab/calib_mine.js --en         → out/en-blind.tsv         (‏40 · אנגלית · שני כיוונים)
 *   node typo-lab/calib_mine.js --selftest   → שיניים
 *
 * ===== למה קובץ נפרד מ-teacher.js =====
 * ‏`teacher.js` הוא מנגנון השיפוט. הקובץ הזה **בונה את מה שנשפט**, והוא תלוי
 * בדברים שהמנגנון אינו תלוי בהם: המאגר החי דרך `lib/ctx.js`, וטקסונומיית
 * הטעויות. הפרדה אומרת שאפשר להחליף את הסטים בלי לגעת בשופט, ולהפך.
 *
 * ===== שני כללי ברזל של הקובץ הזה =====
 *
 * ‏1 ⛔ **הקובץ שיוצא הוא עיוור.** אין בו תווית, אין שם מחלקה, אין פסק. מי
 *   שמתייג רואה בדיוק מה שהשופט יראה. המחלקות נשמרות ב-`*.design.json` נפרד
 *   ש**אינו נשלח לאיש** — בדיוק כמו `_cat` בסט 24 המקרים.
 *
 * ‏2 ⛔ **שלילי קרוב אינו נרדפת.** הבור שקל ליפול אליו: שני כרטיסים עם פירוש
 *   **זהה** (`הדיר רגליו` / `הוקיר רגליו`) נראים כמו זוג קרוב מצוין — והם
 *   ההפך הגמור. מי שכתב את הפירוש של האחד **כן** ידע את השני. הסינון למטה
 *   פוסל אותם במפורש (`JACCARD_MAX`), וה-selftest מוודא שהוא עדיין פוסל.
 *
 * ===== חוקיות =====
 * הכול נגזר מ**המאגר של האפליקציה עצמה** (`data.js` / `data-en.js`) ומחישוב
 * מחרוזות. אין כאן לקסיקון חיצוני, אין ויקימילון, אין WordNet, אין רשימת
 * תדירות. השורות שנכתבו ביד נכתבו על ידי LLM — מותר במפורש (`METHODOLOGY.md`).
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');

const OUT = path.join(__dirname, 'out');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const say = s => process.stdout.write(s + '\n');
const has = f => argv.includes(f);

/* ===================== עזרים ===================== */

const STOP = new Set(['של', 'את', 'על', 'אל', 'עמ', 'עם', 'מנ', 'מן', 'או', 'אכ', 'אך', 'כי', 'לא',
  'זה', 'מה', 'כל', 'יותר', 'בו', 'בה', 'שהוא', 'היא', 'הוא', 'אינו', 'למשהו', 'משהו', 'מישהו',
  'בדרכ', 'מאוד', 'כדי', 'אחרי', 'לפני', 'ולא', 'גמ', 'גם', 'אבל', 'כמו', 'כזה', 'שבו', 'שבה']);

const jac = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); };
const ov = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i; };

/* שלד עיצורי · הסרת ניקוד ואם-קריאה. **מניפולציית מחרוזת בלבד** — אין כאן
   ניתוח מורפולוגי ואין לקסיקון. משמש רק לאיתור זוגות מאותה משפחה. */
const skel = s => String(s).replace(/[֑-ׇ]/g, '').replace(/[אוהי]/g, '').replace(/[^א-ת]/g, '');

const TSV_HDR = 'id\tמילה בכרטיס\tהפירוש המקורי\tמה כתוב במאגר\tמה הלומד כתב\tהאם הלומד ידע את המילה? כ / ל / ?';
const EN_HDR = 'id\tכיוון\tמילה בכרטיס\tהפירוש המקורי\tמה כתוב במאגר\tמה הלומד כתב\tהאם הלומד ידע את המילה? כ / ל / ?';

function writeSet(file, hdr, rows, cols, design) {
  const clean = s => String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').trim();
  fs.writeFileSync(path.join(OUT, file + '.tsv'),
    [hdr].concat(rows.map(r => cols.map(c => clean(r[c])).join('\t') + '\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT, file + '.design.json'), JSON.stringify(design, null, 1), 'utf8');
  /* ⛔ שער · אם תווית או שם מחלקה דלפו לקובץ העיוור, עצור. */
  const txt = fs.readFileSync(path.join(OUT, file + '.tsv'), 'utf8');
  for (const bad of design.rows.map(r => r.cls).filter((v, i, a) => a.indexOf(v) === i)) {
    if (txt.includes(bad)) throw new Error(`⛔ שם המחלקה «${bad}» דלף לקובץ העיוור ${file}.tsv`);
  }
  say(`נכתב · out/${file}.tsv · ${rows.length} שורות · עיוור (עמודת תווית ריקה)`);
  say(`נכתב · out/${file}.design.json · ⛔ **לא לשלוח לשופט ולא למתייג**`);
}

/* ===================== 1 · שליליים קרובים · עברית ===================== */

/* ⛔ הפרמטרים האלה **הם** ההגדרה של "קרוב". שינוי שלהם משנה את הסט.
 * ‏JACCARD_MAX פוסל נרדפות אמיתיות · JACCARD_MIN פוסל זרים גמורים. */
const JACCARD_MIN = 0.18;
const JACCARD_MAX = 0.62;

function nearNeg() {
  const c = getCtx('he');
  const B = c.BANK;
  const wl = s => c.norm(s).split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  const setOf = new Map(); B.forEach((r, i) => setOf.set(i, new Set(wl(r.meaning))));
  const segsOf = new Map(); B.forEach((r, i) => segsOf.set(i, c.meaningSegs(r.meaning)));

  const idx = new Map();
  B.forEach((r, i) => { for (const w of setOf.get(i)) { if (!idx.has(w)) idx.set(w, []); idx.get(w).push(i); } });

  /* --- מאגר זוגות · שדה משותף, רפרנט שונה --- */
  const seen = new Set(); const cand = [];
  for (const [, list] of idx) {
    if (list.length > 14) continue;                      /* מילה גנרית · לא אות לקרבה */
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const [i, j] = [list[a], list[b]]; const k = i + ':' + j;
      if (seen.has(k)) continue; seen.add(k);
      const si = setOf.get(i), sj = setOf.get(j);
      if (si.size < 2 || sj.size < 2) continue;
      const o = ov(si, sj), J = jac(si, sj);
      if (o < 2) continue;
      /* ⛔ הפסילה החשובה · נרדפות אמיתיות אינן שליליים */
      if (J > JACCARD_MAX || J < JACCARD_MIN) continue;
      if (c.norm(B[i].meaning) === c.norm(B[j].meaning)) continue;
      if (skel(B[i].term) === skel(B[j].term)) continue; /* שמור לדלי D */
      cand.push({ i, j, o, J });
    }
  }
  cand.sort((x, y) => y.o - x.o || x.J - y.J || x.i - y.i || x.j - y.j);

  const rows = [], design = [], used = new Set();
  /* ⛔ הסינון ברמת ה**מקטע**, לא רק ברמת הפירוש המלא.
   * הבאג שזה תופס · `חושכ מצרימ` «אפלה כבדה» מול `מאפליה` «אפלה גדולה».
   * הז'קארד על הפירוש המלא היה 0.44 ועבר את השער — אבל **המקטעים שנשלחים
   * בפועל** נבדלים במילה אחת ונרדפים זה לזה. שורה כזאת אינה שלילי קרוב אלא
   * נרדפת, והיא מדללת בדיוק את מה שהסט אמור למדוד. */
  const SEG_JACCARD_MAX = 0.5;
  const push = (i, j, cls, why, typedSeg) => {
    if (used.has(i)) return false;
    const segs = segsOf.get(i);
    const written = segs[0];
    const typed = typedSeg !== undefined ? typedSeg : segsOf.get(j)[0];
    if (!typed || c.norm(typed) === c.norm(written)) return false;
    const sw = new Set(wl(written)), st = new Set(wl(typed));
    if (sw.size && st.size && jac(sw, st) >= SEG_JACCARD_MAX) return false;
    used.add(i);
    const id = 'NN' + String(rows.length + 1).padStart(2, '0');
    rows.push({ id, term: B[i].term, gloss: B[i].meaning, written, typed });
    design.push({ id, cls, why, cardA: B[i].id, cardB: j >= 0 ? B[j].id : null, termB: j >= 0 ? B[j].term : null });
    return true;
  };

  /* דלי A · נרדפת של מילה שכנה — חפיפה גבוהה, ז'קארד באמצע */
  for (const p of cand) { if (design.filter(d => d.cls.startsWith('A')).length >= 8) break; if (p.o >= 3) push(p.i, p.j, 'A·נרדפת-שכנה', `חפיפה ${p.o} · J=${p.J.toFixed(2)}`); }

  /* דלי B · מילת-על — הפירוש של כרטיס אחר הוא **מילה בודדת** שמופיעה בתוך הפירוש
     של הכרטיס הזה. זה בדיוק המקרה האמיתי R18: `כובע` נכתב על `מצנפת`. */
  const shortCards = B.map((r, i) => ({ i, segs: segsOf.get(i) }))
    .filter(x => x.segs.length && wl(x.segs[0]).length === 1)
    .map(x => ({ i: x.i, w: c.norm(x.segs[0]) }));
  const byWord = new Map(); for (const s of shortCards) if (!byWord.has(s.w)) byWord.set(s.w, s.i);
  const bCand = [];
  B.forEach((r, i) => {
    for (const w of setOf.get(i)) {
      const j = byWord.get(w);
      if (j === undefined || j === i) continue;
      if (wl(r.meaning).length < 2) continue;
      bCand.push({ i, j, w });
    }
  });
  bCand.sort((x, y) => x.i - y.i);
  for (const p of bCand) { if (design.filter(d => d.cls.startsWith('B')).length >= 6) break; push(p.i, p.j, 'B·מילת-על', `«${p.w}» היא הפירוש המלא של כרטיס אחר`, B[p.j].meaning); }

  /* דלי C · אותו שדה, רפרנט אחר — חפיפה 2, ז'קארד נמוך */
  for (const p of cand) { if (design.filter(d => d.cls.startsWith('C')).length >= 6) break; if (p.J <= 0.34) push(p.i, p.j, 'C·שדה-משותף', `חפיפה ${p.o} · J=${p.J.toFixed(2)}`); }

  /* דלי D · אותה משפחה שהמאגר מבחין ביניהן — שלד עיצורי זהה, פירוש שונה */
  const bySkel = new Map();
  B.forEach((r, i) => { const s = skel(r.term); if (s.length >= 3) { if (!bySkel.has(s)) bySkel.set(s, []); bySkel.get(s).push(i); } });
  const dCand = [];
  for (const [, list] of bySkel) {
    if (list.length < 2) continue;
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const [i, j] = [list[a], list[b]];
      if (c.norm(B[i].meaning) === c.norm(B[j].meaning)) continue;
      if (jac(setOf.get(i), setOf.get(j)) > JACCARD_MAX) continue;
      dCand.push({ i, j });
    }
  }
  dCand.sort((x, y) => x.i - y.i);
  for (const p of dCand) { if (design.filter(d => d.cls.startsWith('D')).length >= 4) break; push(p.i, p.j, 'D·אותה-משפחה', `שלד עיצורי זהה · ${B[p.i].term} / ${B[p.j].term}`); }

  /* השלמה ל-24 מדלי A אם דלי כלשהו לא התמלא */
  for (const p of cand) { if (rows.length >= 24) break; push(p.i, p.j, 'A·נרדפת-שכנה', `מילוי · חפיפה ${p.o} · J=${p.J.toFixed(2)}`); }
  if (rows.length !== 24) throw new Error(`נכרו ${rows.length} שורות ולא 24 · הרחב את הפרמטרים`);

  writeSet('near-neg-blind', TSV_HDR, rows, ['id', 'term', 'gloss', 'written', 'typed'], {
    generated: 'typo-lab/calib_mine.js --near-neg',
    what: 'שליליים קרובים · התשובה קרובה סמנטית אך שייכת למילה אחרת',
    truth: 'לא ידועה · דורש תיוג אנושי. הציפייה היא ל, אבל שורה שהיא נרדפת אמיתית ראויה ל-כ או ?',
    params: { JACCARD_MIN, JACCARD_MAX, SEG_JACCARD_MAX },
    buckets: Object.fromEntries(['A', 'B', 'C', 'D'].map(k => [k, design.filter(d => d.cls.startsWith(k)).length])),
    rows: design,
  });
  say('');
  say('| דלי | מה זה | שורות |');
  say('|---|---|---|');
  for (const [k, n] of [['A', 'נרדפת של מילה שכנה'], ['B', 'מילת-על'], ['C', 'אותו שדה רפרנט אחר'], ['D', 'אותה משפחה שהמאגר מבחין']]
    .map(([k, n]) => [k + ' · ' + n, design.filter(d => d.cls.startsWith(k)).length])) say(`| ${k} | ${n} |`);
  say('');
  say('⚠ **אמת המידה כאן אינה ידועה מראש** — בניגוד לבקרה השלילית המבנית.');
  say('הכרייה מייצרת *מועמדים* לשלילי קרוב; רק תיוג אנושי קובע אם הם באמת שליליים.');
}

/* ===================== 2 · אנגלית · שני כיוונים ===================== */

/* הרכב הסט · מוצהר מראש ולא נגזר ממה שנוח.
 * כיוון `word` נדגם **פרופורציונלית למשקלי הטקסונומיה** (`lib/taxonomy-en.js`:
 * adj 2 · drop 2 · transpose 1 · double 1 · pattern 1 · סכום 7) — כי זו
 * האוכלוסייה ש-`en-word 69.09%` נמדד עליה, וסט כיול שאינו באותו הרכב מודד
 * משהו אחר. שתי מחלקות **נוספות בכוונה** מעליה, כי הן קיימות אצל לומדים
 * ואינן בטקסונומיה כלל: שלילי קרוב ומורפולוגיה. זה מוצהר, לא מוסתר. */
const EN_PLAN = {
  word: { typo: 12, nearneg: 6, morph: 6 },
  gloss: { syn: 5, partial: 4, nearneg: 4, morph: 3 },
};

/* מורפולוגיה אנגלית · חוקי כתיב בסיסיים, מחרוזות בלבד */
function inflect(w) {
  const out = [];
  if (/[^aeiou]y$/.test(w)) { out.push(w.slice(0, -1) + 'ies', w.slice(0, -1) + 'ied'); }
  else if (/(s|x|z|ch|sh)$/.test(w)) out.push(w + 'es');
  else out.push(w + 's');
  if (/e$/.test(w)) out.push(w.slice(0, -1) + 'ing', w + 'd');
  else out.push(w + 'ing', w + 'ed');
  return out.filter(x => x !== w);
}

/* ⛔ **שלילי קרוב אינו הטיה.** הבאג שזה תופס · חיפוש "מוטציה שנוחתת על מילת
 * מאגר אחרת" החזיר `dealt→deal`, `generated→generate`, `occasions→occasion`.
 * שלושתם נוחתים על מילת מאגר — ובכל זאת אינם שליליים בכלל: מי שכתב `generate`
 * על הכרטיס `generated` **ידע את המילה**. זו מחלקת המורפולוגיה, יש לה דלי משלה,
 * וערבוב שלה לתוך דלי השליליים היה מזהם את שתי המדידות בבת אחת. */
function isMorphPair(a, b) {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (l === s + 's' || l === s + 'es' || l === s + 'ed' || l === s + 'd' || l === s + 'ing') return true;
  if (/e$/.test(s) && l === s.slice(0, -1) + 'ing') return true;
  if (/[^aeiou]y$/.test(s) && (l === s.slice(0, -1) + 'ies' || l === s.slice(0, -1) + 'ied')) return true;
  return false;
}

function enSet() {
  const e = getCtx('en');
  const B = e.BANK;
  const nk = w => (e.normEn ? e.normEn(w) : String(w).toLowerCase()).trim();
  const single = B.filter(r => /^[A-Za-z]+$/.test(r.term) && r.term.length >= 4);
  const keyMap = new Map(); for (const r of single) if (!keyMap.has(nk(r.term))) keyMap.set(nk(r.term), r);
  const keys = [...keyMap.keys()].filter(k => /^[a-z]{4,}$/.test(k));
  const inBank = new Set(keys);

  const rows = [], design = [];
  const add = (dir, r, typed, cls, why) => {
    const segs = e.meaningSegs(r.meaning);
    const id = 'E' + String(rows.length + 1).padStart(2, '0');
    rows.push({
      id, dir, term: r.term, gloss: r.meaning,
      written: dir === 'word' ? r.term : segs[0],
      typed,
    });
    design.push({ id, dir, cls, why, card: r.id });
  };

  /* דגימה דטרמיניסטית · פריסה אחידה על המאגר הממוין, בלי RNG */
  const spread = (arr, n, off = 0) => {
    const out = []; if (!arr.length) return out;
    for (let i = 0; i < n; i++) out.push(arr[Math.floor((i + 0.5) * arr.length / n + off) % arr.length]);
    return out;
  };

  /* ---- כיוון word · שגיאות כתיב פרופורציונליות ---- */
  const ROWS_Q = [['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], ['z', 'x', 'c', 'v', 'b', 'n', 'm']];
  const adjOf = ch => { for (const R of ROWS_Q) { const i = R.indexOf(ch); if (i >= 0) return [R[i - 1], R[i + 1]].filter(Boolean); } return []; };
  const opGen = {
    adj: w => { const o = []; for (let i = 0; i < w.length; i++) for (const c of adjOf(w[i])) o.push(w.slice(0, i) + c + w.slice(i + 1)); return o; },
    drop: w => { const o = []; for (let i = 0; i < w.length; i++) o.push(w.slice(0, i) + w.slice(i + 1)); return o; },
    transpose: w => { const o = []; for (let i = 0; i + 1 < w.length; i++) if (w[i] !== w[i + 1]) o.push(w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2)); return o; },
    double: w => { const o = []; for (let i = 0; i < w.length; i++) o.push(w.slice(0, i + 1) + w[i] + w.slice(i + 1)); return o; },
    pattern: w => [w.replace(/ie/, 'ei'), w.replace(/ei/, 'ie'), w.replace(/c/, 's'), w.replace(/ph/, 'f'), w.replace(/^(.*)e$/, '$1')].filter(x => x && x !== w),
  };
  /* משקלי הטקסונומיה · adj 2 · drop 2 · transpose 1 · double 1 · pattern 1 */
  const WEIGHTS = [['adj', 4], ['drop', 3], ['transpose', 2], ['double', 2], ['pattern', 1]];
  const longKeys = keys.filter(k => k.length >= 6).sort();
  let ki = 0;
  for (const [opName, count] of WEIGHTS) {
    let made = 0;
    while (made < count && ki < longKeys.length * 3) {
      const k = longKeys[(ki * 37) % longKeys.length]; ki++;
      const outs = opGen[opName](k).filter(x => x !== k && !inBank.has(x));   /* **לא** מילת מאגר · זו שגיאה טהורה */
      if (!outs.length) continue;
      add('word', keyMap.get(k), outs[Math.floor(outs.length / 2)], 'word·typo·' + opName, `אופרטור ${opName} · לא נחת על מילת מאגר`);
      made++;
    }
  }

  /* ---- כיוון word · שליליים קרובים · המוטציה נוחתת על **מילת מאגר אחרת** ---- */
  const collide = [];
  for (const w of keys) {
    for (const opName of ['adj', 'drop', 'transpose']) {
      for (const v of opGen[opName](w)) {
        if (!inBank.has(v) || v === w) continue;
        if (isMorphPair(w, v)) continue;                 /* ⛔ הטיה אינה שלילי · ראה isMorphPair */
        collide.push({ w, v, opName });
      }
    }
  }
  collide.sort((a, b) => a.w.localeCompare(b.w) || a.v.localeCompare(b.v));
  for (const p of spread(collide.filter(p => p.w.length >= 5), EN_PLAN.word.nearneg, 3)) {
    add('word', keyMap.get(p.w), keyMap.get(p.v).term, 'word·nearneg', `${p.opName} · נחת על מילת המאגר «${p.v}» (${keyMap.get(p.v).meaning.slice(0, 30)})`);
  }

  /* ---- כיוון word · מורפולוגיה ----
     ⚠ מסובבים את סוג ההטיה (‏s / ing / ed) ולא לוקחים תמיד את הראשונה. שש שורות
     שכולן "+s" מודדות חוק אחד ומדווחות אותו כשש. */
  let mi = 0;
  for (const k of spread(longKeys.filter(k => !/(s|ed|ing)$/.test(k)), EN_PLAN.word.morph, 11)) {
    const all = inflect(k);
    const pool = all.filter(x => !inBank.has(x));
    const use = pool.length ? pool : all;
    const f = use[mi++ % use.length];
    add('word', keyMap.get(k), f, 'word·morph', `הטיה · ${k} → ${f}`);
  }

  /* ---- כיוון gloss · תשובה חלקית · מקטע אחד מתוך פירוש רב-מקטעי ---- */
  const multi = B.filter(r => e.meaningSegs(r.meaning).length >= 2).sort((a, b) => a.id.localeCompare(b.id));
  for (const r of spread(multi, EN_PLAN.gloss.partial, 5)) {
    const s = e.meaningSegs(r.meaning);
    add('gloss', r, s[s.length - 1], 'gloss·partial', `מקטע אחרון מתוך ${s.length}`);
  }

  /* ---- כיוון gloss · שלילי קרוב · הפירוש של מילה אנגלית שכנה ---- */
  for (const p of spread(collide.filter(p => p.w.length >= 5), EN_PLAN.gloss.nearneg, 29)) {
    const A = keyMap.get(p.w), C = keyMap.get(p.v);
    if (e.norm(A.meaning) === e.norm(C.meaning)) continue;
    add('gloss', A, e.meaningSegs(C.meaning)[0], 'gloss·nearneg', `הפירוש של «${p.v}» · שכנה במרחק 1`);
  }

  /* ---- כיוון gloss · נרדפות ומורפולוגיה עברית · **נכתבו ביד** ----
     ⚠ אלה 8 השורות היחידות בקובץ שאינן נגזרות מהמאגר. נרדפת עברית אינה קיימת
     במאגר ואי אפשר לכרות אותה, ולקסיקון עברי חיצוני אסור (‏AGPL · ראה
     `המשך-מכאן.md §1`). ‏LLM שכותב — מותר במפורש. הן כתובות כאן בקוד ולא
     בקובץ צדדי, כדי שהסט יישאר משוחזר בפקודה אחת. */
  const HAND = [
    { t: 'brave', ty: 'אמיץ לב', cls: 'gloss·syn', why: 'הרחבה כבולה של אמיץ' },
    { t: 'enormous', ty: 'ענק', cls: 'gloss·syn', why: 'נרדפת של עצום' },
    { t: 'silent', ty: 'חרישי', cls: 'gloss·syn', why: 'נרדפת של שקט/דומם' },
    { t: 'rapid', ty: 'זריז', cls: 'gloss·syn', why: 'נרדפת של מהיר' },
    { t: 'ancient', ty: 'עתיק יומינ', cls: 'gloss·syn', why: 'נרדפת של קדום/עתיק' },
    { t: 'decide', ty: 'החלטה', cls: 'gloss·morph', why: 'שם פועל → שם פעולה' },
    { t: 'destroy', ty: 'הרס', cls: 'gloss·morph', why: 'שם פועל → שם פעולה' },
    { t: 'arrive', ty: 'הגעה', cls: 'gloss·morph', why: 'שם פועל → שם פעולה' },
  ];
  /* ⛔ שער · נרדפת שכבר נמצאת בתוך הפירוש **אינה בודקת כלום**.
   * הבאג שזה תופס · `enormous` פירושו "עצום" ונכתב `עצום` כנרדפת. אחרי הנרמול
   * שני הצדדים זהים, השורה מתקבלת טריוויאלית, ומחלקת "נרדפות" מדווחת הצלחה
   * שלא נבחנה. שלוש מתוך חמש שורות הנרדפות נפלו בזה. */
  for (const h of HAND) {
    const r = keyMap.get(nk(h.t));
    if (!r) throw new Error(`⛔ «${h.t}» אינה במאגר האנגלי · תקן את הטבלה`);
    if (h.cls === 'gloss·syn' && e.norm(r.meaning).split(/[\s,;]+/).includes(e.norm(h.ty))) {
      throw new Error(`⛔ «${h.ty}» כבר מופיעה בפירוש של «${h.t}» («${r.meaning}») · נרדפת שאינה בודקת כלום`);
    }
    add('gloss', r, h.ty, h.cls, h.why);
  }

  const byCls = {};
  for (const d of design) { const k = d.cls.split('·').slice(0, 2).join('·'); byCls[k] = (byCls[k] || 0) + 1; }
  writeSet('en-blind', EN_HDR, rows, ['id', 'dir', 'term', 'gloss', 'written', 'typed'], {
    generated: 'typo-lab/calib_mine.js --en',
    what: 'כיול אנגלית · שני כיוונים · אין לו קודם, המורה היה בלי כיול אנגלי בכלל',
    truth: 'לא ידועה · דורש תיוג אנושי',
    sampling: 'כיוון word · פרופורציונלי למשקלי lib/taxonomy-en.js (adj2 drop2 transpose1 double1 pattern1). שלילי קרוב ומורפולוגיה נוספו מעליה בכוונה ואינם בטקסונומיה.',
    hand_written: HAND.length,
    plan: EN_PLAN, byCls, rows: design,
  });
  say('');
  say('| מחלקה | שורות |');
  say('|---|---|');
  for (const k of Object.keys(byCls).sort()) say(`| ${k} | ${byCls[k]} |`);
  say('');
  say(`| כיוון word | ${design.filter(d => d.dir === 'word').length} |`);
  say(`| כיוון gloss | ${design.filter(d => d.dir === 'gloss').length} |`);
  say('');
  say(`⚠ ${HAND.length} שורות **נכתבו ביד** (נרדפת/מורפולוגיה עברית) · אי אפשר לכרות אותן`);
  say('  מהמאגר, ולקסיקון עברי חיצוני אסור משפטית. הן בקוד ולכן משוחזרות.');
  say('⚠ הפירוש במאגר האנגלי הוא **עברית** · כיוון gloss שופט טקסט עברי מול מילה אנגלית.');
}

/* ===================== 3 · הסט החוץ-מדגמי · אנגלית · en-blind2 =====================
 *
 * ⛔⛔ **הקובץ הזה קיים כדי לבחון חוק שאני עצמי גזרתי, ולכן אני עצמי הסיכון.**
 *
 * החוק לכיוון `word` (`teacher.js :: decideWordDir`) הגיע ל-24/24 על `en40` —
 * והוא נגזר **תוך הסתכלות על אותן 24 שורות**. אם אני גם בונה את הסט שאמור
 * לבחון אותו, הידיעה תדלוף לבחירה גם בלי כוונה: אבחר "דוגמה מעניינת", אסנן
 * שורה שנראית לי לא הוגנת, ארחיב מחלקה שאני יודע שהחוק חזק בה.
 *
 * שלוש ההגנות, ושלושתן מבניות ולא הבטחות:
 *
 *   ‏1. **החוק ננעל בגיט לפני שנבנתה שורה אחת.** ‏hash הקומיט נכתב בראש
 *      הקובץ שנוצר. הסדר מוכח מהגיט, לא מוצהר על ידי.
 *   ‏2. **המכסות מוכרזות בקובץ נפרד לפני הדגימה** (`--en2-quota`), והן נגזרות
 *      **משיעורי האוכלוסייה בלבד** — לא מהמדגם ולא ממה שנוח. `--en2` מסרב
 *      לרוץ בלי קובץ המכסות.
 *   ‏3. **הדגימה מכנית**: ‏PRNG בזרע קבוע בתוך כל שכבה. אין בחירה ידנית, אין
 *      סינון "קל/קשה", אין דילוג. שורה משעממת נכנסת.
 *
 * ⭐ **דוגמים מ-`split: "holdout"` בלבד.** מחולל הקורפוס כבר הפריש 15% לחלוקה
 * הזאת בדיוק למטרה הזאת, והשימוש בה הוא הבחירה המכנית הנכונה — לא הצטמצמות
 * שלי לתת-קבוצה שנוחה לי. */

const EN2_SEED = 'typo-lab/teacher/en2/v1';
const EN2_N = 40;
const EN2_SPLIT = 'holdout';
const EN2_ONE_PER_GROUP = true;      /* לכל היותר שורה אחת לכל כרטיס · מוכרז מראש */

/* ‏PRNG דטרמיניסטי · xmur3 + mulberry32. אותו זרע ⇒ אותו מדגם, לנצח. */
function rngOf(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
  let a = (h ^ h >>> 16) >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

const EN2_SRC = path.join(OUT, 'answers-en.jsonl');
const EN2_QUOTA = path.join(OUT, 'en-blind2.quota.json');

function readCorpus() {
  if (!fs.existsSync(EN2_SRC)) throw new Error(`חסר ${path.relative(ROOT, EN2_SRC)} · הסוכן שבונה את הקורפוס טרם סיים`);
  return fs.readFileSync(EN2_SRC, 'utf8').split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
}

/* ---- שלב 1 · הכרזת המכסות · חייב לרוץ לפני הדגימה ---- */
function en2Quota() {
  const all = readCorpus().filter(r => r.split === EN2_SPLIT);
  const byDir = {};
  for (const r of all) {
    (byDir[r.direction] || (byDir[r.direction] = { n: 0, cls: {} })).n++;
    byDir[r.direction].cls[r.source_class] = (byDir[r.direction].cls[r.source_class] || 0) + 1;
  }
  const total = all.length;

  /* חלוקה פרופורציונלית עם **שארית גדולה** · דטרמיניסטי, בלי הטיה לכיוון אחד */
  const largestRemainder = (weights, N) => {
    const keys = Object.keys(weights).sort();
    const sum = keys.reduce((a, k) => a + weights[k], 0);
    const exact = keys.map(k => ({ k, x: N * weights[k] / sum }));
    const out = {}; let used = 0;
    for (const e of exact) { out[e.k] = Math.floor(e.x); used += out[e.k]; }
    exact.sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)) || a.k.localeCompare(b.k));
    for (let i = 0; used < N; i++, used++) out[exact[i % exact.length].k]++;
    return out;
  };

  const dirQuota = largestRemainder(Object.fromEntries(Object.keys(byDir).map(d => [d, byDir[d].n])), EN2_N);
  const quota = {};
  for (const d of Object.keys(dirQuota).sort()) quota[d] = largestRemainder(byDir[d].cls, dirQuota[d]);

  /* execFileSync ולא execSync · אין כאן מחרוזת שרצה דרך shell ולכן אין משטח הזרקה,
     גם אם מתישהו מישהו יכניס לכאן ערך מבחוץ. */
  let lock = 'UNKNOWN';
  try { lock = require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch (e) { /* ריפו לא זמין */ }

  const doc = {
    what: 'מכסות הדגימה לסט en-blind2 · מוכרזות לפני הדגימה ונגזרות משיעורי האוכלוסייה בלבד',
    lock_commit: lock,
    declared_at: new Date().toISOString().slice(0, 10),
    source: 'typo-lab/out/answers-en.jsonl',
    filter: { split: EN2_SPLIT, one_row_per_group: EN2_ONE_PER_GROUP },
    seed: EN2_SEED, n: EN2_N,
    population: { total_holdout: total, by_direction: Object.fromEntries(Object.keys(byDir).map(d => [d, byDir[d].n])) },
    method: 'largest-remainder על שיעורי source_class בתוך כל כיוון · דגימה ב-PRNG בזרע קבוע בתוך כל שכבה',
    quota,
  };
  fs.writeFileSync(EN2_QUOTA, JSON.stringify(doc, null, 1), 'utf8');
  say(`# מכסות · en-blind2 · ננעל על ${lock.slice(0, 7)}`);
  say('');
  say(`אוכלוסייה · ${total.toLocaleString('en')} שורות ב-split=${EN2_SPLIT}`);
  say('');
  say('| כיוון | source_class | באוכלוסייה | מכסה |');
  say('|---|---|---|---|');
  for (const d of Object.keys(quota).sort()) for (const c of Object.keys(quota[d]).sort()) {
    if (!quota[d][c]) continue;
    say(`| ${d} | ${c} | ${byDir[d].cls[c].toLocaleString('en')} | **${quota[d][c]}** |`);
  }
  const tot = Object.values(quota).reduce((a, o) => a + Object.values(o).reduce((x, y) => x + y, 0), 0);
  say('');
  say(`סה"כ ${tot} · כיוונים: ${Object.keys(dirQuota).sort().map(d => d + '=' + dirQuota[d]).join(' · ')}`);
  say('');
  say(`נכתב · ${path.relative(ROOT, EN2_QUOTA)}`);
  say('⛔ מכאן ואילך המכסות קפואות · `--en2` קורא מהקובץ הזה ואינו מחשב מחדש.');
}

/* ---- שלב 2 · הדגימה · מכנית לחלוטין ---- */
function en2Sample() {
  if (!fs.existsSync(EN2_QUOTA)) throw new Error('⛔ אין קובץ מכסות · הרץ קודם  node typo-lab/calib_mine.js --en2-quota');
  const q = JSON.parse(fs.readFileSync(EN2_QUOTA, 'utf8'));
  const all = readCorpus().filter(r => r.split === q.filter.split);

  const rows = [], design = [];
  const usedGroups = new Set();
  for (const dir of Object.keys(q.quota).sort()) {
    for (const cls of Object.keys(q.quota[dir]).sort()) {
      const need = q.quota[dir][cls];
      if (!need) continue;
      /* מיון יציב לפי id ⇒ אותה שכבה בכל הרצה · ואז ערבוב בזרע קבוע */
      const pool = all.filter(r => r.direction === dir && r.source_class === cls).sort((a, b) => a.id.localeCompare(b.id));
      const rnd = rngOf(q.seed + '|' + dir + '|' + cls);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      let took = 0;
      for (const r of pool) {
        if (took >= need) break;
        if (q.filter.one_row_per_group && usedGroups.has(r.group)) continue;
        usedGroups.add(r.group);
        took++;
        const id = 'X' + String(rows.length + 1).padStart(2, '0');
        rows.push({ id, dir: r.direction, term: r.card_term, gloss: r.card_gloss, written: r.direction === 'word' ? r.card_term : r.card_gloss, typed: r.typed });
        design.push({ id, dir: r.direction, cls: r.source_class, why: 'נדגם מכנית', corpus_id: r.id, group: r.group });
      }
      if (took < need) say(`⚠ ${dir}/${cls} · נדרשו ${need} ונמצאו ${took} · השכבה קטנה מהמכסה`);
    }
  }
  if (rows.length !== EN2_N) throw new Error(`⛔ נדגמו ${rows.length} ולא ${EN2_N}`);

  /* ⛔ ראש הקובץ נושא את hash הנעילה · הסדר מוכח ולא מוצהר */
  const hdr = `# en-blind2 · סט חוץ-מדגם · נדגם מכנית מ-answers-en.jsonl (split=${q.filter.split})\n`
    + `# ⛔ החוק שנבחן כאן ננעל בקומיט ${q.lock_commit} **לפני** שנדגמה שורה אחת\n`
    + `# זרע ${q.seed} · מכסות ב-en-blind2.quota.json · בלי בחירה ידנית ובלי סינון\n`
    + EN_HDR;
  const clean = s => String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').trim();
  fs.writeFileSync(path.join(OUT, 'en-blind2.tsv'),
    [hdr].concat(rows.map(r => ['id', 'dir', 'term', 'gloss', 'written', 'typed'].map(c => clean(r[c])).join('\t') + '\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT, 'en-blind2.design.json'), JSON.stringify({
    generated: 'typo-lab/calib_mine.js --en2', lock_commit: q.lock_commit, seed: q.seed,
    truth: 'לא ידועה · דורש תיוג אנושי', rows: design,
  }, null, 1), 'utf8');

  /* שער · הקובץ העיוור חייב להישאר עיוור */
  const txt = fs.readFileSync(path.join(OUT, 'en-blind2.tsv'), 'utf8');
  for (const bad of [...new Set(design.map(d => d.cls))]) {
    if (txt.includes(bad)) throw new Error(`⛔ שם המחלקה «${bad}» דלף לקובץ העיוור`);
  }
  const byCls = {};
  for (const d of design) byCls[d.dir + '·' + d.cls] = (byCls[d.dir + '·' + d.cls] || 0) + 1;
  say(`נכתב · out/en-blind2.tsv · ${rows.length} שורות · ננעל על ${q.lock_commit.slice(0, 7)}`);
  say(`נכתב · out/en-blind2.design.json · ⛔ לא לשלוח לשופט ולא למתייג`);
  say('');
  say('| כיוון·מחלקה | שורות |');
  say('|---|---|');
  for (const k of Object.keys(byCls).sort()) say(`| ${k} | ${byCls[k]} |`);
  say('');
  say(`כיוון word ${design.filter(d => d.dir === 'word').length} · כיוון gloss ${design.filter(d => d.dir === 'gloss').length}`);
}

/* ===================== 4 · הסט השלישי · en-blind3 =====================
 *
 * אותה מכניקה בדיוק כמו `en-blind2` — נעילה → מכסות מוכרזות → דגימה מכנית
 * מ-`holdout` → hash בראש הקובץ → עצירה. מה ש**שונה** הוא רק ההרכב, ושתי
 * הדרישות שנגזרות ישירות מ-11 ההחטאות של הסבב הקודם:
 *
 *   ⭐ **`neg-garbage` במכסה מפורשת.** מחלקה A (`X20` `X21` · מחרוזת רחוקה
 *      מכל דבר) הפילה את החוק הקודם — והיא נכנסה לסט השני **במקרה**, כי
 *      הדגימה הפרופורציונלית הגרילה 3 שורות. סמיכות על מקריות אינה תכנון.
 *
 *   ⭐ **שגיאות כתיב עבריות בכיוון `gloss` במכסה מפורשת.** מחלקה B
 *      (`דברוימ` `בופשה` `אסקה` `בטיחת` `געריני`) היא **5 מ-11** ההחטאות,
 *      והיא לא הייתה בסט הראשון **בכלל**. זו בדיוק האוכלוסייה שבה הפאנל
 *      המוחזר קורס היום (‏T5 דוחה כל מחרוזת שאינה מילה).
 *
 * ⛔ הרצפות מוכרזות ב-`--en3-quota` **לפני** הדגימה, בדיוק כמו כל מכסה אחרת.
 * רצפה אינה בחירה ידנית של שורות: היא קובעת **כמה** מכל מחלקה, והזרע קובע
 * **אילו**. שאר המכסה מתחלק פרופורציונלית כמו קודם. */
const EN3_SEED = 'typo-lab/teacher/en3/v1';
const EN3_N = 40;
const EN3_FLOORS = {
  'word|neg-garbage': 5,
  'gloss|neg-garbage': 3,
  'gloss|sp-adj': 4,
  'gloss|sp-drop': 3,
  'gloss|sp-transpose': 3,
  'gloss|sp-double': 2,
};
const EN3_QUOTA = path.join(OUT, 'en-blind3.quota.json');

function en3Quota() {
  const all = readCorpus().filter(r => r.split === EN2_SPLIT);
  const byDir = {};
  for (const r of all) {
    (byDir[r.direction] || (byDir[r.direction] = { n: 0, cls: {} })).n++;
    byDir[r.direction].cls[r.source_class] = (byDir[r.direction].cls[r.source_class] || 0) + 1;
  }
  const floorTotal = Object.values(EN3_FLOORS).reduce((a, b) => a + b, 0);
  const rest = EN3_N - floorTotal;
  if (rest < 0) throw new Error('הרצפות עולות על גודל הסט');

  const largestRemainder = (weights, N) => {
    const keys = Object.keys(weights).sort();
    const sum = keys.reduce((a, k) => a + weights[k], 0);
    if (!sum || N <= 0) return Object.fromEntries(keys.map(k => [k, 0]));
    const exact = keys.map(k => ({ k, x: N * weights[k] / sum }));
    const out = {}; let used = 0;
    for (const e of exact) { out[e.k] = Math.floor(e.x); used += out[e.k]; }
    exact.sort((a, b) => (b.x - Math.floor(b.x)) - (a.x - Math.floor(a.x)) || a.k.localeCompare(b.k));
    for (let i = 0; used < N; i++, used++) out[exact[i % exact.length].k]++;
    return out;
  };

  /* היתרה מתחלקת פרופורציונלית על **כל** התאים, והרצפות נוספות מעליה */
  const flat = {};
  for (const d of Object.keys(byDir)) for (const c of Object.keys(byDir[d].cls)) flat[d + '|' + c] = byDir[d].cls[c];
  const spread = largestRemainder(flat, rest);
  const quota = {};
  for (const key of new Set([...Object.keys(flat), ...Object.keys(EN3_FLOORS)])) {
    const [d, c] = key.split('|');
    const v = (spread[key] || 0) + (EN3_FLOORS[key] || 0);
    if (!v) continue;
    const avail = (byDir[d] && byDir[d].cls[c]) || 0;
    if (v > avail) throw new Error(`⛔ ${key} · נדרשו ${v} ובאוכלוסייה יש ${avail}`);
    (quota[d] || (quota[d] = {}))[c] = v;
  }
  const tot = Object.values(quota).reduce((a, o) => a + Object.values(o).reduce((x, y) => x + y, 0), 0);
  if (tot !== EN3_N) throw new Error(`⛔ סכום המכסות ${tot} ולא ${EN3_N}`);

  let lock = 'UNKNOWN';
  try { lock = require('child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch (e) { /* ריפו לא זמין */ }

  fs.writeFileSync(EN3_QUOTA, JSON.stringify({
    what: 'מכסות en-blind3 · מוכרזות לפני הדגימה',
    lock_commit: lock, declared_at: new Date().toISOString().slice(0, 10),
    source: 'typo-lab/out/answers-en.jsonl',
    filter: { split: EN2_SPLIT, one_row_per_group: true, exclude_ids_from: 'en-blind2' },
    seed: EN3_SEED, n: EN3_N,
    floors: EN3_FLOORS,
    floors_rationale: 'neg-garbage · מחלקה A שהפילה את החוק ונכנסה לסט 2 במקרה. gloss/sp-* · מחלקה B, 5 מ-11 ההחטאות, נעדרה מסט 1 לגמרי.',
    method: 'יתרה (40 פחות רצפות) מתחלקת largest-remainder על כל התאים · הרצפות נוספות מעליה · דגימה ב-PRNG בזרע קבוע',
    quota,
  }, null, 1), 'utf8');

  say(`# מכסות · en-blind3 · ננעל על ${lock.slice(0, 7)}`);
  say('');
  say(`רצפות מוכרזות (${floorTotal} שורות) · יתרה פרופורציונלית (${rest} שורות)`);
  say('');
  say('| כיוון | source_class | מכסה | מזה רצפה |');
  say('|---|---|---|---|');
  for (const d of Object.keys(quota).sort()) for (const c of Object.keys(quota[d]).sort())
    say(`| ${d} | ${c} | **${quota[d][c]}** | ${EN3_FLOORS[d + '|' + c] || '—'} |`);
  say('');
  say(`סה"כ ${tot}`);
  say(`נכתב · ${path.relative(ROOT, EN3_QUOTA)}`);
}

function en3Sample() {
  if (!fs.existsSync(EN3_QUOTA)) throw new Error('⛔ אין קובץ מכסות · הרץ קודם --en3-quota');
  const q = JSON.parse(fs.readFileSync(EN3_QUOTA, 'utf8'));
  const all = readCorpus().filter(r => r.split === q.filter.split);
  /* ⛔⛔ **מניעת החפיפה מפתחת על תוכן ולא על מזהה. זה לא קוסמטי.**
   *
   * מה שהתגלה: `answers-en.jsonl` **נבנה מחדש** על ידי סוכן הקורפוס אחרי
   * ש-`en-blind2` נדגם. נבדק: ‏38 מתוך 40 מזהי-הקורפוס של `en-blind2` מצביעים
   * היום על **תוכן אחר** (`en-g-001628` היה `luck→מזל ממש`, היום `luck→זל`).
   *
   * לכן `prev.has(r.id)` היה עושה בדיוק את ההפך ממה שנועד: מחריג 40 שורות
   * שרירותיות, ו**לא** מונע דגימה חוזרת של אותו תוכן שכבר נשרף בסט השני.
   * מפתח התוכן `direction|term|typed` יציב מול בנייה מחדש של הקורפוס.
   *
   * ⚠ `en-blind2` עצמו לא נפגע — הוא קובץ קפוא, והציון חושב מולו ולא מול
   * הקורפוס. מה שנפגע הוא רק ההנחה שאפשר להצביע ממנו חזרה לקורפוס. */
  const ckey = (dir, term, typed) => [dir, String(term).trim(), String(typed).trim()].join('');
  const prev = new Set();
  const pt = path.join(OUT, 'en-blind2.tsv');
  if (fs.existsSync(pt)) {
    const lines = fs.readFileSync(pt, 'utf8').split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).slice(1);
    for (const l of lines) { const c = l.split('\t'); prev.add(ckey(c[1], c[2], c[5])); }
  }
  if (!prev.size) throw new Error('⛔ לא נטענו שורות מ-en-blind2 · מניעת החפיפה לא תעבוד');

  const rows = [], design = [], usedGroups = new Set();
  for (const dir of Object.keys(q.quota).sort()) {
    for (const cls of Object.keys(q.quota[dir]).sort()) {
      const need = q.quota[dir][cls];
      const pool = all.filter(r => r.direction === dir && r.source_class === cls && !prev.has(ckey(r.direction, r.card_term, r.typed)))
        .sort((a, b) => a.id.localeCompare(b.id));
      const rnd = rngOf(q.seed + '|' + dir + '|' + cls);
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      let took = 0;
      for (const r of pool) {
        if (took >= need) break;
        if (q.filter.one_row_per_group && usedGroups.has(r.group)) continue;
        usedGroups.add(r.group); took++;
        const id = 'Y' + String(rows.length + 1).padStart(2, '0');
        rows.push({ id, dir: r.direction, term: r.card_term, gloss: r.card_gloss, written: r.direction === 'word' ? r.card_term : r.card_gloss, typed: r.typed });
        design.push({ id, dir: r.direction, cls: r.source_class, why: 'נדגם מכנית', corpus_id: r.id, group: r.group });
      }
      if (took < need) say(`⚠ ${dir}/${cls} · נדרשו ${need} ונמצאו ${took}`);
    }
  }
  if (rows.length !== EN3_N) throw new Error(`⛔ נדגמו ${rows.length} ולא ${EN3_N}`);

  const hdr = `# en-blind3 · סט חוץ-מדגם שלישי · נדגם מכנית מ-answers-en.jsonl (split=${q.filter.split})\n`
    + `# ⛔ הפאנל שנבחן כאן ננעל בקומיט ${q.lock_commit} **לפני** שנדגמה שורה אחת\n`
    + `# זרע ${q.seed} · מכסות ורצפות ב-en-blind3.quota.json · אין חפיפה עם en-blind2\n`
    + EN_HDR;
  const clean = s => String(s == null ? '' : s).replace(/[\t\r\n]+/g, ' ').trim();
  fs.writeFileSync(path.join(OUT, 'en-blind3.tsv'),
    [hdr].concat(rows.map(r => ['id', 'dir', 'term', 'gloss', 'written', 'typed'].map(c => clean(r[c])).join('\t') + '\t')).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT, 'en-blind3.design.json'), JSON.stringify({
    generated: 'typo-lab/calib_mine.js --en3', lock_commit: q.lock_commit, seed: q.seed,
    truth: 'לא ידועה · דורש תיוג אנושי', rows: design,
  }, null, 1), 'utf8');

  const txt = fs.readFileSync(path.join(OUT, 'en-blind3.tsv'), 'utf8');
  for (const bad of [...new Set(design.map(d => d.cls))]) if (txt.includes(bad)) throw new Error(`⛔ «${bad}» דלף לקובץ העיוור`);
  const overlap = rows.filter(r => prev.has(ckey(r.dir, r.term, r.typed))).length;
  if (overlap) throw new Error(`⛔ ${overlap} שורות חופפות ל-en-blind2`);

  const byCls = {};
  for (const d of design) byCls[d.dir + '·' + d.cls] = (byCls[d.dir + '·' + d.cls] || 0) + 1;
  say(`נכתב · out/en-blind3.tsv · ${rows.length} שורות · ננעל על ${q.lock_commit.slice(0, 7)} · אפס חפיפה עם en-blind2`);
  say('');
  say('| כיוון·מחלקה | שורות |');
  say('|---|---|');
  for (const k of Object.keys(byCls).sort()) say(`| ${k} | ${byCls[k]} |`);
  say('');
  say(`word ${design.filter(d => d.dir === 'word').length} · gloss ${design.filter(d => d.dir === 'gloss').length}`);
}

/* ===================== שיניים ===================== */

function selftest() {
  let ok = true;
  const t = (c, m) => { say(`  ${c ? '✅' : '⛔'} ${m}`); if (!c) ok = false; };
  const c = getCtx('he');

  say('## א · הפסילה שמגדירה את הסט · נרדפות אינן שליליים');
  const A = new Set(c.norm('נמנע מלבקר, הגיע לעתים רחוקות').split(/\s+/));
  t(jac(A, A) === 1, 'פירוש זהה ⇒ ז\'קארד 1');
  t(jac(A, A) > JACCARD_MAX, `⛔ ז'קארד 1 חורג מ-${JACCARD_MAX} ⇒ **נפסל** · הדיר/הוקיר רגליו לא ייכנס`);
  const far = new Set(c.norm('מתקנ מסתובב להכנת כלי חרס').split(/\s+/));
  t(jac(A, far) < JACCARD_MIN, '⛔ שני פירושים זרים ⇒ נפסלים גם הם · הסט אינו "כל זוג"');

  say('## ב · הקובץ העיוור נשאר עיוור');
  for (const f of ['near-neg-blind', 'en-blind', 'en-blind2', 'en-blind3']) {
    const p = path.join(OUT, f + '.tsv');
    if (!fs.existsSync(p)) { say(`  · ${f}.tsv טרם נוצר · דילוג`); continue; }
    const txt = fs.readFileSync(p, 'utf8');
    const d = JSON.parse(fs.readFileSync(path.join(OUT, f + '.design.json'), 'utf8'));
    const classes = [...new Set(d.rows.map(r => r.cls))];
    t(!classes.some(x => txt.includes(x)), `${f}.tsv · אין בו אף שם מחלקה (${classes.length} מחלקות נבדקו)`);
    /* שורות `#` הן פרובננס (‏hash הנעילה) ואינן נתונים · מדלגים עליהן */
    const body = txt.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
    const head = body[0], lines = body.slice(1);
    const nCol = head.split('\t').length;
    t(lines.every(l => l.split('\t').length === nCol), `${f}.tsv · לכל שורה ${nCol} עמודות`);
    t(lines.every(l => l.split('\t')[nCol - 1].trim() === ''), `${f}.tsv · **עמודת התווית ריקה בכל השורות**`);
    t(lines.length === d.rows.length, `${f}.tsv · ${lines.length} שורות = ${d.rows.length} ברישום התכן`);
    /* ⛔ שום עמודה שאינה קלט · פסק, ניקוד, margin, מרחק, מקור */
    const BANNED = ['margin', 'verdict', 'score', 'label', 'source_class', 'פסק', 'ניקוד', 'מרחק', 'confidence', 'dist'];
    const hit = BANNED.filter(b => head.toLowerCase().includes(b.toLowerCase()));
    t(!hit.length, `${f}.tsv · אין עמודת פסק/margin/מקור בכותרת${hit.length ? ' ⛔ נמצא: ' + hit.join(',') : ''}`);
    t(!/\b(margin|verdict|conf(idence)?)\b/i.test(txt), `${f}.tsv · אין margin/verdict בשום מקום בגוף`);
  }

  /* ⭐ שיניים · קובץ מורעל **חייב** להיכשל בשער. שער שלא נראה אדום אינו שער. */
  {
    const p = path.join(OUT, '_selftest-blind.tsv');
    const check = txt => {
      const body = txt.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#'));
      const head = body[0], lines = body.slice(1), nCol = head.split('\t').length;
      const emptyLabel = lines.every(l => l.split('\t')[nCol - 1].trim() === '');
      const noBanned = !['margin', 'verdict', 'score'].some(b => head.toLowerCase().includes(b));
      return emptyLabel && noBanned;
    };
    try {
      t(check('a\tb\tתווית\nX1\ty\t\n'), 'קובץ נקי עובר את השער · השער אינו "פוסל הכול"');
      t(!check('a\tb\tתווית\nX1\ty\tכ\n'), '⛔ קובץ עם תווית מלאה ⇒ **נכשל**');
      t(!check('a\tb\tmargin\nX1\ty\t0.3\n'), '⛔ קובץ עם עמודת margin ⇒ **נכשל**');
      t(!check('a\tb\tverdict\nX1\ty\taccept\n'), '⛔ קובץ עם עמודת verdict ⇒ **נכשל**');
    } finally { if (fs.existsSync(p)) fs.unlinkSync(p); }
  }

  say('## ב2 · הסדר מוכח ולא מוצהר');
  for (const nm of ['en-blind2', 'en-blind3']) {
    const qp = path.join(OUT, nm + '.quota.json'), tp = path.join(OUT, nm + '.tsv');
    if (!fs.existsSync(qp) || !fs.existsSync(tp)) { say(`  · ${nm} טרם נוצר · דילוג`); continue; }
    const q = JSON.parse(fs.readFileSync(qp, 'utf8'));
    const txt = fs.readFileSync(tp, 'utf8');
    const d = JSON.parse(fs.readFileSync(path.join(OUT, nm + '.design.json'), 'utf8'));
    t(/^[0-9a-f]{40}$/.test(q.lock_commit), `${nm} · hash הנעילה תקין · ${q.lock_commit.slice(0, 7)}`);
    t(txt.includes(q.lock_commit), `${nm} · ⭐ **hash הנעילה כתוב בראש הקובץ** · הסדר מוכח מהגיט`);
    t(q.filter.split === 'holdout', `${nm} · נדגם מ-holdout בלבד`);
    const got = {};
    for (const r of d.rows) (got[r.dir] || (got[r.dir] = {}))[r.cls] = (got[r.dir][r.cls] || 0) + 1;
    let match = true;
    for (const dir of Object.keys(q.quota)) for (const c of Object.keys(q.quota[dir])) {
      if ((q.quota[dir][c] || 0) !== ((got[dir] || {})[c] || 0)) match = false;
    }
    t(match, `${nm} · ⭐ **המדגם תואם למכסה שהוכרזה** · אף שכבה לא הורחבה בדיעבד`);
    t(new Set(d.rows.map(r => r.group)).size === d.rows.length, `${nm} · שורה אחת לכל כרטיס`);
    /* ⭐ שתי הדרישות שנגזרו מ-11 ההחטאות · חייבות להיות בסט השלישי */
    if (nm === 'en-blind3') {
      const cnt = f => d.rows.filter(f).length;
      const garbage = cnt(r => r.cls === 'neg-garbage');
      const heTypo = cnt(r => r.dir === 'gloss' && /^sp-/.test(r.cls));
      t(garbage >= 8, `⭐ neg-garbage · ${garbage} שורות · מחלקה A שהפילה את החוק`);
      t(heTypo >= 10, `⭐ שגיאות כתיב עבריות בכיוון gloss · ${heTypo} שורות · מחלקה B`);
      /* ⛔ אפס חפיפה עם הסט השני · **לפי תוכן**, כי הקורפוס נבנה מחדש */
      const p2 = path.join(OUT, 'en-blind2.tsv');
      if (fs.existsSync(p2)) {
        const key = (a, b, c2) => [a, String(b).trim(), String(c2).trim()].join('');
        const prev = new Set(fs.readFileSync(p2, 'utf8').split(/\r?\n/)
          .filter(l => l.trim() && !l.startsWith('#')).slice(1)
          .map(l => { const c2 = l.split('\t'); return key(c2[1], c2[2], c2[5]); }));
        const mine = txt.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#')).slice(1)
          .map(l => { const c2 = l.split('\t'); return key(c2[1], c2[2], c2[5]); });
        t(prev.size > 0 && !mine.some(k => prev.has(k)), '⭐ ⛔ אפס חפיפת **תוכן** עם en-blind2 · לא לפי מזהה, כי הקורפוס נבנה מחדש');
      }
    }
  }

  say('## ג · דטרמיניזם');
  t(skel('גַּנָּב') === skel('גְּנֵבָה').slice(0, skel('גַּנָּב').length) || skel('גַּנָּב') !== '', 'שלד עיצורי מחזיר מחרוזת');
  t(skel('אָבְנַיִים') === skel('אָבְנַיִים'), 'שלד יציב');

  say('');
  say(ok ? '✅ כל השיניים נשכו' : '⛔ שן שבורה · יציאה 1');
  if (!ok) process.exitCode = 1;
}

if (require.main === module) {
  try {
    if (has('--near-neg')) nearNeg();
    else if (has('--en')) enSet();
    else if (has('--en2-quota')) en2Quota();
    else if (has('--en2')) en2Sample();
    else if (has('--en3-quota')) en3Quota();
    else if (has('--en3')) en3Sample();
    else if (has('--selftest')) { say('# שיניים · calib_mine.js'); say(''); selftest(); }
    else say('שימוש: --near-neg | --en | --en2-quota | --en2 | --en3-quota | --en3 | --selftest');
  } catch (e) { say('⛔ ' + e.message); process.exitCode = 1; }
}

module.exports = { nearNeg, enSet, en2Quota, en2Sample, en3Quota, en3Sample, skel, jac, JACCARD_MIN, JACCARD_MAX };
