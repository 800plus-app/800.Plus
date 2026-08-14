'use strict';
/* חוקי צד-הפירוש · מחלקות B (תשובה חלקית), C (מילה עודפת), D (מורפולוגיה קלה).
 *
 * למה כאן ולא ב-app.js: כל חוק כאן הוא הצעה שנמדדת, לא התנהגות שנשלחה. השילוב לריצה
 * נעשה רק אחרי שהמדידה הראתה אפס התנגשויות, ורק על החוקים שעברו.
 *
 * ===== החוזה של כל חוק =====
 *   id, name, cls        זהות. cls היא המחלקה בתוכנית (B/C/D).
 *   he                   נימוק עברי בשורה אחת · למה החוק בכלל נשקל.
 *   kind                 'gen'  · קבוצת הקבלות החדשות סופית וניתנת למנייה מלאה.
 *                        'scan' · הקבוצה אינסופית (כל מחרוזת שמכילה את המקטע), ולכן
 *                                 הסיכון נמדד בסריקה הפוכה על יקום מוגדר ולא במנייה.
 *   defaults             ערכי הפרמטרים · אף אחד מהם אינו מנוחש, כולם נמדדים.
 *   accepts(typed, segs, ctx, p)   הפרדיקט הטהור. זה ורק זה מכריע קבלה.
 *   expand(segs, ctx, p)           לחוקי 'gen' בלבד · קבוצת המחרוזות שהחוק מוסיף.
 *
 * ===== למה gen ו-scan ולא מנגנון אחד =====
 * לחוק gen, accepts מוגדר *דרך* expand (`expand(...).has(typed)`), ולכן אי אפשר שהמנייה
 * והפרדיקט ייפרדו · סחיפה בין שניהם הייתה מדידת-סיכון שמודדת קוד אחר מזה שמקבל. לחוק
 * scan אין expand כלל, וכל מדידה עליו עוברת דרך אותו accepts.
 *
 * ===== כל חוק ניתן לכיבוי בנפרד =====
 * makeGlossChecker מקבל תצורה לכל חוק בנפרד, כדי שהמדידה תוכל לייחס כל קבלה וכל
 * התנגשות לחוק אחד ולא לתערובת.
 *
 * הכל טהור: אין מצב מודול, אין Math.random, אותה כניסה מחזירה אותה יציאה.
 */

const wordsOf = s => String(s).split(/\s+/).filter(Boolean);

/* PARTICLE_STOP של האפליקציה עצמה, לא העתק. מילות היחס האלה כבר נזרקות משני הצדדים
   ב-particleMatch, ולכן חוק שסופר "מילות תוכן" חייב לספור באותה הגדרה · אחרת "לצערו של"
   ייחשב מילה עודפת בזמן שהאפליקציה כבר מקבלת אותו היום. */
const stopCache = new WeakMap();
function stopOf(ctx) {
  let s = stopCache.get(ctx);
  if (!s) {
    if (!ctx.PARTICLE_STOP) throw new Error('glossrules: ctx.PARTICLE_STOP חסר · ארגז החול לא הרים אותו');
    s = new Set(Array.from(ctx.PARTICLE_STOP));
    stopCache.set(ctx, s);
  }
  return s;
}
/* מילות תוכן = מה שנשאר אחרי מילות היחס העצמאיות. */
function contentOf(ws, ctx) { const st = stopOf(ctx); return ws.filter(w => !st.has(w)); }

