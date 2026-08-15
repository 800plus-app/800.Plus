'use strict';
/* ===== מחלקת המורפולוגיה · שתי השערות על **הווטו**, לא על החוק =====
 *
 * `out/morph-report.md` דחה 28 וריאנטים מורפולוגיים. הקובץ הזה אינו מוסיף וריאנט אחד.
 * הוא בודק שתי השערות על **האיסור**:
 *
 *   H1 · הכלל מרחיב את מרחב הקבלה, אבל האיסור לא הורחב איתו.
 *        `isVetoedSeg` נשען על `veto.segKeys`, ש-`buildVeto` בונה מ-`meaningSegs`
 *        **הגולמיים** בלבד. אבל יקום הקבלה בפועל (`SINGLE` ב-measure_morph) כולל גם את
 *        ענף `particleMatch` ואת `meanNorm`/`meanBare`. מחרוזת שהיא תשובה קבילה של
 *        כרטיס אחר **רק דרך ההרחבה הזאת** אינה ב-`segKeys`, ולכן הווטו שקוף לה.
 *        זו בדיוק שורת "**הווטו אינו חוסם**" בדוח.
 *        זו גם בדיוק אותה תקלה שנתפסה ב-gloss: `expandOf(B1-union)` לא הוזרם לאילוץ.
 *        התיקון שם היה **להזרים את ההרחבה לאילוץ**. כאן אותו דבר בדיוק.
 *
 *   H2 · שוליים מדורגים · להתיר את הכלל רק כשהמאגר שקט סביב התשובה (`dOther` גדול).
 *
 * ⚠ הקובץ הזה **קורא בלבד**. הוא אינו נוגע ב-app.js, ב-typo-lex.js, ב-data*.js,
 * ב-out/typo-rules.json ו-ב-out/golden.jsonl.
 *
 * ===== שן · שחזור הדוח הקיים =====
 * הווטו V0 כאן הוא `isVetoedSeg` עצמו, והמדידה חייבת להחזיר **בדיוק** את המספרים של
 * `out/morph-report.md`. אם לא — הרתמה מודדת קוד אחר, וכל מספר אחר בקובץ הזה חסר ערך.
 * ההשוואה מתבצעת אוטומטית מול הטבלה בדוח (`--verify`), ונופלת על אי-התאמה.
 *
 *   node typo-lab/morph_veto_search.js              → מדידה מלאה + דוח
 *   node typo-lab/morph_veto_search.js --selftest   → הוכחת שיניים (ווטו שבור בכוונה)
 */

const fs = require('fs');
const path = require('path');
const MM = require('./measure_morph.js');
const M = require('./lib/morphrules.js');
const { isVetoedSeg } = require('./lib/veto.js');
const { acceptedKeys } = require('./lib/keys.js');

const OUT = path.join(__dirname, 'out');
const LANGS = ['he', 'en'];
const say = s => process.stdout.write(s + '\n');
const wordsOf = s => String(s).split(/\s+/).filter(Boolean);

/* 4 המקרים הפתוחים · 13 ו-20 כבר מתקבלים היום ואינם נספרים לאף חוק. */
const OPEN = [4, 8, 14, 23];

/* ===== הווטואים שנבדקים =====
 * כל אחד הוא פרדיקט (x, card) -> חסום. שלושתם משתמשים באותה קבוצת-היתר בדיוק
 * (הכרטיס עצמו + glossAlts), כדי שההבדל ביניהם יהיה **מה נכנס לאינדקס** ולא מי מותר.
 */
