'use strict';
/* שער התיוג · typo-lab/selfcheck2b.js
 *
 * הביקורת האדוורסרית על הדאטהסט הראשון מצאה שהתיוג אינו מוכיח את מה שהוא מתיימר להוכיח:
 * ‏accept על מילים אמיתיות אחרות, בינוני פועל שנולד מאופרטור הכתיב, 93.7% לא-מילים תחת
 * תווית "נטייה", תוויות סותרות על אותה מחרוזת בדיוק, דליפת folds בסט הפירוש, ואופרטורים
 * אנגליים שמפיקים מחרוזות שאף כותב אינו מפיק. כל ממצא כזה הוא סף שגוי בהמשך הצינור.
 *
 * השער הזה בודק כל אחד מהם בנפרד, עם המספר שנמדד ולא עם "עבר".
 *
 * ⚠ שיניים · הכלל של הפרויקט: שער שמדווח "עבר" בלי שהוכח שהוא יודע להיכשל אינו עדות
 * (‏CLAUDE.md, שלושה מקרים מתועדים). לכן כל טענה כאן נבדקת **פעמיים**: על הנכס המתוקן,
 * שם היא חייבת להיות ירוקה, ועל נכס ישן/שבור, שם היא חייבת להיות אדומה.
 * "לשער יש שיניים" מודפס רק אם כל טענה אדומה בישן וירוקה בחדש.
 *
 * ===== מה נוסף ב-v3 =====
 * ‏F7b · ‏F7 הוחל על נקודת הייחוס בלבד והשאיר את הצד השני שבור: שורה הוכרזה דו-משמעית
 *        מול **מקטע של הכרטיס עצמו** (1,467 שורות gloss ועוד 7 he-word). הטענה כאן
 *        סופרת שותפי-דו-משמעות שהם צורה קבילה של הכרטיס · חייב אפס.
 * ‏L1-L3 · לקסיקון-הריצה (out/runtime-lexicon.js). זה הנכס שנשלח לדפדפן, ולכן שלוש
 *        טענות עליו: אין בו צורת מאגר, ה-FPR שנמדד הוא ה-FPR שתוכנן, ו-lookup() מסכים
 *        עם הקבוצה המדויקת בלי אף false negative. הנכס השבור לכל טענה נבנה כאן בריצה
 *        (‏--broken=nosub / size / bits) ולא נשמר בדיסק · אין דרך "לשכוח" לרענן אותו.
 *
 * ⚠ שתי קבוצות טענות ושני מקורות שיניים: טענות הדאטהסט נבדקות מול הארכיון out/v1-old,
 * וטענות הנכס מול בנייה שבורה. שתיהן חייבות להיות אדומות שם.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const { getCtx } = require('./lib/ctx.js');
const { acceptedKeys, acceptedSegs } = require('./lib/keys.js');
const { inLexicon, buildLexicon } = require('./lib/lexicon.js');
const { licitForms } = require('./lib/morph.js');
const { isParticipleShape } = require('./lib/taxonomy-he.js');
const TAX_EN = require('./lib/taxonomy-en.js');
const GEN = require('./gen_dataset.js');
const RTL = require('./build_runtime_lexicon.js');

/* ‏v3 יושב ב-out/ עצמו · הארכיון out/v1-old הוא הדאטהסט שמולו מוכחות השיניים. */
const NEW_DIR = path.join(__dirname, 'out');
const OLD_DIR = path.join(__dirname, 'out', 'v1-old');
const RTL_FILE = path.join(__dirname, 'out', 'runtime-lexicon.js');

/* דגימה למדידות הנכס · אותו סדר גודל שהמשימה דורשת, ודטרמיניסטי. */
const LOOKUP_SAMPLE = 200000;
/* סובלנות ל-FPR · הרצועה שבתוכה "מה שנמדד הוא מה שתוכנן". הגבול העליון תופס מסנן
   קטן מדי, והתחתון תופס מסנן שהתרוקן · שניהם כשל, ואף אחד מהם אינו רעש דגימה:
   ב-200,000 דגימות סטיית התקן היחסית ב-FPR של 0.5% היא ‎~3%. */
const FPR_TOL_HI = 1.25;
const FPR_TOL_LO = 0.5;

/* ===== עזר ===== */

function loadRows(dir) {
  const out = [];
  for (const f of ['dataset-he.jsonl', 'dataset-en.jsonl']) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      if (line) out.push(JSON.parse(line));
    }
  }
  return out;
}

