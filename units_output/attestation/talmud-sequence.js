'use strict';
/* הצירוף המלא בתלמוד ובטקסט עתיק נוסף · units_output/attestation/talmud-sequence.js
 *
 *   node units_output/attestation/talmud-sequence.js --build      → בונה את הקורפוס
 *   node units_output/attestation/talmud-sequence.js --left       → הנותרות בלי מקור
 *   node units_output/attestation/talmud-sequence.js --emit       → כותב שורות הוכחה
 *   node units_output/attestation/talmud-sequence.js --licenses   → מה נבחר ומה נפסל
 *   node units_output/attestation/talmud-sequence.js --selftest   → בקרה
 *
 * ===== למה זה קיים =====
 *
 * `ancient-sequence.js` סורק מקרא ומשנה בלבד. שלושה מהביטויים שנשארו הם ארמית
 * תלמודית, ולכן צריך קורפוס שני: תלמוד בבלי.
 *
 * ===== מה שנמצא בפועל על הרישיונות · וזה משנה את התשובה =====
 *
 * ⛔ לספריא אין תלמוד בבלי בעברית/ארמית בנחלת הכלל. שתי האפשרויות היחידות:
 *   · `William Davidson Edition - Aramaic` → CC-BY-NC. ⛔ פסול — 800+ מסחרי.
 *   · `Wikisource Talmud Bavli`            → CC-BY-SA, מקורו he.wikisource,
 *      והוא תעתיק של דפוס וילנא 1880–1886 שהוא עצמו נחלת הכלל.
 *
 * ⭐ מה נלקח בפועל: ציטוט, לא טקסט. השורה שנרשמת היא «הצירוף מופיע בבבלי
 * ברכות ה ע״א» — עובדה ביבליוגרפית על יצירה בנחלת הכלל. עמודת הראיה נושאת
 * מקטע קצר לצורך אימות בלבד. ⛔ שום טקסט אינו נכנס למאגר המוצר.
 * ⭐ ו-«ויקיטקסט» נמצא ברשימה הסגורה המותרת, ו-66 שורות בעץ כבר נשענות עליו.
 * ⚠ ההערכה כאן הנדסית ולא משפטית. הפער בין תג ה-CC-BY-SA של האתר לבין
 * נחלת-הכלל של דפוס וילנא מוצג כאן ואינו נבלע.
 *
 * ⛔ מה נפסל ולא נסרק (הפלט המלא ב-`--licenses`):
 *   · תלמוד ירושלמי · `Venice Edition` רישיון `unknown`, ו-Guggenheimer הוא
 *     CC-BY ומ-1999–2015. «unknown» אינו נחלת הכלל ואינו מתקבל.
 *   · מהדורות `Torat Emet` / `Daat` — נחלת הכלל אבל בלי שנת מהדורה, ולכן
 *     אי אפשר להעביר אותן בסף 1929. ⛔ לא נכנסו.
 *
 * ⭐ לוגיקת ההתאמה אינה מועתקת — היא מיובאת מ-`ancient-sequence.js`,
 * ולכן `seqIn` ו-`formsOf` הם עותק אחד שמשרת את שני המנועים.
 */
const fs = require('fs');
const path = require('path');
const A = require('./ancient-sequence.js');
const DIR = __dirname;
const CORPUS = process.env.TALMUDCORPUS || path.join(require('os').tmpdir(), '800plus-talmud-corpus.json');

/* ===== מקורות · שם מדויק, רישיון נדרש, ותווית המקור שתירשם ===== */
const BAVLI = ['Berakhot', 'Shabbat', 'Eruvin', 'Pesachim', 'Rosh Hashanah', 'Yoma', 'Sukkah',
  'Beitzah', 'Taanit', 'Megillah', 'Moed Katan', 'Chagigah', 'Yevamot', 'Ketubot', 'Nedarim',
  'Nazir', 'Sotah', 'Gittin', 'Kiddushin', 'Bava Kamma', 'Bava Metzia', 'Bava Batra', 'Sanhedrin',
  'Makkot', 'Shevuot', 'Avodah Zarah', 'Horayot', 'Zevachim', 'Menachot', 'Chullin', 'Bekhorot',
  'Arakhin', 'Temurah', 'Keritot', 'Meilah', 'Tamid', 'Niddah'];