function vetoSet(L, cfgKey) {
  const ctx = L.ctx;

  /* קבוצת ההיתר · זהה ל-offenders ול-isVetoedSeg. ממוזכרת לכרטיס. */
  const allowOf = card => {
    if (card._allow) return card._allow;
    const s = new Set([card.key]);
    for (const t of Array.from(ctx.glossAlts(card.w))) s.add(ctx.K(t));
    card._allow = s;
    return s;
  };

  /* V0 · הווטו של היום · segKeys מ-meaningSegs הגולמיים. */
  const V0 = (x, card) => isVetoedSeg(x, card.w, L.veto, ctx);

  /* V1 · **יקום הקבלה המלא** · אותה קבוצה שההתנגשות מוגדרת מולה (SINGLE).
     זו ההזרמה: ההרחבה שהחוק/האפליקציה מוסיפים נכנסת לאילוץ עצמו. */
  const V1 = (x, card) => {
    const owners = L.SINGLE.get(x);
    if (!owners || !owners.size) return false;
    if (card.singles.has(x)) return false;          // מתקבל היום · לעולם לא רגרסיה
    const allow = allowOf(card);
    for (const o of owners) if (!allow.has(o)) return true;
    return false;
  };

  /* צד המונח · אותו פרדיקט של isVetoedTerm, על termKeys. */
  const VT = (x, card) => {
    const xk = ctx.K(x);
    if (!xk) return false;
    const owners = L.veto.termKeys.get(xk);
    if (!owners || !owners.size) return false;
    return !acceptedKeys(card.w, ctx).has(xk);
  };

  const V1t = (x, card) => V1(x, card) || VT(x, card);

  return { V0, V1, VT, V1t, allowOf };
}

/* ===== V2 · ווטו במרחב השלדים =====
 * מפה שלד -> בעלים מעל **כל** המחרוזות הקבילות בנות מילה אחת של כל המאגר (SINGLE)
 * ומעל כל מפתחות המונחים, באותה פונקציית מפתח שהחוק עצמו משתמש בה.
 * נבנה לכל (שפה, וריאנט) בנפרד, כי פונקציית המפתח היא של הווריאנט.
 */
function buildSkelOwners(L, rule, params) {
  const ctx = L.ctx;
  const map = new Map();
  const put = (k, o) => { let s = map.get(k); if (!s) { s = new Set(); map.set(k, s); } s.add(o); };
  for (const [x, owners] of L.SINGLE) {
    const ks = rule.keysTyped(x, ctx, params);
    if (!ks.size) continue;
    for (const k of ks) for (const o of owners) put(k, o);
  }
  for (const c of L.cards) {
    for (const kk of acceptedKeys(c.w, ctx)) {
      if (wordsOf(kk).length !== 1) continue;
      for (const k of rule.keysTyped(kk, ctx, params)) put(k, c.key);
    }
  }
  return map;
}

