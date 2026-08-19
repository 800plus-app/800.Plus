/* גיליון הבחינה של המדגם — הפריטים עם פסק הדין של כל שער על כל אחד מהם.
 *
 *   node sentence-completion/build_sample_review.js
 *
 * מאחד ארבעה מקורות: sample.key.tsv (מה נדגם ומה המפתח) · sentences-en-v3.js (הפריט
 * המלא) · runs/s-*.txt (מה הבוטים ענו) · הכרעת כיסוי ההקשר.
 *
 * למה גיליון ולא טבלה בטרמינל: המדידה אומרת "8 נפלו", והשאלה שחגי צריך לענות עליה
 * היא **אם הוא מסכים** — וזה דורש לראות את המשפט, את ארבעת המסיחים, את מה שהבוטים
 * העדיפו, ואת ההסבר. פסק דין בלי הפריט לידו אינו בר-שיפוט.
 */
const fs = require('fs'), path = require('path');
global.window = {};
require(path.join(__dirname, 'sentences-en-v3.js'));
const SENT = global.window.SENT_EN;

const rd = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const key = rd('sample.key.tsv').trim().split('\n').slice(1).map(l => l.split('\t'));

/* אותה לוגיקת התאמה של score_cloze.js — נטיות, כתיב בריטי, פעלים חריגים. */
const norm = s => String(s).toLowerCase().trim().replace(/[^a-z+ ]/g, '');
const brit = w => w.replace(/ise$/, 'ize').replace(/yse$/, 'yze');
const IRREG = { withdrew: 'withdraw', withdrawn: 'withdraw', broke: 'break', broken: 'break', chose: 'choose' };
const stem = w => { const b = brit(IRREG[w] || w); return b.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, ''); };
const same = (a, b) => { a = norm(a); b = norm(b); return a === b || (a.length > 3 && b.length > 3 && stem(a) === stem(b)); };

function parseRun(file) {
  const m = new Map();
  rd(file).split('\n').forEach(line => {
    const g = line.match(/^\s*(\d+)\s*:\s*(.*)$/); if (!g) return;
    let rest = g[2].trim(), rating = null;
    const r = rest.match(/^(FORCED|LOOSE|OPEN)\s*\|\s*(.*)$/i);
    if (r) { rating = r[1].toUpperCase(); rest = r[2]; }
    m.set(+g[1], { rating, cands: rest.split(',').map(s => s.trim()).filter(Boolean) });
  });
  return m;
}
const cl1 = parseRun('runs/s-cloze-1-natural.txt');
const cl2 = parseRun('runs/s-cloze-2-judge.txt');
const MC = '1:B 2:B 3:A 4:B 5:A 6:B 7:A 8:A 9:B 10:B 11:C 12:B 13:A 14:B 15:D 16:B 17:D 18:D 19:C 20:D 21:A 22:B 23:A 24:B 25:A 26:A 27:A 28:C 29:D 30:B 31:C 32:A 33:C 34:C 35:D 36:C 37:C 38:C 39:D 40:A 41:D 42:C 43:A 44:A 45:C 46:C 47:A 48:B 49:C 50:C 51:A 52:C 53:D 54:D 55:A 56:C 57:B 58:C 59:D';
const mc = new Map(MC.split(/\s+/).map(t => { const [q, a] = t.split(':'); return [+q, a]; }));

/* איתור הפריט המלא לפי src, כי המדגם מחזיק מזהה ולא את הפריט. */
const bySrc = new Map();
for (const [b, arr] of Object.entries(SENT)) arr.forEach(it => bySrc.set(it.src, { ...it, band: b }));