/* ===== B1 · פיצול "או" בתוך מקטע =====
 * meaningSegs מפצל על פסיק, נקודה-פסיק, קו ונקודתיים · ולא על "או". לכן
 * "בעל שיניים או בעל צורה של שיניים" הוא מקטע אחד, והקלדת "בעל שיניים" נדחית למרות
 * שהיא בדיוק אחת משתי החלופות שהפירוש מונה.
 *
 * שני מצבים:
 *   plain         פיצול ישיר על "או". פותר את מְשֻׁנָּן.
 *   distributive  ה"או" מחבר רק חלק מהמקטע, והשאר משותף לשתי החלופות:
 *                 "אסף עצים או קש למדורה" = "אסף עצים למדורה" / "אסף קש למדורה".
 *                 נמנה על כל תחילית משותפת p וכל סיומת משותפת s.
 *
 * שלושה שומרים, וכולם נדרשו:
 *   · מקטע שהוא *עצמו* "או" (הפירוש של or באנגלית) אינו מפוצל · tests/55 מקבע שהוא
 *     נשאר בר-מענה, ופיצול היה משאיר אותו בלי אף תשובה.
 *   · שני הצדדים חייבים להיות לא ריקים · "או" בקצה מקטע אינו חיבור בין חלופות.
 *   · minSide · כמה מילים לפחות ב*ליבה* של כל צד (החלק שהוא באמת החלופה). במאגר "או"
 *     הוא לרוב חיבור *בתוך* צירוף ("שפת נהר או נחל", "רסיס עץ או מתכת") ולא הפרדה בין
 *     שני פירושים, ואז הפיצול מייצר מקטע-רפאים בן מילה אחת שהוא הפירוש המלא של ערך
 *     אחר. minSide=2 חוסם את החלק מהם, ולא את כולו · ראה המדידה.
 *   · minAlt · כמה מילים לפחות בחלופה ה*מיוצרת*. שומר רופף יותר מ-minSide: הוא מרשה
 *     ליבה בת מילה אחת כשיש לה הקשר משותף ("אסף | עצים | למדורה"), וחוסם רק תוצאה
 *     בת מילה אחת. שני השומרים נמדדים בנפרד כי הם נותנים תשובות שונות למקרה 15.
 */
const splitOr = {
  id: 'B1', name: 'splitOr', cls: 'B', kind: 'gen',
  he: 'המקטע מונה שתי חלופות מחוברות ב"או", והמפצל אינו מפריד ביניהן',
  defaults: { mode: 'plain', minSide: 1, minAlt: 1 },
  /* guards · רשימת זוגות (minSide, minAlt) שהחוק מקבל את **האיחוד** שלהם. שני השומרים
     חוסמים דברים שונים: minSide מגן מפני "או" שמחבר בתוך צירוף, ו-minAlt מגן מפני
     תוצאה בת מילה אחת. תצורה אחת עם שניהם יחד (AND) מפילה מקרים שכל אחד לבדו פותר,
     ולכן האיחוד הוא הצורה שנמדדת ולא פשרה ביניהם. */
  expand(segs, ctx, p) {
    const guards = p && p.guards;
    if (guards && guards.length) {
      const all = new Set();
      for (const g of guards) for (const v of this.expand(segs, ctx, Object.assign({}, p, { guards: null }, g))) all.add(v);
      for (const s of segs) all.delete(s);
      return all;
    }
    const raw = new Set();
    const mode = (p && p.mode) || 'plain';
    const minSide = p && p.minSide != null ? p.minSide : 1;
    const minAlt = p && p.minAlt != null ? p.minAlt : 1;
    const out = { add: v => { if (wordsOf(v).length >= minAlt) raw.add(v); }, delete: v => raw.delete(v) };
    for (const seg of segs) {
      const W = wordsOf(seg);
      if (W.length < 3) continue;                 // "או" בקצה, או מקטע שהוא "או" לבדו
      const idx = [];
      for (let i = 1; i < W.length - 1; i++) if (W[i] === 'או') idx.push(i);
      if (!idx.length) continue;
      if (mode === 'plain') {
        /* פיצול על כל מופעי "או" יחד · "א או ב או ג" נותן שלוש חלופות. */
        const parts = [];
        let cur = [];
        for (const w of W) { if (w === 'או') { parts.push(cur); cur = []; } else cur.push(w); }
        parts.push(cur);
        if (parts.length < 2 || parts.some(a => a.length < minSide)) continue;
        for (const a of parts) out.add(a.join(' '));
        continue;
      }
      for (const i of idx) {
        const n = W.length;
        for (let pre = 0; pre <= i - 1; pre++) {
          for (let suf = 0; suf <= n - i - 2; suf++) {
            /* הליבות הן החלופות עצמן · minSide נמדד עליהן ולא על התוצאה, שהתחילית
               והסיומת המשותפות מנפחות. */
            const leftCore = W.slice(pre, i), rightCore = W.slice(i + 1, n - suf);
            if (leftCore.length < minSide || rightCore.length < minSide) continue;
            const tail = W.slice(n - suf, n);
            const alt1 = W.slice(0, i).concat(tail);
            const alt2 = W.slice(0, pre).concat(rightCore, tail);
            if (alt1.length) out.add(alt1.join(' '));
            if (alt2.length) out.add(alt2.join(' '));
          }
        }
      }
    }
    /* מקטע שכבר קיים אינו "קבלה חדשה", ואינו מזיק · הסינון האמיתי נעשה במדידה מול
       meaningMatch, כאן רק חוסכים רעש. */
    for (const s of segs) out.delete(s);
    return raw;
  },
  accepts(typed, segs, ctx, p) { return this.expand(segs, ctx, p).has(typed); },
};

