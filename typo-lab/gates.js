'use strict';
/* מקרים שתולים עם שיניים מוכחות · typo-lab/gates.js
 *
 *   node typo-lab/gates.js              הרצת השערים על הפרמטרים הנשלחים
 *   node typo-lab/gates.js --selftest   הוכחה שכל שער יודע להיכשל
 *
 * ===== למה כל מקרה נבחר מהנתונים ולא מוקלד ביד =====
 *
 * מילה עברית מקובעת בקוד נרקבת. המאגר גדל, ערך משנה ניקוד, וריאציה מפסיקה להיות
 * דו-משמעית · והשער ממשיך לדווח ירוק על מקרה שכבר אינו המקרה שהוא נועד לבדוק. לכן כל
 * שער כאן **בוחר** את המקרה שלו מהדאטהסט או מהמאגר לפי קריטריון כתוב, ומדפיס גם את
 * המקרה שנבחר וגם את הסיבה שבגללה הוא נבחר. ריצה על מאגר אחר תבחר מקרה אחר ותישאר
 * תקפה.
 *
 * ===== ולמה שער שעובר אינו עדות =====
 *
 * ‏CLAUDE.md של הפרויקט: שער שמדווח "עבר" בלי הוכחת שיניים אינו עדות. זה קרה כאן שלוש
 * פעמים. ולכן ‎--selftest מריץ את **כל** השערים מול ארבעה קלקולים שתולים, ודורש שכל שער
 * ייתפס על ידי לפחות אחד מהם:
 *
 *   bad      · הפרמטרים המתירניים מהמפרט: minLen 0, סף 9, vetoMargin 0
 *   noVeto   · בודק אמיתי שהווטו שלו רוקן ושולי הדו-משמעות כובו · הקלקול המבני
 *   zero     · אפס סובלנות בכל הרצועות · בדיוק ‎enabled:false
 *   noToday  · שכבת ההתאמה של היום הוסרה · הקלקול שהופך רגרסיה לשקטה
 *
 * ארבעה ולא שניים, מפני ששניים אינם מספיקים ואמירה שהם מספיקים הייתה שקרית: שער
 * "הטעות מתקבלת" אינו יכול להיתפס בקלקול **מתירני**, כי מתירנות רק מרחיבה קבלה. הוא
 * נתפס בקלקול שמכבה את הסובלנות · zero. וכך גם שער אינווריאנט-הבסיס, שנתפס רק
 * ב-noToday. מטריצת התפיסות מודפסת במלואה, ואינה מסתירה תא ריק.
 */

const fs = require('fs');
const path = require('path');

const { getCtx } = require('./lib/ctx.js');
const { buildVeto } = require('./lib/veto.js');
const { acceptedKeys, acceptedSegs, acceptsToday } = require('./lib/keys.js');
const { makeChecker } = require('./lib/checker.js');
const { mulberry32 } = require('./lib/rng.js');
const BG = require('./bank_gate.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');

/* אובייקט הפרמטרים השתול · מועתק מילה במילה מהמפרט, ובכוונה בלי W: normalizeParams
   משלימה ברירות מחדל, וזה בדיוק המצב שהמפרט מתאר. */
const BAD_PARAMS = { enabled: true, minLen: 0, bands: [{ maxLen: 99, t: 9 }], vetoMargin: 0 };

const KINDS = ['bad', 'noVeto', 'zero', 'noToday'];
const KIND_HE = {
  plain: 'הנשלח', bad: 'פרמטרים מתירניים', noVeto: 'בלי הווטו',
  zero: 'אפס סובלנות', noToday: 'בלי שכבת היום',
};

/* ===== סביבה ===== */

/* ‏project מקצץ כל שורה לשדות שהשערים באמת קוראים. שמירת 89 אלף אובייקטים מלאים
   עלתה כאן ביותר מגיגה-בייט, וריצה שנחנקת בזיכרון אינה ראיה טובה יותר. */