/* מונח -> כרטיס, לכל שפה. השורה נושאת את card.term הגולמי, וזה המפתח היחיד שמחזיר
   את הכרטיס עצמו · בלעדיו אי אפשר לבדוק "צורה קבילה של הכרטיס" בלי לשכפל את הלוגיקה. */
const cardCache = {};
function cardsOf(lang) {
  if (cardCache[lang]) return cardCache[lang];
  const m = new Map();
  for (const c of Array.from(getCtx(lang).BANK)) if (!m.has(c.term)) m.set(c.term, c);
  cardCache[lang] = m;
  return m;
}

const accCache = new Map();
function acceptedFor(row) {
  const k = row.lang + SEP + row.set + SEP + row.term;
  const hit = accCache.get(k);
  if (hit) return hit;
  const ctx = getCtx(row.lang);
  const card = cardsOf(row.lang).get(row.term);
  const s = !card ? new Set() : (row.set === 'gloss' ? acceptedSegs(card, ctx) : acceptedKeys(card, ctx));
  accCache.set(k, s);
  return s;
}

/* המילה שהשתנתה בין המפתח למוקלד · כל האופרטורים משחיתים מילה אחת בתוך צירוף. */
function diffWord(key, typed) {
  const a = String(key).split(' ');
  const b = String(typed).split(' ');
  if (a.length !== b.length) return null;
  let at = -1;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    if (at >= 0) return null;
    at = i;
  }
  return at < 0 ? null : { src: a[at], out: b[at] };
}

const isPos = row => !String(row.op).startsWith('neg/');
/* מפריד שאינו יכול להופיע במפתח · בלעדיו ('rule','ruler') ו-('ruler','uler') מקבלים
   אותו מזהה, ושתי שלשות שונות נספרות כשלשה סותרת אחת. */
const SEP = String.fromCharCode(1);
const glossLang = row => (row.set === 'gloss' ? 'he' : row.lang);

/* ===== שמונה הטענות =====
 * כל אחת מחזירה { bad, total, note } · bad הוא מה שנספר, וטענה עוברת רק כש-bad === 0.
 * שם הטענה נושא את מספר הממצא, כדי שדוח כישלון יצביע ישר על הסעיף בביקורת.
 */

