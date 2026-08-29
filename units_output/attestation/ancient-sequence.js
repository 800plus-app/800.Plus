'use strict';
/* הצירוף המלא בנוסח עתיק · units_output/attestation/ancient-sequence.js
 *
 *   node units_output/attestation/ancient-sequence.js --build      → בונה את הקורפוס
 *   node units_output/attestation/ancient-sequence.js --eight      → 8 הביטויים
 *   node units_output/attestation/ancient-sequence.js --left       → הנותרות בלי מקור
 *   node units_output/attestation/ancient-sequence.js --selftest   → בקרה
 *
 * ===== למה זה קיים =====
 *
 * מילון מאנדקס למות, לא צירופים. שמונת הביטויים נפלו שם, ולכן צריך מנוע שני:
 * **סריקת רצף מדויק בתוך נוסח מקרא ומשנה עתיק**, שהוא ברשימה הסגורה המותרת.
 *
 * ===== ⛔ ארבעה כשלים שהמנוע בנוי לא ליפול בהם =====
 *
 * 1 · ⛔ **מנוע החיפוש של ספריא אינו העדות ואינו נשאל.** על «לא תרצח» הוא
 *     מחזיר עשרים פרשנים ולא את שמות כ׳ י״ג. הדירוג שלו אינו כיסוי, ושאלה
 *     שנשענת עליו מחזירה «לא נמצא» על פסוק מפורש. ⭐ **לכן הקורפוס נמשך
 *     במלואו ונסרק מקומית** — התשובה דטרמיניסטית ואינה תלויה בדירוג.
 * 2 · ⛔ **«כל המילים קיימות» אינו «הצירוף מופיע».** ההשוואה היא רצף על
 *     גבולות מילה — זה בדיוק מה שהפיל את שמונת הביטויים במבחן הרפוי.
 * 3 · ⛔ **הגרסה ננעצת בשם ולא בשפה.** ‏`?version=hebrew` על ספר מקרא מחזיר
 *     את «Miqra according to the Masorah» שהוא **CC-BY-SA ואסור לנו**.
 *     ⭐ הגרסאות הננעצות: `Tanach with Text Only` ו-`Mishnah, ed. Romm,
 *     Vilna 1913` — שתיהן `Public Domain`, ושתיהן לפני 1929.
 * 4 · ⛔ **הרישיון נמדד חי מהתשובה** ולא מ-`sefaria-licenses.json`. הריצה
 *     נעצרת אם גרסה שנמשכה אינה נחלת הכלל או שהיא מ-1929 ואילך.
 */
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
/* ⛔ הקורפוס יורד ל-temp של המערכת ולא לתוך הריפו · הוא כ-10MB, הריפו
 * ציבורי, ואין סיבה שקובץ עבודה ייכנס אליו בטעות. */
const CORPUS = process.env.SEQCORPUS || path.join(require('os').tmpdir(), '800plus-ancient-corpus.json');