const TOSEFTA = ['Berakhot', 'Peah', 'Demai', 'Kilayim', 'Sheviit', 'Terumot', 'Maasrot',
  'Maaser Sheni', 'Challah', 'Orlah', 'Bikkurim', 'Shabbat', 'Eruvin', 'Pesachim', 'Shekalim',
  'Yoma', 'Sukkah', 'Beitzah', 'Rosh Hashanah', 'Taanit', 'Megillah', 'Moed Katan', 'Chagigah',
  'Yevamot', 'Ketubot', 'Nedarim', 'Nazir', 'Sotah', 'Gittin', 'Kiddushin', 'Bava Kamma',
  'Bava Metzia', 'Bava Batra', 'Sanhedrin', 'Makkot', 'Shevuot', 'Eduyot', 'Avodah Zarah',
  'Horayot', 'Zevachim', 'Menachot', 'Chullin', 'Bekhorot', 'Arakhin', 'Temurah', 'Keritot',
  'Meilah', 'Tamid', 'Middot', 'Kelim Kamma', 'Oholot', 'Negaim', 'Parah', 'Tahorot', 'Mikvaot',
  'Niddah', 'Makhshirin', 'Zavim', 'Tevul Yom', 'Yadayim', 'Oktzin'];

const SOURCES = [
  {
    corpus: 'תלמוד בבלי', pin: 'Wikisource Talmud Bavli', lic: 'CC-BY-SA',
    label: 'ויקיטקסט · תלמוד בבלי (וילנא 1880–1886)', addr: 'talmud',
    books: BAVLI.map(b => ({ ref: b, show: 'בבלי ' + b })),
  },
  {
    corpus: 'תוספתא', pin: null, lic: 'Public Domain',
    label: 'ויקיטקסט · תוספתא (נחלת הכלל לפי ספריא)', addr: 'int',
    books: TOSEFTA.map(b => ({ ref: 'Tosefta ' + b, show: 'תוספתא ' + b })),
  },
];

/* ===== תווית מקטע =====
 * ⛔ `text[0]` בתלמוד אינו «פרק 1» אלא דף 1a שאינו קיים · דף 2a יושב באינדקס 2.
 * ⭐ ולכן `Math.floor(i/2)+1` ולא `+2` — נבדק מול ברכות שנגמרת ב-64a. */
const daf = i => (Math.floor(i / 2) + 1) + (i % 2 === 0 ? 'a' : 'b');

async function fetchBook(spec, book) {
  const q = 'https://www.sefaria.org/api/v3/texts/' + encodeURIComponent(book.ref.replace(/ /g, '_')) +
    '?version=' + encodeURIComponent(spec.pin ? 'hebrew|' + spec.pin : 'hebrew');
  const r = await fetch(q, { headers: A.UA });
  if (!r.ok) throw new Error(book.ref + ' החזיר ' + r.status);
  const j = await r.json();
  const v = (j.versions || [])[0];
  if (!v) throw new Error(book.ref + ' · אין גרסה עברית');
  if (spec.pin && v.versionTitle !== spec.pin) throw new Error(book.ref + ' · נפילה שקטה ל-«' + v.versionTitle + '»');
  /* ⛔ הרישיון נמדד חי מהתשובה · לא מ-`sefaria-licenses.json` שכבר נתפס מתייג שגוי */
  if (String(v.license).trim() !== spec.lic) throw new Error(book.ref + ' · רישיון «' + v.license + '» ולא «' + spec.lic + '»');
  if (A.tooNew(v.versionTitle)) throw new Error(book.ref + ' · שנת מהדורה 1929 ואילך בשם הגרסה');
  const segs = [];
  (function walk(x, p) {
    if (Array.isArray(x)) return x.forEach((y, i) => walk(y, p.concat(i)));
    const w = A.strip(String(x || '')).split(' ').filter(Boolean);
    if (!w.length) return;
    const loc = spec.addr === 'talmud'
      ? daf(p[0]) + ':' + (p.slice(1).map(n => n + 1).join(':') || '1')
      : p.map(n => n + 1).join(':');
    segs.push({ seg: book.show + ' ' + loc, words: w });
  })(v.text, []);
  return { ref: book.ref, corpus: spec.corpus, label: spec.label, ver: v.versionTitle, lic: v.license, segs: segs };
}

async function build() {
  const out = [];
  for (const spec of SOURCES) {
    for (const book of spec.books) {
      let b = null;
      try { b = await fetchBook(spec, book); }
      catch (e) { console.log('  ⛔ דילוג · ' + e.message); await A.sleep(120); continue; }
      out.push(b);
      console.log('  ' + String(out.length).padStart(3) + '  ' + b.ref + '  ' + b.segs.length + ' מקטעים · ' + b.lic);
      await A.sleep(120);
    }
  }
  fs.writeFileSync(CORPUS, JSON.stringify(out), 'utf8');
  const tw = out.reduce((s, b) => s + b.segs.reduce((n, g) => n + g.words.length, 0), 0);
  console.log('\n⭐ ' + out.length + ' ספרים · ' + tw + ' מילים · גרסאות: ' +
    Array.from(new Set(out.map(b => b.ver + ' (' + b.lic + ')'))).join(' | '));
}

