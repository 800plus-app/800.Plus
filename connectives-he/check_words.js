#!/usr/bin/env node
/*
 * check_words.js · השער של רשימת המילים ליחידת «מילות קישור ומילים הופכות כיוון»
 *
 * הרצה:  node connectives-he/check_words.js
 *        node connectives-he/check_words.js --selftest
 *
 * exit 0 = הרשימה תקינה · exit 1 = נמצא פגם
 *
 * מה בקובץ words.json: מערך של רשומות, ובכל רשומה בדיוק שישה שדות.
 *   w      המילה בכתיב מלא בלי ניקוד
 *   nikud  אותה מילה מנוקדת
 *   k      קטגוריה אחת בדיוק מתוך התשע
 *   slot   החריץ התחבירי: adverb · conj · prep · phrase
 *   gloss  פירוש קצר בעברית פשוטה
 *   flip   בוליאני. האם המילה הופכת את כיוון המשפט
 *
 * הגדרת החריץ (slot) היא תפקיד תחבירי ולא מספר מילים, בעקבות התוכנית
 * המאושרת שבה «אף על פי כן» מסומן adverb:
 *   conj    ניצב בראש פסוקית ומחבר שתי פסוקיות (אף ש־, שכן, אולם, אלא)
 *   prep    שולט בצירוף שמני (חרף, בשל, למעט)
 *   adverb  תואר פועל של המשפט כולו, מילה אחת או צירוף (לפיכך, אף על פי כן)
 *   phrase  צירוף שדורש פסוקית שלמה אחריו ואינו מילת חיבור פשוטה (ספק אם)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'words.json');
const MIN_WORDS = 55;

const CATEGORIES = [
  'ניגוד', 'ויתור', 'סיבה', 'תוצאה', 'תנאי בטל',
  'הסתייגות', 'הוספה', 'הבהרה', 'הופכות כיוון'
];
const SLOTS = ['adverb', 'conj', 'prep', 'phrase'];
const FIELDS = ['w', 'nikud', 'k', 'slot', 'gloss', 'flip'];

// מפרידים שמעידים על שתי קטגוריות ברשומה אחת
const SPLITTERS = /[,\/|+·;]|\sו-|\sאו\s/;

/* ---------- עזר ---------- */

// הסרת סימני ניקוד וטעמים. המקף העברי (U+05BE) נשאר, הוא חלק מהמילה
function stripNikud(s) {
  return String(s).replace(/[֑-ֽֿ-ׇ]/g, '');
}

// שלד עיצורי להשוואה בין כתיב מלא (w) לכתיב חסר שמנוקד (nikud):
// אמות הקריאה ו/י נופלות משני הצדדים, ולכן «לְעֻמַּת» ו«לעומת» משתווים
function skeleton(s) {
  return stripNikud(s).replace(/[ויְ]/g, '').replace(/\s+/g, ' ').trim();
}

function hasNikudMarks(s) {
  return /[֑-ֽֿ-ׇ]/.test(String(s));
}

/* ---------- הכללים ---------- */
// כל כלל מחזיר מערך תקלות. תקלה = { rule, msg }