const NIQ = /[֑-ׇ]/g;
const strip = s => String(s).replace(/<[^>]*>/g, ' ').normalize('NFKC').replace(NIQ, '')
  .replace(/[׳״"’']/g, '').replace(/[־‐-―]/g, ' ')
  .replace(/[^֐-׿\s]/g, ' ').replace(/\s+/g, ' ').trim();

const TANAKH = ['Genesis', 'Exodus', 'Leviticus', 'Numbers', 'Deuteronomy', 'Joshua', 'Judges',
  'I Samuel', 'II Samuel', 'I Kings', 'II Kings', 'Isaiah', 'Jeremiah', 'Ezekiel', 'Hosea', 'Joel',
  'Amos', 'Obadiah', 'Jonah', 'Micah', 'Nahum', 'Habakkuk', 'Zephaniah', 'Haggai', 'Zechariah',
  'Malachi', 'Psalms', 'Proverbs', 'Job', 'Song of Songs', 'Ruth', 'Lamentations', 'Ecclesiastes',
  'Esther', 'Daniel', 'Ezra', 'Nehemiah', 'I Chronicles', 'II Chronicles'];
const MISHNAH = ['Berakhot', 'Peah', 'Demai', 'Kilayim', 'Sheviit', 'Terumot', 'Maasrot', 'Maaser Sheni',
  'Challah', 'Orlah', 'Bikkurim', 'Shabbat', 'Eruvin', 'Pesachim', 'Shekalim', 'Yoma', 'Sukkah',
  'Beitzah', 'Rosh Hashanah', 'Taanit', 'Megillah', 'Moed Katan', 'Chagigah', 'Yevamot', 'Ketubot',
  'Nedarim', 'Nazir', 'Sotah', 'Gittin', 'Kiddushin', 'Bava Kamma', 'Bava Metzia', 'Bava Batra',
  'Sanhedrin', 'Makkot', 'Shevuot', 'Eduyot', 'Avodah Zarah', 'Avot', 'Horayot', 'Zevachim',
  'Menachot', 'Chullin', 'Bekhorot', 'Arakhin', 'Temurah', 'Keritot', 'Meilah', 'Tamid', 'Middot',
  'Kinnim', 'Kelim', 'Oholot', 'Negaim', 'Parah', 'Tahorot', 'Mikvaot', 'Niddah', 'Makhshirin',
  'Zavim', 'Tevul Yom', 'Yadayim', 'Oktzin'];
/* ⭐ שתי הגרסאות הננעצות · שם מלא, לא «hebrew» */
const PIN = { מקרא: 'Tanach with Text Only', משנה: 'Mishnah, ed. Romm, Vilna 1913' };
const CUTOFF = 1929;
const tooNew = v => { const y = String(v).match(/\b(1[5-9]\d\d|20\d\d)\b/g); return !!y && Math.max.apply(null, y.map(Number)) >= CUTOFF; };
const isPD = l => /^(Public Domain|PD|CC0)$/i.test(String(l).trim());
const UA = { 'User-Agent': '800plus-attestation/1.0' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* התאמת רצף על גבולות מילה · 'מדויק' · 'תחילית' · null
 * ⭐ «תחילית» = המילה הראשונה בטקסט נושאת ו/ה/ב/ל/כ/מ/ש נוספת (`ומשל ברוחו`
 * מול `משל ברוחו`). ⛔ **אינה הוכחה אוטומטית** — מדווחת בנפרד ונשארת להכרעה. */
function seqIn(hay, needle) {
  const H = Array.isArray(hay) ? hay : strip(hay).split(' ').filter(Boolean);
  const N = strip(needle).split(' ').filter(Boolean);
  if (!N.length || H.length < N.length) return null;
  let pre = null;
  for (let i = 0; i + N.length <= H.length; i++) {
    if (H[i] !== N[0] && !(H[i].length === N[0].length + 1 && /^[והבלכמש]/.test(H[i]) && H[i].slice(1) === N[0])) continue;
    let ok = true;
    for (let k = 1; k < N.length; k++) if (H[i + k] !== N[k]) { ok = false; break; }
    if (!ok) continue;
    if (H[i] === N[0]) return 'מדויק';
    pre = 'תחילית';
  }
  return pre;
}

/* ===== בניית הקורפוס · פעם אחת, ואז מקומי לגמרי ===== */
async function fetchBook(ref, corpus) {
  const u = 'https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(ref.replace(/ /g, '_')) +
    '?version=' + encodeURIComponent('hebrew|' + PIN[corpus]);
  const r = await fetch(u, { headers: UA });
  if (!r.ok) throw new Error(ref + ' החזיר ' + r.status);
  const j = await r.json();
  const v = (j.versions || [])[0];
  if (!v) throw new Error(ref + ' · הגרסה «' + PIN[corpus] + '» אינה קיימת');
  if (v.versionTitle !== PIN[corpus]) throw new Error(ref + ' · נפילה שקטה לגרסה «' + v.versionTitle + '»');
  if (!isPD(v.license)) throw new Error(ref + ' · רישיון «' + v.license + '» אינו נחלת הכלל');
  if (tooNew(v.versionTitle)) throw new Error(ref + ' · מהדורה 1929 ואילך');
  /* ⭐ נשמר לפי מקטע ולא כטקסט אחד · אחרת הציטוט יוצא «Genesis» ולא «Genesis 18:9»,
   * ⛔ וגם היה נוצר רצף מדומה על התפר בין פסוק לפסוק. */
  const segs = [];
  (function walk(x, p) {
    if (Array.isArray(x)) return x.forEach((y, i) => walk(y, p.concat(i + 1)));
    const w = strip(String(x || '')).split(' ').filter(Boolean);
    if (w.length) segs.push({ seg: ref + ' ' + p.join(':'), words: w });
  })(v.text, []);
  return { ref: ref, corpus: corpus, ver: v.versionTitle, lic: v.license, segs: segs };
}
async function build() {
  const books = TANAKH.map(b => [b, 'מקרא']).concat(MISHNAH.map(m => ['Mishnah ' + m, 'משנה']));
  const out = [];
  for (const [ref, corpus] of books) {
    const b = await fetchBook(ref, corpus);
    out.push(b);
    console.log('  ' + String(out.length).padStart(3) + '/' + books.length + '  ' + ref + '  ' + b.segs.length + ' מקטעים  · ' + b.lic);
    await sleep(150);
  }
  fs.writeFileSync(CORPUS, JSON.stringify(out), 'utf8');
  const tw = out.reduce((s, b) => s + b.segs.reduce((n, g) => n + g.words.length, 0), 0);
  console.log('\n⭐ ' + out.length + ' ספרים · ' + tw + ' מילים · שתי גרסאות: ' +
    Array.from(new Set(out.map(b => b.ver))).join(' | '));
}
let corpus = null;
function load() {
  if (corpus) return corpus;
  if (!fs.existsSync(CORPUS)) throw new Error('הקורפוס לא נבנה · הרץ --build');
  corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
  return corpus;
}

/* צורות החיפוש לערך אחד
 * ⛔ **המלכודת שנתפסה כאן:** `הקשה את ליבו / ערפו` פוצל ל-«ערפו», מילה בודדת,
 * והיא נמצאה בויקרא — ⛔ «הוכחה» לצירוף בן שלוש מילים דרך מילה אחת מתוכו.
 * ⭐ לכן: כשהערך רב-מילי, **כל צורה חייבת להיות רב-מילית.** חלופה קטועה
 * (`… / ערפו`) מושלמת מהחלופה הראשונה על ידי החלפת המילה האחרונה בלבד. */
function formsOf(phrase) {
  const alts = String(phrase).split('/').map(s => s.trim()).filter(Boolean);
  const head = strip(alts[0].replace(/\([^)]*\)/g, ' ')).split(' ').filter(Boolean);
  const out = new Set();
  alts.forEach((a, i) => {
    [strip(a.replace(/\([^)]*\)/g, ' ')), strip(a)].forEach(v => {
      const w = v.split(' ').filter(Boolean);
      if (!w.length) return;
      if (i > 0 && w.length < head.length && head.length > 1) {
        /* חלופה קטועה · מושלמת מהראשונה, והצורה שנבדקה מודפסת בפלט */
        out.add(head.slice(0, head.length - w.length).concat(w).join(' '));
      } else if (head.length > 1 && w.length < 2) {
        /* ⛔ מילה בודדת אינה מייצגת ערך רב-מילי */
      } else out.add(w.join(' '));
    });
  });
  return Array.from(out);
}
/* ===== הכרעה על ביטוי אחד ===== */
function prove(phrase) {
  const out = { phrase: phrase, proved: null, prefix: null, forms: formsOf(phrase) };
  for (const f of out.forms) {
    for (const b of load()) for (const g of b.segs) {
      const k = seqIn(g.words, f);
      if (!k) continue;
      const rec = { ref: g.seg, corpus: b.corpus, ver: b.ver, lic: b.lic, form: f, ctx: g.words.join(' ') };
      if (k === 'מדויק') { out.proved = rec; return out; }
      if (!out.prefix) out.prefix = rec;
    }
  }
  return out;
}

/* ===== בקרה ===== */
function selftest() {
  let ok = true;
  const C = load();
  const p0 = C.length === TANAKH.length + MISHNAH.length && C.every(b => isPD(b.lic) && !tooNew(b.ver) && b.segs.length > 0);
  ok = ok && p0;
  console.log((p0 ? '✓ ' : '⛔ ') + 'בקרה · ' + C.length + ' ספרים בקורפוס, כולם נחלת הכלל ולפני 1929 · ' +
    Array.from(new Set(C.map(b => b.ver + ' (' + b.lic + ')'))).join(' | '));

  const t1 = prove('לא תרצח');
  const p1 = !!(t1.proved && t1.proved.corpus === 'מקרא');
  ok = ok && p1;
  console.log((p1 ? '✓ ' : '⛔ ') + 'בקרה חיובית · «לא תרצח» ⟵ ' + (t1.proved ? t1.proved.ref : 'לא נמצא'));

  const t1c = prove('על שלשה דברים העולם עומד');
  console.log('  (משנה · «על שלשה דברים העולם עומד» ⟵ ' + (t1c.proved ? t1c.proved.ref : 'לא נמצא') + ')');
  const p1b = !!t1c.proved && t1c.proved.corpus === 'משנה';
  ok = ok && p1b;
  console.log((p1b ? '✓ ' : '⛔ ') + 'בקרה חיובית שנייה · צירוף משנאי נמצא בקורפוס המשנה');

  const t2 = prove('גלופסטיק מרוזבן');
  const p2 = !t2.proved && !t2.prefix;
  ok = ok && p2;
  console.log((p2 ? '✓ ' : '⛔ ') + 'בקרה שלילית · צירוף מומצא ⟵ ' + (t2.proved ? '⛔ «הוכח»' : 'לא נמצא, כנדרש'));

  const p3 = seqIn('ולא משל את רוחו', 'משל ברוחו') === null
    && seqIn('ולא משל ברוחו כל', 'משל ברוחו') === 'מדויק'
    && seqIn('מגבור ומשל ברוחו מלכד', 'משל ברוחו') === 'תחילית';
  ok = ok && p3;
  console.log((p3 ? '✓ ' : '⛔ ') + 'בקרה · רצף שבור נדחה · רצף רציף = מדויק · «ומשל» = תחילית ולא מדויק');

  const p4 = tooNew('Miqra according to the Masorah') === false && tooNew('Torat Emet 1978') === true
    && isPD('CC-BY-SA') === false && isPD('Public Domain') === true;
  ok = ok && p4;
  console.log((p4 ? '✓ ' : '⛔ ') + 'בקרה · CC-BY-SA נדחה ומהדורה 1929+ נדחית, בלי המטמון');

  /* ⛔ המלכודת שנתפסה בריצה · חלופה קטועה שהופכת למילה בודדת */
  const f5 = formsOf('הִקְשָה אֶת לִיבּוֹ / עָרְפּוֹ');
  const p5 = f5.indexOf('ערפו') < 0 && f5.indexOf('הקשה את ערפו') >= 0 && f5.indexOf('הקשה את ליבו') >= 0;
  ok = ok && p5;
  console.log((p5 ? '✓ ' : '⛔ ') + 'בקרה · «… / ערפו» אינו נבדק כמילה בודדת אלא כ-«הקשה את ערפו» · הצורות: ' + f5.join(' | '));

  console.log(ok ? '\n⭐ למנוע יש שיניים · הוא מאשר, דוחה, ומבחין בין שני הקורפוסים' : '\n⛔ המנוע אינו מבחין');
  process.exit(ok ? 0 : 1);
}

const EIGHT = ['יֵשׁ בְּלִבּוֹ עָלָיו', 'סָכַר אֶת פִּיו', 'הִתְאַבֵּק בַּעֲפַר רַגְלָיו',
  'שָׁלַח יָד בְּנַפְשׁוֹ', 'סָבַב אוֹתוֹ בְּכַחַשׁ', 'שָׁפַךְ לִבּוֹ', 'מִלְּגוֹ / מִלְגַו', 'קַל תְּפִיסָה'];

function leftWords() {
  const out = require('child_process').execFileSync('node',
    [path.join(DIR, 'permitted-sources.js'), '--list'], { encoding: 'utf8', maxBuffer: 1 << 24 });
  const L = out.split(/\r?\n/);
  const i = L.findIndex(l => /=== נשארו בלי חלופה ===/.test(l));
  const j = L.findIndex(l => /=== קיבלו חלופה ===/.test(l));
  return L.slice(i + 1, j < 0 ? L.length : j).filter(l => l.trim()).map(l => l.trim().split(' | ')[0]);
}

function run(list, label) {
  console.log('=== ' + label + ' · ' + list.length + ' ===\n');
  let yes = 0, pre = 0, no = 0;
  for (const w of list) {
    const r = prove(w);
    if (r.proved) { yes++; console.log('  ⭐ מדויק  | ' + w + ' ⟵ ' + r.proved.ref + ' · ' + r.proved.corpus + ' · ' + r.proved.ver + ' · ' + r.proved.lic); }
    else if (r.prefix) { pre++; console.log('  ⚠ תחילית | ' + w + ' ⟵ ' + r.prefix.ref + ' · ' + r.prefix.corpus + ' · ' + r.prefix.ver); }
    else { no++; console.log('  ⛔ אין    | ' + w); }
  }
  console.log('\n  ⭐ רצף מדויק בנוסח עתיק : ' + yes);
  console.log('  ⚠ רצף עם תחילית        : ' + pre + '   ⛔ לא מוחל · להכרעה');
  console.log('  ⛔ לא נמצא              : ' + no);
  console.log('  ' + (yes + pre + no === list.length ? '✅ הסכום מתיישב · ' + (yes + pre + no) : '⛔ הסכום אינו מתיישב'));
}

/* ⭐ מיוצא כדי שמנוע התלמוד ישתמש **באותה** לוגיקת התאמה ולא בעותק שני שלה.
 * ⚠ הלקח שמאחורי זה: אותה טבלה בשני עותקים עוקבים — תיקון שנגע באחד נראה שלם
 * ולא היה. כאן יש עותק אחד, ומי שמשנה את `seqIn` משנה את שני המנועים. */
module.exports = { strip, seqIn, formsOf, leftWords, tooNew, isPD, UA, sleep, CUTOFF };

if (require.main === module) (async () => {
  const a = process.argv;
  if (a.indexOf('--build') >= 0) return void await build();
  if (a.indexOf('--selftest') >= 0) return selftest();
  if (a.indexOf('--eight') >= 0) return run(EIGHT, 'שמונת הביטויים · 230b3bb6');
  if (a.indexOf('--left') >= 0) return run(leftWords(), 'הנותרות בלי מקור מותר');
  console.log('--build | --eight | --left | --selftest');
})().catch(e => { console.error('⛔ ' + e.message); process.exit(2); });