let corpus = null;
function load() {
  if (corpus) return corpus;
  if (!fs.existsSync(CORPUS)) throw new Error('הקורפוס לא נבנה · הרץ --build');
  corpus = JSON.parse(fs.readFileSync(CORPUS, 'utf8'));
  return corpus;
}

/* ===== הכרעה על ביטוי אחד · אותו כלל בדיוק כמו במנוע העתיק ===== */
function prove(phrase) {
  const out = { phrase: phrase, proved: null, prefix: null, forms: A.formsOf(phrase) };
  for (const f of out.forms) {
    for (const b of load()) {
      for (const g of b.segs) {
        const k = A.seqIn(g.words, f);
        if (!k) continue;
        const ctx = g.words.join(' ');
        const at = ctx.indexOf(f.split(' ')[0]);
        const rec = {
          ref: g.seg, corpus: b.corpus, label: b.label, ver: b.ver, lic: b.lic, form: f,
          ctx: ctx.slice(Math.max(0, at - 30), Math.min(ctx.length, at + f.length + 40)).trim(),
        };
        if (k === 'מדויק') { out.proved = rec; return out; }
        if (!out.prefix) out.prefix = rec;
      }
    }
  }
  return out;
}

/* ===== אבחון · כתיב מלא מול כתיב חסר · ⛔ אינו מוחל דבר =====
 *
 * ⛔ 34 מהביטויים לא נמצאו, ולפחות חלק מהם נופלים על **אורתוגרפיה בלבד**:
 * הערך אצלנו כתוב `גְּזֵרָה שָׁוָוה` והתלמוד כותב `גזרה שוה`. אותה מילה, שני
 * כתיבים. ⛔ המנוע הראשי אוסר השלמת אמות קריאה במפורש, כי המחלקה הזאת כבר
 * ייצרה כאן התאמות שקריות — ולכן זה **דוח בלבד**: הוא סופר, מדפיס את הטקסט
 * שנמצא, ו**אינו כותב שורת הוכחה אחת.** ההכרעה אם לקבל אינה של סוכן.
 * ⭐ הצמצום הצר ביותר שמניע משהו: קיפול `וו⟶ו` ו-`יי⟶י` בלבד, בשני הצדדים,
 * בלי שום השלמה או הסרה של אות. */
const fold = w => String(w).replace(/וו/g, 'ו').replace(/יי/g, 'י');
function proveKtiv(phrase) {
  const out = { phrase: phrase, hit: null };
  for (const f of A.formsOf(phrase)) {
    const N = fold(f).split(' ').filter(Boolean);
    if (!N.length) continue;
    for (const b of load()) for (const g of b.segs) {
      const H = g.words.map(fold);
      for (let i = 0; i + N.length <= H.length; i++) {
        let ok = true;
        for (let k = 0; k < N.length; k++) if (H[i + k] !== N[k]) { ok = false; break; }
        if (!ok) continue;
        out.hit = { ref: g.seg, corpus: b.corpus, form: f,
          found: g.words.slice(i, i + N.length).join(' '),
          ctx: g.words.slice(Math.max(0, i - 5), i + N.length + 5).join(' ') };
        return out;
      }
    }
  }
  return out;
}
function ktiv() {
  const list = A.leftWords();
  console.log('=== אבחון כתיב · ' + list.length + ' · ⛔ לא מוחל ===\n');
  let n = 0;
  for (const w of list) {
    const r = proveKtiv(w);
    if (!r.hit) continue;
    /* ⛔ מה שכבר נמצא ברצף מדויק אינו מועמד — הוא כבר הוכח */
    if (prove(w).proved) continue;
    n++;
    console.log('  ⚠ ' + w + '\n      ⟵ ' + r.hit.ref + ' · נמצא בפועל «' + r.hit.found +
      '» · הצורה אצלנו «' + r.hit.form + '»\n      הקשר: «' + r.hit.ctx + '»');
  }
  console.log('\n  ⚠ מועמדי כתיב · נפתחים רק אם חגי מאשר את הקיפול: ' + n);
  console.log('  ⛔ לא נכתבה שורת הוכחה · הפקודה הזאת אינה משנה קובץ');
}

