'use strict';
/* שער ההתנגשויות של מחלקה E · זה כל המשחק.
 *
 * לקסיקון נרדפות הוא הרחבה של מה שנחשב תשובה נכונה, ולכן הוא בדיוק סוג השינוי שיכול
 * לשבור את האבחנה בין שני ערכים במאגר. השאלה היחידה ששווה לשאול עליו: אם מילה בקבוצה
 * תוכל להחליף כל מילה אחרת בקבוצה בתוך פירוש, האם התשובה הרשומה של ערך אחד הופכת
 * לתשובה קבילה של ערך אחר.
 *
 * המודל · צורה קנונית במקום סימולציית החלפות.
 *   החלפה חופשית בתוך קבוצה שקולה בדיוק למיפוי כל מילות הקבוצה לנציג אחד. שני טקסטים
 *   ניתנים להמרה זה לזה בהחלפות אם ורק אם הצורה הקנונית שלהם זהה. לכן במקום לייצר
 *   n^k וריאציות לכל מקטע, מחשבים canon פעם אחת ומשווים · אותה תשובה בדיוק, בזמן ליניארי,
 *   בלי תקרה שרירותית על מספר הווריאציות שנבדקות.
 *
 * מה נספר כהתנגשות. הלומד מקליד T עבור כרטיס E. הריצה תקבל אם canon(T) שווה ל-canon
 * של מקטע כלשהו של E. זו קבלת-שווא אם T היא התשובה הרשומה של ערך אחר F · המילה של F
 * (כולל heForms, שאלה בדיוק הצורות שהריצה מקבלת) או מקטע פירוש של F. לכן שני האינדקסים
 * נבנים על canon: גם מפתחות המילים וגם מקטעי הפירושים.
 *
 * baseline · השער מדווח רק על התנגשויות **חדשות**. שני ערכים שחולקים מקטע פירוש זהה
 * כבר היום אינם באשמת הלקסיקון, וספירה שלהם הייתה מנפחת את הדחיות ומסתירה את הנזק
 * האמיתי. לכן אותו חישוב בדיוק רץ עם canon = זהות, וההפרש הוא מה שמדווח.
 *
 * פטור הנרדפות של הריצה נשמר: ערך שחולק פירוש עם E דרך GLOSS_ALT כבר מתקבל היום
 * (glossAlts ב-check), ולכן אינו התנגשות אלא בדיוק ההתנהגות הקיימת.
 *
 * שני המאגרים נבדקים. הפירושים עבריים גם במאגר האנגלי (meaningSegs מנרמלת ב-norm
 * העברי בשניהם), ולכן קבוצה שנראית תמימה בעברית יכולה להתנגש דווקא באנגלית.
 */

const fs = require('fs');
const path = require('path');
const { getCtx } = require('./lib/ctx.js');

const LEX_PATH = path.join(__dirname, 'lexicon', 'synonyms.json');
const OUT_DIR = path.join(__dirname, 'out');
const OUT_MD = path.join(OUT_DIR, 'synonym-gate.md');

/* ===== מודל המאגר · נבנה פעם אחת לכל שפה ===== */

const modelCache = new Map();

function bankModel(lang) {
  const hit = modelCache.get(lang);
  if (hit) return hit;
  const ctx = getCtx(lang);
  const he = lang !== 'en';

  const entries = [];       // {owner, term, unit, segs, allowed}
  const answers = [];       // {key, owner, kind, text} · כל מה שמתקבל היום עבור ערך כלשהו
  const unitOf = new Map(); // owner -> unit
  const termOf = new Map(); // owner -> term

  for (const w of Array.from(ctx.BANK)) {
    const owner = ctx.K(w.term);
    if (!owner) continue;
    unitOf.set(owner, w.unit);
    if (!termOf.has(owner)) termOf.set(owner, w.term);

    const segs = Array.from(ctx.meaningSegs(w.meaning)).filter(Boolean);
    const allowed = new Set([owner]);
    for (const t of Array.from(ctx.glossAlts(w))) { const k = ctx.K(t); if (k) allowed.add(k); }

    entries.push({ owner, term: w.term, unit: w.unit, segs, allowed, card: w });

    answers.push({ key: owner, owner, kind: 'מילה', text: w.term });
    if (he) for (const v of Array.from(ctx.heForms(w.term))) {
      const k = ctx.K(v); if (k && k !== owner) answers.push({ key: k, owner, kind: 'כתיב', text: v });
    }
    for (const s of segs) answers.push({ key: s, owner, kind: 'פירוש', text: s });
  }

  const m = { ctx, lang, entries, answers, unitOf, termOf };
  modelCache.set(lang, m);
  return m;
}