/* ===== B2 · ראש מקטע =====
 * "התחרט" מול "התחרט על מה שעשה", "כובע" מול "כובע בד". הלומד נתן את ראש הפירוש
 * ונעצר · הוא יודע את המילה, אבל כתב פחות ממה שרשום.
 *
 * ⚠ זה החוק המסוכן במחלקה B, וזו בדיוק הסיבה שהוא פרמטרי ולא קבוע: ראש מקטע הוא
 * לרוב מילת-על ("כובע"), ומילת-על מתאימה גם למילים אחרות במאגר. הפרמטרים:
 *   minWords   כמה מילות תוכן חייבות להיות בתחילית
 *   minFrac    איזה חלק ממילות התוכן של המקטע התחילית מכסה
 *   headMode   'any'          כל תחילית בגבול מילה
 *              'modifierTail' רק כשההמשך פותח במילת יחס · כלומר הזנב הוא תיאור ולא
 *                             מילה נוספת בצירוף. "התחרט | על מה שעשה" כן,
 *                             "כובע | בד" לא · שם "בד" הוא חלק מהצירוף עצמו.
 * התחילית תמיד נגמרת במילת תוכן: "התחרט על" אינה תשובה.
 */
const headOfSegment = {
  id: 'B2', name: 'headOfSegment', cls: 'B', kind: 'gen',
  he: 'הלומד נתן את ראש הפירוש ונעצר · תשובה חלקית אך נכונה',
  defaults: { minWords: 2, minFrac: 0.5, headMode: 'any' },
  expand(segs, ctx, p) {
    const out = new Set();
    const st = stopOf(ctx);
    const minWords = p && p.minWords != null ? p.minWords : 2;
    const minFrac = p && p.minFrac != null ? p.minFrac : 0.5;
    const headMode = (p && p.headMode) || 'any';
    for (const seg of segs) {
      const W = wordsOf(seg);
      const total = W.filter(w => !st.has(w)).length;
      if (total < 2) continue;                    // אין ראש ואין זנב
      let cnt = 0;
      for (let k = 1; k < W.length; k++) {
        if (!st.has(W[k - 1])) cnt++;
        if (st.has(W[k - 1])) continue;           // תחילית חייבת להיגמר במילת תוכן
        if (cnt < minWords) continue;
        if (cnt / total < minFrac) continue;
        if (cnt === total) continue;              // זו כל התשובה, לא ראש שלה
        if (headMode === 'modifierTail' && !st.has(W[k])) continue;
        out.add(W.slice(0, k).join(' '));
      }
    }
    for (const s of segs) out.delete(s);
    return out;
  },
  accepts(typed, segs, ctx, p) { return this.expand(segs, ctx, p).has(typed); },
};

/* ===== C1 · מילה עודפת =====
 * "לצערו הרב" מול "לצערו". הלומד כתב את הפירוש ועוד מילה אחת.
 *
 * ההכלה נמדדת על מילות התוכן: מילות היחס העצמאיות כבר מתקבלות היום דרך particleMatch,
 * וספירה שלהן כ"מילה עודפת" הייתה סופרת פעמיים.
 * פרמטרים:
 *   maxExtra     כמה מילים עודפות מותרות
 *   fillerOnly   העודפת חייבת להיות מילת עוצמה חסרת תוכן ("הרב", "מאוד", "ביותר").
 *                זה השומר האמיתי: בלעדיו כל מילה מהעולם מותרת כתוספת, וכל מקטע שהוא
 *                תת-קבוצה של מקטע אחר במאגר נפתח לבליעה.
 *   subsequence  מילות המקטע חייבות להופיע בסדר · לא רק כרב-קבוצה.
 */
const FILLER_RAW = ['הרב', 'רב', 'מאוד', 'מאד', 'ביותר', 'יותר', 'מדי', 'ממש',
  'לגמרי', 'לחלוטין', 'בהחלט', 'במיוחד', 'היטב'];