/* ===== המדידה · וריאנט אחד, שפה אחת, כל הווטואים בבת אחת ===== */
function measure(L, cfg) {
  const ctx = L.ctx;
  const rule = M.BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);
  const V = vetoSet(L, cfg.key);
  const skelOwners = buildSkelOwners(L, rule, params);

  const V2 = (x, card) => {
    const allow = V.allowOf(card);
    if (card.singles.has(x)) return false;
    for (const k of rule.keysTyped(x, ctx, params)) {
      const owners = skelOwners.get(k);
      if (!owners) continue;
      for (const o of owners) if (!allow.has(o)) return true;
    }
    return false;
  };

  const VETOES = [
    { id: 'VNONE', f: () => false },        // בלי ווטו כלל · הבסיס הגולמי שהדוח מדווח
    { id: 'V0', f: V.V0 },
    { id: 'V1', f: V.V1 },
    { id: 'V1t', f: V.V1t },
    { id: 'V2', f: V2 },
    { id: 'V2t', f: (x, c) => V2(x, c) || V.VT(x, c) },
  ];

  const res = {};
  const IDS = VETOES.map(v => v.id);
  for (const v of VETOES) res[v.id] = { same: 0, other: 0, termSame: 0, termOther: 0, benign: 0, kept: 0, exSame: [], exOther: [], exTerm: [] };
  void IDS;
  let newAccepts = 0, regress = 0, mismatch = 0;

  /* אינדקס מפתח -> מחרוזות היקום · בדיוק כמו measureRisk. */
  const keyIx = new Map();
  for (const x of L.pool) {
    for (const k of rule.keysTyped(x, ctx, params)) {
      let a = keyIx.get(k); if (!a) { a = []; keyIx.set(k, a); } a.push(x);
    }
  }

  const gated = M.makeMorphChecker(ctx, { [rule.name]: { on: true, params, veto: L.veto } });

  for (const card of L.cards) {
    for (const s of card.segs) { const v = gated(s, card.w); if (!v.ok || v.by !== 'today') regress++; }

    const segK = rule.keysSeg(card.segs, ctx, params);
    if (!segK.size) continue;
    const hits = new Set();
    for (const k of segK) { const a = keyIx.get(k); if (a) for (const x of a) hits.add(x); }

    for (const x of hits) {
      if (card.singles.has(x)) continue;
      if (!rule.accepts(x, card.segs, ctx, params)) { mismatch++; continue; }
      newAccepts++;

      const bad = MM.offenders(L, x, card);
      const units = new Set();
      for (const o of bad) for (const u of (L.unitOfOwner.get(o) || [])) units.add(u);
      const sameUnit = units.has(card.unit);

      const xk = ctx.K(x);
      const tOwners = xk ? L.veto.termKeys.get(xk) : null;
      const isTerm = !bad.length && tOwners && tOwners.size && !acceptedKeys(card.w, ctx).has(xk);
      const tUnits = new Set();
      if (isTerm) for (const o of tOwners) for (const u of (L.unitOfOwner.get(o) || [])) tUnits.add(u);

      for (const v of VETOES) {
        if (v.f(x, card)) continue;                                   // חסום · לא שורד
        const R = res[v.id];
        R.kept++;
        if (bad.length) {
          const row = `[${L.lang}] ${card.w.term} (יח' ${card.unit}) ← "${x}" · תשובה קבילה של ${bad.slice(0, 4).join(' , ')}`;
          if (sameUnit) { R.same++; if (R.exSame.length < 60) R.exSame.push(row); }
          else { R.other++; if (R.exOther.length < 40) R.exOther.push(row); }
        } else if (isTerm) {
          const row = `[${L.lang}] ${card.w.term} (יח' ${card.unit}) ← "${x}" · "${x}" הוא מונח במאגר (${Array.from(tOwners).slice(0, 3).join(' , ')})`;
          if (tUnits.has(card.unit)) { R.termSame++; if (R.exTerm.length < 40) R.exTerm.push(row); }
          else { R.termOther++; if (R.exTerm.length < 40) R.exTerm.push(row); }
        } else R.benign++;
      }
    }
  }

  return { lang: L.lang, cfg, params, newAccepts, regress, mismatch, res };
}

/* ===== התועלת · 4 המקרים הפתוחים, לכל ווטו ===== */
function benefit(L, cfg, resolved) {
  const ctx = L.ctx;
  const rule = M.BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);
  const V = vetoSet(L, cfg.key);
  const skelOwners = buildSkelOwners(L, rule, params);
  const V2 = (x, card) => {
    const allow = V.allowOf(card);
    if (card.singles.has(x)) return false;
    for (const k of rule.keysTyped(x, ctx, params)) {
      const o2 = skelOwners.get(k);
      if (!o2) continue;
      for (const o of o2) if (!allow.has(o)) return true;
    }
    return false;
  };
  const out = { VNONE: [], V0: [], V1: [], V1t: [], V2: [], V2t: [], raw: [], why: {} };
  for (const { c, card } of resolved) {
    const a = ctx.norm(c.typed);
    if (ctx.meaningMatch(a, card.w.meaning)) continue;
    if (!rule.accepts(a, card.segs, ctx, params)) continue;
    out.raw.push(c.n);
    const blocks = { VNONE: false, V0: V.V0(a, card), V1: V.V1(a, card), V1t: V.V1t(a, card), V2: V2(a, card), V2t: V2(a, card) || V.VT(a, card) };
    for (const k of ['VNONE', 'V0', 'V1', 'V1t', 'V2', 'V2t']) if (!blocks[k]) out[k].push(c.n);
    /* מי חוסם, בשמו · מספר בלי שם אינו ראיה. */
    const w = { typed: a, term: card.w.term };
    const owners = L.SINGLE.get(a);
    w.uniOwners = owners ? Array.from(owners).filter(o => !V.allowOf(card).has(o)) : [];
    const xk = ctx.K(a);
    const tO = xk ? L.veto.termKeys.get(xk) : null;
    w.termOwners = tO && !acceptedKeys(card.w, ctx).has(xk) ? Array.from(tO) : [];
    const sk = [];
    for (const k of rule.keysTyped(a, ctx, params)) {
      const o2 = skelOwners.get(k);
      if (!o2) continue;
      for (const o of o2) if (!V.allowOf(card).has(o)) sk.push(k + '→' + o);
    }
    w.skelOwners = sk.slice(0, 12);
    w.blocks = blocks;
    out.why[c.n] = w;
  }
  return out;
}