function readJsonl(file, project) {
  if (!fs.existsSync(file)) return { rows: [], bad: 0, missing: true };
  const rows = [];
  let bad = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let r;
    try { r = JSON.parse(line); } catch (e) { bad++; continue; }
    rows.push(project ? project(r) : r);
  }
  return { rows, bad, missing: false };
}
const DS_FIELDS = r => ({ set: r.set, lang: r.lang, term: r.term, unit: r.unit, typed: r.typed, label: r.label, why: r.why, trusted: r.trusted });
const GOLD_FIELDS = r => ({ set: r.set, lang: r.lang, term: r.term, unit: r.unit, typed: r.typed, verdict: r.verdict });

function buildEnv() {
  const P = BG.shipParams();
  const lang = {};
  for (const L of ['he', 'en']) {
    const ctx = getCtx(L);
    const veto = buildVeto(ctx, L);
    const cards = Array.from(ctx.BANK);
    const byCard = new Map();
    const byKey = new Map();
    const info = [];
    for (const w of cards) {
      const owner = ctx.K(w.term);
      if (!owner) continue;
      byCard.set(String(w.term) + '|' + String(w.unit), w);
      const allowed = new Set([owner]);
      for (const t of Array.from(ctx.glossAlts(w))) { const k = ctx.K(t); if (k) allowed.add(k); }
      const e = { w, owner, term: w.term, unit: w.unit, allowed, keys: Array.from(acceptedKeys(w, ctx)).filter(Boolean), segs: Array.from(acceptedSegs(w, ctx)).filter(Boolean) };
      info.push(e);
      if (!byKey.has(owner)) byKey.set(owner, e);
    }
    lang[L] = { ctx, veto, cards, byCard, byKey, info, setKey: L === 'en' ? 'en-word' : 'he-word' };
  }

  const ds = ['dataset-he.jsonl', 'dataset-en.jsonl'].map(n => readJsonl(path.join(OUT, n), DS_FIELDS));
  const rows = ds.reduce((a, r) => a.concat(r.rows), []);
  const golden = readJsonl(path.join(OUT, 'golden.jsonl'), GOLD_FIELDS);

  return { P, lang, rows, dsBad: ds.reduce((a, r) => a + r.bad, 0), dsMissing: ds.some(r => r.missing), golden };
}

/* ===== מנוע · הבודק האמיתי, ומולו ארבעת הקלקולים ===== */

function makeEngine(kind, env) {
  const cache = new Map();
  const base = env.P.sets;
  function ck(L, setKey) {
    const id = L + '|' + setKey;
    let c = cache.get(id);
    if (c) return c;
    const M = env.lang[L];
    let params = base[setKey];
    let veto = M.veto;
    if (kind === 'bad') params = BAD_PARAMS;
    /* ‏`zero` הוא המודל של `enabled:false`, ולכן הוא חייב לאפס **את שני** וקטורי
       הספים. אפס רק ל-`bands` השאיר את המשטר הצר חי, ושער [6] דיווח 15 פערים
       ("miitgate" ~ mitigate התקבל כשהשכבה "כבויה"). המתג עצמו ב-app.js תקין —
       ‏`nearMatch` יוצאת בשורה הראשונה — זה **המודל כאן** שהתיישן ברגע שנשלח
       המשטר הצר, וזו בדיוק העדות שהשער אמור לתת. */
    else if (kind === 'zero') {
      const z = bs => (bs || []).map(b => ({ maxLen: b.maxLen, t: 0 }));
      params = Object.assign({}, params, { bands: z(params.bands) });
      if (params.bandsTight) params.bandsTight = z(params.bandsTight);
    }
    else if (kind === 'noVeto') {
      /* ריקון האינדקסים ולא דגל בקוד · דגל "אל תבדוק וטו" בקובץ ייצור הוא המתג שיישכח
         דלוק. שולי הדו-משמעות מכובים איתו, כי הם השכבה השנייה של אותו רעיון. */
      params = Object.assign({}, params, { vetoMargin: 0 });
      veto = { termKeys: new Map(), segKeys: new Map(), lang: L };
    }
    c = makeChecker(params, M.ctx, veto, L);
    cache.set(id, c);
    return c;
  }
  /* noToday מיושם כעטיפה ולא כמימוש מחדש: הוא הופך כל קבלה שהגיעה משכבת היום לדחייה,
     כלומר מדמה בדיוק את הרגרסיה "השכבה המדויקת נעלמה" בלי לשכפל שורת קוד. */
  const strip = v => (kind === 'noToday' && v.ok && v.via === 'exact') ? { ok: false, why: 'far' } : v;
  return {
    kind,
    word: (typed, card, L) => strip(ck(L, env.lang[L].setKey).acceptWord(typed, card)),
    gloss: (typed, card, L) => strip(ck(L, 'gloss').acceptGloss(typed, card)),
  };
}

