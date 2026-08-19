'use strict';
/* פרובה לשוליים המדורגים · typo-lab/graded_probe.js
 *
 * שלושה שערים ומדידה אחת, בתהליך אחד (loadRows יקר · הוא רץ פעם אחת):
 *
 *  A · זהות · הפרמטרים **הנשלחים** (out/typo-rules.json) על כל 89,375 השורות של שני
 *      הדאטהסטים, מול תצלום הקוד שלפני העריכה (lib/checker_baseline.js). ההשוואה היא על
 *      מפת ההחלטות המלאה שורה-שורה (ok · via · why · dist), ולא על סקלר ה-recall ·
 *      "אותו recall במקרה" אינו יכול לעבור כאן.
 *  B · שקילות המשטר הצר · הפרמטרים של gradedRefined מול lib/shortword_eval.decideOne,
 *      שהוא המימוש שממנו נמדדה הטענה 0.7171. מימוש עצמאי, שנכתב לפני העבודה הזאת.
 *  C · השומר · marginSoft < marginHard חייב לזרוק.
 *
 * מוטציות · --mutants מייצר עותקים שבורים של lib/checker.js ומריץ עליהם את השער שאמור
 * לתפוס אותם. שער שלא הודגם אדום אינו ראיה, ולכן ההרצה הזאת היא חלק מהפרובה ולא נספח.
 */

const fs = require('fs');
const path = require('path');

const LIB = path.join(__dirname, 'lib');
const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');

const EV = require('./evolve.js');
const SE = require('./lib/shortword_eval.js');
const BASE = require('./lib/checker_baseline.js');
const LIVE = require('./lib/checker.js');

const RULES = JSON.parse(fs.readFileSync(path.join(OUT, 'typo-rules.json'), 'utf8'));
const SHORT = JSON.parse(fs.readFileSync(path.join(OUT, 'shortword.json'), 'utf8'));

/* פרמטרי המועמד · .params של gradedRefined + המשקלים הצרים שיושבים ב-.W בראש השלב. */
const GR = SHORT.stages.gradedRefined;
const CAND_EN = Object.assign({}, GR.params, { WTight: GR.W });

/* ===== מוטציות · טקסטואליות, וכל אחת מאמתת שהיא באמת הוחלה ===== */
const MUTANTS = {
  M1: {
    note: 'תנאי המשטר הפוך · gap < marginSoft  →  gap > marginSoft',
    from: 'tight = GRADED && gap < P.marginSoft;',
    to: 'tight = GRADED && gap > P.marginSoft;',
    gate: 'B'
  },
  M2: {
    note: 'bandsTight דולף למסלול הרגיל · bandOf תמיד הצר',
    from: 'const bandOf = tight ? thresholdTightFor : thresholdFor;',
    to: 'const bandOf = thresholdTightFor;',
    gate: 'B'
  },
  M3: {
    note: 'השומר marginSoft < marginHard הוסר',
    from: 'if (marginSoft < marginHard) {',
    to: 'if (false) {',
    gate: 'C'
  },
  M4: {
    note: 'הפסילה הקשה סוטה באחד · gap < marginHard  →  gap <= marginHard',
    from: 'if (P.marginHard > 0 && gap < P.marginHard) hardReject = true;',
    to: 'if (P.marginHard > 0 && gap <= P.marginHard) hardReject = true;',
    gate: 'A'
  }
};

function buildMutant(name) {
  const m = MUTANTS[name];
  const src = fs.readFileSync(path.join(LIB, 'checker.js'), 'utf8');
  if (src.indexOf(m.from) < 0) throw new Error(`mutant ${name}: the anchor was not found · ${m.from}`);
  const out = src.split(m.from).join(m.to);
  if (out === src) throw new Error(`mutant ${name}: nothing changed`);
  const f = path.join(LIB, `checker_mutant_${name}.js`);
  fs.writeFileSync(f, out);
  return require(f);
}