/* ===== H2 · שוליים · המרחק הקטן ביותר מהתשובה לכל מחרוזת קבילה של כרטיס זר ===== */
function nearestOther(L, x, card, allow) {
  const ctx = L.ctx;
  let best = Infinity, who = null;
  for (const [u, owners] of L.SINGLE) {
    let foreign = false;
    for (const o of owners) if (!allow.has(o)) { foreign = true; break; }
    if (!foreign) continue;
    if (Math.abs(u.length - x.length) >= best) continue;
    const d = ctx.editDist(x, u);
    if (d < best) { best = d; who = u; if (!best) break; }
  }
  return { d: best, who };
}

/* ===== --dump · כל קבלה חדשה בשמה =====
 * "אל תסמוך על מספר בלי לראות את השורות". לווריאנטים הקטנים הרשימה נמנית **במלואה**,
 * ולכן היא ראיה ולא מדגם.
 */
function dump(L, cfg) {
  const ctx = L.ctx;
  const rule = M.BY_NAME.get(cfg.rule);
  const params = Object.assign({}, rule.defaults, cfg.params);
  const V = vetoSet(L, cfg.key);
  const skelOwners = buildSkelOwners(L, rule, params);
  const V2 = (x, card) => {
    if (card.singles.has(x)) return false;
    const allow = V.allowOf(card);
    for (const k of rule.keysTyped(x, ctx, params)) {
      const o2 = skelOwners.get(k); if (!o2) continue;
      for (const o of o2) if (!allow.has(o)) return true;
    }
    return false;
  };
  const keyIx = new Map();
  for (const x of L.pool) for (const k of rule.keysTyped(x, ctx, params)) {
    let a = keyIx.get(k); if (!a) { a = []; keyIx.set(k, a); } a.push(x);
  }
  const rows = [];
  for (const card of L.cards) {
    const segK = rule.keysSeg(card.segs, ctx, params);
    if (!segK.size) continue;
    const hits = new Set();
    for (const k of segK) { const a = keyIx.get(k); if (a) for (const x of a) hits.add(x); }
    for (const x of hits) {
      if (card.singles.has(x)) continue;
      if (!rule.accepts(x, card.segs, ctx, params)) continue;
      const bad = MM.offenders(L, x, card);
      const xk = ctx.K(x);
      const tO = xk ? L.veto.termKeys.get(xk) : null;
      const isTerm = !bad.length && tO && tO.size && !acceptedKeys(card.w, ctx).has(xk);
      rows.push({
        lang: L.lang, term: card.w.term, unit: card.unit, meaning: card.w.meaning, typed: x,
        cls: bad.length ? 'התנגשות' : isTerm ? 'מונח' : 'תמים',
        owners: bad.length ? bad : (isTerm ? Array.from(tO) : []),
        V0: V.V0(x, card), V1: V.V1(x, card), V1t: V.V1t(x, card), V2: V2(x, card), V2t: V2(x, card) || V.VT(x, card),
      });
    }
  }
  return rows;
}

/* ===== --residual · מה נשאר **מחוץ** ליקום, ואיזה חלק ממנו מילה אמיתית =====
 * הווטו (בכל גרסה) מגן רק מפני מחרוזת שהיא תשובה של כרטיס אחר. שארית הקבלות אינה
 * נמדדת מבנית · כך כתוב ב-morph-report §"גבול המדידה". אבל היא **כן** ניתנת למדידה
 * חלקית: לקסיקון-הריצה (`out/runtime-lexicon.js`) מסמן מילה אמיתית שאינה צורה קבילה
 * של אף ערך במאגר, וזה בדיוק גודל הסיכון שהווטו לא רואה.
 * ⚠ אפשרי רק לחוקי `kind='gen'` · ל-M1/M2 קבוצת הקבלות אינה סופית.
 */