const ASSERTIONS = [

  {
    id: 'F1',
    name: 'אין accept על מחרוזת שהיא מילה אמיתית ואינה צורה קבילה של הכרטיס',
    run(rows) {
      let bad = 0, total = 0;
      const ex = [];
      for (const r of rows) {
        if (r.label !== 'accept') continue;
        total++;
        if (acceptedFor(r).has(r.typed)) continue;
        if (!inLexicon(r.typed, glossLang(r), r.key)) continue;
        bad++;
        if (ex.length < 6) ex.push(`${r.key}→${r.typed}`);
      }
      return { bad, total, note: ex.join(' · ') };
    }
  },

  {
    id: 'F2a',
    name: 'אין שורת אם-קריאה בצורת בינוני פועל על שורש בן שלוש אותיות',
    /* רק שורות **מיוצרות**. שלילי מסוג neg/d1-partner הוא מילת מאגר אמיתית שבמקרה היא
       הבינוני (בָּצַר מול בּוֹצֵר, יֶקֶב מול יוֹקֵב) · היא מתויגת reject/veto ונכונה
       בדיוק כפי שהיא. הממצא היה על אופרטור שמייצר בינוני ומתייג אותו accept. */
    run(rows) {
      let bad = 0;
      const ex = [];
      for (const r of rows) {
        if (!isPos(r)) continue;
        const d = diffWord(r.key, r.typed);
        if (!d) continue;
        if (!isParticipleShape(d.src, d.out)) continue;
        bad++;
        if (ex.length < 6) ex.push(`${d.src}→${d.out}`);
      }
      return { bad, total: rows.length, note: ex.join(' · ') };
    }
  },

  {
    id: 'F2b',
    name: 'כל שורת neg/inflection היא נטייה לגיטימית של המונח הכתוב',
    run(rows) {
      let bad = 0, total = 0;
      const ex = [];
      for (const r of rows) {
        if (r.op !== 'neg/inflection') continue;
        total++;
        const card = cardsOf(r.lang).get(r.term);
        const ctx = getCtx(r.lang);
        const ok = card && licitForms(card, r.lang).some(f => ctx.K(f) === r.typed);
        if (ok) continue;
        bad++;
        if (ex.length < 6) ex.push(`${r.term}→${r.typed}`);
      }
      return { bad, total, note: ex.join(' · ') };
    }
  },

  {
    id: 'F3',
    name: 'אין שלשה (set,key,typed) שנושאת גם accept וגם reject',
    run(rows) {
      const seen = new Map();
      for (const r of rows) {
        const t = r.set + SEP + r.key + SEP + r.typed;
        let s = seen.get(t);
        if (!s) { s = new Set(); seen.set(t, s); }
        s.add(r.label);
      }
      let bad = 0;
      const ex = [];
      for (const [t, s] of seen) {
        if (s.size < 2) continue;
        bad++;
        if (ex.length < 6) ex.push(t.split(SEP).slice(1).join('→'));
      }
      return { bad, total: seen.size, note: ex.join(' · ') };
    }
  },

  {
    id: 'F4',
    name: 'אין (set,key) בסט gloss שחוצה fold או את קו ה-holdout',
    run(rows) {
      const fold = new Map(), hold = new Map();
      for (const r of rows) {
        if (r.set !== 'gloss') continue;
        let f = fold.get(r.key); if (!f) { f = new Set(); fold.set(r.key, f); } f.add(r.fold);
        let h = hold.get(r.key); if (!h) { h = new Set(); hold.set(r.key, h); } h.add(!!r.holdout);
      }
      let crossFold = 0, straddle = 0;
      const ex = [];
      for (const [k, f] of fold) if (f.size > 1) { crossFold++; if (ex.length < 4) ex.push(k); }
      for (const [, h] of hold) if (h.size > 1) straddle++;
      return {
        bad: crossFold + straddle, total: fold.size,
        note: `חוצי-fold ${crossFold} · חוצי-holdout ${straddle}` + (ex.length ? ' · ' + ex.join(' · ') : '')
      };
    }
  },

  {
    id: 'F5a',
    name: 'אין שורת pattern/c-s מחוץ להקשר c רכה (לפני e/i/y)',
    run(rows) {
      let bad = 0, total = 0;
      const ex = [];
      for (const r of rows) {
        if (r.op !== 'pattern/c/s') continue;
        total++;
        const d = diffWord(r.key, r.typed);
        if (d && TAX_EN.genCS(d.src).includes(d.out)) continue;
        bad++;
        if (ex.length < 6) ex.push(`${r.key}→${r.typed}`);
      }
      return { bad, total, note: ex.join(' · ') };
    }
  },

  {
    id: 'F5b',
    name: 'אין שורת silent-e שמוסיפה e (רק הסרה)',
    run(rows) {
      let bad = 0, total = 0;
      const ex = [];
      for (const r of rows) {
        if (r.op !== 'pattern/silent-e') continue;
        total++;
        const d = diffWord(r.key, r.typed);
        if (d && d.out.length < d.src.length) continue;
        bad++;
        if (ex.length < 6) ex.push(`${r.key}→${r.typed}`);
      }
      return { bad, total, note: ex.join(' · ') };
    }
  },

  {
    id: 'F6',
    name: 'כל מפתח חיובי בסט gloss הוא עד שלוש מילים',
    run(rows) {
      let bad = 0, total = 0;
      const ex = [];
      for (const r of rows) {
        if (r.set !== 'gloss' || !isPos(r)) continue;
        total++;
        const n = String(r.key).split(' ').filter(Boolean).length;
        if (n <= GEN.SEG_MAX_WORDS) continue;
        bad++;
        if (ex.length < 4) ex.push(`${n} מילים: ${r.key}`);
      }
      return { bad, total, note: ex.join(' · ') };
    }
  },

  {
    id: 'F7b',
    name: 'אין שורה ששותף הדו-משמעות שלה הוא צורה קבילה של הכרטיס עצמו',
    /* הטענה חלה על **שני הכיוונים**. הממצא שדווח היה על צד הפירוש (1,467 שורות), אבל
       השורש זהה בשני הצדדים · collide החזיר מפתח שיש לו בעלים זר גם כשהמפתח עצמו הוא
       צורה של הכרטיס. בארכיון v1-old זה נורה 103 פעמים בצד המילה, ולכן הטענה נושכת שם
       גם בלי שורות gloss. הפילוח לפי סט נמצא ב-note ולא נבלע במספר אחד. */
    run(rows) {
      let bad = 0, total = 0;
      const bySet = {};
      const ex = [];
      for (const r of rows) {
        const why = String(r.why || '');
        if (why.indexOf('ambiguous:') !== 0) continue;
        total++;
        const partner = why.slice('ambiguous:'.length);
        if (!acceptedFor(r).has(partner)) continue;
        bad++;
        bySet[r.set] = (bySet[r.set] || 0) + 1;
        if (ex.length < 4) ex.push(`${r.key}→${r.typed} ~ ${partner}`);
      }
      const split = Object.keys(bySet).sort().map(k => `${k} ${bySet[k]}`).join(' · ');
      return { bad, total, note: (split ? split + ' · ' : '') + ex.join(' · ') };
    }
  }
];