/* ===== מה נבחר ומה נפסל · הפלט שמסביר את ההכרעה ===== */
async function licenses() {
  const probe = ['Berakhot', 'Jerusalem Talmud Berakhot', 'Tosefta Berakhot', 'Bereshit Rabbah',
    'Midrash Tanchuma', 'Mishneh Torah, Foundations of the Torah', 'Shulchan Arukh, Orach Chayim'];
  for (const t of probe) {
    const r = await fetch('https://www.sefaria.org/api/texts/versions/' + encodeURIComponent(t.replace(/ /g, '_')), { headers: A.UA });
    const j = await r.json();
    const he = (Array.isArray(j) ? j : (j.versions || [])).filter(v => v.language === 'he');
    console.log('== ' + t);
    he.forEach(v => {
      const pd = A.isPD(v.license), old = !A.tooNew(v.versionTitle);
      const yr = String(v.versionTitle).match(/\b(1[5-9]\d\d|20\d\d)\b/);
      const mark = pd && old && yr ? '⭐ מתקבל' : (/^CC-BY-SA$/i.test(String(v.license).trim()) ? '⚠ CC-BY-SA' : '⛔ נפסל');
      console.log('   ' + mark + ' | ' + v.versionTitle + ' | ' + v.license + (yr ? '' : ' | ⛔ אין שנת מהדורה'));
    });
    await A.sleep(120);
  }
}

/* ===== בקרה ===== */
function selftest() {
  let ok = true;
  const C = load();
  const bavli = C.filter(b => b.corpus === 'תלמוד בבלי'), tos = C.filter(b => b.corpus === 'תוספתא');
  const p0 = bavli.length >= 30 && bavli.every(b => b.ver === 'Wikisource Talmud Bavli') &&
    tos.every(b => A.isPD(b.lic)) && C.every(b => b.segs.length > 0 && !A.tooNew(b.ver));
  ok = ok && p0;
  console.log((p0 ? '✓ ' : '⛔ ') + 'בקרה 0 · ' + bavli.length + ' מסכתות בבלי (' +
    Array.from(new Set(bavli.map(b => b.ver + ' · ' + b.lic))).join(' | ') + ') + ' + tos.length +
    ' תוספתא (' + Array.from(new Set(tos.map(b => b.lic))).join(' | ') + ')');

  /* ⭐ בקרה חיובית · ביטוי תלמודי מובהק שאינו במקרא ואינו במשנה */
  const t1 = prove('אלא אמר רבא');
  const p1 = !!(t1.proved && t1.proved.corpus === 'תלמוד בבלי');
  ok = ok && p1;
  console.log((p1 ? '✓ ' : '⛔ ') + 'בקרה 1 · «אלא אמר רבא» ⟵ ' + (t1.proved ? t1.proved.ref : 'לא נמצא'));

  const t2 = prove('גלופסטיק מרוזבן');
  const p2 = !t2.proved && !t2.prefix;
  ok = ok && p2;
  console.log((p2 ? '✓ ' : '⛔ ') + 'בקרה 2 · צירוף מומצא ⟵ ' + (t2.proved ? '⛔ «הוכח»' : 'לא נמצא, כנדרש'));

  /* ⛔ בקרה 3 · מילים שקיימות בתלמוד, בסדר שאינו קיים */
  const t3 = prove('רבא אמר אלא שמע תא בהפוך');
  const p3 = !t3.proved;
  ok = ok && p3;
  console.log((p3 ? '✓ ' : '⛔ ') + 'בקרה 3 · מילים קיימות בסדר שאינו קיים ⟵ ' + (t3.proved ? '⛔ «הוכח»' : 'נדחה, כנדרש'));

  /* ⛔ בקרה 4 · תווית המקור עוברת את השער של permitted-sources */
  const src = SOURCES.map(s => s.label);
  const p4 = src.every(s => /^(ויקינתונים|ויקיטקסט|לפי מילה|כתב־יד לנינגרד|נחלת הכלל \(מקרא עתיק\))/.test(s)) &&
    src.every(s => !A.tooNew(s));
  ok = ok && p4;
  console.log((p4 ? '✓ ' : '⛔ ') + 'בקרה 4 · שתי התוויות עוברות את הרשימה הסגורה ואין בהן שנה 1929+');

  /* ⛔ בקרה 5 · מיפוי הדף · האינדקס אינו הדף */
  const p5 = daf(2) === '2a' && daf(3) === '2b' && daf(126) === '64a';
  ok = ok && p5;
  console.log((p5 ? '✓ ' : '⛔ ') + 'בקרה 5 · אינדקס 2⟶2a · 3⟶2b · 126⟶64a (ברכות נגמרת ב-64a)');

  console.log(ok ? '\n⭐ למנוע יש שיניים · הוא מאשר, דוחה סדר הפוך, ודוחה המצאה' : '\n⛔ המנוע אינו מבחין');
  process.exit(ok ? 0 : 1);
}

