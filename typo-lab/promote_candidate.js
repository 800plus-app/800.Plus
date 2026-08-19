'use strict';
/* קידום מועמד לארטיפקט הנשלח · typo-lab/promote_candidate.js
 *
 * מעביר סט אחד מ-out/typo-rules.CANDIDATE.json אל out/typo-rules.json, ומשאיר
 * בארטיפקט **תיעוד פרובננס** של הקידום: מאיזה קובץ, מה טביעת האצבע, ואיזו ריצת שער
 * אישרה אותו. בלי הרישום הזה הארטיפקט מציג מספרי `results`/`exact` מריצת GA שכבר
 * אינה מתארת את הסט שהוחלף · וזו בדיוק הטעות שהשער נועד למנוע.
 *
 *   node typo-lab/promote_candidate.js --set en-word --gate out/bank-gate.typo-rules.CANDIDATE.md
 *
 * ⚠ מה זה **לא** עושה · אינו מריץ שער, אינו מחשב recall, ואינו נוגע ב-app.js.
 * הקידום חוקי רק אחרי ששער המאגר רץ על קובץ המועמד עצמו וחזר ירוק.
 */

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');
const argv = process.argv.slice(2);
const argOf = n => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : null; };

const SET = argOf('set');
const GATE = argOf('gate');
const CAND = argOf('cand') || path.join(OUT, 'typo-rules.CANDIDATE.json');

if (!SET) { say('⛔ חסר --set'); process.exit(2); }

const BG = require('./bank_gate.js');

const rulesPath = path.join(OUT, 'typo-rules.json');
const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
const cand = JSON.parse(fs.readFileSync(CAND, 'utf8'));

if (!cand.params || !cand.params[SET]) { say(`⛔ ${path.basename(CAND)} בלי params.${SET}`); process.exit(2); }

/* בקרת שפיות · כל סט **אחר** חייב להיות זהה בין השניים, אחרת הקידום מעביר בשקט גם
   שינויים שלא נבדקו. השער רץ על קובץ המועמד כולו, ולכן זו בדיוק ההנחה שהוא מכסה. */
const other = Object.keys(rules.params).filter(k => k !== SET);
const norm = o => JSON.stringify(o);
for (const k of other) {
  if (norm(rules.params[k]) !== norm(cand.params[k])) {
    say(`⛔ הסט ${k} נבדל בין הארטיפקט למועמד · קידום היה מבריח שינוי שלא נשלח לשער`);
    process.exit(1);
  }
}

const before = BG.fingerprint(Object.fromEntries(Object.entries(rules.params).map(([k, v]) => [k, v])));
rules.params[SET] = JSON.parse(JSON.stringify(cand.params[SET]));
const after = BG.fingerprint(Object.fromEntries(Object.entries(rules.params).map(([k, v]) => [k, v])));

let gateNote = null;
if (GATE) {
  const gp = path.isAbsolute(GATE) ? GATE : path.join(__dirname, '..', GATE);
  if (!fs.existsSync(gp)) { say(`⛔ דוח השער ${GATE} לא נמצא`); process.exit(2); }
  const txt = fs.readFileSync(gp, 'utf8');
  const ok = /אפס התנגשויות חדשות/.test(txt) && !/⛔ \d+ התנגשויות חדשות/.test(txt);
  if (!ok) { say(`⛔ דוח השער ${path.basename(gp)} אינו ירוק · אין קידום`); process.exit(1); }
  const m = txt.match(/(\d+) זוגות שחושבו/);
  gateNote = { file: path.basename(gp), pairs: m ? Number(m[1]) : null };
}

rules.promoted = rules.promoted || [];
rules.promoted.push({
  set: SET,
  from: path.basename(CAND),
  source: cand.candidateNote || null,
  fingerprintBefore: before,
  fingerprintAfter: after,
  bankGate: gateNote,
  /* ⚠ `results`, `exact` ו-`shipGate` בארטיפקט הזה **אינם** מתארים את הסט שהוחלף ·
     הם נשארו מריצת ה-GA. מי שמצטט מהם מספר על en-word אחרי הקידום מצטט גנום אחר. */
  staleBlocks: ['results.' + SET, 'exact.' + SET, 'shipGate.' + SET],
});

fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 1), 'utf8');
say(`✅ ${SET} קודם מ-${path.basename(CAND)}`);
say(`   טביעה ${before} → ${after}`);
if (gateNote) say(`   שער · ${gateNote.file} · ${gateNote.pairs} זוגות`);
say('   ⚠ results/exact/shipGate של הסט הזה נשארו מריצת ה-GA ואינם מתארים אותו · נרשם ב-promoted[].staleBlocks');