/* ===== בחירת המקרים · פעם אחת, עם הבודק הנשלח ===== */

function pickAcceptedTypo(env, eng) {
  /* הקריטריון: שורה שהדאטהסט מתייג ראויה-לקבל, חד-משמעית (‏why=novel) ובת-אימות
     (‏trusted), שהחוק הנשלח מציל דרך הנתיב הפאזי · והארוכה מכולן. הארוכה, כי שם
     הסובלנות עובדת הכי קשה: ברצועה הארוכה הסף הוא הנמוך ביותר יחסית לאורך. */
  let scanned = 0, saved = 0, best = null;
  for (const r of env.rows) {
    if (r.label !== 'accept' || r.why !== 'novel' || r.trusted !== true) continue;
    if (r.set !== 'he-word' && r.set !== 'en-word') continue;
    const M = env.lang[r.lang];
    if (!M) continue;
    const card = M.byCard.get(String(r.term) + '|' + String(r.unit));
    if (!card) continue;
    scanned++;
    const v = eng.word(r.typed, card, r.lang);
    if (!v.ok || v.via !== 'typo') continue;
    saved++;
    const len = String(r.typed).length;
    if (!best || len > best.len ||
      (len === best.len && (r.typed < best.row.typed || (r.typed === best.row.typed && String(r.term) < String(best.row.term))))) {
      best = { row: r, card, len };
    }
  }
  return { best, scanned, saved };
}

/* כל זוגות המאגר במרחק עריכה 1 · דרך אינדקס-המחיקות של bank_gate, שהוא שלם. */
function d1Pairs(env, L) {
  const M = env.lang[L];
  const ctx = M.ctx;
  const keys = [];
  const ownerOfKey = [];
  for (const e of M.info) for (const k of e.keys) { keys.push(k); ownerOfKey.push(e); }
  const NI = BG.makeNear(keys, 1, 24);
  const out = [];
  const seen = new Set();
  for (const e of M.info) {
    for (const k of e.keys) {
      for (const i of NI.near(k)) {
        const other = ownerOfKey[i];
        if (other.owner === e.owner) continue;
        if (e.allowed.has(other.owner) || other.allowed.has(e.owner)) continue;
        if (ctx.editDist(k, keys[i]) !== 1) continue;
        const id = e.owner + '|' + keys[i];
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ card: e, typed: keys[i], intruder: other, cardKey: k });
      }
    }
  }
  /* סדר דטרמיניסטי · הארוך קודם, ואז לקסיקוגרפית. שער שבוחר מקרה אחר בכל ריצה
     אינו ראיה. */
  out.sort((a, b) => b.typed.length - a.typed.length ||
    (a.typed < b.typed ? -1 : a.typed > b.typed ? 1 : 0) ||
    (a.card.owner < b.card.owner ? -1 : a.card.owner > b.card.owner ? 1 : 0));
  return out;
}