const fillerCache = new WeakMap();
function fillerOf(ctx) {
  let s = fillerCache.get(ctx);
  if (!s) { s = new Set(FILLER_RAW.map(w => ctx.norm(w)).filter(Boolean)); fillerCache.set(ctx, s); }
  return s;
}
const extraWord = {
  id: 'C1', name: 'extraWord', cls: 'C', kind: 'scan',
  he: 'התשובה מכילה את הפירוש ועוד מילה · "לצערו הרב" מול "לצערו"',
  defaults: { maxExtra: 1, fillerOnly: true, subsequence: false },
  accepts(typed, segs, ctx, p) {
    const maxExtra = p && p.maxExtra != null ? p.maxExtra : 1;
    const fillerOnly = p && p.fillerOnly != null ? p.fillerOnly : true;
    const subsequence = !!(p && p.subsequence);
    const T = contentOf(wordsOf(typed), ctx);
    if (!T.length) return false;
    const filler = fillerOnly ? fillerOf(ctx) : null;
    for (const seg of segs) {
      const S = contentOf(wordsOf(seg), ctx);
      if (!S.length) continue;
      const extra = T.length - S.length;
      if (extra < 1 || extra > maxExtra) continue;
      /* הכלה כרב-קבוצה · מילה כפולה במקטע דורשת מילה כפולה בתשובה. */
      const pool = T.slice();
      let okAll = true;
      for (const w of S) { const j = pool.indexOf(w); if (j < 0) { okAll = false; break; } pool.splice(j, 1); }
      if (!okAll) continue;
      if (filler && !pool.every(w => filler.has(w))) continue;
      if (subsequence) {
        let i = 0;
        for (const w of T) if (i < S.length && w === S[i]) i++;
        if (i < S.length) continue;
      }
      return true;
    }
    return false;
  },
  /* כשהעודפת חייבת להיות מילת עוצמה **וגם** הסדר נשמר, קבוצת הקבלות סופית *במונחי
     מילות תוכן*: היא בדיוק כל השחלה של עד maxExtra מילות עוצמה לתוך רצף מילות התוכן
     של המקטע. מילות היחס העצמאיות אינן נספרות ולכן אינן מרחיבות את הקבוצה · הן כבר
     חופשיות היום דרך particleMatch.
     המנייה היא לכן בצורה הקנונית (מילות תוכן בלבד), וזו גם הצורה שבה המדידה משווה.
     בלי המנייה הזאת השורה "נותר אחרי הווטו" בדוח הייתה "לא נמדד".
     מחזיר null כשהקבוצה אינה סופית, ואז המדידה נופלת חזרה לסריקה בתוך היקום בלבד. */
  finiteExpand(segs, ctx, p) {
    const maxExtra = p && p.maxExtra != null ? p.maxExtra : 1;
    const fillerOnly = p && p.fillerOnly != null ? p.fillerOnly : true;
    const subsequence = !!(p && p.subsequence);
    if (!fillerOnly || !subsequence || maxExtra > 2) return null;
    const filler = Array.from(fillerOf(ctx));
    const base = [];
    for (const s of segs) { const S = contentOf(wordsOf(s), ctx); if (S.length) base.push(S); }
    if (!base.length) return new Set();
    let cur = base;
    const out = new Set();
    for (let round = 0; round < maxExtra; round++) {
      const next = [];
      for (const W of cur) {
        for (const f of filler) {
          for (let i = 0; i <= W.length; i++) {
            const v = W.slice(0, i).concat([f], W.slice(i));
            const k = v.join(' ');
            if (!out.has(k)) { out.add(k); next.push(v); }
          }
        }
      }
      cur = next;
    }
    for (const s of segs) out.delete(s);
    return out;
  },
};

/* ===== D1 · מילת יחס חופשית =====
 * הרחבה של particleMatch (app.js:1293). מה שכבר עובד היום, ואומת בהרצה: "נרתיק לחרב"
 * מול "נרתיק החרב" ו"עובד בבית מרחץ" מול "עובד בבית המרחץ" · שניהם *מתקבלים* היום,
 * כי peel מוריד אות אחת מ-הלבכו והשוואה peel מול peel מצליחה.
 *
 * מה שנשאר פתוח, ולכן מה שהחוק הזה מציע:
 *   peel      אילו אותיות ניתנות לקילוף. היום 'הלבכו'. הרחבה: מ' ("מבית" מול "בית")
 *             ו-ש' ("שקשור" מול "קשור" · דִּידַקְטִי).
 *   minLen    היום קילוף רק ממילה באורך >3. הורדה ל->2 פותחת מילים בנות שלוש אותיות,
 *             ושם ההבחנה בין תחילית לאות שורשית קורסת ("הרב" אינו "רב" עם ה').
 *   subset    הרפיה של שוויון מספר המילים · כל מילות התשובה נמצאות במקטע, והמקטע ארוך
 *             יותר. ⚠ זו למעשה מחלקה B בתחפושת מורפולוגי, והיא נמדדת ככזאת.
 *   maxMissing  כמה מילות מקטע מותר שלא יופיעו בתשובה, כש-subset פעיל.
 *
 * מימוש עצמאי ולא עטיפה של particleMatch: העטיפה הייתה יכולה רק להוסיף קבלות אחרי
 * שהפונקציה המקורית החזירה false, ולא לשנות את peel שבתוכה.
 */