/* ===== טענות הנכס · לקסיקון-הריצה =====
 * כל טענה מקבלת ‎api (התוצר של הנכס עצמו, לא מימוש מקביל) ו-ex (הקבוצות המדויקות
 * שממנו הוא נבנה), ומחזירה את אותו ‎{bad, total, note}‎. ‏broken הוא מצב הבנייה שמוכיח
 * שהטענה יודעת להיכשל.
 */

/* דגימת מילים · כל החברים בקבוצה, ואחריהם אי-מילים עד למכסה. שתי המחציות נחוצות:
   החברים מודדים false negative (חייב אפס), האי-מילים מודדות את ה-FPR. */
function sampleWords(ex, howMany) {
  const out = [];
  for (const L of ['he', 'en']) for (const w of ex.sets[L]) out.push([w, L, true]);
  const left = Math.max(0, howMany - out.length);
  for (const L of ['he', 'en']) {
    const set = new Set(ex.sets[L]);
    for (const w of RTL.nonWords(L, set, Math.ceil(left / 2))) out.push([w, L, false]);
  }
  return out.slice(0, Math.max(howMany, out.length));
}

const RTL_ASSERTIONS = [

  {
    id: 'L1',
    name: 'לקסיקון-הריצה אינו מכיל אף צורה קבילה של אף ערך במאגר',
    broken: 'nosub',
    /* שתי בדיקות ולא אחת: הקבוצה שממנה נבנה המסנן, ו-lookup עצמו. הראשונה מדויקת
       והיא זו שחייבת להיות אפס. השנייה אינה יכולה להיות אפס · מסנן Bloom מחזיר true
       על שיעור FPR מכל קבוצה, כולל זו · ולכן היא נבדקת מול תקרה ולא מול אפס. */
    run(api, ex) {
      let inSet = 0, viaLookup = 0, total = 0;
      const bad0 = [];
      for (const L of ['he', 'en']) {
        const src = new Set(ex.sets[L]);
        const drop = L === 'en' ? ex.bank.en : ex.bank.he;
        for (const w of Array.from(drop).sort()) {
          total++;
          if (src.has(w)) { inSet++; if (bad0.length < 4) bad0.push(w); }
          if (api.lookup(w, L)) viaLookup++;
        }
      }
      const ceiling = Math.max(20, Math.ceil(total * api.fprTarget * 3));
      const bad = inSet + (viaLookup > ceiling ? 1 : 0);
      return {
        bad, total,
        note: `בקבוצה ${inSet} · ב-lookup ${viaLookup} (תקרה ${ceiling})` + (bad0.length ? ' · ' + bad0.join(' · ') : '')
      };
    }
  },

  {
    id: 'L2',
    name: 'ה-FPR שנמדד על אי-מילים הוא ה-FPR שתוכנן',
    broken: 'size',
    run(api, ex) {
      const rows = [];
      let bad = 0;
      for (const L of ['he', 'en']) {
        const m = RTL.measureFPR(api.lookup, L, new Set(ex.sets[L]), LOOKUP_SAMPLE);
        const hi = api.fprTarget * FPR_TOL_HI, lo = api.fprTarget * FPR_TOL_LO;
        if (m.fpr > hi || m.fpr < lo) bad++;
        rows.push(`${L} ${(m.fpr * 100).toFixed(3)}% (${m.hit}/${m.n})`);
      }
      return { bad, total: 2 * LOOKUP_SAMPLE, note: `יעד ${(api.fprTarget * 100).toFixed(2)}% · ` + rows.join(' · ') };
    }
  },

  {
    id: 'L3',
    name: 'lookup() מסכים עם הקבוצה המדויקת · אפס false negative על 200,000 דגימות',
    broken: 'bits',
    run(api, ex) {
      const sample = sampleWords(ex, LOOKUP_SAMPLE);
      let fn = 0, fp = 0, members = 0;
      const bad0 = [];
      for (const [w, L, isMember] of sample) {
        const got = api.lookup(w, L);
        if (isMember) {
          members++;
          if (!got) { fn++; if (bad0.length < 4) bad0.push(`${L}:${w}`); }
        } else if (got) fp++;
      }
      return {
        bad: fn, total: sample.length,
        note: `חברים ${members} · false negative ${fn} · false positive ${fp} (${((fp / Math.max(1, sample.length - members)) * 100).toFixed(3)}%)` +
          (bad0.length ? ' · ' + bad0.join(' · ') : '')
      };
    }
  }
];