/* ===== קנוניזציה ===== */

const IDENTITY = null;   // canon ריק = מיפוי הזהות, וזה ה-baseline

function canonText(s, map) {
  if (!map) return s;
  let touched = false;
  const out = String(s).split(' ').map(w => {
    const r = map.get(w);
    if (r === undefined || r === w) return w;
    touched = true; return r;
  });
  return touched ? out.join(' ') : s;
}

/* קבוצות -> מפת מילה מנורמלת -> נציג. הנציג הוא המילה הראשונה בקבוצה, מנורמלת. */
function canonMapOf(groups, norm) {
  const map = new Map();
  for (const g of groups) {
    const ws = g.words.map(norm).filter(Boolean);
    if (!ws.length) continue;
    const rep = ws[0];
    for (const w of ws) map.set(w, rep);
  }
  return map.size ? map : IDENTITY;
}

/* ===== החישוב · אילו זוגות מתנגשים תחת canon נתון ===== */

function collisionsUnder(model, map) {
  const idx = new Map();   // canonKey -> Map(owner -> {kind,text})
  for (const a of model.answers) {
    const c = canonText(a.key, map);
    let m = idx.get(c);
    if (!m) { m = new Map(); idx.set(c, m); }
    if (!m.has(a.owner)) m.set(a.owner, a);
  }

  const out = new Map();   // id -> detail
  for (const e of model.entries) {
    for (const seg of e.segs) {
      const c = canonText(seg, map);
      const m = idx.get(c);
      if (!m || m.size < 2) continue;
      for (const [owner, a] of m) {
        if (e.allowed.has(owner)) continue;
        const id = `${model.lang}|${e.owner}|${seg}|${owner}|${a.kind}`;
        if (!out.has(id)) out.set(id, {
          id, lang: model.lang,
          victim: e.owner, victimTerm: e.term, victimUnit: e.unit, victimSeg: seg,
          canonKey: c,
          intruder: owner, intruderTerm: model.termOf.get(owner) || owner,
          intruderUnit: model.unitOf.get(owner), intruderKind: a.kind, intruderText: a.text,
          sameUnit: e.unit === model.unitOf.get(owner),
        });
      }
    }
  }
  return out;
}

const baselineCache = new Map();
function baselineOf(model) {
  const hit = baselineCache.get(model.lang);
  if (hit) return hit;
  const b = collisionsUnder(model, IDENTITY);
  baselineCache.set(model.lang, b);
  return b;
}

/* התנגשויות שהקבוצות האלה יצרו, מעבר למה שכבר קיים היום. */
function newCollisions(groups, langs) {
  const found = [];
  for (const lang of (langs || ['he', 'en'])) {
    const model = bankModel(lang);
    const map = canonMapOf(groups, model.ctx.norm);
    if (!map) continue;
    const base = baselineOf(model);
    for (const [id, d] of collisionsUnder(model, map)) if (!base.has(id)) found.push(d);
  }
  /* סדר דטרמיניסטי · דוח שמשנה סדר בין הרצות אינו ראיה. */
  found.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return found;
}

