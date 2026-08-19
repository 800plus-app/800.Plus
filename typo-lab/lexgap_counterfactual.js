'use strict';
/* ⭐ כמה מ-6.3 הנקודות ניתנות בכלל להחזרה · typo-lab/lexgap_counterfactual.js
 *
 *   node --max-old-space-size=8192 typo-lab/lexgap_counterfactual.js
 *   node typo-lab/lexgap_counterfactual.js --selftest
 *
 * ===== השאלה =====
 *
 * ‏`en-word` נשלח ב-74.63% (פרוטוקול A · האילוץ כולל את שליליות מחלקת `zngry`)
 * ומגיע ל-~81% בלי המחלקה. ההשערה בתדריך: חלק מהמחרוזות במחלקה הן **מילים
 * אנגליות אמיתיות** שהפרדיקט אינו מזהה, ולכן הן נכנסות לאילוץ שלא לצורך; לקסיקון
 * שיכיר אותן יוציא אותן מהאילוץ ויחזיר נקודות.
 *
 * ⭐ ההשערה הזאת ניתנת לחסימה **מלמעלה בלי לדעת אף מילה**: נסיר מהאילוץ את ה-k
 * השליליות ה**כי כובלות** — אלה שהעלות שלהן הכי קרובה לסף, כלומר בדיוק אלה
 * שמחזיקות את הסף למטה — ונמדוד כמה recall חוזר. אם הסרת ה-k הכובלות ביותר אינה
 * מחזירה כלום, אז **שום** לקסיקון לא יחזיר כלום, ולא משנה אילו מילים ימצא בו.
 *
 * זה חסם עליון ולא הערכה: מילה אמיתית שנמצא בפועל יכולה, במקרה הטוב, להיות אחת
 * מה-k הכובלות. היא אינה יכולה להיות טובה מהן.
 */

const fs = require('fs');
const path = require('path');
const F = require('./fit.js');

const OUT = path.join(__dirname, 'out');
const say = s => process.stdout.write(s + '\n');
const pct = x => (100 * x).toFixed(2) + '%';

/* ===== כמה כל שלילית "כובלת" · המרווח שלה מהסף במודל נתון =====
   מרווח קטן = היא זו שמחזיקה את הסף למטה. מרווח גדול = הסרתה לא תזיז דבר. */
function slackOf(S, i, M) {
  const R = F.regimeOf(S.gap[i], M.cuts);
  const g = M.per[R];
  let best = Infinity;
  const hi = S.off[i + 1];
  for (let p = S.off[i]; p < hi; p++) {
    const th = M.t[R * F.NBAND + S.pBand[p]];
    if (!(th > 0)) continue;
    const c = F.pairCost(S, p, g.wv, g.aFirst, g.aShare) - th;
    if (c < best) best = c;
  }
  return best;
}