/* ===== ⛔ עצירה ידנית · רצף שנמצא ואינו הביטוי =====
 *
 * ⛔ **רצף מדויק אינו תמיד הצירוף.** «לא בכדי» נמצא בבבא מציעא לח ע״א בתוך
 * `אפילו יתר מכדי חסרונן — לא, בכדי חסרונן`, כלומר `לא` סוגר תשובה ו-`בכדי`
 * פותח את הבאה אחריה. שתי המילים סמוכות במקרה **מעבר לגבול פסוקית**, וזה
 * אינו הביטוי המודרני. ⭐ המנוע צודק מכנית, והשיפוט הזה אינו מכני — ולכן
 * הוא רשום כאן בשמו ובנימוקו, ו**מודפס בכל ריצה** במקום להישמט בשקט.
 * ⛔ הערך נשאר «דרוש מקור». */
const HOLD = {
  'לֹא בִּכְדִי': 'הרצף נמצא, אבל `לא` ו-`בכדי` שם משני צדי גבול פסוקית — סמיכות מקרית ולא הביטוי',
};

function run(list, label, emit) {
  console.log('=== ' + label + ' · ' + list.length + ' ===\n');
  let yes = 0, pre = 0, no = 0, held = 0;
  const rows = [];
  for (const w of list) {
    const r = prove(w);
    if (r.proved && HOLD[w]) {
      held++;
      console.log('  ⛔ נעצר   | ' + w + ' ⟵ ' + r.proved.ref + ' · ' + HOLD[w]);
      no++;
    } else if (r.proved) {
      yes++;
      console.log('  ⭐ מדויק  | ' + w + ' ⟵ ' + r.proved.ref + ' · ' + r.proved.corpus + ' · «' + r.proved.ctx + '»');
      rows.push([w, '', r.proved.label, r.proved.ref + ' · ' + r.proved.ver + ' · «' + r.proved.ctx + '»',
        'רצף מדויק · הצורה שנבדקה: ' + r.proved.form + ' · תג הרישיון של האתר ' + r.proved.lic + ' · הטקסט עצמו נחלת הכלל']);
    } else if (r.prefix) {
      pre++;
      console.log('  ⚠ תחילית | ' + w + ' ⟵ ' + r.prefix.ref + ' · ' + r.prefix.corpus);
    } else { no++; console.log('  ⛔ אין    | ' + w); }
  }
  console.log('\n  ⭐ רצף מדויק : ' + yes);
  console.log('  ⚠ תחילית    : ' + pre + '   ⛔ לא מוחל · להכרעה');
  console.log('  ⛔ לא נמצא   : ' + no + '   (מתוכם ' + held + ' נעצרו ידנית אחרי שהרצף כן נמצא)');
  console.log('  ' + (yes + pre + no === list.length ? '✅ הסכום מתיישב · ' + (yes + pre + no) : '⛔ הסכום אינו מתיישב'));
  if (emit) {
    const f = path.join(DIR, 'attestation-talmud-proof.tsv');
    fs.writeFileSync(f, ['מילה\tיחידה\tמקור ההוכחה\tרפרנס\tראיה · הטקסט שנמצא בפועל']
      .concat(rows.map(r => r.join('\t'))).join('\n') + '\n', 'utf8');
    console.log('\n⭐ נכתבו ' + rows.length + ' שורות ל-attestation-talmud-proof.tsv');
  }
}

if (require.main === module) (async () => {
  const a = process.argv;
  if (a.indexOf('--build') >= 0) return void await build();
  if (a.indexOf('--licenses') >= 0) return void await licenses();
  if (a.indexOf('--selftest') >= 0) return selftest();
  if (a.indexOf('--ktiv') >= 0) return ktiv();
  if (a.indexOf('--left') >= 0 || a.indexOf('--emit') >= 0) return run(A.leftWords(), 'הנותרות בלי מקור מותר', a.indexOf('--emit') >= 0);
  console.log('--build | --left | --emit | --ktiv | --licenses | --selftest');
})().catch(e => { console.error('⛔ ' + e.message); process.exit(2); });
