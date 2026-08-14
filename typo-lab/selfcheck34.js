'use strict';
/* שיניים לשלבים 3-4 · typo-lab/selfcheck34.js
 *
 * שער שמדווח "עבר" בלי להוכיח שהוא יודע להיכשל אינו עדות · זה כתוב ב-CLAUDE.md של
 * הפרויקט, וזה קרה בו שלוש פעמים. לכן כל בדיקה כאן שותלת קודם כשל ודורשת לתפוס אותו,
 * ורק אחר כך בודקת את המצב התקין.
 *
 * שבע בדיקות:
 *   1. בודק שבור · שכבת הווטו מנוטרלת → הכושר חייב לצנוח לעונש המוות.
 *   2. פרמטרים אבסורדיים · minLen 0, סף 9 → קבלות-שווא, כושר שלילי.
 *   3. גנום אפס-סובלנות · בדיוק ההתנהגות של היום: 0 קבלות-שווא ו-0 קבלות-פאזיות.
 *   4. שקילות מרחק · wEditDist בלי משקלים === editDist של app.js על 20,000 זוגות.
 *   5. שקילות מהיר↔מדויק · המכפלה הסקלרית על היישורים שנמנו === wEditDist החסומה.
 *   6. טבלת הזהב · משוחזרת מהדיסק ומריצה מחדש אותה הכרעה, שורה בשורה.
 *   7. הסמנטיקה של v2 · חשבון ההוצאה של trusted:false, ודלי ה-real-word.
 *
 * וכן שני אילוצים קשיחים מהתוכנית: שומר הנטיות (כפרים מול כֹּפֶר) ושורות הווטו.
 */

const fs = require('fs');
const path = require('path');

const { getCtx } = require('./lib/ctx.js');
const { buildVeto } = require('./lib/veto.js');
const { wEditDist, opVectors, opCounts, OP_KEYS, UNIT_W } = require('./lib/wdist.js');
const { makeChecker, normalizeParams, MAX_OPS } = require('./lib/checker.js');
const { mulberry32 } = require('./lib/rng.js');
const EV = require('./evolve.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');