function validate(words) {
  const bad = [];
  const add = (rule, msg) => bad.push({ rule, msg });

  if (!Array.isArray(words)) {
    add('SHAPE', 'words.json אינו מערך');
    return bad;
  }

  // 1 · מספר מילים
  if (words.length < MIN_WORDS) {
    add('MIN', `יש ${words.length} מילים, והמינימום הוא ${MIN_WORDS}`);
  }

  const seen = new Map();

  words.forEach((it, i) => {
    const at = `#${i + 1}`;
    if (!it || typeof it !== 'object' || Array.isArray(it)) {
      add('SHAPE', `${at} אינה רשומה`);
      return;
    }
    const name = typeof it.w === 'string' && it.w.trim() ? it.w : at;

    // 2 · שדות. בדיוק ששת השדות, בלי חסר ובלי עודף
    for (const f of FIELDS) {
      if (!(f in it)) add('FIELDS', `${name}: חסר השדה ${f}`);
    }
    for (const f of Object.keys(it)) {
      if (!FIELDS.includes(f)) add('FIELDS', `${name}: שדה לא מוכר ${f}`);
    }

    // 3 · המילה עצמה
    if (typeof it.w !== 'string' || !it.w.trim()) {
      add('WORD', `${at}: שדה w ריק`);
    }

    // 4 · קטגוריה אחת בדיוק מתוך התשע
    if (Array.isArray(it.k)) {
      add('CAT', `${name}: קטגוריה אחת בלבד, ולא ${it.k.length}`);
    } else if (typeof it.k !== 'string' || !it.k.trim()) {
      add('CAT', `${name}: אין קטגוריה`);
    } else if (SPLITTERS.test(it.k)) {
      add('CAT', `${name}: שתי קטגוריות ברשומה אחת «${it.k}»`);
    } else if (!CATEGORIES.includes(it.k)) {
      add('CAT', `${name}: קטגוריה שאינה ברשימה «${it.k}»`);
    }

    // 5 · חריץ תחבירי
    if (typeof it.slot !== 'string' || !it.slot.trim()) {
      add('SLOT', `${name}: אין חריץ תחבירי`);
    } else if (!SLOTS.includes(it.slot)) {
      add('SLOT', `${name}: חריץ שאינו ברשימה «${it.slot}»`);
    }

    // 6 · ניקוד
    if (typeof it.nikud !== 'string' || !it.nikud.trim()) {
      add('NIKUD', `${name}: אין ניקוד`);
    } else if (!hasNikudMarks(it.nikud)) {
      add('NIKUD', `${name}: השדה nikud בלי סימני ניקוד`);
    } else if (typeof it.w === 'string' && skeleton(it.nikud) !== skeleton(it.w)) {
      add('NIKUD_MATCH',
        `${name}: הניקוד אינו של המילה. «${stripNikud(it.nikud)}» מול «${it.w}»`);
    }

    // 7 · פירוש
    if (typeof it.gloss !== 'string' || !it.gloss.trim()) {
      add('GLOSS', `${name}: אין פירוש`);
    } else if (it.gloss.includes('—')) {
      add('DASH', `${name}: מקף ארוך בפירוש`);   // כלל /HEB 3א
    }

    // 8 · flip בוליאני
    if (typeof it.flip !== 'boolean') {
      add('FLIP', `${name}: flip חייב להיות true או false`);
    }

    // 9 · כפילות
    if (typeof it.w === 'string') {
      const key = it.w.trim();
      if (seen.has(key)) {
        add('DUP', `${name}: מופיעה פעמיים, ברשומות ${seen.get(key)} ו-${at}`);
      } else {
        seen.set(key, at);
      }
    }
  });

  return bad;
}

/* ---------- דוח ---------- */

function summary(words) {
  const byCat = new Map(CATEGORIES.map(c => [c, 0]));
  const bySlot = new Map(SLOTS.map(s => [s, 0]));
  let flips = 0;
  for (const it of words) {
    if (byCat.has(it.k)) byCat.set(it.k, byCat.get(it.k) + 1);
    if (bySlot.has(it.slot)) bySlot.set(it.slot, bySlot.get(it.slot) + 1);
    if (it.flip === true) flips++;
  }
  const lines = [];
  lines.push(`סה"כ ${words.length} מילים · ${flips} מהן הופכות כיוון`);
  lines.push('קטגוריות: ' + CATEGORIES.map(c => `${c} ${byCat.get(c)}`).join(' · '));
  lines.push('חריצים:   ' + SLOTS.map(s => `${s} ${bySlot.get(s)}`).join(' · '));
  return lines.join('\n');
}

function readWords() {
  let raw;
  try {
    raw = fs.readFileSync(FILE, 'utf8');
  } catch (e) {
    console.error(`✗ אין קובץ ${FILE}`);
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`✗ words.json אינו JSON תקין: ${e.message}`);
    process.exit(1);
  }
}

/* ---------- selftest ---------- */
// לכל כלל: נתונים מזויפים שמפרים אותו לבדו, והוכחה שהוא נדלק.
// ובסוף: המצב האמיתי חייב לעבור נקי.