/* ===== דטרמיניזם ===== */

const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

function determinism() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'typolab2b-'));
  try {
    const m = GEN.generate({ outDir: tmp, quiet: true });
    const ref = JSON.parse(fs.readFileSync(path.join(NEW_DIR, 'manifest.json'), 'utf8'));
    const got = {}, want = {};
    for (const f of m.files) got[f.name] = f.sha256;
    for (const f of ref.files) want[f.name] = f.sha256;

    /* הנכס נבנה מחדש ומושווה לקובץ שעל הדיסק · נכס שנשלח לדפדפן ואינו משוחזר מהמקור
       הוא נכס שאיש אינו יודע מה יש בו. */
    if (fs.existsSync(RTL_FILE)) {
      want['runtime-lexicon.js'] = sha(fs.readFileSync(RTL_FILE, 'utf8'));
      got['runtime-lexicon.js'] = sha(RTL.build({}).text);
      /* המניפסט חייב לתאר את הנכס שעל הדיסק · gen_dataset כותב אותו מאפס, ולכן ריצה
         שלו בלי בניית הנכס אחריה תוציא כאן אדום במקום מניפסט חלקי בשקט. */
      want['manifest.runtimeLexicon'] = want['runtime-lexicon.js'];
      got['manifest.runtimeLexicon'] = (ref.runtimeLexicon && ref.runtimeLexicon.sha256) || '·';
    }
    const names = Object.keys(want).sort();
    const diff = names.filter(n => got[n] !== want[n]);
    return { ok: diff.length === 0 && names.length > 0, names, diff, got, want };
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* זמני · לא קריטי */ }
  }
}

/* ===== הרצה ===== */

function pad(s, n) {
  const t = String(s);
  return t.length >= n ? t : t + ' '.repeat(n - t.length);
}

