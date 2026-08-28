#!/usr/bin/env node
/* scan_items.js - סורק את 450 הפריטים של השלמת המשפטים ומחזיר רשימת ממצאים.
   קריאה בלבד. לא נוגע באף קובץ תוכן. כותב רק scan-findings.tsv.

   שני פורמטים קיימים בבנק:
     יחיד - o[i] מחרוזת, ___ אחד ב-s, זוג ** אחד ב-t, g[i] = "word = פירוש"
     זוג  - o[i] מערך של שתיים, שני ___ ב-s, שני זוגות ** ב-t,
            g[i] = "wordA = פירוש · wordB = פירוש"
   השערים מותאמים לפורמט של הפריט, ולכן פורמט הזוג אינו נספר כתקלה.

   שימוש:  node scan_items.js             סורק וכותב את קובץ הממצאים
           node scan_items.js --control    מריץ רק את הבקרה החיובית */

const fs = require('fs');
const path = require('path');

const BATCH_DIR = path.join(__dirname, 'batches');
const OUT = path.join(__dirname, 'scan-findings.tsv');

/* ---------- נרמול עברית ---------- */

const NIQQUD = /[֑-ׇ]/g;                                       // ניקוד וטעמים
const FINALS = { 'ם': 'מ', 'ן': 'נ', 'ך': 'כ', 'ף': 'פ', 'ץ': 'צ' };
const PREFIX = new Set(['ל', 'ה', 'ב', 'כ', 'מ', 'ו', 'ש']);   // ל ה ב כ מ ו ש
const MATRES = /[אוית]/g;                                       // לא בשימוש ישיר, ראו bare()

/* מילים שלא נחשבות הוכחת התאמה - נפוצות מדי בשני הצדדים */
const STOP = new Set([
  'את', 'של', 'על', 'אל', 'עם', 'זה', 'זו', 'כל', 'לא', 'או', 'גם', 'אף',
  'כדי', 'לידי', 'יותר', 'פחות', 'משהו', 'מישהו', 'מאוד', 'עוד', 'רק',
  'כמו', 'אחר', 'אחרת', 'הוא', 'היא', 'להיות', 'שהוא', 'שהיא', 'אותו', 'אותה'
]);

const stripNiqqud = s => String(s == null ? '' : s).replace(NIQQUD, '');
const normLetters = w => w.split('').map(c => FINALS[c] || c).join('');