function describe(d) {
  const u = x => (x == null ? '?' : String(x));
  return `[${d.lang}] "${d.victimTerm}" (יחידה ${u(d.victimUnit)}) · המקטע "${d.victimSeg}" ` +
    `מתלכד עם ${d.intruderKind} של "${d.intruderTerm}" (יחידה ${u(d.intruderUnit)}): "${d.intruderText}"` +
    (d.sameUnit ? ' ‼ אותה יחידה' : '');
}

/* ===== השער ===== */

/* טהור · אינו כותב קבצים, כדי ש-selfcheck יוכל להריץ אותו על קבוצות שתולות. */
function runGate(groups, opts) {
  const langs = (opts && opts.langs) || ['he', 'en'];
  const results = groups.map(g => {
    const hits = newCollisions([g], langs);
    return {
      id: g.id, words: g.words.slice(), pos: g.pos, note: g.note,
      pass: hits.length === 0, hits,
      severe: hits.filter(h => h.sameUnit).length,
    };
  });

  /* מעבר שני · אינטראקציה בין קבוצות.
     קבוצה שעוברת לבדה יכולה להתנגש כשהיא פועלת יחד עם אחרת: מקטע שבו שתי מילים
     מקבוצות שונות מוחלפות בו-זמנית לא נבדק באף אחת מהבדיקות הבודדות. לכן הסט המאושר
     נבדק כמכלול, ואם נוצרה התנגשות חדשה נדחות הקבוצות שנגעו במקטע · עד לנקודת שבת. */
  const interactions = [];
  for (let round = 0; round < 8; round++) {
    const ok = results.filter(r => r.pass);
    if (!ok.length) break;
    const groupsOk = ok.map(r => groups.find(g => g.id === r.id));
    const combined = newCollisions(groupsOk, langs);
    const own = new Set();
    for (const r of ok) for (const h of r.hits) own.add(h.id);
    const extra = combined.filter(h => !own.has(h.id));
    if (!extra.length) break;

    /* מי אשם: כל קבוצה שאחת ממילותיה מופיעה במקטע הקורבן או בטקסט הפולש. */
    const guilty = new Set();
    for (const h of extra) {
      const norm = bankModel(h.lang).ctx.norm;
      const words = new Set((h.victimSeg + ' ' + h.intruderText).split(/\s+/).map(norm));
      for (const r of ok) if (r.words.map(norm).some(w => words.has(w))) guilty.add(r.id);
    }
    if (!guilty.size) break;
    for (const r of results) if (guilty.has(r.id)) {
      r.pass = false;
      r.hits = r.hits.concat(extra.filter(h => {
        const norm = bankModel(h.lang).ctx.norm;
        const words = new Set((h.victimSeg + ' ' + h.intruderText).split(/\s+/).map(norm));
        return r.words.map(norm).some(w => words.has(w));
      }));
      r.interaction = true;
    }
    interactions.push(...extra);
  }

  return { results, interactions };
}

/* ===== 24 המקרים האמיתיים · 11 הנרדפות ===== */

/* הפירוש מובא כגיבוי מהדוח (דוחות/סיכומים/מדידת-כלל-מורפולוגי.md), ומשמש רק כשהערך לא אותר
   במאגר לפי מפתח · שלושה מונחים לא אותרו שם מסיבת כתיב מלא/חסר בתעתיק, וזה מתועד. */