function main() {
  const out = s => process.stdout.write(s + '\n');
  let fail = 0;

  out('# selfcheck2b · שער התיוג המתוקן');
  out('');

  if (!fs.existsSync(path.join(NEW_DIR, 'dataset-he.jsonl'))) {
    out(`⛔ אין דאטהסט ב-${NEW_DIR}. הרץ קודם: node gen_dataset.js`);
    process.exit(1);
  }
  if (!fs.existsSync(RTL_FILE)) {
    out(`⛔ אין לקסיקון-ריצה ב-${RTL_FILE}. הרץ קודם: node build_runtime_lexicon.js`);
    process.exit(1);
  }

  const lex = buildLexicon();
  out(`לקסיקון · ${lex.stats.heTypes} טיפוסים עבריים · ${lex.stats.enTypes} אנגליים · ${lex.stats.files} קבצים · ${(lex.stats.bytes / 1e6).toFixed(1)}MB`);

  const nu = loadRows(NEW_DIR);
  const old = fs.existsSync(path.join(OLD_DIR, 'dataset-he.jsonl')) ? loadRows(OLD_DIR) : null;
  out(`דאטהסט חדש · ${nu.length} שורות` + (old ? ` · דאטהסט ישן · ${old.length} שורות` : ' · ⚠ אין דאטהסט ישן להשוואה'));
  out('');

  /* --- הטענות על החדש --- */
  out('## הטענות · על הדאטהסט המתוקן');
  const newRes = [];
  for (const a of ASSERTIONS) {
    const r = a.run(nu);
    newRes.push(r);
    const ok = r.bad === 0;
    if (!ok) fail++;
    out(`${ok ? '✅' : '❌'} ${pad(a.id, 5)} ${pad(a.name, 62)} · חריגות ${r.bad} מתוך ${r.total}${r.note ? ' · ' + r.note : ''}`);
  }
  out('');

  /* --- טענות הנכס · על הקובץ שעל הדיסק, זה שנשלח לדפדפן --- */
  out('## הטענות · על לקסיקון-הריצה שעל הדיסק');
  const rtlApi = RTL.loadArtifact(fs.readFileSync(RTL_FILE, 'utf8'), RTL_FILE);
  const rtlEx = RTL.exactSets();
  out(`נכס · ${fs.statSync(RTL_FILE).size} בייט · יעד FPR ${(rtlApi.fprTarget * 100).toFixed(2)}% · he n=${rtlApi.he.n} m=${rtlApi.he.m} k=${rtlApi.he.k} · en n=${rtlApi.en.n} m=${rtlApi.en.m} k=${rtlApi.en.k}`);
  for (const a of RTL_ASSERTIONS) {
    const r = a.run(rtlApi, rtlEx);
    const ok = r.bad === 0;
    if (!ok) fail++;
    out(`${ok ? '✅' : '❌'} ${pad(a.id, 5)} ${pad(a.name, 62)} · חריגות ${r.bad} מתוך ${r.total}${r.note ? ' · ' + r.note : ''}`);
  }
  out('');

  /* --- שיניים · דאטהסט --- */
  out('## שיניים · טענות הדאטהסט על הארכיון out/v1-old');
  let teeth = true;
  if (!old) {
    teeth = false;
    out('⚠ ‏out/v1-old/dataset-*.jsonl אינו קיים · אי אפשר להוכיח שיניים, והשער נכשל.');
    fail++;
  } else {
    for (let i = 0; i < ASSERTIONS.length; i++) {
      const a = ASSERTIONS[i];
      const r = a.run(old);
      const red = r.bad > 0;
      if (!red) teeth = false;
      out(`${red ? '🔴' : '⚪'} ${pad(a.id, 5)} ${pad(a.name, 62)} · חריגות בישן ${r.bad}${r.note ? ' · ' + r.note : ''}`);
    }
  }

  /* --- שיניים · הנכס. כל טענה מול הבנייה השבורה **שלה** ולא מול בנייה שבורה כללית:
     "משהו נשבר איפשהו והשער צעק" אינו הוכחה שהטענה הזו יודעת להיכשל. --- */
  out('');
  out('## שיניים · טענות הנכס על בנייה שבורה');
  for (const a of RTL_ASSERTIONS) {
    const b = RTL.build({ broken: a.broken });
    const api = RTL.loadArtifact(b.text, path.join(__dirname, 'out', `.broken-${a.broken}.js`));
    const r = a.run(api, b.exact);
    const red = r.bad > 0;
    if (!red) teeth = false;
    out(`${red ? '🔴' : '⚪'} ${pad(a.id, 5)} ${pad('broken=' + a.broken, 62)} · חריגות בשבור ${r.bad}${r.note ? ' · ' + r.note : ''}`);
  }
  if (!teeth) {
    fail++;
    out('');
    out('⛔ טענה שעברה גם על הנכס הישן/השבור אינה מוכיחה דבר · השער אינו נושך שם.');
  }
  out('');

  /* --- דטרמיניזם --- */
  out('## דטרמיניזם · ריצה חוזרת מול ה-SHA שנרשם');
  const d = determinism();
  if (!d.ok) fail++;
  for (const n of d.names) {
    const same = d.got[n] === d.want[n];
    out(`${same ? '✅' : '❌'} ${pad(n, 20)} ${String(d.want[n]).slice(0, 16)}… ${same ? '=' : '≠'} ${String(d.got[n] || '·').slice(0, 16)}…`);
  }
  out('');

  const n = ASSERTIONS.length + RTL_ASSERTIONS.length;
  if (fail === 0) {
    out('לשער יש שיניים');
    out(`פסק דין · ירוק. ${n} הטענות עברו על החדש, כולן נכשלו על הישן/השבור, והדאטהסט והנכס משוחזרים ביט-אחר-ביט.`);
    process.exit(0);
  }
  out(`פסק דין · אדום. ${fail} כשלים.`);
  process.exit(1);
}

module.exports = { ASSERTIONS, RTL_ASSERTIONS, loadRows, diffWord, determinism, sampleWords };

if (require.main === module) main();