/* ===== טעינה ===== */
say('טוען שורות · שני הדאטהסטים');
const t0 = Date.now();
const { perSet, langs } = EV.loadRows();
const SETS = ['he-word', 'en-word', 'gloss'];
const nRows = SETS.reduce((a, s) => a + perSet[s].length, 0);
say(`${nRows} שורות · ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (EV.CAND_K !== LIVE.MAX_CANDS) throw new Error(`CAND_K ${EV.CAND_K} !== MAX_CANDS ${LIVE.MAX_CANDS}`);

const cardOf = r => langs[r.lang].byCard.get(r.term + '|' + r.unit);

/* פסק דין אחד לשורה · אותו מסלול שה-exactEval של evolve מריץ. */
function verdictsFor(CH, rows, params) {
  const cks = {};
  const out = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const k = r.lang + '|' + r.set;
    let ck = cks[k];
    if (!ck) { const L = langs[r.lang]; ck = cks[k] = CH.makeChecker(params, L.ctx, L.veto, r.lang); }
    const card = cardOf(r);
    out[i] = r.set === 'gloss' ? ck.acceptGloss(r.typed, card) : ck.acceptWord(r.typed, card);
  }
  return out;
}

const sig = v => `${v.ok ? 1 : 0}|${v.via || ''}|${v.why || ''}|${v.dist == null ? '' : v.dist.toFixed(9)}`;

/* ===== שער A · זהות מול הקוד שלפני העריכה, על הפרמטרים הנשלחים ===== */
function gateA(CH, label) {
  let bad = 0, badBit = 0, n = 0;
  const ex = [];
  const regimes = new Map();
  for (const set of SETS) {
    const rows = perSet[set];
    const P = RULES.params[set];
    const a = verdictsFor(BASE, rows, P);
    const b = verdictsFor(CH, rows, P);
    for (let i = 0; i < rows.length; i++) {
      n++;
      const rg = b[i].regime || '-';
      regimes.set(rg, (regimes.get(rg) || 0) + 1);
      if (a[i].ok !== b[i].ok) badBit++;
      if (sig(a[i]) !== sig(b[i])) {
        bad++;
        if (ex.length < 6) ex.push(`${set} · "${rows[i].typed}" ~ ${rows[i].term} · ישן ${sig(a[i])} · חדש ${sig(b[i])}`);
      }
    }
  }
  say(`\n[A · ${label}] ${n} שורות · אי-התאמות בביט accept/reject: ${badBit} · אי-התאמות בפסק המלא (ok/via/why/dist): ${bad}`);
  say(`      משטרים שנצפו: ${Array.from(regimes).map(([k, v]) => k + ':' + v).join(' ')}`);
  for (const e of ex) say(`      ⛔ ${e}`);
  return { n, bad, badBit };
}

/* ===== שער B · שקילות המשטר הצר מול shortword_eval ===== */
function gateB(CH, label) {
  const rows = perSet['en-word'];
  const P = LIVE.normalizeParams(CAND_EN);
  const S = EV.packSet(rows);
  const CN = SE.compile(S, SE.constW(P.W), null);
  const CT = SE.compile(S, SE.constW(P.WTight), null);
  const E = SE.mkE(CAND_EN);
  const v = verdictsFor(CH, rows, CAND_EN);
  let bad = 0, tp = 0, nAcc = 0;
  const ex = [];
  for (let i = 0; i < rows.length; i++) {
    const ref = SE.decideOne(S, i, E, CN, CT);
    if (ref !== v[i].ok) {
      bad++;
      if (ex.length < 6) ex.push(`"${rows[i].typed}" ~ ${rows[i].term} · reference ${ref} · checker ${v[i].ok} (${v[i].why || v[i].via})`);
    }
    if (rows[i].label === 'accept' && rows[i].trusted !== false) { nAcc++; if (v[i].ok) tp++; }
  }
  say(`\n[B · ${label}] en-word ${rows.length} שורות · אי-התאמות מול shortword_eval: ${bad}`);
  say(`      recall של הבודק על אותן שורות: ${(100 * tp / nAcc).toFixed(2)}%  (${tp}/${nAcc})`);
  for (const e of ex) say(`      ⛔ ${e}`);
  return { bad, tp, nAcc };
}

/* ===== שער C · השומר ===== */
function gateC(CH, label) {
  let threw = false, msg = '';
  try { CH.normalizeParams({ marginHard: 2, marginSoft: 1, bands: [{ maxLen: null, t: 1 }] }); }
  catch (e) { threw = true; msg = e.message; }
  say(`\n[C · ${label}] marginSoft=1 < marginHard=2 · זרק? ${threw ? 'כן ✅ · ' + msg : 'לא ⛔'}`);
  return threw;
}

/* ===== המדידה · דרך exactEval של evolve, המסלול האמיתי ===== */
function faBuckets(CH, rows, params, limit) {
  const v = verdictsFor(CH, rows, params);
  const b = new Map();
  const named = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.label === 'accept') continue;
    if (!v[i].ok) continue;
    const k = String(r.why).split(':')[0];
    b.set(k, (b.get(k) || 0) + 1);
    if (named.length < (limit || 30)) named.push(`"${r.typed}" התקבל על ${r.term} (${r.key}) · ${r.why} · ${r.op} · dist ${v[i].dist}`);
  }
  return { buckets: Array.from(b).sort(), named };
}

function lenTable(res) {
  const m = new Map();
  for (const [k, g] of res.byLen) m.set(k, g);
  return m;
}

function measure(tag, params) {
  const rows = perSet['en-word'];
  const ho = rows.filter(r => r.holdout);
  const full = EV.exactEval(rows, params, langs);
  const hold = EV.exactEval(ho, params, langs);
  const fb = faBuckets(LIVE, rows, params);
  const fbHo = faBuckets(LIVE, ho, params);
  say(`\n===== ${tag} =====`);
  say(`  מלא     · recall ${(full.recall * 100).toFixed(2)}%  (${full.tp}/${full.nAcc})  · קבלות-שווא ${full.fa}/${full.nRej} · real-word ${full.faRealWord}`);
  say(`  holdout · recall ${(hold.recall * 100).toFixed(2)}%  (${hold.tp}/${hold.nAcc})  · קבלות-שווא ${hold.fa}/${hold.nRej} · real-word ${hold.faRealWord}`);
  say(`  דליי קבלות-שווא · מלא: ${fb.buckets.map(([k, v]) => k + ':' + v).join(' ') || 'אין'} · holdout: ${fbHo.buckets.map(([k, v]) => k + ':' + v).join(' ') || 'אין'}`);
  for (const s of fb.named) say(`      ⚠ ${s}`);
  return { full, hold, fb, fbHo };
}

/* ===== חוצי-כרטיסים ===== */
function crossOf(params, tag) {
  const X = CROSS.rows['en-word'];
  const r = EV.exactEval(X, params, langs);
  const fb = faBuckets(LIVE, X, params);
  say(`  חוצי-כרטיסים · ${X.length} שורות · קבלות ${r.fa} · ${tag}`);
  for (const s of fb.named) say(`      ⛔ ${s}`);
  return r;
}

/* ===== ריצה ===== */
const argv = process.argv.slice(2);
const wantMut = argv.includes('--mutants');
const wantMeasure = argv.includes('--measure');

const A0 = gateA(LIVE, 'הקוד החדש · שפוי');
const B0 = gateB(LIVE, 'הקוד החדש · שפוי');
const C0 = gateC(LIVE, 'הקוד החדש · שפוי');

if (wantMut) {
  say('\n########## מוטציות · כל אחת חייבת להאדים את השער שנועד לה ##########');
  for (const name of Object.keys(MUTANTS)) {
    const m = MUTANTS[name];
    const CH = buildMutant(name);
    say(`\n--- ${name} · ${m.note} · שער ${m.gate} ---`);
    if (m.gate === 'A') gateA(CH, name);
    if (m.gate === 'B') gateB(CH, name);
    if (m.gate === 'C') {
      const threw = gateC(CH, name);
      /* השומר הוסר · צריך גם להראות שהחלון השלילי באמת משנה החלטות ולא רק "לא זרק". */
      if (!threw) {
        const bad = { ...CAND_EN, marginHard: 2, marginSoft: 1 };
        const rows = perSet['en-word'];
        const a = verdictsFor(CH, rows, Object.assign({}, CAND_EN, { marginHard: 1, marginSoft: 1 }));
        const b = verdictsFor(CH, rows, bad);
        let d = 0;
        for (let i = 0; i < rows.length; i++) if (a[i].ok !== b[i].ok) d++;
        say(`      חלון שלילי נבלע בשקט · ${d} החלטות שונות מ-marginSoft=marginHard`);
      }
    }
  }
}

/* ===== וריאנטים · מה בדיוק נושא במשקל, ומה השער יראה בפועל ===== */
if (argv.includes('--variants')) {
  say('\n########## וריאנטים ##########');

  /* 1 · הארטיפקט מהדיסק · הצורה שהשער יטען, ולא אובייקט שבניתי בזיכרון. */
  const FILE = JSON.parse(fs.readFileSync(path.join(OUT, 'graded-candidate-rules.json'), 'utf8'));
  const rows = perSet['en-word'];
  const fromFile = EV.exactEval(rows, FILE.params['en-word'], langs);
  say(`\nמהארטיפקט graded-candidate-rules.json · recall ${(fromFile.recall * 100).toFixed(2)}% · קבלות-שווא ${fromFile.fa}`);

  /* 2 · כמה שורות בכלל נכנסות למשטר הצר, ומה הן תורמות. */
  const v = verdictsFor(LIVE, rows, CAND_EN);
  let tight = 0, tightTP = 0, mainTP = 0;
  for (let i = 0; i < rows.length; i++) {
    if (v[i].regime === 'tight') { tight++; if (v[i].ok && rows[i].label === 'accept') tightTP++; }
    else if (v[i].regime === 'main' && v[i].ok && rows[i].label === 'accept') mainTP++;
  }
  say(`המשטר הצר · ${tight} שורות הגיעו אליו · מהן ${tightTP} קבלות אמת · המשטר הראשי ${mainTP}`);

  /* 3 · minLen · המועמד מגיע עם 0 והנשלח עם 3. זה **אינו** הגן המדורג, וצריך לדעת
     כמה מהרווח באורכים הקצרים מגיע ממנו ולא מהמשטר הצר. */
  const P3 = Object.assign({}, CAND_EN, { minLen: 3 });
  const r3 = EV.exactEval(rows, P3, langs);
  say(`המועמד עם minLen=3 (כמו הנשלח) · recall ${(r3.recall * 100).toFixed(2)}% · קבלות-שווא ${r3.fa}`);
  const g3 = lenTable(r3);
  say('  לפי אורך: ' + Array.from(g3).sort((a, b) => (a[0] === '12+' ? 99 : +a[0]) - (b[0] === '12+' ? 99 : +b[0]))
    .map(([k, g]) => k + ':' + (g.nAcc ? (100 * g.tp / g.nAcc).toFixed(1) + '%' : '—')).join(' '));

  /* 4 · מה השער באמת יטען · bank_gate.shipParams מנרמל בעצמו ובוחר שדות. */
  process.env.TYPO_RULES = path.join(OUT, 'graded-candidate-rules.json');
  delete require.cache[require.resolve('./bank_gate.js')];
  const BG = require('./bank_gate.js');
  const sp = BG.shipParams ? BG.shipParams() : null;
  if (sp) say(`bank_gate.shipParams · שדות ה-en-word שהשער רואה: ${Object.keys(sp.sets['en-word']).join(',')}`);
  else say('bank_gate אינו מייצא shipParams · נבדק בקריאה של הקובץ');
}

let CROSS = null;
if (wantMeasure) {
  say('\n########## מדידה · en-word ##########');
  const shipped = measure('הנשלח · params["en-word"] מ-typo-rules.json', RULES.params['en-word']);
  const cand = measure('המועמד · gradedRefined + WTight', CAND_EN);

  say('\n===== recall לפי אורך המפתח · נשלח מול מועמד =====');
  const a = lenTable(shipped.full), b = lenTable(cand.full);
  const ah = lenTable(shipped.hold), bh = lenTable(cand.hold);
  const keys = Array.from(new Set([...a.keys(), ...b.keys()])).sort((x, y) => (x === '12+' ? 99 : +x) - (y === '12+' ? 99 : +y));
  say('| אורך | n | נשלח מלא | מועמד מלא | נשלח holdout | מועמד holdout | FA נשלח | FA מועמד |');
  say('|---|---|---|---|---|---|---|---|');
  const pc = g => (g && g.nAcc ? (100 * g.tp / g.nAcc).toFixed(2) + '%' : '—');
  for (const k of keys) {
    const g = a.get(k), h = b.get(k), gh = ah.get(k), hh = bh.get(k);
    say(`| ${k} | ${g ? g.nAcc : 0} | ${pc(g)} | ${pc(h)} | ${pc(gh)} | ${pc(hh)} | ${g ? g.fa : 0} | ${h ? h.fa : 0} |`);
  }

  say('\n===== שליליות חוצות-כרטיסים =====');
  CROSS = EV.buildCrossCard(langs, perSet);
  crossOf(RULES.params['en-word'], 'הנשלח');
  crossOf(CAND_EN, 'המועמד');

  fs.writeFileSync(path.join(OUT, 'graded-probe.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    identity: A0, gradedEquivalence: B0, guardThrows: C0,
    shipped: { full: { recall: shipped.full.recall, tp: shipped.full.tp, nAcc: shipped.full.nAcc, fa: shipped.full.fa }, hold: { recall: shipped.hold.recall, fa: shipped.hold.fa }, byLen: Array.from(shipped.full.byLen) },
    candidate: { full: { recall: cand.full.recall, tp: cand.full.tp, nAcc: cand.full.nAcc, fa: cand.full.fa }, hold: { recall: cand.hold.recall, fa: cand.hold.fa }, byLen: Array.from(cand.full.byLen) }
  }, null, 1));
}

say(`\nסך הכול ${((Date.now() - t0) / 1000).toFixed(1)}s`);
