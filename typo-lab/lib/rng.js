'use strict';
/* אקראיות זרועה · דטרמיניזם מלא.
 *
 * המעבדה מייצרת עשרות אלפי וריאציות ומדווחת עליהן מספרים. מספר שלא ניתן לשחזר אינו
 * עדות, ולכן אין כאן Math.random בשום מקום ולא ייכנס לכאן לעולם. הזרע נגזר ממחרוזות
 * מתארות ("dataset", "he", מספר הפריט), כך שאותו ניסוי מייצר את אותו זרע בין ריצות,
 * בין מכונות, ובלי לשמור מצב.
 */

/* fnv1a 32 ביט. Math.imul ולא * : כפל רגיל ב-JS עובר ל-double אחרי 2^53 ומאבד ביטים
   נמוכים, ואז הגיבוב מפסיק להיות אותו גיבוב על מחרוזות ארוכות. */
function fnv1a(str) {
  const s = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/* מפריד שאינו יכול להופיע בחלק עצמו, כדי ש-('a','bc') ו-('ab','c') לא יקבלו אותו זרע. */
function seedFor() {
  const parts = Array.prototype.slice.call(arguments).map(String);
  return fnv1a(parts.join(''));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rngFor() { return mulberry32(seedFor.apply(null, arguments)); }

const randInt = (rnd, n) => Math.floor(rnd() * n);
const pick = (rnd, arr) => arr[randInt(rnd, arr.length)];

/* דגימה בלי החזרה. Fisher-Yates חלקי על עותק: לא נוגע במערך הקלט (BANK של ארגז החול
   הוא מבנה חי של האפליקציה), ועולה O(n) גם כש-n גדול בהרבה מ-k. */
function sample(rnd, arr, k) {
  const a = Array.from(arr);
  const n = Math.min(k, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + randInt(rnd, a.length - i);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, n);
}

module.exports = { fnv1a, seedFor, mulberry32, rngFor, randInt, pick, sample };