function pickCases(env, eng) {
  const acc = pickAcceptedTypo(env, eng);
  const pairs = { he: d1Pairs(env, 'he'), en: d1Pairs(env, 'en') };
  const all = pairs.he.map(x => Object.assign({ lang: 'he' }, x)).concat(pairs.en.map(x => Object.assign({ lang: 'en' }, x)));
  all.sort((a, b) => b.typed.length - a.typed.length ||
    (a.typed < b.typed ? -1 : a.typed > b.typed ? 1 : 0) ||
    (a.lang < b.lang ? -1 : a.lang > b.lang ? 1 : 0));

  /* שער הווטו רוצה זוג שרק הווטו חוסם · אחרת הוא "עובר" גם כשהווטו מנוטרל, וכל
     האמירה על מבניות ריקה. הבחירה נעשית מול הבודק המקולקל בכוונה. */
  const nv = makeEngine('noVeto', env);
  let vetoCase = null;
  for (const c of all) {
    const v = nv.word(c.typed, c.card.w, c.lang);
    if (v.ok && v.via === 'typo') { vetoCase = c; break; }   // via=exact הוא היום, לא הווטו
  }

  /* דגימה דטרמיניסטית של זוגות שהחוק של היום מקבל. */
  const rnd = mulberry32(0x800 + 14);
  const pool = [];
  for (const L of ['he', 'en']) for (const e of env.lang[L].info) for (const k of e.keys) pool.push({ L, e, k });
  const baseline = [];
  const usedIdx = new Set();
  while (baseline.length < 500 && usedIdx.size < pool.length) {
    const i = Math.floor(rnd() * pool.length);
    if (usedIdx.has(i)) continue;
    usedIdx.add(i);
    const s = pool[i];
    if (!acceptsToday(env.lang[s.L].ctx, s.k, s.e.w)) continue;
    baseline.push(s);
  }

  /* דגימה דטרמיניסטית ל-enabled:false · **שני הצדדים**.
     כל שורות הדאטהסט הן מקרים שהחוק של היום דוחה (זו ההגדרה שלהן), ולכן מדגם מהן בלבד
     היה בודק רק את כיוון הדחייה · והמדידה הראתה שזה בדיוק קרה: הקלקול "בלי שכבת היום"
     לא נתפס, כי לא היה במדגם ולו מקרה אחד שהיום מקבל. חצי מהמדגם הוא קבלות של היום. */
  const rnd2 = mulberry32(0x800 + 15);
  const sample = [];
  const used2 = new Set();
  const usable = env.rows.filter(r => env.lang[r.lang] && env.lang[r.lang].byCard.has(String(r.term) + '|' + String(r.unit)));
  while (sample.length < 250 && used2.size < usable.length) {
    const i = Math.floor(rnd2() * usable.length);
    if (used2.has(i)) continue;
    used2.add(i);
    sample.push({ kind: 'ds', r: usable[i] });
  }
  for (const s of baseline.slice(0, 250)) sample.push({ kind: 'today', s });

  return { acc, all, first: all[0] || null, vetoCase, baseline, sample, counts: { he: pairs.he.length, en: pairs.en.length } };
}

/* ===== השערים ===== */