const K_HE = { contrast: 'ניגוד', cause: 'סיבה ותוצאה', addition: 'הוספה', condition: 'תנאי וזמן', example: 'דוגמה' };
const rows = [];
for (const [q, band, src, ans, words, blanks] of key) {
  const it = bySrc.get(src); if (!it) continue;
  const target = words.split('|');
  const pos = [cl1, cl2].map(run => {
    const e = run.get(+q); if (!e) return { pos: -1, first: '—', rating: null };
    let p = -1;
    e.cands.forEach((c, i) => {
      const parts = norm(c).split('+').map(x => x.trim());
      const hit = +blanks === 1 ? same(parts[0], target[0])
        : parts.length === 2 && target.every((w, j) => same(parts[j] || '', w));
      if (hit && p === -1) p = i;
    });
    return { pos: p, first: e.cands[0] || '—', rating: e.rating };
  });
  const hits = pos.filter(p => p.pos >= 0);
  const top1 = pos.filter(p => p.pos === 0).length;
  const verdict = top1 > 1 ? 'TOP1' : hits.length ? 'TOP3' : 'MISS';
  rows.push({
    q: +q, band, src, it, target, blanks: +blanks, ans,
    mcOk: mc.get(+q) === ans, verdict,
    rating: pos.map(p => p.rating).find(Boolean) || null,
    prefer: pos.map(p => p.first),
  });
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BI = { 'בסיס': 0, 'בינוני': 1, 'מתקדם': 2, 'אקדמי': 3 };
const stat = {
  n: rows.length,
  top1: rows.filter(r => r.verdict === 'TOP1').length,
  top3: rows.filter(r => r.verdict === 'TOP3').length,
  miss: rows.filter(r => r.verdict === 'MISS').length,
  loose: rows.filter(r => r.rating === 'LOOSE').length,
  mc: rows.filter(r => r.mcOk).length,
};

const html = `<meta charset="utf-8">
<title>השלמת משפטים · מדגם ${stat.n} מתוך 204 · פסק דין לפי שער</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@font-face{font-family:FRL;src:url('../fonts/frank-ruhl-libre-hebrew.woff2') format('woff2');unicode-range:U+0590-05FF,U+FB1D-FB4F;font-display:swap}
@font-face{font-family:FRL;src:url('../fonts/frank-ruhl-libre-latin.woff2') format('woff2');unicode-range:U+0000-00FF;font-display:swap}
:root{--paper:#f4f1ea;--ink:#1a1714;--ink2:#5c554c;--rule:#d5cec1;--red:#a8332a;--green:#2f5d43;--amber:#8a6a1f;
--b0:#4a6fa5;--b1:#2f7d5f;--b2:#9a6a2a;--b3:#8c3d5e}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:FRL,Georgia,serif;direction:rtl;line-height:1.65;
background-image:radial-gradient(circle at 12% 6%,rgba(168,51,42,.035),transparent 42%),radial-gradient(circle at 90% 94%,rgba(47,93,67,.04),transparent 45%);background-attachment:fixed}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:99;opacity:.3;
background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E")}
.wrap{max-width:960px;margin:0 auto;padding:clamp(22px,5vw,64px) clamp(16px,4vw,40px) 90px}
header{border-bottom:2.5px solid var(--ink);padding-bottom:13px;display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap;animation:rise .7s cubic-bezier(.2,.7,.2,1) both}
h1{font-size:clamp(24px,4vw,38px);margin:0;font-weight:700;letter-spacing:-.02em;line-height:1.12}
h1 small{display:block;font-size:.44em;font-weight:400;color:var(--ink2);letter-spacing:.15em;margin-bottom:7px}
.stamp{font-size:12px;letter-spacing:.12em;border:1.5px solid var(--amber);color:var(--amber);padding:7px 12px;transform:rotate(-1.4deg);font-weight:700;white-space:nowrap}
.meta{display:flex;gap:22px;flex-wrap:wrap;font-size:13px;color:var(--ink2);border-bottom:1px solid var(--rule);padding:10px 0 20px;margin-bottom:26px;animation:rise .7s .05s cubic-bezier(.2,.7,.2,1) both}
.meta b{color:var(--ink)}
.warn{border-right:3px solid var(--amber);background:rgba(138,106,31,.07);padding:11px 15px;font-size:14px;margin-bottom:26px}
.bar{display:flex;gap:0;flex-wrap:wrap;border-bottom:1px solid var(--rule);margin-bottom:28px;animation:rise .7s .1s cubic-bezier(.2,.7,.2,1) both}
.bar button{background:none;border:0;border-bottom:2.5px solid transparent;font-family:inherit;font-size:15px;color:var(--ink2);padding:9px 16px;cursor:pointer;margin-bottom:-1px;transition:color .18s,border-color .18s}
.bar button[aria-pressed=true]{color:var(--ink);border-bottom-color:var(--red);font-weight:700}
@media(hover:hover){.bar button:hover{color:var(--ink)}}
.item{border:1px solid var(--rule);background:rgba(255,255,255,.44);padding:20px 22px 18px;margin-bottom:14px;position:relative;animation:rise .5s cubic-bezier(.2,.7,.2,1) both}
.item::before{content:attr(data-id);position:absolute;top:-1px;right:-1px;background:var(--ink);color:var(--paper);font-size:10.5px;padding:4px 9px;letter-spacing:.05em;font-weight:700}
.item.miss{border-color:var(--red);border-width:2px}
.item.t3{border-right:3px solid var(--amber)}
.sent{direction:ltr;text-align:left;font-size:clamp(15.5px,2.1vw,18px);line-height:1.75;margin:4px 0 15px;padding-right:52px}
.bl{border-bottom:2px solid var(--red);padding:0 24px;margin:0 3px}
.fill{color:var(--green);font-weight:700;border-bottom:2px solid var(--green);padding:0 4px}
.fill.bad{color:var(--red);border-color:var(--red);text-decoration:line-through}
.opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:7px}
.opt{direction:ltr;text-align:left;font-family:inherit;font-size:14.5px;background:rgba(255,255,255,.7);border:1px solid var(--rule);padding:8px 12px;cursor:pointer;transition:border-color .16s,background .16s,transform .16s}
@media(hover:hover) and (pointer:fine){.opt:hover:not(.done){border-color:var(--ink);transform:translateY(-1px)}}
.opt.ok{border-color:var(--green);border-width:2px;background:rgba(47,93,67,.1)}
.opt.no{border-color:var(--red);background:rgba(168,51,42,.07);opacity:.7}
.opt.done{cursor:default}
.exp{border-right:2.5px solid var(--amber);padding:9px 13px;margin-top:13px;font-size:14px;color:var(--ink2);background:rgba(138,106,31,.05)}
.exp b{color:var(--ink)}
.hid{display:none}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:12px;font-size:11.5px;letter-spacing:.04em}
.c{border:1px solid var(--rule);padding:3px 9px;color:var(--ink2);white-space:nowrap}
.c.b0{border-color:var(--b0);color:var(--b0)}.c.b1{border-color:var(--b1);color:var(--b1)}
.c.b2{border-color:var(--b2);color:var(--b2)}.c.b3{border-color:var(--b3);color:var(--b3)}
.c.g{border-color:var(--green);color:var(--green);font-weight:700}
.c.r{border-color:var(--red);color:var(--red);font-weight:700}
.c.a{border-color:var(--amber);color:var(--amber);font-weight:700}
.pref{direction:ltr;text-align:left;font-size:13px;color:var(--red);margin-top:9px;padding:7px 11px;background:rgba(168,51,42,.06);border-right:2.5px solid var(--red)}
.note{font-size:13.5px;color:var(--ink2);border-top:1px solid var(--rule);margin-top:40px;padding-top:16px}
.note b{color:var(--ink)}.note ul{padding-right:19px;margin:7px 0}
@keyframes rise{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:none}}
</style>
<div class="wrap">
<header>
  <h1><small>800+ · אנגלית · מנה 2 · פסק דין לפי שער</small>מדגם ${stat.n} מתוך 204</h1>
  <div class="stamp">${(stat.n / 204 * 100).toFixed(0)}% מהקורפוס</div>
</header>
<div class="meta">
  <span>רב-ברירה <b>${stat.mc}/${stat.n}</b></span>
  <span>כיסוי הקשר <b>${stat.top1}</b> עברו · <b>${stat.top3}</b> גבוליים · <b class="miss">${stat.miss}</b> נפסלו</span>
  <span>הקשר רופף <b>${stat.loose}</b></span>
  <span>נאותות <b>${stat.n}/${stat.n}</b> נקי</span>
</div>
<div class="warn">⚠ <b>זה מדגם, לא הקורפוס.</b> ${204 - stat.n} פריטים לא נדגמו, ולכן <b>לא נבדקו</b> בשערי הבוטים. מה שכתוב כאן הוא הערכה לאיכות הקורפוס, ואינו תעודה לכל פריט בו.</div>

<div class="bar">
  <button aria-pressed="true" data-f="all">הכול · ${stat.n}</button>
  <button aria-pressed="false" data-f="miss">⛔ נפסלו · ${stat.miss}</button>
  <button aria-pressed="false" data-f="t3">⚠ גבוליים · ${stat.top3}</button>
  <button aria-pressed="false" data-f="loose">הקשר רופף · ${stat.loose}</button>
  <button aria-pressed="false" data-f="ok">✅ נקיים · ${rows.filter(r => r.verdict === 'TOP1' && r.rating !== 'LOOSE').length}</button>
</div>

${rows.map(r => {
  const it = r.it, bi = BI[r.band];
  const parts = it.s.split('___');
  const sent = parts.map((p, j) => esc(p) + (j < parts.length - 1 ? `<span class="bl" data-b="${j}"></span>` : '')).join('');
  const opts = it.o.map((o, j) => `<button class="opt" data-i="${j}">${esc([].concat(o).join(' … '))}</button>`).join('');
  const cls = [r.verdict === 'MISS' ? 'miss' : '', r.verdict === 'TOP3' ? 't3' : '',
    r.rating === 'LOOSE' ? 'loose' : '', r.verdict === 'TOP1' && r.rating !== 'LOOSE' ? 'ok' : ''].filter(Boolean).join(' ');
  const vch = r.verdict === 'TOP1' ? '<span class="c g">כיסוי הקשר: עבר</span>'
    : r.verdict === 'TOP3' ? '<span class="c a">כיסוי הקשר: גבולי</span>'
    : '<span class="c r">כיסוי הקשר: נפסל</span>';
  return `<div class="item ${cls}" data-id="${esc(r.band)} · ${esc(r.src)}" data-a="${it.a}" data-o='${esc(JSON.stringify(it.o))}'>
  <div class="sent">${sent}</div>
  <div class="opts">${opts}</div>
  <div class="exp hid"><b>${K_HE[it.k] || it.k}</b> · ${esc((it.w || []).join(' · '))} — ${esc(it.e)}</div>
  ${r.verdict !== 'TOP1' ? `<div class="pref">הפותרים העדיפו: <b>${esc(r.prefer.join(' / '))}</b> &nbsp;·&nbsp; המפתח: ${esc(r.target.join('+'))}</div>` : ''}
  <div class="chips">
    <span class="c b${bi}">${esc(r.band)}</span>
    ${vch}
    <span class="c ${r.mcOk ? 'g' : 'r'}">רב-ברירה: ${r.mcOk ? 'נכון' : 'שגוי'}</span>
    ${r.rating ? `<span class="c ${r.rating === 'FORCED' ? 'g' : 'a'}">הקשר ${r.rating === 'FORCED' ? 'מהודק' : 'רופף'}</span>` : ''}
    ${r.blanks === 2 ? '<span class="c r">שני חסרים</span>' : ''}
  </div></div>`;
}).join('')}

<div class="note">
<b>מה כל שער מודד, ומה הוא לא.</b>
<ul>
<li><b>רב-ברירה</b> ⟵ ${stat.mc}/${stat.n}. ⚠ <b>רווי, ולכן אינו מודד קושי</b> — הוא מוכיח רק שהפריט חד-משמעי. גם גרסה שבורה קיבלה כאן 100%.</li>
<li><b>כיסוי הקשר</b> ⟵ המדידה שקובעת. הפותר מקבל את המשפט <b>בלי האפשרויות</b> וכותב מילה. אם הוא לא מגיע למפתח, ההקשר אינו מכריע אותו. זה מבטל אלימינציה לגמרי.</li>
<li><b>נאותות אדוורסרית</b> ⟵ ${stat.n}/${stat.n} נקי. שואל אם מסיח קרוב נפסל ברמז מפורש או בצירוף קנוני, או שהוא סתם "קצת לא".</li>
<li>⚠ <b>מה שאף שער לא מודד: קושי אמיתי.</b> בוט חזק פותר את כל הרצועות, ולכן העקומה שטוחה. קושי נמדד רק על משתמשים באפליקציה.</li>
<li>⚠ <b>שניים מהנפסלים הם באשמתי</b> ולא של הכותבים: הוריתי למַפְתֵּח מחדש שני פריטים כדי לפתור כפילות מפתח, והתיקון דחף אותם למילה פחות טבעית.</li>
<li><b>הדפוס שחוזר בכל הנפסלים:</b> ההקשר בוחר את המילה <b>השכיחה</b>. stop &gt; halt · relieve &gt; alleviate · abandon &gt; concede · require &gt; oblige.</li>
</ul>
</div>
</div>
<script>
document.querySelectorAll('.bar button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.bar button').forEach(x=>x.setAttribute('aria-pressed',x===b));
  const f=b.dataset.f;
  document.querySelectorAll('.item').forEach(it=>{
    it.style.display = (f==='all'||it.classList.contains(f)) ? '' : 'none';
  });
});
document.querySelectorAll('.item').forEach(item=>{
  const a=+item.dataset.a, o=JSON.parse(item.dataset.o), opts=[...item.querySelectorAll('.opt')];
  opts.forEach(b=>b.onclick=()=>{
    if(b.classList.contains('done'))return;
    const pick=+b.dataset.i, right=pick===a;
    opts.forEach(x=>{x.classList.add('done'); if(+x.dataset.i===a)x.classList.add('ok'); else if(x===b)x.classList.add('no');});
    const words=[].concat(o[pick]);
    item.querySelectorAll('.bl').forEach((bl,j)=>{bl.outerHTML='<span class="fill'+(right?'':' bad')+'">'+words[j]+'</span>';});
    item.querySelector('.exp').classList.remove('hid');
  });
});
</script>`;

const out = path.join(__dirname, 'sample-review.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`נכתב: ${out}  (${(html.length / 1024).toFixed(1)}KB · ${rows.length} פריטים)`);
console.log(`עברו ${stat.top1} · גבוליים ${stat.top3} · נפסלו ${stat.miss} · רופפים ${stat.loose} · רב-ברירה ${stat.mc}/${stat.n}`);