function residual(cfgKey) {
  const cfg = MM.CONFIGS.concat(MM.PAIR_CONFIGS, MM.CLASS_CONFIGS).find(c => c.key === cfgKey);
  if (!cfg) throw new Error('וריאנט לא מוכר · ' + cfgKey);
  const rule = M.BY_NAME.get(cfg.rule);
  if (rule.kind !== 'gen') return { cfgKey, gen: false };
  const params = Object.assign({}, rule.defaults, cfg.params);
  let LEX = null;
  try { LEX = require(path.join(OUT, 'runtime-lexicon.js')); } catch (e) { LEX = null; }

  const out = { cfgKey, gen: true, total: 0, today: 0, collide: 0, term: 0, rest: 0, realWord: 0, rows: [] };
  for (const lang of LANGS) {
    const L = MM.loadLang(lang);
    const ctx = L.ctx;
    const V = vetoSet(L, cfgKey);
    for (const card of L.cards) {
      for (const x of rule.expand(card.segs, ctx, params)) {
        if (!rule.accepts(x, card.segs, ctx, params)) continue;
        if (card.singles.has(x)) { out.today++; continue; }
        out.total++;
        if (V.V1(x, card)) { out.collide++; continue; }
        if (V.VT(x, card)) { out.term++; continue; }
        out.rest++;
        const real = LEX ? !!LEX.lookup(x, 'he') : null;
        if (real) out.realWord++;
        out.rows.push({ lang, term: card.w.term, unit: card.unit, typed: x, meaning: card.w.meaning, real });
      }
    }
  }
  return out;
}