function buildGates(env, K) {
  const G = [];
  const A = (id, name, why, run) => G.push({ id, name, why, run });

  A('1', 'טעות מוכרת שחייבת להתקבל',
    K.acc.best
      ? `נבחרה מהדאטהסט: הווריאציה הראויה-לקבל הארוכה ביותר (${K.acc.best.len} תווים) שהחוק הנשלח מציל, מתוך ${K.acc.saved} מצילות ב-${K.acc.scanned} שורות חד-משמעיות`
      : 'לא נמצאה אף וריאציה ראויה-לקבל שהחוק הנשלח מציל',
    eng => {
      if (!K.acc.best) return { pass: false, detail: 'אין מקרה · לחוק הנשלח אין ולו הצלה אחת' };
      const b = K.acc.best;
      const v = eng.word(b.row.typed, b.card, b.row.lang);
      return {
        pass: !!v.ok && v.via === 'typo',
        detail: `"${b.row.typed}" ~ ${b.row.term} · ok=${!!v.ok} via=${v.via || v.why}`,
      };
    });

  A('2', 'זוג מרחק-1 מהמאגר שחייב להידחות',
    K.first
      ? `נבחר מהמאגר: זוג מרחק-עריכה 1 עם המפתח הארוך ביותר (${K.first.typed.length} תווים), מתוך ${K.counts.he + K.counts.en} זוגות כאלה`
      : 'לא נמצא אף זוג מרחק-1 במאגר',
    eng => {
      if (!K.first) return { pass: false, detail: 'אין זוג מרחק-1 · הבדיקה לא רצה' };
      const c = K.first;
      const v = eng.word(c.typed, c.card.w, c.lang);
      /* ולא רק המקרה הנקוב: **כל** זוגות מרחק-1 בשתי השפות, בשני הכיוונים. מקרה יחיד
         היה נשאר ירוק גם אם הווטו נשבר בכל שאר המאגר.
         נספרות קבלות **חדשות** בלבד (‏via=typo). קבלה ב-via=exact היא ההתנהגות של היום
         ואינה תוצר השכבה הזאת: "spring" מתקבל על הכרטיס "sprang" מפני שהערך עצמו כתוב
         "spring, sprang", ו-"נקבובית" מתקבל על "נֶקֶב / נַקְבּוּבִית" מאותה סיבה. לספור
         אותן כפריצה היה מדווח על המאגר, לא על השכבה. */
      let bad = 0, ex = 0, n = 0, firstBad = null;
      for (const x of K.all) {
        n++;
        const r = eng.word(x.typed, x.card.w, x.lang);
        if (!r.ok) continue;
        if (r.via === 'exact') { ex++; continue; }
        bad++;
        if (!firstBad) firstBad = `"${x.typed}" על "${x.card.term}"`;
      }
      return {
        pass: !v.ok && bad === 0,
        detail: `"${c.typed}" על "${c.card.term}" (שייך ל-${c.intruder.term}) · ok=${!!v.ok} why=${v.why} · ומכלל ${n} זוגות המרחק-1: ${bad} קבלות חדשות, ${ex} קבלות של היום` + (firstBad ? ` · ראשונה: ${firstBad}` : ''),
      };
    });

  A('3', 'הווטו · הקלדה ששווה למילה אחרת במרחק 1 מהמונח',
    K.vetoCase
      ? `נבחר מהמאגר: זוג מרחק-1 שהבודק **בלי הווטו** דווקא מקבל, כלומר הווטו הוא הדבר היחיד שחוסם אותו`
      : 'לא נמצא זוג שהווטו לבדו חוסם · אין למה שהווטו עושה ביטוי נמדד',
    eng => {
      if (!K.vetoCase) return { pass: false, detail: 'אין מקרה שבו הווטו הוא החוסם היחיד' };
      const c = K.vetoCase;
      const v = eng.word(c.typed, c.card.w, c.lang);
      return {
        pass: v.ok === false && v.why === 'collision',
        detail: `"${c.typed}" על "${c.card.term}" · שייך ל-"${c.intruder.term}" · ok=${!!v.ok} why=${v.why}`,
      };
    });

  A('4', 'אינווריאנט הבסיס · 500 קבלות של היום נשארות קבלות',
    `500 זוגות (הוקלד, כרטיס) שנדגמו דטרמיניסטית מהמאגר וש-acceptsToday מקבלת · הם חייבים להתקבל עם via=exact`,
    eng => {
      let bad = 0, notExact = 0, first = null;
      for (const s of K.baseline) {
        const v = eng.word(s.k, s.e.w, s.L);
        if (!v.ok) { bad++; if (!first) first = `"${s.k}" ~ ${s.e.term} נדחה (${v.why})`; continue; }
        if (v.via !== 'exact') { notExact++; if (!first) first = `"${s.k}" ~ ${s.e.term} התקבל דרך ${v.via}`; }
      }
      return {
        pass: bad === 0 && notExact === 0,
        detail: `${K.baseline.length} זוגות · ${bad} נדחו · ${notExact} התקבלו שלא דרך exact` + (first ? ` · ראשון: ${first}` : ''),
      };
    });

  A('5', 'טבלת הזהב משוחזרת מהדיסק זהה',
    `out/golden.jsonl מורץ מחדש מול הפרמטרים שבארטיפקט · ok, via ו-why חייבים להתלכד שורה בשורה`,
    eng => {
      if (env.golden.missing) return { pass: false, detail: 'out/golden.jsonl חסר' };
      let n = 0, diff = 0, miss = 0, first = null;
      for (const g of env.golden.rows) {
        const M = env.lang[g.lang];
        const card = M && M.byCard.get(String(g.term) + '|' + String(g.unit));
        if (!card) { miss++; continue; }
        const v = g.set === 'gloss' ? eng.gloss(g.typed, card, g.lang) : eng.word(g.typed, card, g.lang);
        n++;
        if (!!v.ok !== !!g.verdict.ok || (v.via || null) !== g.verdict.via || (v.why || null) !== g.verdict.why) {
          diff++;
          if (!first) first = `"${g.typed}" ~ ${g.term} · ${JSON.stringify(g.verdict)} מול ${JSON.stringify(v)}`;
        }
      }
      return {
        pass: diff === 0 && miss === 0 && n > 0,
        detail: `${n} החלטות · ${diff} פערים · ${miss} כרטיסים חסרים` + (first ? ` · ראשון: ${first}` : '') + (env.golden.bad ? ` · ${env.golden.bad} שורות לא נפרסו` : ''),
      };
    });

  A('6', 'enabled:false משחזר את התנהגות היום על 500 שורות',
    `אפס סובלנות בכל הרצועות · הפסק חייב להיות זהה ל-acceptsToday / meaningMatch על 500 שורות דאטהסט שנדגמו דטרמיניסטית`,
    eng => {
      /* השוואה מול הבודק **המכובה** ולא מול הפעיל · זו בדיוק המשמעות של enabled:false. */
      const off = offEngine(env, eng.kind);
      let n = 0, diff = 0, acc = 0, first = null;
      for (const it of K.sample) {
        const isDs = it.kind === 'ds';
        const lang = isDs ? it.r.lang : it.s.L;
        const M = env.lang[lang];
        const typed = isDs ? it.r.typed : it.s.k;
        const term = isDs ? it.r.term : it.s.e.term;
        const card = isDs ? M.byCard.get(String(it.r.term) + '|' + String(it.r.unit)) : it.s.e.w;
        if (!card) continue;
        const gloss = isDs && it.r.set === 'gloss';
        n++;
        const today = gloss ? !!M.ctx.meaningMatch(typed, card.meaning) : !!acceptsToday(M.ctx, typed, card);
        if (today) acc++;
        const v = gloss ? off.gloss(typed, card, lang) : off.word(typed, card, lang);
        if (!!v.ok !== today || (v.ok && v.via !== 'exact')) {
          diff++;
          if (!first) first = `"${typed}" ~ ${term} · היום=${today} כבוי=${!!v.ok}/${v.via || v.why}`;
        }
      }
      return { pass: diff === 0 && n > 0 && acc > 0, detail: `${n} שורות (${acc} מהן קבלות של היום) · ${diff} פערים` + (first ? ` · ראשון: ${first}` : '') };
    });

  return G;
}