function selftest() {
  const real = readWords();
  const clone = () => JSON.parse(JSON.stringify(real));
  const fails = [];
  let n = 0;

  // rule = הכלל שנבדק · also = כללים שנלווים אליו בהכרח (מחיקת שדה מדליקה גם FIELDS).
  // הדרישה: קבוצת הכללים שנדלקו זהה בדיוק לצפוי. לא פחות, ולא אחד מיותר.
  function expectRule(label, rule, words, also) {
    n++;
    const want = new Set([rule].concat(also || []));
    const bad = validate(words);
    const got = new Set(bad.map(b => b.rule));
    const missing = [...want].filter(r => !got.has(r));
    const extra = [...got].filter(r => !want.has(r));
    if (missing.length || extra.length) {
      const why = [
        missing.length ? `לא נדלק ${missing.join(',')}` : '',
        extra.length ? `נדלק בנוסף ${extra.join(',')}` : ''
      ].filter(Boolean).join(' · ');
      fails.push(`${label}: ${why}`);
      console.log(`  ✗ ${label} · ${why}`);
      return;
    }
    const first = bad.find(b => b.rule === rule);
    console.log(`  ✓ ${label} · ${rule} נפל: ${first.msg}`);
  }

  console.log('— selftest · כל כלל נבדק לבדו —');

  // MIN
  expectRule('פחות מ-55 מילים', 'MIN', clone().slice(0, MIN_WORDS - 1));

  // CAT · אין קטגוריה
  let w = clone(); delete w[3].k;
  expectRule('מילה בלי קטגוריה', 'CAT', w, ['FIELDS']);

  // CAT · שתי קטגוריות כמערך
  w = clone(); w[5].k = ['ניגוד', 'ויתור'];
  expectRule('שתי קטגוריות (מערך)', 'CAT', w);

  // CAT · שתי קטגוריות במחרוזת אחת
  w = clone(); w[6].k = 'ניגוד, ויתור';
  expectRule('שתי קטגוריות (מחרוזת)', 'CAT', w);

  // CAT · קטגוריה שאינה ברשימה
  w = clone(); w[7].k = 'זמן';
  expectRule('קטגוריה מחוץ לתשע', 'CAT', w);

  // SLOT · חסר
  w = clone(); delete w[9].slot;
  expectRule('חריץ חסר', 'SLOT', w, ['FIELDS']);

  // SLOT · ערך לא חוקי
  w = clone(); w[10].slot = 'verb';
  expectRule('חריץ שאינו ברשימה', 'SLOT', w);

  // NIKUD · חסר
  w = clone(); delete w[12].nikud;
  expectRule('ניקוד חסר', 'NIKUD', w, ['FIELDS']);

  // NIKUD · מחרוזת בלי סימני ניקוד
  w = clone(); w[13].nikud = stripNikud(w[13].nikud);
  expectRule('ניקוד בלי סימני ניקוד', 'NIKUD', w);

  // NIKUD_MATCH · ניקוד של מילה אחרת
  w = clone(); w[14].nikud = 'אַחֶרֶת';
  expectRule('הניקוד אינו של המילה', 'NIKUD_MATCH', w);

  // DUP · אותה מילה פעמיים
  w = clone(); w.push(JSON.parse(JSON.stringify(w[0])));
  expectRule('כפילות', 'DUP', w);

  // GLOSS · חסר
  w = clone(); w[16].gloss = '   ';
  expectRule('פירוש חסר', 'GLOSS', w);

  // DASH · מקף ארוך בפירוש
  w = clone(); w[17].gloss = 'אבל — בלשון גבוהה';
  expectRule('מקף ארוך בפירוש', 'DASH', w);

  // FLIP · לא בוליאני
  w = clone(); w[18].flip = 'true';
  expectRule('flip שאינו בוליאני', 'FLIP', w);

  // FIELDS · שדה חסר
  w = clone(); delete w[19].w;
  // מחיקת w מפילה גם WORD, ולכן נבדק כאן רק שהכלל FIELDS נדלק
  n++;
  {
    const bad = validate(w);
    if (bad.some(b => b.rule === 'FIELDS')) {
      console.log('  ✓ שדה חסר · FIELDS נפל: ' + bad.find(b => b.rule === 'FIELDS').msg);
    } else {
      fails.push('שדה חסר: הכלל FIELDS לא נדלק');
      console.log('  ✗ שדה חסר · FIELDS לא נדלק');
    }
  }

  // FIELDS · שדה עודף
  w = clone(); w[20].src = 'bt1#1';
  expectRule('שדה עודף', 'FIELDS', w);

  // בקרה חיובית: המצב האמיתי עובר נקי
  n++;
  const realBad = validate(real);
  if (realBad.length === 0) {
    console.log(`  ✓ המצב האמיתי · 0 תקלות על ${real.length} מילים`);
  } else {
    fails.push(`המצב האמיתי נפל על ${realBad.length} תקלות`);
    console.log('  ✗ המצב האמיתי נפל:');
    for (const b of realBad.slice(0, 10)) console.log(`      [${b.rule}] ${b.msg}`);
  }

  console.log(`— ${n - fails.length}/${n} מקרים כמצופה —`);
  if (fails.length) {
    console.error('✗ selftest נכשל:');
    for (const f of fails) console.error('  ' + f);
    process.exit(1);
  }
  console.log('✓ selftest עבר. לכל כלל יש שיניים, והמצב האמיתי נקי.');
  process.exit(0);
}

/* ---------- main ---------- */

function main() {
  if (process.argv.includes('--selftest')) return selftest();

  const words = readWords();
  const bad = validate(words);

  if (bad.length) {
    console.error(`✗ check_words · ${bad.length} תקלות`);
    for (const b of bad) console.error(`  [${b.rule}] ${b.msg}`);
    process.exit(1);
  }

  console.log('✓ check_words · הרשימה תקינה');
  console.log(summary(words));
  process.exit(0);
}

main();