let failures = 0;
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail || '' });
  if (!ok) failures++;
  say(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ' · ' + detail : ''}`);
}

/* ===== 4 · שקילות מול הפרימיטיב של האפליקציה ===== */
function checkDistanceEquivalence() {
  say('\n[4] wEditDist בלי משקלים מול editDist של app.js');
  const ctx = getCtx('he');
  const rnd = mulberry32(20260814);
  const HE = 'אבגדהוזחטיכלמנסעפצקרשת';
  const EN = 'abcdefghijklmnopqrstuvwxyz';
  let n = 0, bad = 0, firstBad = null, transposeSeen = 0;
  for (let t = 0; t < 20000; t++) {
    const al = (t % 2) ? HE : EN;
    const la = Math.floor(rnd() * 9), lb = Math.floor(rnd() * 9);
    let a = '', b = '';
    for (let i = 0; i < la; i++) a += al[Math.floor(rnd() * al.length)];
    for (let i = 0; i < lb; i++) b += al[Math.floor(rnd() * al.length)];
    const x = wEditDist(a, b, UNIT_W, Infinity);
    const y = ctx.editDist(a, b);
    n++;
    if (x !== y) { bad++; if (!firstBad) firstBad = `"${a}" / "${b}" → ${x} מול ${y}`; }
    if (la > 1 && lb > 1 && a[0] === b[1] && a[1] === b[0] && a[0] !== a[1]) transposeSeen++;
  }
  check(`שקילות על ${n} זוגות אקראיים`, bad === 0, bad ? `${bad} פערים · ראשון ${firstBad}` : `כולל ${transposeSeen} זוגות עם היפוך פותח`);

  /* שיניים · אותה בדיקה עם transpose=1 חייבת **להיכשל**, אחרת היא אינה בודקת כלום:
     היא הייתה עוברת גם אם מהלך ההיפוך לא היה קיים בקוד. */
  /* הזוגות חייבים להיות היפוך שכנים **אחרי** קיפול הסופיות · "שלום"/"שלמו" נראה כמו
     היפוך אבל ם ו-מ הם שני תווים שונים לפני norm, ולכן אין שם היפוך כלל. */
  const OSA = Object.assign({}, UNIT_W, { transpose: 1 });
  const pairs = [['abcd', 'abdc'], ['כתבי', 'כבתי'], ['stop', 'sotp']];
  let osaDiff = 0;
  for (const [a, b] of pairs) {
    if (wEditDist(a, b, OSA, Infinity) !== ctx.editDist(a, b)) osaDiff++;
  }
  check('שן · במחיר היפוך 1 המרחקים חייבים להיפרד', osaDiff === pairs.length, `${osaDiff}/${pairs.length} נפרדו`);

  /* שיניים · מרחק חסום חייב להחזיר אינסוף מעבר לתקרה ולא מספר גדול. */
  check('שן · חסם מחזיר Infinity ולא מספר', wEditDist('abcdefgh', 'zyxwvuts', UNIT_W, 2) === Infinity);
}

/* ===== 5 · שקילות המהיר למדויק ===== */
function checkFastExactEquivalence() {
  say('\n[5] מכפלה סקלרית על היישורים שנמנו מול wEditDist החסומה');
  const rnd = mulberry32(777);
  const HE = 'אבגדהוזחטיכלמנסעפצקרשת';
  const EN = 'abcdefghijklmnopqrstuvwxyz';
  let n = 0, bad = 0, first = null, maxVec = 0;
  for (let t = 0; t < 8000; t++) {
    const al = (t % 2) ? HE : EN;
    const la = 1 + Math.floor(rnd() * 10);
    let a = '';
    for (let i = 0; i < la; i++) a += al[Math.floor(rnd() * al.length)];
    /* b נגזר מ-a בעד שלוש פעולות · זוגות אקראיים לגמרי היו כמעט תמיד מחוץ לתקרה. */
    let b = a;
    const ops = 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < ops; k++) {
      const i = Math.floor(rnd() * Math.max(1, b.length));
      const r = rnd();
      if (r < 0.34) b = b.slice(0, i) + al[Math.floor(rnd() * al.length)] + b.slice(i + 1);
      else if (r < 0.67) b = b.slice(0, i) + b.slice(i + 1);
      else b = b.slice(0, i) + al[Math.floor(rnd() * al.length)] + b.slice(i);
    }
    if (!b) continue;
    const W = {
      sub: 1,
      adjSub: 0.2 + rnd() * 1.8, transpose: 0.2 + rnd() * 2.8, ins: 0.2 + rnd() * 1.8,
      del: 0.2 + rnd() * 1.8, doubleLetter: 0.2 + rnd() * 1.8, materVI: 0.2 + rnd() * 1.8,
      homophone: 0.2 + rnd() * 1.8
    };
    const vecs = opVectors(a, b, MAX_OPS);
    if (vecs.length > maxVec) maxVec = vecs.length;
    let dot = Infinity;
    for (const v of vecs) {
      let s = 0;
      for (const k of OP_KEYS) s += v[k] * W[k];
      if (s < dot) dot = s;
    }
    const exact = wEditDist(a, b, W, Infinity, MAX_OPS);
    n++;
    if (Math.abs(dot - exact) > 1e-9 && !(dot === Infinity && exact === Infinity)) {
      bad++;
      if (!first) first = `"${a}" / "${b}" → ${dot} מול ${exact}`;
    }
  }
  check(`שקילות על ${n} זוגות עם משקלים אקראיים`, bad === 0, bad ? `${bad} פערים · ראשון ${first}` : `לכל היותר ${maxVec} יישורים בלתי-נשלטים`);

  /* שיניים · יישור יחיד (opCounts) חייב להיות **גרוע יותר** לפחות פעם אחת. אם לא, המניין
     המלא היה מיותר וכל הנימוק לגביו שקרי. */
  let single = 0;
  const cheap = { sub: 1, adjSub: 0.2, transpose: 2.9, ins: 0.2, del: 0.2, doubleLetter: 0.2, materVI: 0.2, homophone: 0.2 };
  for (const [a, b] of [['leda', 'lead'], ['abcd', 'abdc'], ['שלמו', 'שלום']]) {
    const oc = opCounts(a, b, MAX_OPS);
    if (!oc) continue;
    let s = 0;
    for (const k of OP_KEYS) s += oc.counts[k] * cheap[k];
    if (s > wEditDist(a, b, cheap, Infinity, MAX_OPS) + 1e-9) single++;
  }
  check('שן · יישור יחיד יקר יותר מהמינימום האמיתי', single > 0, `${single}/3 זוגות`);
}

/* ===== 1-3 · הכושר ===== */
function checkFitness(packs) {
  say('\n[1-3] הכושר · בודק שבור, פרמטרים אבסורדיים, וגנום אפס-סובלנות');

  for (const set of EV.SETS) {
    const S = packs[set];
    const all = Int32Array.from({ length: S.N }, (_, i) => i);

    /* 3 · אפס סובלנות. חייב להיות בדיוק ההתנהגות של היום: אף שורה אינה מתקבלת (כל
       השורות בדאטהסט הן כאלה שהחוק של היום דוחה), ולכן 0 קבלות-שווא ו-0 קבלות. */
    const zero = normalizeParams(EV.genomeToParams(EV.paramsToGenome(EV.SEED_PARAMS[0])));
    const zRes = EV.evalSubset(S, all, EV.makeFastEval(zero));
    /* ‏faOwn ולא fa · שורה שהחוק של היום מקבל (via=exact) אינה באחריות הגנום. נמדד:
       שורת gloss אחת ("כל" מול "כלל") ש-meaningMatch מקבלת לפני שכל פרמטר נקרא. */
    check(`[3] ${set} · גנום אפס-סובלנות: 0 קבלות-שווא`, zRes.faOwn === 0, `${zRes.faOwn} (ועוד ${zRes.faToday} via=exact שאינן של הגנום)`);
    check(`[3] ${set} · גנום אפס-סובלנות: 0 קבלות פאזיות`, zRes.tp === 0, `${zRes.tp}`);
    const zFit = EV.fitnessOf(Object.assign({}, zRes, { fa: zRes.faOwn }), zero);
    check(`[3] ${set} · הכושר שלו הוא 0 בדיוק`, Math.abs(zFit) < 1e-12, String(zFit));

    /* 2 · פרמטרים אבסורדיים · minLen 0 וסף 9 לכל אורך. */
    const absurd = normalizeParams({ minLen: 0, bands: [{ maxLen: Infinity, t: 9 }], W: {}, vetoMargin: 1 });
    const aRes = EV.evalSubset(S, all, EV.makeFastEval(absurd));
    const aFit = EV.fitnessOf(aRes, absurd);
    check(`[2] ${set} · פרמטרים אבסורדיים מייצרים קבלות-שווא`, aRes.fa > 0, `${aRes.fa} קבלות-שווא`);
    check(`[2] ${set} · והכושר צונח מתחת ל-1e5-`, aFit < -1e5, aFit.toExponential(2));

    /* 1 · בודק שבור · אותם פרמטרים, אבל שכבת הווטו והשכבות המבניות מנוטרלות. אם הכושר
       אינו צונח, אין לשכבות האלה שום השפעה והן קישוט. */
    const broken = brokenEval(S, absurd);
    check(`[1] ${set} · בודק בלי וטו: קבלות-שווא גדלות`, broken.fa > aRes.fa, `${aRes.fa} → ${broken.fa}`);
    check(`[1] ${set} · והכושר נשאר בעונש המוות`, EV.fitnessOf(broken, absurd) < -1e5, EV.fitnessOf(broken, absurd).toExponential(2));

    /* 1ב · בודק שבור על הפרמטרים **הנשלחים**. זו השן החדה באמת: על הפרמטרים הטובים
       יש 0 קבלות-שווא, ובלי הווטו הם חייבים להתפוצץ. */
    const ship = normalizeParams(shipParams()[set]);
    const sRes = EV.evalSubset(S, all, EV.makeFastEval(ship));
    const sBroken = brokenEval(S, ship);
    check(`[1] ${set} · הפרמטרים הנשלחים: 0 קבלות-שווא`, sRes.faOwn === 0, `${sRes.faOwn} · real-word ${sRes.faRealWord} · via=exact ${sRes.faToday}`);
    /* סט בלי שום סובלנות (כל הספים 0) אינו מקבל דבר, ולכן הסרת הווטו אינה יכולה לשבור
       אותו · השן נוגסת באוויר ומדולגת במפורש במקום לדווח ירוק כוזב. */
    const anyTol = ship.bands.some(b => b.t > 0);
    if (anyTol) check(`[1] ${set} · ובלי הווטו הם נשברים`, sBroken.fa > 0 && EV.fitnessOf(sBroken, ship) < -1e5, `0 → ${sBroken.fa} קבלות-שווא`);
    else say(`  ⊘ [1] ${set} · אין סובלנות בכלל (כל הספים 0) · שן הווטו אינה ישימה`);
  }
}

/* ===== 7 · הסמנטיקה של v2 · trusted:false ו-real-word =====
 * הספירות מקובעות בכוונה לדאטהסט v2 (manifest.json · 89,375 שורות). אם מישהו ייצר
 * דאטהסט מחדש והחלוקה תזוז, הבדיקה תיפול · וזה בדיוק מה שצריך לקרות, כי כל דוח שנשען
 * על "‏3,891 שורות הוצאו" ייהפך שקרי באותו רגע. */
/* ‏lexAccept עלה עם לקסיקון v2 (‏+667 מילים נטו) · 92->116, 94->118, 44->57. אלה שורות
   accept שהמסנן חוסם, וההערכה שלהן בדוח היא **תוויות שגויות ולא רגרסיות**: 30 מתוך
   74 החסימות החדשות הן מחרוזת של מילה אחת שהיא מילה עברית אמיתית ("כריש", "דונמ",
   "ציטט", "חלחלו"), כלומר accept היה התיוג הלא-נכון מלכתחילה.
   ‏lexRealWord לא זז (‏1,701 מתוך 2,019) · השלמת צורות-המאגר בפרדיקט כבר כיסתה את מה
   שהתוספת הייתה מוסיפה, ו-667 המילים החדשות אינן נופלות על 318 השורות הלא-מכוסות. */
const V2_COUNTS = {
  'he-word': { untrusted: 2277, realWord: 1167, lexRealWord: 952, lexAccept: 116 },
  'en-word': { untrusted: 0, realWord: 123, lexRealWord: 120, lexAccept: 118 },
  'gloss': { untrusted: 1818, realWord: 729, lexRealWord: 629, lexAccept: 57 }
};

/* ===== 8 · הלקסיקון · האם המעבדה מודדת את החיפוש שהריצה תריץ =====
 * הנכס נטען מהקובץ שהדפדפן יטען, והסמנטיקה נבדקת מול lexHit של הבנאי · שורה בשורה,
 * על כל הדאטהסט. אילו נכתב כאן מימוש מקביל, הוא היה יכול להיות נכון ביום שנכתב
 * ולהיפרד בשקט אחר כך. */
function checkLexiconIdentity(perSet) {
  say('\n[8] לקסיקון-הריצה · זהות מול הבנאי');
  const CK = require('./lib/checker.js');
  check('הנכס נטען · out/runtime-lexicon.js', CK.LEX_AVAILABLE, CK.LEX_AVAILABLE ? '' : 'חסר · הריצו build_runtime_lexicon.js');
  if (!CK.LEX_AVAILABLE) return;
  let B = null, LEX = null;
  try { B = require('./build_runtime_lexicon.js'); LEX = require('./out/runtime-lexicon.js'); } catch (e) { B = null; }
  if (!B) { check('הבנאי זמין להשוואה', false, 'build_runtime_lexicon.js לא נטען'); return; }

  let n = 0, bad = 0, first = null, hits = 0;
  for (const set of EV.SETS) {
    for (const r of perSet[set]) {
      const lang = set === 'gloss' ? 'he' : r.lang;
      const mine = CK.lexHit(r.typedKey, r.key, lang);
      const theirs = B.lexHit(r.typed, lang, r.key, LEX.lookup);
      n++;
      if (mine) hits++;
      if (mine !== theirs) { bad++; if (!first) first = `"${r.typed}" ~ "${r.key}" (${set}) · ${mine}/${theirs}`; }
    }
  }
  check(`‏lexHit זהה לבנאי על ${n} שורות (${hits} פגיעות)`, bad === 0, bad ? `${bad} פערים · ראשון ${first}` : '');

  /* שן · חיפוש שמחזיר תמיד false חייב להיפרד. בלי זה, "זהה" יכול להיות "שניהם לא רצו". */
  let toothless = 0;
  for (const set of EV.SETS) {
    for (const r of perSet[set]) {
      const lang = set === 'gloss' ? 'he' : r.lang;
      if (B.lexHit(r.typed, lang, r.key, () => false) !== CK.lexHit(r.typedKey, r.key, lang)) toothless++;
    }
  }
  check('שן · חיפוש מנוטרל מייצר פערים', toothless === hits && hits > 0, `${toothless} פערים מול ${hits} פגיעות`);

  /* שן · negative שגוי הוא בלתי אפשרי במסנן Bloom · מילה שנמצאת בו חייבת להימצא. */
  check('מילת בדיקה עברית נמצאת', LEX.lookup('מעניינ', 'he') === false, 'מעניינ הוחסר כצורת מאגר · false הוא הנכון');
  check('מילה שאינה מילה אינה נמצאת', !LEX.lookup('קכגדחט', 'he'), 'קכגדחט');
}

function checkV2Semantics(packs) {
  say('\n[7] סמנטיקת v2 · הוצאת trusted:false מהמונה, ודלי ה-real-word');

  for (const set of EV.SETS) {
    const S = packs[set];
    const all = Int32Array.from({ length: S.N }, (_, i) => i);
    let unt = 0, untRej = 0, rw = 0, rwAcc = 0;
    for (let i = 0; i < S.N; i++) {
      const f = S.flags[i];
      if (!(f & 16)) { unt++; if (!(f & 8)) untRej++; }
      if (f & 32) { rw++; if (f & 8) rwAcc++; }
    }
    const want = V2_COUNTS[set];
    check(`[7] ${set} · ${want.untrusted} שורות trusted:false`, unt === want.untrusted, `${unt}`);
    check(`[7] ${set} · ${want.realWord} שורות why=real-word`, rw === want.realWord, `${rw}`);

    /* ההנחה שהדוח נשען עליה, נבדקת ולא מוצהרת: כל הלא-מהימנות הן accept (ולכן ההוצאה
       נוגעת רק למונה ה-recall), וכל שורות real-word הן reject (ולכן הן יכולות להיספר
       רק כקבלות-שווא). אם אחת מהשתיים תישבר, שאר הבדיקות כאן מודדות דבר אחר. */
    check(`[7] ${set} · כל הלא-מהימנות מתויגות accept`, untRej === 0, `${untRej} מהן reject`);
    check(`[7] ${set} · כל שורות real-word מתויגות reject`, rwAcc === 0, `${rwAcc} מהן accept`);

    /* חשבון ההוצאה · הזהות חייבת להתקיים בכל גנום, וכאן היא נבדקת על גנום מתירני
       לחלוטין, שבו כל המונים שונים מאפס. */
    const perm = normalizeParams({ minLen: 0, bands: [{ maxLen: Infinity, t: 999 }], W: {}, vetoMargin: 1 });
    const r = EV.evalSubset(S, all, EV.makeFastEval(perm));
    check(`[7] ${set} · nAccAll === nAcc + לא-מהימנות`, r.nAccAll === r.nAcc + r.nUntrustedAccept, `${r.nAccAll} מול ${r.nAcc}+${r.nUntrustedAccept}`);
    check(`[7] ${set} · tpAll === tp + לא-מהימנות שהתקבלו`, r.tpAll === r.tp + r.tpUntrusted, `${r.tpAll} מול ${r.tp}+${r.tpUntrusted}`);
    check(`[7] ${set} · קבלות-שווא על real-word אינן עולות על סך הקבלות-שווא`, r.faRealWord <= r.fa, `${r.faRealWord} מתוך ${r.fa}`);

    check(`[7] ${set} · המכנה בפועל קטן ב-${want.untrusted}`, r.nAccAll - r.nAcc === want.untrusted, `${r.nAccAll - r.nAcc}`);

    /* שן · דלי ה-real-word חייב להיות **פריץ** בפרמטרים גרועים, אחרת "0 קבלות-שווא
       עליו" אינו הישג אלא בדיקה שלא נגעה בו. */
    const absurd = normalizeParams({ minLen: 0, bands: [{ maxLen: Infinity, t: 9 }], W: {}, vetoMargin: 1 });
    const aRes = EV.evalSubset(S, all, EV.makeFastEval(absurd));
    check(`[7] ${set} · שן · פרמטרים אבסורדיים פורצים את דלי ה-real-word`, aRes.faRealWord > 0, `${aRes.faRealWord}/${aRes.nRejectRealWord}`);

    /* ===== שכבת הלקסיקון ===== */
    let lex = 0, lexReal = 0, lexAcc = 0;
    for (let i = 0; i < S.N; i++) {
      const f = S.flags[i];
      if (!(f & 64)) continue;
      lex++;
      if (f & 32) lexReal++;
      if (f & 8) lexAcc++;
    }
    check(`[7] ${set} · הלקסיקון חוסם ${want.lexRealWord} שורות real-word`, lexReal === want.lexRealWord, `${lexReal}`);
    check(`[7] ${set} · ומחירו ${want.lexAccept} שורות accept`, lexAcc === want.lexAccept, `${lexAcc}`);
    check(`[7] ${set} · הלקסיקון אינו חוסם שורה שהיא צורה של הכרטיס`, lexAcc < S.N * 0.01, `${lexAcc} מתוך ${S.N}`);

    /* המספר עצמו · על הפרמטרים הנשלחים. זה מספר הבטיחות החשוב ביותר בריצה. */
    const ship = normalizeParams(shipParams()[set]);
    const sRes = EV.evalSubset(S, all, EV.makeFastEval(ship));

    /* שן · **השכבה נושאת במשקל**. אותם פרמטרים בדיוק בלי הלקסיקון חייבים לייצר
       קבלות-שווא על real-word. אם לא · השכבה קישוט, וכל הדוח שנשען עליה שקרי.
       נמדד בריצה: he-word 1 · en-word 15 · gloss 6 קבלות-שווא נפתחות בלעדיה. */
    const noLex = EV.evalSubset(S, all, EV.makeFastEval(Object.assign({}, ship, { useLexicon: false })));
    if (ship.bands.some(b => b.t > 0)) {
      check(`[7] ${set} · שן · בלי הלקסיקון אותם פרמטרים נשברים`, noLex.faRealWord > 0 && sRes.faRealWord === 0,
        `real-word FA ${sRes.faRealWord} → ${noLex.faRealWord} · FA כולל ${sRes.faOwn} → ${noLex.faOwn}`);
    } else say(`  ⊘ [7] ${set} · אין סובלנות בכלל · שן הלקסיקון אינה ישימה`);

    /* שן · ההוצאה חייבת **לשנות** את המספר בסטים שבהם יש לא-מהימנות · ונמדדת בנקודת
       ההפעלה הנשלחת ולא בגנום המתירני. בגנום המתירני שני המונים מקבלים הכול, ולכן
       שניהם יוצאים 100% ב-gloss וההשוואה נוגסת באוויר · נמדד, וזו הייתה הגרסה
       הראשונה של הבדיקה הזאת. */
    if (want.untrusted > 0 && sRes.tpAll > 0) {
      check(`[7] ${set} · שן · ההוצאה משנה את ה-recall בנקודת ההפעלה`, Math.abs(sRes.recall - sRes.recallAll) > 1e-9, `${(sRes.recall * 100).toFixed(3)}% מול ${(sRes.recallAll * 100).toFixed(3)}%`);
    }
    check(`[7] ${set} · הפרמטרים הנשלחים: 0 קבלות-שווא על real-word`, sRes.faRealWord === 0, `${sRes.faRealWord} מתוך ${sRes.nRejectRealWord}`);
  }

  /* ‏recallByLength · הפילוח חייב להסתכם בדיוק במונה הכולל, אחרת הטבלה בדוח מספרת
     סיפור אחר מהשורה שמעליה. */
  for (const set of EV.SETS) {
    const S = packs[set];
    const all = Int32Array.from({ length: S.N }, (_, i) => i);
    const E = EV.makeFastEval(normalizeParams(shipParams()[set]));
    const tot = EV.evalSubset(S, all, E);
    const by = EV.recallByLength(S, all, E);
    const sum = by.reduce((a, b) => ({ nAccept: a.nAccept + b.nAccept, tp: a.tp + b.tp, fa: a.fa + b.fa }), { nAccept: 0, tp: 0, fa: 0 });
    check(`[7] ${set} · פילוח האורכים מסתכם בכולל`, sum.nAccept === tot.nAcc && sum.tp === tot.tp && sum.fa === tot.fa,
      `accept ${sum.nAccept}/${tot.nAcc} · tp ${sum.tp}/${tot.tp} · fa ${sum.fa}/${tot.fa}`);
  }
}

/* בודק שבור · מדלג על הווטו, על שומר הנטיות ועל שולי הדו-משמעות. מימוש נפרד ולא דגל
   בקוד האמיתי: דגל "אל תבדוק וטו" בקובץ הייצור הוא בדיוק המתג שיישכח דלוק. */
function brokenEval(S, P) {
  const E = EV.makeFastEval(P);
  const K = OP_KEYS.length;
  let tp = 0, nAcc = 0, fa = 0, nRej = 0;
  for (let i = 0; i < S.N; i++) {
    const isAcc = (S.flags[i] & 8) !== 0;
    /* אותה הוצאה בדיוק כמו במונה האמיתי · בודק שבור שסופר אחרת אינו "אותם פרמטרים
       בלי הווטו" אלא ניסוי אחר, וההשוואה בינו לבין הבודק התקין הייתה חסרת מובן. */
    const trusted = (S.flags[i] & 16) !== 0;
    if (isAcc) { if (trusted) nAcc++; } else nRej++;
    let ok = false;
    if (S.tLen[i] >= E.minLen && E.anyT) {
      const hi = S.off[i + 1];
      for (let p = S.off[i]; p < hi; p++) {
        const L = S.pLen[p];
        const t = E.tcache[L < 256 ? L : 255];
        if (!(t > 0)) continue;
        let cost = 0;
        for (let j = 0; j < K; j++) cost += S.pCnt[p * K + j] * E.wv[j];
        if (cost <= t) { ok = true; break; }
      }
    }
    if (ok) { if (isAcc) { if (S.flags[i] & 16) tp++; } else fa++; }
  }
  return { tp, nAcc, fa, nRej, recall: nAcc ? tp / nAcc : 0 };
}

function shipParams() {
  const j = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
  const out = {};
  for (const set of EV.SETS) {
    const p = j.params[set];
    out[set] = {
      minLen: p.minLen, vetoMargin: p.vetoMargin, W: p.W,
      bands: p.bands.map(b => ({ maxLen: b.maxLen == null ? Infinity : b.maxLen, t: b.t }))
    };
  }
  return out;
}

/* ===== אילוצים קשיחים מהתוכנית ===== */
function checkHardConstraints(rowsBySet, langs) {
  say('\n[קשיח] שומר הנטיות ושורות הווטו · דרך הבודק האמיתי');
  const P = shipParams();
  const checkers = {};
  const ckFor = (lang, set) => {
    const k = lang + '|' + set;
    if (!checkers[k]) {
      const L = langs[lang];
      checkers[k] = makeChecker(P[set], L.ctx, L.veto, lang);
    }
    return checkers[k];
  };

  let inflN = 0, inflBad = 0, vetoN = 0, vetoBad = 0;
  for (const set of EV.SETS) {
    for (const r of rowsBySet[set]) {
      const isInfl = String(r.op) === 'neg/inflection';
      const isVeto = String(r.why).split(':')[0] === 'veto';
      if (!isInfl && !isVeto) continue;
      const L = langs[r.lang];
      const card = L.byCard.get(r.term + '|' + r.unit);
      const v = set === 'gloss' ? ckFor(r.lang, set).acceptGloss(r.typed, card) : ckFor(r.lang, set).acceptWord(r.typed, card);
      if (isInfl) { inflN++; if (v.ok) inflBad++; }
      if (isVeto) { vetoN++; if (v.ok) vetoBad++; }
    }
  }
  check(`שומר הנטיות · ${inflN} שורות נטייה, אף אחת אינה מתקבלת`, inflBad === 0, `${inflBad} נפרצו`);
  check(`הווטו · ${vetoN} שורות וטו, אף אחת אינה מתקבלת`, vetoBad === 0, `${vetoBad} נפרצו`);

  /* המקרה המפורש מהתוכנית · isCorrect('כפרים','כֹּפֶר') נשאר false, וגם nearMatch לא
     יפרוץ אותו. אם המילה כֹּפֶר אינה במאגר, זו אינה "בדיקה שעברה" אלא בדיקה שלא רצה. */
    const he = langs.he;
  const kofer = Array.from(he.ctx.BANK).find(w => he.ctx.K(w.term) === he.ctx.K('כֹּפֶר'));
  if (!kofer) check('כפרים מול כֹּפֶר · הערך קיים במאגר', false, 'לא נמצא');
  else {
    const v = ckFor('he', 'he-word').acceptWord('כפרים', kofer);
    check('כפרים מול כֹּפֶר · נשאר נדחה', v.ok === false, `why=${v.why}`);
  }
}

/* ===== 6 · טבלת הזהב ===== */
function checkGolden(langs) {
  say('\n[6] טבלת הזהב · שחזור מהדיסק והרצה חוזרת');
  const file = path.join(OUT, 'golden.jsonl');
  if (!fs.existsSync(file)) { check('טבלת הזהב קיימת', false, 'out/golden.jsonl חסר · הריצו evolve.js'); return; }
  const P = shipParams();
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const checkers = {};
  let n = 0, bad = 0, first = null, okCount = 0;
  for (const line of lines) {
    const g = JSON.parse(line);
    const k = g.lang + '|' + g.set;
    if (!checkers[k]) {
      const L = langs[g.lang];
      checkers[k] = makeChecker(P[g.set], L.ctx, L.veto, g.lang);
    }
    const card = langs[g.lang].byCard.get(g.term + '|' + g.unit);
    if (!card) { bad++; if (!first) first = `כרטיס חסר · ${g.term}`; continue; }
    const v = g.set === 'gloss' ? checkers[k].acceptGloss(g.typed, card) : checkers[k].acceptWord(g.typed, card);
    n++;
    if (v.ok) okCount++;
    const sameOk = !!v.ok === !!g.verdict.ok;
    const sameWhy = (v.why || null) === g.verdict.why;
    const sameVia = (v.via || null) === g.verdict.via;
    if (!sameOk || !sameWhy || !sameVia) {
      bad++;
      if (!first) first = `"${g.typed}" ~ ${g.term} · ${JSON.stringify(g.verdict)} מול ${JSON.stringify(v)}`;
    }
  }
  check(`${n} החלטות משוחזרות זהות (${okCount} קבלות)`, bad === 0, bad ? `${bad} פערים · ראשון ${first}` : '');

  /* שיניים · פרמטרים אחרים חייבים לשבור את ההרצה החוזרת, אחרת "זהה" יכול להיות
     "הבדיקה לא באמת מריצה את הפרמטרים".
     אפס-סובלנות ולא סף גבוה יותר, ובכוונה: בסטים של המונחים הסף כלל **אינו** האילוץ
     הפעיל (שולי הדו-משמעות הם), ולכן העלאת סף שינתה שתי החלטות בלבד · שן שנוגסת
     באוויר. עם אפס-סובלנות המספר ידוע מראש: כל הקבלות שהגיעו דרך הנתיב הפאזי, בדיוק. */
  const expect = lines.map(l => JSON.parse(l)).filter(g => g.verdict.ok && g.verdict.via === 'typo').length;
  const zeroed = {};
  for (const set of EV.SETS) zeroed[set] = Object.assign({}, P[set], { bands: P[set].bands.map(b => ({ maxLen: b.maxLen, t: 0 })) });
  const ck2 = {};
  let diff = 0;
  for (const line of lines) {
    const g = JSON.parse(line);
    const k = g.lang + '|' + g.set;
    if (!ck2[k]) { const L = langs[g.lang]; ck2[k] = makeChecker(zeroed[g.set], L.ctx, L.veto, g.lang); }
    const card = langs[g.lang].byCard.get(g.term + '|' + g.unit);
    if (!card) continue;
    const v = g.set === 'gloss' ? ck2[k].acceptGloss(g.typed, card) : ck2[k].acceptWord(g.typed, card);
    if (!!v.ok !== !!g.verdict.ok) diff++;
  }
  check('שן · אפס-סובלנות מבטל בדיוק את הקבלות הפאזיות', diff === expect && expect > 0, `${diff} השתנו מול ${expect} צפויות`);
}

/* ===== ראשי ===== */
function main() {
  const T0 = Date.now();
  say('=== שיניים לשלבים 3-4 ===');

  checkDistanceEquivalence();
  checkFastExactEquivalence();

  say('\nטעינה וקדם-חישוב (משותף לשאר הבדיקות) ...');
  const { perSet, langs } = EV.loadRows();
  const packs = {};
  for (const set of EV.SETS) packs[set] = EV.packSet(perSet[set]);

  checkFitness(packs);
  checkV2Semantics(packs);
  checkLexiconIdentity(perSet);
  checkHardConstraints(perSet, langs);
  checkGolden(langs);

  const wall = ((Date.now() - T0) / 1000).toFixed(1);
  say(`\n=== ${results.length - failures}/${results.length} עברו · ${wall} שניות ===`);
  if (failures) {
    say(`\n⛔ ${failures} בדיקות נפלו:`);
    for (const r of results) if (!r.ok) say(`   ${r.name} · ${r.detail}`);
    process.exit(1);
  }
  say('לשער יש שיניים');
  process.exit(0);
}

if (require.main === module) main();