/* ===== ההרצה ===== */
function main() {
  const t0 = Date.now();
  const ri = process.argv.indexOf('--residual');
  if (ri >= 0 && process.argv[ri + 1]) {
    const r = residual(process.argv[ri + 1]);
    if (!r.gen) { say('⛔ ' + r.cfgKey + ' אינו חוק gen · קבוצת הקבלות אינה סופית ואי אפשר למנות שארית'); process.exit(2); }
    say(`# ${r.cfgKey} · מנייה מלאה`);
    say(`קבלות חדשות שנוצרו ${r.total} · מתוכן התנגשות-פירוש ${r.collide} · מונח תפוס ${r.term} · **שארית ${r.rest}**`);
    say(`מתוך השארית · מילה אמיתית לפי לקסיקון-הריצה: **${r.realWord}** (${(100 * r.realWord / Math.max(1, r.rest)).toFixed(1)}%)`);
    say('');
    for (const x of r.rows.filter(y => y.real).slice(0, 60)) say(`- [${x.lang}] ${x.term} (יח' ${x.unit}) ← "${x.typed}" · פירוש: ${x.meaning}`);
    fs.writeFileSync(path.join(OUT, `morph-residual.${r.cfgKey}.json`), JSON.stringify(r, null, 1));
    say(`\nנכתב אל typo-lab/out/morph-residual.${r.cfgKey}.json`);
    return;
  }
  const di = process.argv.indexOf('--dump');
  if (di >= 0 && process.argv[di + 1]) {
    const key = process.argv[di + 1];
    const cfg = MM.CONFIGS.concat(MM.PAIR_CONFIGS, MM.CLASS_CONFIGS).find(c => c.key === key);
    if (!cfg) { say('⛔ וריאנט לא מוכר · ' + key); process.exit(2); }
    const all = [];
    for (const lang of LANGS) all.push(...dump(MM.loadLang(lang), cfg));
    const surv = all.filter(r => !r.V1t);
    say(`# ${key} · ${cfg.label}`);
    say(`סה"כ קבלות חדשות ${all.length} · שורדות את V1t ${surv.length} · נחסמות ${all.length - surv.length}`);
    say('');
    for (const r of surv.sort((a, b) => (a.lang < b.lang ? -1 : 1) || 0)) {
      say(`- [${r.lang}] ${r.term} (יח' ${r.unit}) ← "${r.typed}" · ${r.cls}${r.owners.length ? ' · ' + r.owners.slice(0, 4).join(' , ') : ''} · פירוש: ${r.meaning}`);
    }
    say('');
    say('--- נחסמות על ידי V1t (מדגם עד 40) ---');
    for (const r of all.filter(x => x.V1t).slice(0, 40)) {
      say(`- [${r.lang}] ${r.term} ← "${r.typed}" · ${r.cls} · ${r.owners.slice(0, 4).join(' , ')}`);
    }
    fs.writeFileSync(path.join(OUT, `morph-dump.${key}.json`), JSON.stringify(all, null, 1));
    say(`\nנכתב אל typo-lab/out/morph-dump.${key}.json`);
    return;
  }
  const L = { he: MM.loadLang('he'), en: MM.loadLang('en') };
  const resolved = MM.resolveCases(L.he);

  const oi = process.argv.indexOf('--only');
  const ONLY = oi >= 0 && process.argv[oi + 1] ? new Set(process.argv[oi + 1].split(',')) : null;
  const CONFIGS = MM.CONFIGS.concat(MM.PAIR_CONFIGS, MM.CLASS_CONFIGS).filter(c => !ONLY || ONLY.has(c.key));
  const rows = [];
  for (const cfg of CONFIGS) {
    const per = {};
    for (const lang of LANGS) per[lang] = measure(L[lang], cfg);
    const ben = benefit(L.he, cfg, resolved);
    const agg = {};
    for (const v of ['VNONE', 'V0', 'V1', 'V1t', 'V2', 'V2t']) {
      agg[v] = {
        same: LANGS.reduce((n, l) => n + per[l].res[v].same, 0),
        other: LANGS.reduce((n, l) => n + per[l].res[v].other, 0),
        termSame: LANGS.reduce((n, l) => n + per[l].res[v].termSame, 0),
        termOther: LANGS.reduce((n, l) => n + per[l].res[v].termOther, 0),
        benign: LANGS.reduce((n, l) => n + per[l].res[v].benign, 0),
        kept: LANGS.reduce((n, l) => n + per[l].res[v].kept, 0),
        solved: ben[v].filter(n => OPEN.includes(n)),
        exSame: LANGS.flatMap(l => per[l].res[v].exSame),
        exOther: LANGS.flatMap(l => per[l].res[v].exOther),
        exTerm: LANGS.flatMap(l => per[l].res[v].exTerm),
      };
    }
    const newAcc = LANGS.reduce((n, l) => n + per[l].newAccepts, 0);
    const regress = LANGS.reduce((n, l) => n + per[l].regress, 0);
    const mismatch = LANGS.reduce((n, l) => n + per[l].mismatch, 0);
    rows.push({ cfg, agg, ben, newAcc, regress, mismatch, per });
    say(`${cfg.key.padEnd(12)} newAcc=${String(newAcc).padStart(6)} ` +
      ['V0', 'V1', 'V1t', 'V2', 'V2t'].map(v => `${v}:same=${agg[v].same},other=${agg[v].other},term=${agg[v].termSame}/${agg[v].termOther},פותר=[${agg[v].solved.join(',')}]`).join('  '));
  }

  /* ===== שן · V0 חייב לשחזר את morph-report.md ===== */
  const teeth = verifyAgainstReport(rows);
  /* ...ושההשוואה מסוגלת להאדים · ארבע הזזות, כל אחת בעמודה אחרת. */
  teeth.selftest = [
    ['newAcc', k => k === 'P-act-agent'], ['same', k => k === 'M3-cons-sr'],
    ['other', k => k === 'M1-s3'], ['gSame', k => k === 'P-act-agent'], ['gOther', k => k === 'M3-cons'],
  ].map(([col, pick]) => {
    const r = verifyAgainstReport(rows, (key, w) => { if (pick(key)) w[col] += 1; return w; });
    return { col, red: !r.ok, hits: r.bad.length };
  });
  const blind = teeth.selftest.filter(x => !x.red).map(x => x.col);
  if (blind.length) { say('⛔ ההשוואה עיוורת בעמודות ' + blind.join(', ') + ' · אינה שער'); process.exit(1); }
  say('שיניים · ההשוואה מאדימה בכל ' + teeth.selftest.length + ' העמודות שנוסו');

  /* ===== H2 · שוליים · לכל מקרה פתוח שנפתר, המרחק לכרטיס הזר הקרוב ביותר ===== */
  const margins = [];
  const seen = new Set();
  for (const r of rows) for (const n of r.ben.raw) {
    if (!OPEN.includes(n) || seen.has(n)) continue;
    seen.add(n);
    const { c, card } = resolved.find(x => x.c.n === n);
    const a = L.he.ctx.norm(c.typed);
    const V = vetoSet(L.he, r.cfg.key);
    const nb = nearestOther(L.he, a, card, V.allowOf(card));
    margins.push({ n, term: c.term, typed: c.typed, norm: a, d: nb.d, who: nb.who });
  }

  const outJson = { generated: new Date().toISOString(), open: OPEN, teeth, margins, rows: rows.map(r => ({ key: r.cfg.key, label: r.cfg.label, newAcc: r.newAcc, regress: r.regress, mismatch: r.mismatch, agg: r.agg, ben: { raw: r.ben.raw, why: r.ben.why } })) };
  fs.writeFileSync(path.join(OUT, 'morph-veto-search.json'), JSON.stringify(outJson, null, 1));
  say('');
  say(`נכתב אל typo-lab/out/morph-veto-search.json · ${((Date.now() - t0) / 1000).toFixed(1)} שניות`);
  if (!teeth.ok) { say('⛔ השן נפלה · V0 אינו משחזר את morph-report.md · אין לסמוך על שום מספר כאן'); process.exit(1); }
  say('✅ השן עברה · V0 משחזר את morph-report.md בכל ' + teeth.checked + ' הוריאנטים');
}