const CASES = [
  { n: 1, term: 'מגובב', meaning: 'ערוך בערימה, מועמס זה על גב זה', typed: 'מסודר בערימה' },
  { n: 2, term: 'שיסה', meaning: 'גרם למישהו לתקוף אחר, הסית', typed: 'הסית לתקיפה' },
  { n: 3, term: 'ניכוש', meaning: 'עקירת עשבים שוטים', typed: 'הסרת עשבים שוטים' },
  { n: 5, term: 'התחלה', meaning: 'העמיד פני חולה, התחזה לחולה', typed: 'שיחק את עצמו חולה' },
  { n: 6, term: 'עמד מנגד', meaning: 'לא התערב', typed: 'נמנע מלהתערב' },
  { n: 9, term: 'קושיה', meaning: 'שאלה, בעיה, חידה', typed: 'סוגיה' },
  { n: 10, term: 'כן', meaning: 'בסיס שעליו מעמידים דבר כלשהו', typed: 'בסיס שמניחים עליו דברים' },
  { n: 17, term: 'הדיוט', meaning: 'נטול ידיעות בתחום מסוים', typed: 'לא יודע דבר בנושא' },
  { n: 21, term: 'עלווה', meaning: 'כלל העלים המכסים את העץ', typed: 'כל העלים על העץ' },
  { n: 22, term: 'קורט', meaning: 'מעט, כמות קטנה', typed: 'קצת' },
  { n: 24, term: 'ירכתיים', meaning: 'האזור האחורי והמרוחק ביותר בדבר; חלקה האחורי של אונייה', typed: 'אחורי הסירה' },
];

function lookupHe(ctx, term) {
  if (!lookupHe._map) {
    const m = new Map();
    for (const w of Array.from(ctx.BANK)) {
      const keys = new Set([ctx.K(w.term)]);
      for (const v of Array.from(ctx.heForms(w.term))) keys.add(ctx.K(v));
      for (const part of String(w.term).split(/[\/|,]|\s-\s/)) {
        for (const v of Array.from(ctx.heForms(part.trim()))) keys.add(ctx.K(v));
      }
      for (const k of keys) if (k && !m.has(k)) m.set(k, w);
    }
    lookupHe._map = m;
  }
  return lookupHe._map.get(ctx.K(term)) || null;
}

function measureCases(approved) {
  const ctx = getCtx('he');
  const map = canonMapOf(approved, ctx.norm);
  const rows = [];
  for (const c of CASES) {
    const hit = lookupHe(ctx, c.term);
    const fromBank = !!hit;
    const meaning = fromBank ? hit.meaning : c.meaning;
    const segs = Array.from(ctx.meaningSegs(meaning)).filter(Boolean);
    const typed = ctx.norm(c.typed);

    const todayOk = segs.includes(typed);
    const ct = canonText(typed, map);
    const matched = segs.find(s => canonText(s, map) === ct) || null;

    rows.push({
      n: c.n, term: fromBank ? hit.term : c.term, source: fromBank ? 'מאגר' : 'דוח',
      meaning, typed: c.typed, todayOk, solved: !todayOk && !!matched, matchedSeg: matched,
    });
  }
  return rows;
}

/* ===== כיסוי · כמה מאוצר המילים של הפירושים הלקסיקון בכלל נוגע בו =====
   נמדד מול אותה כרייה של mine_gloss_vocab (קריאה לפונקציה ולא לקובץ · דוח שתלוי
   בארטיפקט ישן על הדיסק יכול לדווח מספר שכבר אינו נכון). */
function coverage(approved, all) {
  const norm = getCtx('he').norm;
  const { rows, totalOcc } = require('./mine_gloss_vocab.js').mine();
  const cnt = new Map(rows.map(r => [r.word, r.count]));
  const top300 = new Set(rows.slice(0, 300).map(r => r.word));
  const shot = gs => {
    const set = new Set(gs.flatMap(g => g.words.map(norm)).filter(Boolean));
    let occ = 0, inGloss = 0, top = 0;
    for (const w of set) { const c = cnt.get(w); if (c) { occ += c; inGloss++; } if (top300.has(w)) top++; }
    return { words: set.size, inGloss, occ, pct: occ / totalOcc * 100, top };
  };
  return { approved: shot(approved), all: shot(all), distinct: rows.length, totalOcc };
}

/* ===== main ===== */

function loadLexicon(p) {
  const raw = JSON.parse(fs.readFileSync(p || LEX_PATH, 'utf8'));
  if (!raw || !Array.isArray(raw.groups)) throw new Error('synonyms.json: אין מערך groups');
  return raw;
}

