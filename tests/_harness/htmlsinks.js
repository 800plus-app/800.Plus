'use strict';
/* איתור כל אתרי ההזרקה ל-HTML ב-app.js, ושליפת כל ${...} שנכנס אליהם.
 *
 * למה זה קיים
 * ------------
 * ב-11.8.2026 נבדק ב-ד1 שכל מסלולי הרינדור של טקסט שהמשתמש הקליד עוברים דרך
 * esc(). זה נמצא **תקין** — ההוכחה בדפדפן חי היא ב-דוחות/בדק-בית-3/. אבל
 * "תקין היום" אינו הבטחה: יש 62 אתרי innerHTML ו-175 הזרקות, וכל שדה חדש
 * שמישהו יוסיף לתבנית הוא הזדמנות לשכוח esc אחד.
 *
 * הקובץ הזה מפריד את **הסריקה** מה**מדיניות** כדי שהבדיקה שמעליו תוכל לנסח
 * את הכלל ולא לחזור על ניתוח התחביר.
 *
 * ⚠ זה ניתוח טקסט, לא AST. הוא נבנה למדוד את app.js של הפרויקט הזה, ולא
 * מתיימר להיות נכון על JavaScript כללי. */

/* כל השמה ל-innerHTML/outerHTML או קריאה ל-insertAdjacentHTML, עד סוף ההוראה.
   הסריקה סופרת סוגריים ומדלגת על מחרוזות, כדי ש-map פנימי או אובייקט מקונן
   בתוך התבנית לא יחתכו את ההוראה באמצע. */
function sinkStatements(src) {
  const out = [];
  const re = /\.(innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    let i = re.lastIndex, depth = 0, inStr = null, tick = 0;
    for (; i < src.length; i++) {
      const c = src[i], p = src[i - 1];
      if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
      if (c === '"' || c === "'") { inStr = c; continue; }
      if (c === '`') { tick ^= 1; continue; }
      if (tick) continue;
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0 && c === ')') { i++; break; } depth--; }
      else if (c === ';' && depth === 0) break;
    }
    out.push({
      line: src.slice(0, start).split('\n').length,
      text: src.slice(start, Math.min(i + 1, start + 6000)),
    });
  }
  return out;
}

/* שולף ${...} עם ספירת סוגריים מאוזנת, כך שביטוי שמכיל אובייקט, טרנרי מקונן
   או טמפלייט פנימי נשלף בשלמותו ולא נחתך ב-} הראשון. */
function interpolations(text) {
  const out = [];
  for (let i = 0; i < text.length - 1; i++) {
    if (text[i] !== '$' || text[i + 1] !== '{') continue;
    let depth = 1, j = i + 2, inStr = null;
    for (; j < text.length && depth; j++) {
      const c = text[j], p = text[j - 1];
      if (inStr) { if (c === inStr && p !== '\\') inStr = null; continue; }
      if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
    }
    out.push(text.slice(i + 2, j - 1).replace(/\s+/g, ' ').trim());
    i = j - 1;
  }
  return out;
}

/* כל ההזרקות בקובץ, שטוחות, עם מספר השורה של אתר ההזרקה. */
function htmlSinks(src) {
  const out = [];
  for (const st of sinkStatements(src))
    for (const expr of interpolations(st.text)) out.push({ line: st.line, expr });
  return out;
}

/* --- מי מגיע ל-HTML ומי רק שואל שאלה ---
 *
 * לא כל אזכור של שדה בתוך ביטוי הזרקה נכנס לדף. בשני מקומות ב-app.js השדה
 * משמש **תנאי** בלבד:
 *     r.email ? `<button data-reset="${esc(r.email)}">…</button>` : ''
 * האזכור הראשון של r.email רק שואל "יש מייל?", והשני — זה שבאמת נכתב לדף —
 * עטוף. כלל שסופר את שניהם מדווח על תקלה שאינה קיימת, ובדיקה שמדווחת שקר
 * נכבית אחרי הפעם השלישית.
 *
 * הכלל: אם הביטוי מכיל טמפלייט-ליטרל מקונן, רק מה שיושב בתוך ${...} שלו נכתב
 * לדף. אם אין טמפלייט מקונן — הביטוי כולו הוא הפלט. */
function outputPositions(expr) {
  const out = new Array(expr.length).fill(!expr.includes('`'));
  if (!expr.includes('`')) return out;
  let tick = 0, inStr = null;
  const stack = [];                       // עומק הסוגריים בכל ${...} פתוח
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i], p = expr[i - 1];
    if (inStr) { if (c === inStr && p !== '\\') inStr = null; out[i] = stack.length > 0; continue; }
    if (c === '"' || c === "'") { inStr = c; out[i] = stack.length > 0; continue; }
    if (c === '`') { if (!stack.length) tick ^= 1; out[i] = false; continue; }
    if (tick && !stack.length && c === '$' && expr[i + 1] === '{') { stack.push(0); i++; continue; }
    if (stack.length) {
      if (c === '{') stack[stack.length - 1]++;
      else if (c === '}') { if (stack[stack.length - 1] === 0) { stack.pop(); continue; } stack[stack.length - 1]--; }
    }
    out[i] = stack.length > 0;
  }
  return out;
}

/* האם המופע של needle במיקום at עטוף בקריאה לאחת מפונקציות האסקייפ?
   נמדד בספירת סוגריים לאחור: מוצאים את הסוגר הפותח שעוטף אותו וקוראים את השם. */
function escaperWraps(expr, at, escapers) {
  let depth = 0;
  for (let i = at - 1; i >= 0; i--) {
    const c = expr[i];
    if (c === ')') depth++;
    else if (c === '(') {
      if (depth === 0) return escapers.test(expr.slice(0, i));
      depth--;
    }
  }
  return false;
}

/* שדה ששימש כ**מפתח** בחיפוש — `FB_KIND_HE[r.kind]` — אינו נכתב לדף. מה שנכתב
   הוא הערך מתוך המפה, וזו מפה שכתובה בקוד. שדה כזה אינו טעון אסקייפ, ודרישה
   שיהיה מייצרת התראת שווא — הסוג שמכבה בדיקות. */
function isLookupKey(expr, at, needle) {
  let s = at;
  while (s > 0 && /[\w$.]/.test(expr[s - 1])) s--;      // תחילת שרשרת הזיהוי
  let b = s - 1;
  while (b >= 0 && expr[b] === ' ') b--;
  if (expr[b] !== '[') return false;
  let a = at + needle.length;
  while (a < expr.length && expr[a] === ' ') a++;
  return expr[a] === ']';
}

/* כל מופע של needle שנכתב לדף ואינו עטוף באסקייפר. */
function unescapedOutputs(expr, needle, escapers) {
  const reaches = outputPositions(expr);
  const bad = [];
  for (let at = expr.indexOf(needle); at >= 0; at = expr.indexOf(needle, at + needle.length))
    if (reaches[at] && !isLookupKey(expr, at, needle) && !escaperWraps(expr, at, escapers)) bad.push(at);
  return bad;
}

module.exports = { htmlSinks, interpolations, sinkStatements, outputPositions, escaperWraps, unescapedOutputs };