/* הבודק "המכובה" · אפס סובלנות. תחת קלקול noToday הוא יורש את הקלקול, וזה הרצוי:
   השאלה של שער 6 היא האם הכיבוי מחזיר את היום, ולכן קלקול בשכבת היום חייב לשבור אותו. */
const offCache = new Map();
function offEngine(env, kind) {
  const id = kind === 'noToday' ? 'zero+noToday' : 'zero';
  let e = offCache.get(id);
  if (!e) {
    e = makeEngine('zero', env);
    if (kind === 'noToday') {
      const inner = e;
      e = {
        kind: id,
        word: (t, c, L) => { const v = inner.word(t, c, L); return v.ok && v.via === 'exact' ? { ok: false, why: 'far' } : v; },
        gloss: (t, c, L) => { const v = inner.gloss(t, c, L); return v.ok && v.via === 'exact' ? { ok: false, why: 'far' } : v; },
      };
    }
    offCache.set(id, e);
  }
  return e;
}

/* ===== ריצה ===== */

function main() {
  const selftest = process.argv.includes('--selftest');
  const T0 = Date.now();
  say(selftest ? '=== שערי typo-lab · הוכחת שיניים ===' : '=== שערי typo-lab ===');

  const env = buildEnv();
  say(`ארטיפקט: ver=${env.P.ver} · enabled=${env.P.enabled} · דאטהסט ${env.rows.length} שורות · טבלת זהב ${env.golden.rows.length} שורות` +
    (env.dsBad ? ` · ${env.dsBad} שורות דאטהסט לא נפרסו` : ''));

  const plain = makeEngine('plain', env);
  const K = pickCases(env, plain);
  const gates = buildGates(env, K);

  say('');
  say('--- המקרים שנבחרו ---');
  for (const g of gates) say(`  [${g.id}] ${g.name}\n      סיבה: ${g.why}`);

  say('');
  say('--- הרצה על הפרמטרים הנשלחים ---');
  const base = gates.map(g => {
    const r = g.run(plain);
    say(`  ${r.pass ? '✓' : '✗'} [${g.id}] ${g.name} · ${r.detail}`);
    return r;
  });
  const passed = base.filter(r => r.pass).length;
  say('');
  say(`${passed}/${gates.length} שערים עברו`);

  if (!selftest) {
    say(`${((Date.now() - T0) / 1000).toFixed(1)} שניות`);
    say(passed === gates.length ? 'פסק דין: ירוק' : 'פסק דין: אדום');
    process.exit(passed === gates.length ? 0 : 1);
  }

  /* ===== מטריצת הקלקולים ===== */
  say('');
  say('--- מטריצת השיניים · X = השער נתפס בקלקול הזה ---');
  const engines = KINDS.map(k => makeEngine(k, env));
  const matrix = gates.map(g => ({
    g, row: engines.map(e => {
      let r;
      try { r = g.run(e); } catch (err) { r = { pass: false, detail: 'חריגה: ' + err.message }; }
      return !r.pass;
    }),
  }));

  const w = 34;
  const padEnd = (s, n) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
  say('  ' + padEnd('שער', w) + KINDS.map(k => padEnd(KIND_HE[k], 20)).join(''));
  for (const m of matrix) {
    say('  ' + padEnd(`[${m.g.id}] ${m.g.name}`.slice(0, w - 1), w) +
      m.row.map(x => padEnd(x ? 'X' : '.', 20)).join(''));
  }

  const uncaught = matrix.filter(m => !m.row.some(Boolean));
  const idleKinds = KINDS.filter((k, i) => !matrix.some(m => m.row[i]));

  say('');
  for (const m of matrix) {
    const by = KINDS.filter((k, i) => m.row[i]).map(k => KIND_HE[k]);
    say(`  [${m.g.id}] נתפס ב: ${by.length ? by.join(', ') : '⛔ באף קלקול'}`);
  }

  say('');
  const ok = passed === gates.length && uncaught.length === 0 && idleKinds.length === 0;
  if (uncaught.length) say(`⛔ ${uncaught.length} שערים אינם יודעים להיכשל: ${uncaught.map(m => m.g.id).join(', ')}`);
  if (idleKinds.length) say(`⛔ קלקולים שלא תפסו דבר: ${idleKinds.map(k => KIND_HE[k]).join(', ')}`);
  if (passed !== gates.length) say(`⛔ ${gates.length - passed} שערים נכשלו על הפרמטרים הנשלחים`);
  say(`${((Date.now() - T0) / 1000).toFixed(1)} שניות`);
  if (ok) { say('לשער יש שיניים'); process.exit(0); }
  say('פסק דין: אדום');
  process.exit(1);
}

if (require.main === module) main();

module.exports = { BAD_PARAMS, buildEnv, makeEngine, pickCases, buildGates };