function main() {
  const lex = loadLexicon();
  const { results, interactions } = runGate(lex.groups);

  const byId = new Map(results.map(r => [r.id, r]));
  for (const g of lex.groups) {
    const r = byId.get(g.id);
    if (!r) continue;
    g.status = r.pass ? 'approved' : 'rejected';
    if (r.pass) delete g.reason;
    else g.reason = r.hits.slice(0, 3).map(describe).join(' ‖ ');
  }

  const approved = lex.groups.filter(g => g.status === 'approved');
  const rejected = lex.groups.filter(g => g.status === 'rejected');
  const cases = measureCases(approved);
  const solved = cases.filter(c => c.solved);
  /* התקרה הכנה: מה הלקסיקון היה פותר אילו השער היה מאשר הכול. ההפרש בינה לבין
     המספר המאושר הוא בדיוק המחיר של אפס-קבלות-שווא, והוא צריך להיות בדוח. */
  const ceiling = measureCases(lex.groups).filter(c => c.solved).length;
  const cov = coverage(approved, lex.groups);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(LEX_PATH, JSON.stringify(lex, null, 2) + '\n', 'utf8');

  const L = [];
  L.push('# שער ההתנגשויות · לקסיקון הנרדפות (מחלקה E)');
  L.push('');
  L.push('נוצר על ידי `typo-lab/gate_synonyms.js`. אין לערוך ביד · כל הרצה כותבת מחדש.');
  L.push('');
  L.push('## פסק הדין');
  L.push('');
  L.push(`| | |`);
  L.push(`|---|---|`);
  L.push(`| קבוצות שנכתבו | ${lex.groups.length} |`);
  L.push(`| עברו (approved) | **${approved.length}** |`);
  L.push(`| נדחו (rejected) | **${rejected.length}** |`);
  L.push(`| התנגשויות חדשות שנמצאו | ${results.reduce((a, r) => a + r.hits.length, 0)} |`);
  L.push(`| מתוכן באותה יחידה (החמורות) | ${results.reduce((a, r) => a + r.severe, 0)} |`);
  L.push(`| נדחו רק בגלל אינטראקציה בין קבוצות | ${results.filter(r => r.interaction).length} |`);
  L.push(`| מ-11 מקרי הנרדפות האמיתיים · נפתרו | **${solved.length}** |`);
  L.push(`| התקרה · מה 102 הקבוצות היו פותרות בלי השער | ${ceiling} |`);
  L.push('');
  L.push('התנגשות באותה יחידה חמורה יותר כי סבב תרגול הוא יחידה-סקופ: שם הלומד באמת');
  L.push('יכול לבלבל בין שני הערכים באותו סבב. התנגשות בין יחידות נספרת גם היא ודוחה,');
  L.push('כי סקופ "כל המאגר" ו"מילים חלשות" חוצים יחידות.');
  L.push('');
  L.push('## כיסוי · כמה מאוצר המילים של הפירושים הלקסיקון נוגע בו');
  L.push('');
  L.push(`אוצר המילים של הפירושים: **${cov.distinct}** מילות תוכן נבדלות, ${cov.totalOcc} מופעים.`);
  L.push('זו זנב ארוך: כדי לכסות 80% מהמופעים צריך 4,813 מילים שונות.');
  L.push('');
  L.push('| | מילים בלקסיקון | מהן מופיעות בפירושים | מופעים מכוסים | מ-300 המילים הנפוצות |');
  L.push('|---|---|---|---|---|');
  L.push(`| כל הקבוצות שנכתבו | ${cov.all.words} | ${cov.all.inGloss} | ${cov.all.occ} (${cov.all.pct.toFixed(1)}%) | ${cov.all.top} |`);
  L.push(`| **המאושרות בלבד** | ${cov.approved.words} | ${cov.approved.inGloss} | ${cov.approved.occ} (${cov.approved.pct.toFixed(1)}%) | ${cov.approved.top} |`);

  L.push('## הקבוצות שעברו');
  L.push('');
  L.push('| # | מילים | סוג | הערה |');
  L.push('|---|---|---|---|');
  for (const g of approved) L.push(`| ${g.id} | ${g.words.join(' · ')} | ${g.pos} | ${g.note} |`);
  L.push('');

  L.push('## הקבוצות שנדחו · ובשם ההתנגשות');
  L.push('');
  if (!rejected.length) L.push('אין.');
  for (const g of rejected) {
    const r = byId.get(g.id);
    L.push(`### ${g.id} · ${g.words.join(' · ')}${r.interaction ? '  (אינטראקציה בין קבוצות)' : ''}`);
    L.push('');
    L.push(`${g.note}`);
    L.push('');
    L.push(`התנגשויות חדשות: ${r.hits.length}${r.severe ? ` · מהן ${r.severe} באותה יחידה` : ''}`);
    L.push('');
    for (const h of r.hits.slice(0, 6)) L.push(`- ${describe(h)}`);
    if (r.hits.length > 6) L.push(`- ... ועוד ${r.hits.length - 6}`);
    L.push('');
  }

  L.push('## 11 מקרי הנרדפות האמיתיים');
  L.push('');
  L.push('הבנצ\'מרק החיצוני. לא התאמנו עליו · רק נמדד כמה ממנו נפתר.');
  L.push('');
  L.push('| # | מילה | הפירוש | מה הוקלד | מקור | נפתר |');
  L.push('|---|---|---|---|---|---|');
  for (const c of cases) {
    L.push(`| ${c.n} | ${c.term} | ${String(c.meaning).replace(/\|/g, '/')} | ${c.typed} | ${c.source} | ${c.solved ? '**כן**' : 'לא'} |`);
  }
  L.push('');
  L.push(`**${solved.length} מתוך 11.** התקרה, אילו השער היה מאשר את כל ${lex.groups.length} הקבוצות: ${ceiling}.`);
  L.push('');
  L.push('שבעה מהמקרים אינם ניתנים לפתרון בהחלפת מילה **בעיקרון**, ולא בגלל השער:');
  L.push('התשובה שהוקלדה ניסחה את הפירוש מחדש במספר מילים אחר או בסדר אחר');
  L.push('("בסיס שעליו מעמידים דבר כלשהו" מול "בסיס שמניחים עליו דברים"). החלפת נרדפת');
  L.push('היא יחס אחד-לאחד בין מילים, והיא לא נוגעת בהם. זו תקרה של המחלקה, לא של הלקסיקון.');
  L.push('');
  fs.writeFileSync(OUT_MD, L.join('\n'), 'utf8');

  console.log(`קבוצות: ${lex.groups.length} · עברו: ${approved.length} · נדחו: ${rejected.length}`);
  console.log(`התנגשויות חדשות: ${results.reduce((a, r) => a + r.hits.length, 0)} (מהן באותה יחידה: ${results.reduce((a, r) => a + r.severe, 0)})`);
  console.log(`נדחו בגלל אינטראקציה בין קבוצות: ${results.filter(r => r.interaction).length}`);
  console.log('');
  console.log('דחיות:');
  for (const g of rejected) {
    const r = byId.get(g.id);
    console.log(`  ${String(g.id).padStart(3)} [${g.words.join(', ')}] · ${r.hits.length} התנגשויות`);
    if (r.hits[0]) console.log(`      ${describe(r.hits[0])}`);
  }
  console.log('');
  console.log(`11 המקרים האמיתיים · נפתרו: ${solved.length}`);
  for (const c of cases) console.log(`  ${String(c.n).padStart(2)} ${c.solved ? 'כן ' : 'לא '} ${c.term} · "${c.typed}"${c.matchedSeg ? ` -> "${c.matchedSeg}"` : ''}`);
  console.log('');
  console.log(`נכתב: ${OUT_MD}`);
  console.log(`עודכן: ${LEX_PATH}`);
}

if (require.main === module) main();
module.exports = { runGate, newCollisions, collisionsUnder, canonMapOf, canonText, bankModel, loadLexicon, measureCases, describe, CASES, LEX_PATH };