function main() {
  const set = 'en-word';
  say('טוען מטמונים · ' + set);
  const recs = F.loadCache(set);
  const zrecs = F.loadZngry();
  if (!zrecs) throw new Error('אין מטמון zngry · בלעדיו אין מה למדוד');
  const nMain = recs.length;
  const S = F.pack(recs.concat(zrecs));
  const sp = F.splits(S);
  say(`${S.N} שורות · zngry ${sp.zngry.length} · אימון ${sp.train.length} · holdout ${sp.holdout.length} · חוצות ${sp.cross.length}`);

  const shipped = F.fromAppParams(F.shippedParams(set));
  const seedW = shipped.regimes.map(g => g.W);
  const opts = { cuts: [2], seedW };

  const negBase = sp.train.concat(sp.holdout, sp.cross).filter(i => S.isAcc[i] !== 1);
  const zNeg = sp.zngry.filter(i => S.isAcc[i] !== 1);

  const fitWith = (dropSet, tag) => {
    const neg = dropSet && dropSet.size
      ? negBase.concat(zNeg.filter(i => !dropSet.has(i)))
      : negBase.concat(zNeg);
    const m = F.clampModel(S, sp.all, F.fitStudent(S, neg, sp.trainPos, opts));
    const r = F.reportModel(S, sp, tag, m);
    return { m, r };
  };

  /* ===== 1 · הבסיס · האילוץ המלא ===== */
  const base = fitWith(null, 'A · האילוץ המלא · מה שנשלח');
  say(`\nA · האילוץ המלא          holdout ${pct(base.r.holdoutRecall)} · FA h/t/x ${base.r.holdoutFA}/${base.r.trainFA}/${base.r.crossFA} · zngryFA ${base.r.zngryFA}`);

  /* ===== 2 · התקרה · המחלקה כולה מחוץ לאילוץ ===== */
  const ceil = fitWith(new Set(zNeg), 'תקרה · בלי מחלקת zngry כלל');
  say(`תקרה · בלי המחלקה כלל   holdout ${pct(ceil.r.holdoutRecall)} · zngryFA ${ceil.r.zngryFA}`);
  const room = ceil.r.holdoutRecall - base.r.holdoutRecall;
  say(`⭐ כל המרחב שעל הפרק · ${(100 * room).toFixed(2)} נקודות`);

  /* ===== 3 · העקומה · הסרת ה-k הכובלות ביותר ===== */
  /* ‏`slackOf` עובד על צורת ה-**coef** (t/per/cuts) ולא על צורת המודל · אותה המרה
     ש-`decideModel` עושה. בלי זה `M.per` undefined והדירוג שקט-שגוי. */
  const baseCoef = F.modelCoef(base.m);
  const ranked = zNeg.map(i => ({ i, s: slackOf(S, i, baseCoef) }))
    .filter(x => isFinite(x.s)).sort((a, b) => a.s - b.s).map(x => x.i);
  say(`\nשליליות zngry עם מרווח סופי · ${ranked.length} מתוך ${zNeg.length}`);
  say('\n⭐ החסם העליון · אם הלקסיקון היה מכיר בדיוק את ה-k הכובלות ביותר');
  say('  k         · חלק מהמחלקה · holdout · מהמרחב');
  const rows = [];
  for (const frac of [0.001, 0.005, 0.01, 0.02, 0.05, 0.10, 0.25]) {
    const k = Math.round(frac * zNeg.length);
    const drop = new Set(ranked.slice(0, k));
    const f = fitWith(drop, `k=${k}`);
    const share = room > 1e-9 ? (f.r.holdoutRecall - base.r.holdoutRecall) / room : 0;
    rows.push({ frac, k, recall: f.r.holdoutRecall, holdoutFA: f.r.holdoutFA, share });
    say(`  ${(100 * frac).toFixed(1).padStart(5)}%  · ${String(k).padStart(7)} · ${pct(f.r.holdoutRecall).padStart(7)} · ${(100 * share).toFixed(1).padStart(5)}%  · FA ${f.r.holdoutFA}`);
  }

  fs.writeFileSync(path.join(OUT, 'lexgap-counterfactual.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    note: 'חסם עליון · הוסרו השליליות הכובלות ביותר, לא מילים אמיתיות. שום לקסיקון אינו יכול לעשות טוב יותר.',
    set, nMain, nZngry: zNeg.length,
    baseline: base.r.holdoutRecall, ceiling: ceil.r.holdoutRecall, room,
    curve: rows,
  }, null, 1));
  say('\nנכתב · out/lexgap-counterfactual.json');
  return { base, ceil, rows };
}

function selftest() {
  let fail = 0;
  const t = (n, c, e) => { say((c ? '✅ ' : '⛔ ') + n + (e ? ' · ' + e : '')); if (!c) fail++; };
  t('fit.js מייצא את מה שנדרש',
    ['pack', 'splits', 'fitStudent', 'clampModel', 'reportModel', 'pairCost', 'regimeOf', 'loadCache', 'loadZngry', 'fromAppParams', 'shippedParams', 'NBAND']
      .every(k => F[k] !== undefined));
  /* שן · slackOf חייב להיות מונוטוני בסף. מודל עם סף גבוה יותר נותן מרווח קטן יותר. */
  const S = { gap: [0], off: [0, 1], pBand: [3], pShare: [0], pFirst: [0], pCnt: new Array(F.NOP || 8).fill(0) };
  S.pCnt[0] = 1;
  const mk = th => ({ cuts: [2], per: [{ wv: new Array(8).fill(1), aFirst: 0, aShare: 0 }, { wv: new Array(8).fill(1), aFirst: 0, aShare: 0 }], t: (() => { const a = new Array(2 * F.NBAND).fill(0); a[3] = th; return a; })() });
  const co = m => ({ cuts: m.cuts, per: m.per, t: m.t });
  const lo = slackOf(S, 0, co(mk(0.5))), hi = slackOf(S, 0, co(mk(2.0)));
  t('slackOf יורד כשהסף עולה', hi < lo, `סף 0.5 → ${lo} · סף 2.0 → ${hi}`);
  t('slackOf מחזיר Infinity כשאין סף חי', !isFinite(slackOf(S, 0, mk(0))));
  say(fail ? `\n⛔ ${fail} כשלים` : '\n✅ כל השיניים');
  process.exit(fail ? 1 : 0);
}

if (require.main === module) { if (process.argv.includes('--selftest')) selftest(); else main(); }
module.exports = { main, slackOf };