/* ניקוי מילה בודדת: ניקוד, גרשיים, פיסוק, אותיות סופיות */
function cleanWord(w) {
  return normLetters(
    stripNiqqud(w)
      .replace(/[׳״'"“”]/g, '')
      .replace(/[.,;:!?()\[\]{}«»…\-–—\/\\*]/g, '')
      .trim()
  );
}

/* כל הצורות של מילה: המקור, ואחרי הסרת עד שתי תחיליות */
function forms(w) {
  const out = new Set();
  let cur = cleanWord(w);
  if (!cur) return out;
  out.add(cur);
  for (let i = 0; i < 2; i++) {
    if (cur.length > 3 && PREFIX.has(cur[0])) { cur = cur.slice(1); out.add(cur); }
    else break;
  }
  return out;
}

/* שורש גס - 3 האותיות הראשונות של כל צורה */
function roots(w) {
  const out = new Set();
  for (const f of forms(w)) if (f.length >= 3) out.add(f.slice(0, 3));
  return out;
}

/* שלד עיצורי - בלי סיומות נטייה ובלי אמות קריאה. משמש רק לדירוג חומרה. */
function skels(w) {
  const out = new Set();
  for (const f of forms(w)) {
    const cands = [f];
    const cut = f.replace(/(יות|ות|ים|ה|ת|י)$/, '');
    if (cut.length >= 2) cands.push(cut);
    for (const c of cands) {
      out.add(c);
      const bare = c.replace(/[אויה]/g, '');
      if (bare.length >= 2) out.add(bare);
    }
  }
  return out;
}

function words(text) {
  return stripNiqqud(text)
    .split(/[\s,;:.!?()\[\]{}\/·•־\-–—"״]+/)
    .map(cleanWord)
    .filter(w => w.length >= 2 && !STOP.has(w));
}

/* השוואה הדוקה: זהות אחרי תחיליות, שורש גס משותף, או הכלה */
function tightMatch(a, b) {
  const fa = forms(a), fb = forms(b);
  for (const x of fa) if (fb.has(x)) return true;
  const ra = roots(a), rb = roots(b);
  for (const x of ra) if (rb.has(x)) return true;
  for (const x of fa) for (const y of fb)
    if (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))) return true;
  return false;
}

/* השוואה רופפת על שלד עיצורי - רק כדי להפריד "נטייה" מ"מובן אחר" */
function looseMatch(a, b) {
  const A = [...skels(a)], B = [...skels(b)];
  for (const x of A) for (const y of B) {
    if (x.length >= 2 && x === y) return true;
    const s = x.length <= y.length ? x : y, l = x.length <= y.length ? y : x;
    if (s.length >= 2 && l.length - s.length <= 2 && l.includes(s)) return true;
  }
  return false;
}

/* האם מילה כלשהי מהמודגשת מתאימה למילה כלשהי מהמובנים */
function anyMatch(boldWords, senseWords, fn) {
  for (const bw of boldWords) for (const sw of senseWords) if (fn(bw, sw)) return true;
  return false;
}

/* ---------- חילוץ ---------- */

const boldSpans = t => (String(t == null ? '' : t).match(/\*\*([\s\S]+?)\*\*/g) || []).map(x => x.slice(2, -2));
const countStars = t => (String(t == null ? '' : t).match(/\*\*/g) || []).length;
const countBlanks = s => (String(s == null ? '' : s).match(/___/g) || []).length;

/* הצד שאחרי " = " בפירוש, מפוצל למובנים */
function glossSenses(gloss) {
  const s = String(gloss == null ? '' : gloss);
  const i = s.indexOf(' = ');
  let rhs;
  if (i !== -1) rhs = s.slice(i + 3);
  else if (s.includes('=')) rhs = s.slice(s.indexOf('=') + 1);
  else rhs = '';
  return rhs.split(/[,;·•\/]|\sאו\s/).map(x => x.trim()).filter(Boolean);
}

/* פורמט הפריט נקבע לפי המבנה של o, שהוא האמת המבנית */
function formatOf(it) {
  if (!Array.isArray(it.o) || !it.o.length) return 'unknown';
  if (it.o.every(x => Array.isArray(x) && x.length === 2)) return 'pair';
  if (it.o.every(x => typeof x === 'string')) return 'single';
  return 'mixed';
}

/* ===== השער המרכזי =====
   לכל חריץ: המודגשת מ-t מול המובנים של התשובה הנכונה ב-g[a].
   מחזיר מערך של ממצאים, כל אחד עם דגל weak שמפריד נטייה ממובן אחר. */
function senseGate(it, fmt) {
  const out = [];
  const spans = boldSpans(it.t);
  const gloss = Array.isArray(it.g) ? it.g[it.a] : undefined;
  if (typeof gloss !== 'string') return out;                    // נתפס בשער מכני 2 או 4

  /* פירוק לחריצים: יחיד = חריץ אחד, זוג = שני חלקים מופרדים ב-" · " */
  let slots;
  if (fmt === 'pair') {
    const parts = gloss.split(' · ');
    if (parts.length !== 2 || spans.length !== 2) return out;    // נתפס בשער מכני 1 או 3
    slots = parts.map((p, j) => ({ bold: spans[j], gloss: p, label: ' · חריץ ' + (j + 1) }));
  } else {
    if (spans.length !== 1) return out;                          // נתפס בשער מכני 1
    slots = [{ bold: spans[0], gloss, label: '' }];
  }

  for (const slot of slots) {
    const senses = glossSenses(slot.gloss);
    if (!senses.length) { out.push({ type: 'אין מובן אחרי " = "' + slot.label, bold: slot.bold, gloss: slot.gloss }); continue; }
    const bw = words(slot.bold);
    if (!bw.length) { out.push({ type: 'המודגשת ריקה' + slot.label, bold: slot.bold, gloss: slot.gloss }); continue; }
    const sw = senses.reduce((acc, s) => acc.concat(words(s)), []);
    if (anyMatch(bw, sw, tightMatch)) continue;                  // התאמה - אין ממצא
    const weak = anyMatch(bw, sw, looseMatch);                   // אותו שלד עיצורי = כנראה נטייה
    out.push({
      type: 'אי-התאמת מובן' + slot.label + (weak ? ' · חשד נטייה בלבד' : ''),
      bold: slot.bold, gloss: slot.gloss, weak
    });
  }
  return out;
}

/* ---------- טעינה ---------- */

function load() {
  const items = [];
  for (const f of fs.readdirSync(BATCH_DIR).filter(x => x.endsWith('.json')).sort()) {
    const arr = JSON.parse(fs.readFileSync(path.join(BATCH_DIR, f), 'utf8'));
    arr.forEach((it, i) => items.push(Object.assign({}, it, { src: path.basename(f, '.json') + '#' + (i + 1) })));
  }
  return items;
}

/* ---------- סריקה ---------- */

function scan(items) {
  const findings = [];
  const add = (it, type, bold, gloss) => findings.push({
    src: it.src || '?', type,
    bold: bold || '', gloss: gloss || '',
    s: String(it.s == null ? '' : it.s).slice(0, 60)
  });

  const stats = { single: 0, pair: 0, other: 0, missingE: 0, dupS: 0, dupSrc: 0 };
  const bySentence = new Map(), bySrc = new Map();

  for (const it of items) {
    const fmt = formatOf(it);
    if (fmt === 'single') stats.single++; else if (fmt === 'pair') stats.pair++; else stats.other++;
    if (fmt === 'unknown' || fmt === 'mixed') add(it, 'פורמט o לא מזוהה', '', '');

    const wantStars = fmt === 'pair' ? 4 : 2;
    const wantBlanks = fmt === 'pair' ? 2 : 1;

    /* השער המרכזי */
    for (const f of senseGate(it, fmt)) add(it, f.type, f.bold, f.gloss);

    /* שער 1: מספר זוגות ה-** ב-t תואם לפורמט */
    if (typeof it.t !== 'string') add(it, 't חסר', '', '');
    else {
      const stars = countStars(it.t);
      if (stars !== wantStars)
        add(it, 't: ' + stars + ' כוכביות ** (פורמט ' + (fmt === 'pair' ? 'זוג' : 'יחיד') + ' צריך ' + wantStars + ')',
          boldSpans(it.t).join(' | '), '');
    }

    /* שער 2: len(g) == len(o) == len(r) == 4 */
    const lg = Array.isArray(it.g) ? it.g.length : -1;
    const lo = Array.isArray(it.o) ? it.o.length : -1;
    const lr = Array.isArray(it.r) ? it.r.length : -1;
    if (!(lg === 4 && lo === 4 && lr === 4)) add(it, 'אורך מערך: o=' + lo + ' g=' + lg + ' r=' + lr, '', '');

    /* שער 3: g[i] מתחיל ב-o[i] ואחריו " = " (בפורמט זוג: שני החלקים) */
    if (lg > 0 && lo > 0) {
      for (let i = 0; i < Math.min(lg, lo); i++) {
        const g = it.g[i];
        if (typeof g !== 'string') { add(it, 'g[' + i + '] אינו מחרוזת', '', String(g)); continue; }
        if (fmt === 'pair') {
          const parts = g.split(' · ');
          if (parts.length !== 2) { add(it, 'g[' + i + '] אינו שני חלקים מופרדים ב-" · "', '', g); continue; }
          for (let j = 0; j < 2; j++) {
            const pre = it.o[i][j] + ' = ';
            if (parts[j].indexOf(pre) !== 0) add(it, 'g[' + i + '] חלק ' + (j + 1) + ' לא מתחיל ב-"' + it.o[i][j] + ' = "', '', g);
          }
        } else if (typeof it.o[i] === 'string') {
          const pre = it.o[i] + ' = ';
          if (g.indexOf(pre) !== 0) add(it, 'g[' + i + '] לא מתחיל ב-"' + it.o[i] + ' = "', '', g);
        }
      }
    }

    /* שער 4: a בטווח 0..3, ו-s מכיל ___ */
    if (!(Number.isInteger(it.a) && it.a >= 0 && it.a <= 3)) add(it, 'a מחוץ לטווח: ' + it.a, '', '');
    const blanks = countBlanks(it.s);
    if (blanks === 0) add(it, 's בלי ___', '', '');
    else if (blanks !== wantBlanks) add(it, 's: ' + blanks + ' חסרים (פורמט ' + (fmt === 'pair' ? 'זוג' : 'יחיד') + ' צריך ' + wantBlanks + ')', '', '');

    /* שער 5: e חסר */
    if (typeof it.e !== 'string' || !it.e.trim()) { stats.missingE++; add(it, 'e חסר', '', ''); }

    /* שער 6: איסוף לכפילויות */
    const key = String(it.s == null ? '' : it.s).replace(/\s+/g, ' ').trim().toLowerCase();
    if (!bySentence.has(key)) bySentence.set(key, []);
    bySentence.get(key).push(it);
    if (!bySrc.has(it.src)) bySrc.set(it.src, []);
    bySrc.get(it.src).push(it);
  }

  for (const group of bySentence.values()) {
    if (group.length > 1) {
      stats.dupS++;
      const all = group.map(x => x.src).join(', ');
      for (const it of group) add(it, 's כפול (' + all + ')', '', '');
    }
  }
  for (const group of bySrc.values())
    if (group.length > 1) { stats.dupSrc++; add(group[0], 'src כפול x' + group.length, '', ''); }

  return { findings, stats };
}

/* ---------- בקרה חיובית: פריטים מזויפים בזיכרון בלבד ---------- */

function control() {
  const base = {
    s: 'The committee chose to ___ the proposal after the vote.',
    o: ['withdraw', 'abandon', 'reject', 'dismiss'], a: 0,
    g: ['withdraw = לסגת, לפרוש', 'abandon = לנטוש', 'reject = לדחות', 'dismiss = לבטל'],
    r: ['x', 'x', 'x', 'x'], e: 'x'
  };
  const planted = Object.assign({}, base, { src: 'CONTROL#mismatch', t: 'הוועדה בחרה **לרקוד** עם ההצעה אחרי ההצבעה.' });
  const clean = Object.assign({}, base, { src: 'CONTROL#match', t: 'הוועדה בחרה **לפרוש** מההצעה אחרי ההצבעה.' });
  const pairBase = {
    src: 'CONTROL#pair', a: 0,
    s: 'The terraces ___ a crop and the growers ___ it.',
    o: [['yield', 'harvest'], ['harvest', 'yield'], ['yield', 'cultivate'], ['cultivate', 'harvest']],
    g: ['yield = להפיק · harvest = לקצור', 'harvest = לקצור · yield = להפיק',
        'yield = להפיק · cultivate = לעבד', 'cultivate = לעבד · harvest = לקצור'],
    r: ['x', 'x', 'x', 'x'], e: 'x',
    t: 'הטראסות **מפיקות** יבול, והמגדלים **מצחצחים** אותו.'   // החריץ השני מזויף
  };

  const a = senseGate(planted, 'single');
  const b = senseGate(clean, 'single');
  const c = senseGate(pairBase, 'pair');
  const aOk = a.length === 1 && !a[0].weak;
  const bOk = b.length === 0;
  const cOk = c.length === 1 && c[0].type.includes('חריץ 2');

  console.log('=== בקרה חיובית ===');
  console.log('  יחיד  מזויף  **לרקוד**    מול "withdraw = לסגת, לפרוש"  ->  ' + (a.length ? 'סומן V  [' + a[0].type + ']' : 'לא סומן X'));
  console.log('  יחיד  תקין   **לפרוש**    מול "withdraw = לסגת, לפרוש"  ->  ' + (b.length ? 'סומן X (חיובי כוזב)' : 'לא סומן V'));
  console.log('  זוג   מזויף  **מצחצחים**  בחריץ 2 מול "harvest = לקצור" ->  ' + (c.length ? 'סומן V  [' + c[0].type + ']' : 'לא סומן X'));
  const ok = aOk && bOk && cOk;
  console.log('  תוצאה: ' + (ok ? 'השער רץ, תופס את המזויף ולא מסמן את התקין  V' : 'השער שבור  X'));
  return ok;
}

/* ---------- TSV ---------- */

const cell = v => String(v == null ? '' : v).replace(/[\t\r\n]+/g, ' ');

/* קיבוץ סוגים לדוח המסכם */
function bucket(t) {
  if (t.startsWith('אי-התאמת מובן')) return t.includes('נטייה') ? 'אי-התאמת מובן · חשד נטייה בלבד' : 'אי-התאמת מובן (חשוד אמיתי)';
  if (t.startsWith('g[')) return 'g[i] לא בפורמט "o[i] = פירוש"';
  if (t.startsWith('t:')) return 't: מספר ** לא תואם לפורמט';
  if (t.startsWith('s:')) return 's: מספר ___ לא תואם לפורמט';
  if (t.startsWith('a מחוץ')) return 'a מחוץ לטווח';
  if (t.startsWith('אורך מערך')) return 'אורך מערך שגוי';
  if (t.startsWith('s כפול')) return 's כפול';
  if (t.startsWith('src כפול')) return 'src כפול';
  return t;
}

function main() {
  const ok = control();
  if (process.argv.indexOf('--control') !== -1) process.exit(ok ? 0 : 1);
  if (!ok) { console.error('הבקרה נכשלה - לא מדווחים מספרים.'); process.exit(1); }

  const items = load();
  const { findings, stats } = scan(items);

  const lines = ['﻿src\tסוג הממצא\tהמודגשת\tg[a]\tהמשפט (60 תווים)'];
  for (const f of findings) lines.push([f.src, f.type, f.bold, f.gloss, f.s].map(cell).join('\t'));
  fs.writeFileSync(OUT, lines.join('\n') + '\n', 'utf8');

  const byType = new Map();
  for (const f of findings) { const k = bucket(f.type); byType.set(k, (byType.get(k) || 0) + 1); }

  console.log('\n=== סריקה ===');
  console.log('  פריטים: ' + items.length + '  (יחיד ' + stats.single + ' · זוג ' + stats.pair + ' · אחר ' + stats.other + ')');
  console.log('  ממצאים: ' + findings.length + '  על ' + new Set(findings.map(f => f.src)).size + ' פריטים');
  console.log('  לפי סוג:');
  for (const kv of [...byType].sort((x, y) => y[1] - x[1])) console.log('    ' + String(kv[1]).padStart(4) + '  ' + kv[0]);
  console.log('  e חסר: ' + stats.missingE + '   s כפול: ' + stats.dupS + '   src כפול: ' + stats.dupSrc);
  console.log('  נכתב: ' + OUT);

  const strong = findings.filter(f => f.type.startsWith('אי-התאמת מובן') && !f.type.includes('נטייה'));
  const weak = findings.filter(f => f.type.includes('נטייה'));
  console.log('\n=== אי-התאמת מובן · חשודים אמיתיים (' + strong.length + ') ===');
  for (const f of strong) console.log('  ' + f.src.padEnd(10) + ' **' + f.bold + '**  <->  ' + f.gloss);
  console.log('\n=== אי-התאמת מובן · חשד נטייה בלבד (' + weak.length + ') ===');
  for (const f of weak) console.log('  ' + f.src.padEnd(10) + ' **' + f.bold + '**  <->  ' + f.gloss);
  console.log('\n  v2#3 (withdraw / למשוך): ' +
    (strong.some(f => f.src === 'v2#3') ? 'נתפס כחשוד אמיתי  V' : 'לא נתפס  X'));
}

main();