const particleLoose = {
  id: 'D1', name: 'particleLoose', cls: 'D', kind: 'scan',
  he: 'אות יחס או ה"א הידיעה מבדילה בין התשובה לפירוש · אותה תשובה בדיוק',
  defaults: { peel: 'הלבכו', minLen: 4, subset: false, maxMissing: 0 },
  accepts(typed, segs, ctx, p) {
    const peelSet = (p && p.peel) || 'הלבכו';
    const minLen = p && p.minLen != null ? p.minLen : 4;
    const subset = !!(p && p.subset);
    const maxMissing = p && p.maxMissing != null ? p.maxMissing : 0;
    const st = stopOf(ctx);
    const cut = s => wordsOf(s).filter(w => !st.has(w));
    const peel = w => (w.length >= minLen && peelSet.includes(w[0])) ? w.slice(1) : null;
    const eq = (x, y) => x === y || peel(x) === y || x === peel(y) || (!!peel(x) && peel(x) === peel(y));
    const A = cut(typed);
    if (!A.length) return false;
    for (const seg of segs) {
      const B = cut(seg);
      if (!B.length) continue;
      if (!subset) { if (A.length !== B.length) continue; }
      else if (A.length > B.length || B.length - A.length > maxMissing) continue;
      const used = B.map(() => false);
      const all = A.every(x => {
        const j = B.findIndex((y, i) => !used[i] && eq(x, y));
        if (j < 0) return false;
        used[j] = true; return true;
      });
      if (all) return true;
    }
    return false;
  },
};

const RULES = [splitOr, headOfSegment, extraWord, particleLoose];
const BY_ID = new Map(RULES.map(r => [r.id, r]));
const BY_NAME = new Map(RULES.map(r => [r.name, r]));

/* ===== השילוב =====
 * תוספתי בלבד, וזה מובנה ולא מוצהר: הפסק הוא meaningMatch של האפליקציה OR החוקים.
 * לכן שום דבר שמתקבל היום אינו יכול להידחות · אין ענף שמחזיר false אחרי ש-meaningMatch
 * החזירה true. המדידה בכל זאת בודקת את זה על כל המאגר, כי אינווריאנט שלא נמדד הוא
 * אינווריאנט שנשען על קריאה.
 *
 * cfg: { splitOr: {on:true, params:{...}, veto}, headOfSegment:{on:false}, ... }
 * מפתח שאינו מופיע · כבוי.
 *
 * שער הווטו (כש-veto מסופק) חוסם **רק את התוספת**, לעולם לא את meaningMatch. הסדר הזה
 * אינו סגנוני: ווטו שיוחל על ההכרעה כולה היה פוסל מקטע שהכרטיס עצמו מקבל היום ברגע
 * שערך אחר במאגר חולק אותו · כלומר רגרסיה על ההתאמה המדויקת. לכן ההחזרה המוקדמת של
 * 'today' קודמת לכל בדיקת ווטו, ו-measure_gloss אוכף את זה על כל המאגר.
 */
function makeGlossChecker(ctx, cfg) {
  const { isVetoedSeg } = require('./veto.js');
  const active = [];
  let veto = null;
  for (const r of RULES) {
    const c = cfg && (cfg[r.name] || cfg[r.id]);
    if (!c || c.on === false) continue;
    if (c.veto) veto = c.veto;
    active.push({ rule: r, params: Object.assign({}, r.defaults, c.params) });
  }
  return function (typed, card) {
    const a = ctx.norm(typed);
    if (!a) return { ok: false, by: null };
    if (ctx.meaningMatch(a, card.meaning)) return { ok: true, by: 'today' };
    const segs = Array.from(ctx.meaningSegs(card.meaning));
    for (const { rule, params } of active) {
      if (!rule.accepts(a, segs, ctx, params)) continue;
      if (veto && isVetoedSeg(a, card, veto, ctx)) return { ok: false, by: null, veto: true };
      return { ok: true, by: rule.name };
    }
    return { ok: false, by: null };
  };
}

module.exports = {
  RULES, BY_ID, BY_NAME, splitOr, headOfSegment, extraWord, particleLoose,
  makeGlossChecker, wordsOf, contentOf, stopOf, fillerOf, FILLER_RAW,
};
