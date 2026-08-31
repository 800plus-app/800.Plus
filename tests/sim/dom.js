'use strict';
/* ‏DOM מזויף — מינימלי, ומספיק בדיוק למסך של יחידת מילות הקישור.
 *
 * למה בכלל
 * ---------
 * ‏tests/_harness/sandbox.js מרים מ-app.js **חישוב טהור בלבד**, וההערה בראשו
 * מנמקת למה: סטאב DOM שלם שובר את החבילה בכל עריכה עתידית. אבל היחידה הזאת
 * חיה כמעט כולה בתוך הפונקציות שנוגעות ב-DOM — `renderConnCard`, `answerConn`,
 * `finishConnRound` — ולכן «משתמש שעובר סבב» אינו ניתן לסימולציה בלי מסך.
 *
 * ⚠ הפשרה, מפורשת: הקובץ הזה מדמה **רק** את מה שהיחידה נוגעת בו. הוא אינו
 * מנוע רינדור ואינו מפרש `innerHTML` לעץ. מה שנכתב כ-`innerHTML` נשמר כטקסט
 * ונבדק כטקסט; מה שנבנה ב-`createElement`+`appendChild` נשמר כעץ אמיתי וניתן
 * לשאילתה. זו בדיוק החלוקה שהיחידה עושה בפועל.
 *
 * ⭐ המסמכים נבנים מ-`index.html` האמיתי — כל `id`, וה-`class` שלו כפי שהוא
 * נכתב במקור. מסמך שממציא את המזהים שלו מוכיח שהקוד עובד על מסך מומצא.
 */

const fs = require('fs');
const path = require('path');

/* ⚠ `textContent` ו-`innerHTML` **אינם שני שדות נפרדים**, ורתמה שמתייחסת
   אליהם ככאלה ממציאה באגים. המטפל של הכפתור בדף הבית שומר `innerHTML`, כותב
   `textContent` בזמן הטעינה, ומשחזר `innerHTML` — רצף שנכון בדפדפן ונראה
   שבור בכל סטאב תמים. שניהם נשענים כאן על אותו מקור אחד. */
const ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ENT[c]);
const stripTags = s => String(s || '').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

class ClassList {
  constructor(el) { this.el = el; }
  add(...cs) { for (const c of cs) if (c) this.el._cls.add(c); }
  remove(...cs) { for (const c of cs) this.el._cls.delete(c); }
  contains(c) { return this.el._cls.has(c); }
  toggle(c, force) {
    if (force === undefined) {
      if (this.el._cls.has(c)) { this.el._cls.delete(c); return false; }
      this.el._cls.add(c); return true;
    }
    if (force) this.el._cls.add(c); else this.el._cls.delete(c);
    return !!force;
  }
}

class El {
  constructor(doc, tag) {
    this.doc = doc;
    this.tagName = String(tag || 'div').toUpperCase();
    this.id = '';
    this._cls = new Set();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this._html = '';
    this.onclick = null;
    this.disabled = false;
    this.type = '';
    /* לתג <script> שנוצר ב-loadConnData */
    this.src = '';
    this.onload = null;
    this.onerror = null;
    /* insertAdjacentHTML אינו מפרש — הוא נאסף, וזה מספיק כדי לבדוק
       שסימן ה-✓ נתלה על הכפתור הנכון. */
    this.adjacent = [];
  }
  get classList() { if (!this._clist) this._clist = new ClassList(this); return this._clist; }
  get className() { return Array.from(this._cls).join(' '); }
  set className(v) { this._cls = new Set(String(v == null ? '' : v).split(/\s+/).filter(Boolean)); }
  get innerHTML() { return this._html; }
  /* כתיבת innerHTML **מנקה את הילדים**, בדיוק כמו בדפדפן. זה מה שמאפס את
     `#connOpts` בין שאלה לשאלה, וסטאב שלא עושה זאת מצטבר בשקט.
     ⭐ וכל `id=` שבתוך ה-HTML נרשם כאלמנט. זה לא מנוע רינדור — זה בדיוק
     המינימום שבלעדיו `$('#connAgain')` במסך הסיום מחזיר null, והרתמה הייתה
     מדווחת על קריסה שאינה קיימת באפליקציה. */
  set innerHTML(v) {
    this._html = String(v == null ? '' : v);
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    const re = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
    let m;
    while ((m = re.exec(this._html))) {
      const idm = /\bid="([^"]+)"/.exec(m[2]);
      if (!idm) continue;
      const el = new El(this.doc, m[1]);
      el.id = idm[1];
      const clsm = /\bclass="([^"]*)"/.exec(m[2]);
      if (clsm) el.className = clsm[1];
      this.appendChild(el);
    }
  }
  /* כתיבת טקסט מוחקת תגיות וילדים ומחליפה בטקסט בורח — כמו בדפדפן. */
  get textContent() { return stripTags(this._html) + this.children.map(c => c.textContent).join(''); }
  set textContent(v) {
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    this._html = escHtml(v);
  }
  appendChild(el) {
    el.parentNode = this;
    this.children.push(el);
    if (el.id) this.doc._byId[el.id] = el;
    return el;
  }
  insertAdjacentHTML(pos, html) { this.adjacent.push({ pos, html: String(html) }); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  matches(sel) {
    if (sel[0] === '.') return this._cls.has(sel.slice(1));
    if (sel[0] === '#') return this.id === sel.slice(1);
    return this.tagName === sel.toUpperCase();
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = n => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }

  /* ── שתי דרכים ללחוץ, וההבדל ביניהן הוא כל התרחיש של «הלוחץ פעמיים» ──
     `click`  · מה שדפדפן עושה — כפתור מושבת אינו יורה כלל.
     `fire`   · קפיצה מעל ה-disabled, כדי לבדוק אם המשמר ב-JS מחזיק לבדו. */
  click() {
    if (this.disabled) return 'ignored-disabled';
    if (typeof this.onclick !== 'function') return 'no-handler';
    return this.onclick();
  }
  fire() {
    if (typeof this.onclick !== 'function') return 'no-handler';
    return this.onclick();
  }
}