/* השן · הטבלה של morph-report.md, עמודות "התנגשות ביחידה" ו-"נותר אחרי הווטו".
   `tamper` קיים כדי להוכיח שההשוואה **מסוגלת** להאדים · שער שלא הודגם אדום אינו עדות. */
function verifyAgainstReport(rows, tamper) {
  const p = path.join(OUT, 'morph-report.md');
  if (!fs.existsSync(p)) return { ok: false, checked: 0, note: 'morph-report.md חסר' };
  const txt = fs.readFileSync(p, 'utf8');
  const want = new Map();
  for (const line of txt.split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|[^|]*\|[^|]*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\+\s*(\d+)\s*\|/);
    if (m) want.set(m[1], { newAcc: +m[2], same: +m[3], other: +m[4], gSame: +m[5], gOther: +m[6] });
  }
  const bad = [];
  let checked = 0;
  for (const r of rows) {
    let w = want.get(r.cfg.key);
    if (!w) continue;
    if (tamper) w = tamper(r.cfg.key, Object.assign({}, w));
    checked++;
    if (r.newAcc !== w.newAcc) bad.push(`${r.cfg.key}: newAccepts ${r.newAcc} ≠ ${w.newAcc}`);
    if (r.agg.VNONE.same !== w.same) bad.push(`${r.cfg.key}: התנגשות-ביחידה גולמי ${r.agg.VNONE.same} ≠ ${w.same}`);
    if (r.agg.VNONE.other !== w.other) bad.push(`${r.cfg.key}: ביחידה-אחרת גולמי ${r.agg.VNONE.other} ≠ ${w.other}`);
    if (r.agg.V0.same !== w.gSame) bad.push(`${r.cfg.key}: שורד-ווטו ביחידה ${r.agg.V0.same} ≠ ${w.gSame}`);
    if (r.agg.V0.other !== w.gOther) bad.push(`${r.cfg.key}: שורד-ווטו אחר ${r.agg.V0.other} ≠ ${w.gOther}`);
  }
  return { ok: !bad.length, checked, bad };
}

module.exports = { measure, benefit, vetoSet, buildSkelOwners, nearestOther, OPEN };
if (require.main === module) main();
