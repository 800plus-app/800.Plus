/* מאחד את שלושת הסבבים לטבלת הוכחת-מקור אחת, ומסווג כל הוכחה לפי הרישיון שלה.
 *
 * ⚠ סיווג הרישיון הוא העיקר, לא הכיסוי. הוכחה מטקסט קלאסי (תנ"ך, משנה, תלמוד,
 * רש"י, רמב"ם) היא **נחלת הכלל** — הוכחה חזקה. הוכחה מפירוש מודרני שמופיע בספריא
 * (שטיינזלץ, מילון קליין) נמצאת תחת CC BY-NC, כלומר אינה "ללא זכויות" והיא נספרת
 * בנפרד. ויקינתונים הוא CC0 — הרישיון הנקי ביותר שיש.
 */
const fs = require('fs');
const NIQ = /[֑-ׇ]/g;
const norm = s => s.normalize('NFKC').replace(NIQ, '').replace(/["'׳״]/g, '').trim();

const read = f => fs.existsSync(f)
  ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => l.split('\t')) : [];

const r1 = read('attest/wikidata-hits.tsv').slice(1);   // מילה, יחידה, Lid, למה
const r2 = read('attest/round2-hits.tsv');              // מילה, יחידה, Lid, למה
const r3 = read('attest/round3-hits.tsv');              // מילה, יחידה, "ספריא: ref"
const miss = read('attest/round3-miss.tsv');

/* ספרים קלאסיים = נחלת הכלל. הרשימה מוצהרת ולא מנוחשת: מי שלא ברשימה מסומן
   כ"לבדוק רישיון" ולא נספר כנחלת הכלל. */
const CLASSIC = /^(Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|I Samuel|II Samuel|I Kings|II Kings|Isaiah|Jeremiah|Ezekiel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Psalms|Proverbs|Job|Song of Songs|Ruth|Lamentations|Ecclesiastes|Esther|Daniel|Ezra|Nehemiah|I Chronicles|II Chronicles|Mishnah |Tosefta |Jerusalem Talmud |Rashi |Rashbam |Ramban |Ibn Ezra |Radak |Sforno |Mishneh Torah|Shulchan Arukh|Tur|Sefer HaChinukh|Bereshit Rabbah|Vayikra Rabbah|Shemot Rabbah|Midrash|Pesikta|Mekhilta|Sifra|Sifrei|Zohar|Kuzari|Guide for the Perplexed|Duties of the Heart|Mesilat Yesharim|Pirkei Avot|Avot D'Rabbi Natan|Siddur |Machzor |Berakhot|Shabbat|Eruvin|Pesachim|Yoma|Sukkah|Beitzah|Rosh Hashanah|Taanit|Megillah|Moed Katan|Chagigah|Yevamot|Ketubot|Nedarim|Nazir|Sotah|Gittin|Kiddushin|Bava Kamma|Bava Metzia|Bava Batra|Sanhedrin|Makkot|Shevuot|Avodah Zarah|Horayot|Zevachim|Menachot|Chullin|Bekhorot|Arakhin|Temurah|Keritot|Meilah|Tamid|Middot|Kinnim|Niddah)/;
/* ⚠ Jastrow ("A Dictionary of the Talmud", 1903) הוא נחלת הכלל לפי גיל הפרסום,
   ולכן הוא **לא** נמצא ברשימת המודרניים. מילון קליין ושטיינזלץ הם CC BY-NC. */
const PD_LEX = /^(Jastrow|A Dictionary of the Talmud)/;
const MODERN = /^(Steinsaltz|Klein Dictionary|Karati|Contemporary|English Explanation|Gilyon|Peninei|Mishnah Yomit|Sefaria)/;

const rows = [];
r1.forEach(([w, u, lid, lemma]) => rows.push([w, u, 'ויקינתונים (CC0)', lid, lemma || '']));
r2.forEach(([w, u, lid, lemma]) => rows.push([w, u, 'ויקינתונים (CC0)', lid, lemma || '']));
/* ⭐ הרישיון נלקח מ**ספריא עצמו** (api/v3/texts) ולא מרשימה שאני מנחש. הרשימות
   CLASSIC/PD_LEX נשארות רק כגיבוי למקרים שה-API החזיר עליהם unknown. */
const LIC = fs.existsSync('attest/sefaria-licenses.json')
  ? JSON.parse(fs.readFileSync('attest/sefaria-licenses.json', 'utf8')) : {};
const clsOf = (r) => {
  const raw = LIC[r];
  if (/Public Domain|^PD$|CC0/i.test(raw || '')) return 'נחלת הכלל / CC0 (לפי ספריא)';
  if (/CC-BY-SA/i.test(raw || '')) return 'CC BY-SA (ייחוס + שיתוף זהה)';
  if (/CC-BY(?!-)/i.test(raw || '')) return 'CC BY (ייחוס בלבד)';
  if (/CC-BY-NC|Copyright/i.test(raw || '')) return 'מוגן / לא-מסחרי — אינו כשר לשימוש';
  /* ה-API לא ידע — נופלים לסיווג לפי אופי החיבור, ומסמנים שזו הערכה */
  if (CLASSIC.test(r)) return 'טקסט קלאסי (נחלת הכלל, לפי אופי החיבור)';
  if (PD_LEX.test(r)) return 'מילון היסטורי 1903 (נחלת הכלל)';
  return 'רישיון לא ידוע — לא נספר כהוכחה';
};
r3.forEach(([w, u, ref]) => {
  const r = String(ref).replace(/^ספריא:\s*/, '');
  rows.push([w, u, clsOf(r), r, '']);
});
/* סבבים 4 ו-5: כבר סוננו בהרצה לרישיון Public Domain בלבד, ולכן הם נכנסים
   כמות שהם. סבב 5 נושא גם את השאילתה שהוכיחה — שקיפות למי שיבדוק אחרינו. */
const later = [...read('attest/round4-hits.tsv'), ...read('attest/round5-hits.tsv')];
const seen = new Set(rows.map(r => r[0]));
later.forEach(([w, u, cls, ref, note]) => {
  const i = rows.findIndex(r => r[0] === w);
  const row = [w, u, cls || 'נחלת הכלל / CC0 (לפי ספריא)', ref, note || ''];
  if (i >= 0) rows[i] = row;                 // מחליף הוכחה לא-כשרה בהוכחה נקייה
  else rows.push(row);
  seen.add(w);
});
/* מה שנשאר בחוסר אחרי כל הסבבים */
const stillMissing = read('attest/round5-miss.tsv').filter(([w]) => !seen.has(w));

const byClass = {};
rows.forEach(r => byClass[r[2]] = (byClass[r[2]] || 0) + 1);

const w = {};
new Function('window', fs.readFileSync('attest/live-data.js', 'utf8'))(w);
const total = Object.values(w.UNIT_DATA).flat().length;

fs.writeFileSync('attest/attestation.tsv',
  'מילה\tיחידה\tמקור ההוכחה\tמזהה/רפרנס\tלמה במקור\n' +
  rows.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
const finalMiss = (typeof stillMissing !== 'undefined' && stillMissing.length)
  ? stillMissing : miss;
fs.writeFileSync('attest/attestation-missing.tsv',
  'מילה\tיחידה\n' + finalMiss.map(r => r.join('\t')).join('\n') + '\n', 'utf8');

console.log('='.repeat(62));
console.log(`מילות הבנק: ${total}`);
Object.entries(byClass).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`  ${k}: ${v}`));
console.log(`  ללא הוכחה: ${finalMiss.length}`);
const clean = rows.filter(r => /CC0|נחלת הכלל/.test(r[2])).length;
const usable = rows.filter(r => /CC0|נחלת הכלל|CC BY(?! ?-?NC)/.test(r[2])).length;
console.log(`הוכחה ברישיון שמתיר שימוש (כולל CC BY / BY-SA): ${usable}/${total} = ${(usable / total * 100).toFixed(1)}%`);
console.log('='.repeat(62));
console.log(`הוכחה ברישיון נקי (CC0 או נחלת הכלל): ${clean}/${total} = ${(clean / total * 100).toFixed(1)}%`);
console.log(`סה"כ עם הוכחה כלשהי: ${rows.length}/${total} = ${(rows.length / total * 100).toFixed(1)}%`);

/* ---- סבבים 6 ו-7: ויקימדיה. ⚠ הרישיון כאן מעורב, ולכן הוא נכתב בשורה עצמה
   ואינו מתערבב עם נחלת הכלל. `פורס מז'ור` נפסל ידנית: הנרמול מחק את הגרש והוא
   הותאם לערך `מזור`, שהיא מילה אחרת לגמרי. התאמה שנוצרה בגלל נרמול אינה הוכחה. */
const wiki = [...read('attest/round6-hits.tsv'), ...read('attest/round7-hits.tsv')];
wiki.forEach(([w, u, cls, ref, note]) => {
  const i = rows.findIndex(r => r[0] === w);
  const row = [w, u, cls, ref, note || ''];
  if (i >= 0) { if (/מוגן|לא ידוע/.test(rows[i][2])) rows[i] = row; }
  else rows.push(row);
});
const missF = read('attest/round7-miss.tsv').filter(r => r[0] && !rows.some(x => x[0] === r[0]));
fs.writeFileSync('attest/attestation.tsv',
  'מילה\tיחידה\tמקור ההוכחה\tמזהה/רפרנס\tהערה\n' +
  rows.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
fs.writeFileSync('attest/attestation-missing.tsv',
  'מילה\tיחידה\n' + missF.map(r => r.join('\t')).join('\n') + '\n', 'utf8');
const cls2 = {};
rows.forEach(r => cls2[r[2]] = (cls2[r[2]] || 0) + 1);
console.log('\n' + '='.repeat(62));
console.log('אחרי כל שבעת הסבבים:');
Object.entries(cls2).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${v}× ${k}`));
console.log(`  ${missF.length}× ללא הוכחה`);
const pd = rows.filter(r => /CC0|נחלת הכלל/.test(r[2])).length;
const sa = rows.filter(r => /CC BY/.test(r[2])).length;
console.log('='.repeat(62));
console.log(`נחלת הכלל / CC0:      ${pd}/${total} = ${(pd / total * 100).toFixed(1)}%`);
console.log(`CC BY / BY-SA:        ${sa}/${total} = ${(sa / total * 100).toFixed(1)}%`);
console.log(`סה"כ מקור חופשי:      ${pd + sa}/${total} = ${((pd + sa) / total * 100).toFixed(1)}%`);
console.log(`ללא הוכחה:            ${missF.length}/${total} = ${(missF.length / total * 100).toFixed(1)}%`);