class Doc {
  constructor() {
    this._byId = Object.create(null);
    this.scripts = [];
    this.missing = [];                      // כל `$('#x')` שלא נמצא · ממצא בפני עצמו
    this.documentElement = new El(this, 'html');
    this.body = new El(this, 'body');
    this.head = new El(this, 'head');
  }
  createElement(tag) { return new El(this, tag); }
  getElementById(id) { return this._byId[id] || null; }
  querySelector(sel) {
    if (sel[0] === '#') {
      const el = this._byId[sel.slice(1)];
      if (!el) this.missing.push(sel);
      return el || null;
    }
    return this.body.querySelector(sel) || this.head.querySelector(sel);
  }
  querySelectorAll(sel) { return this.body.querySelectorAll(sel); }
  add(id, cls, tag) {
    const el = new El(this, tag || 'div');
    el.id = id;
    el.className = cls || '';
    this._byId[id] = el;
    return el;
  }
}

/* בונה מסמך מכל מזהה שמופיע ב-index.html, עם ה-class שנכתב שם.
   ⭐ ה-`hidden` ההתחלתי מגיע מהמקור ולא מהזיכרון — מסך שמתחיל גלוי בטעות
   הוא בדיוק סוג הבאג שהסימולציה אמורה לתפוס. */
function buildDocument(root) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const doc = new Doc();

  const VOID = new Set(['META', 'LINK', 'BR', 'HR', 'IMG', 'INPUT', 'SOURCE', 'PATH', 'USE']);
  const tagRe = /<([a-zA-Z][\w-]*)\b([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[1], attrs = m[2];
    const idm = /\bid="([^"]+)"/.exec(attrs);
    if (!idm) continue;
    if (doc._byId[idm[1]]) continue;                       // הראשון קובע
    const clsm = /\bclass="([^"]*)"/.exec(attrs);
    const el = doc.add(idm[1], clsm ? clsm[1] : '', tag);

    /* ⭐ התוכן הפנימי נשאב מ-index.html ולא נשאר ריק. בלעדיו «שמור, דרוס,
       שחזר» עובר ריקם — וזה בדיוק מה שהמטפל של הכפתור בדף הבית עושה עם
       ההדגשה שבתוך שורת התיאור. `_html` נכתב ישירות ולא דרך ה-setter, כדי
       שסריקת המזהים הכללית תישאר הרישום היחיד. */
    if (VOID.has(el.tagName) || /\/>\s*$/.test(m[0])) continue;
    let i = tagRe.lastIndex, depth = 1;
    const scan = new RegExp(`<(/?)${tag}\\b`, 'g');
    scan.lastIndex = i;
    let s;
    while ((s = scan.exec(html))) {
      depth += s[1] ? -1 : 1;
      if (depth === 0) { el._html = html.slice(i, s.index); break; }
    }
  }

  /* שני כפתורי אורך הסבב הם ילדים אמיתיים של #connLenSeg — `renderConnLen`
     שואל אותם ב-querySelectorAll('button') וקורא את `data-n`. הערכים נלקחים
     מ-index.html ולא נכתבים כאן ביד. */
  const seg = /<div class="seg" id="connLenSeg"[\s\S]*?<\/div>/.exec(html);
  if (seg) {
    const segEl = doc.getElementById('connLenSeg');
    segEl._html = '';                                    // הילדים מחליפים את הטקסט
    const bre = /<button[^>]*data-n="(\d+)"[^>]*>/g;
    let b;
    while ((b = bre.exec(seg[0]))) {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.dataset.n = b[1];
      segEl.appendChild(btn);
    }
  }

  /* תג הסקריפט של app.js — sentBuildV שולף ממנו את מספר הבנייה. */
  const v = /src="\.\/app\.js\?v=(\d+)"/.exec(html) || /app\.js\?v=(\d+)/.exec(html);
  doc.scripts.push({ src: v ? `./app.js?v=${v[1]}` : './app.js' });

  return doc;
}

module.exports = { El, Doc, buildDocument };
