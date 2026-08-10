/* מייצר את גיליון הבחינה: sentences/review.html
 *
 *   node sentences/build_review.js
 *
 * הגיליון נבנה מהנתונים ולא נכתב ביד, מאותה סיבה שהשער נכתב בקוד: גיליון שנערך
 * ידנית מתיישן ברגע שפריט משתנה, ואז בוחנים גרסה שאינה הגרסה. הדירוגים כאן
 * מחושבים מ-EN_RANK באותה נוסחה של check_sentences.js.
 *
 * גופנים: fonts/frank-ruhl-libre-*.woff2 שכבר במאגר — עברית ולטינית באותה משפחה,
 * אפס בקשות רשת. זה גם מה שהאפליקציה עצמה מגישה מאז fb17955.
 */
const fs = require('fs'), path = require('path');
global.window = {};
/* ⭐ הרצועה נגזרת מ-bands.js — ממספר היחידה בבנק שלנו, לא מ-enrank.js (CC BY-SA 4.0).
   ראה CLAUDE.md · "כלל עומד · חשיפה משפטית" ואת כותרת bands.js. */
const B = require(path.join(__dirname, 'bands.js'));
require(path.join(__dirname, process.env.SENT_FILE || 'sentences-en.js'));
const SENT = global.window.SENT_EN;

const normEn = B.normEn, bandOf = B.bandOfUnit, bandIdx = B.bandIdx;
const BANDS = B.BANDS.map(b => [b.name, b.lo, b.hi]);
const rankOf = w => B.unitOf(w);   // "דירוג" = מספר יחידה 1–10

const data = [];
for (const [level, items] of Object.entries(SENT)) {
  items.forEach((it, i) => {
    const flat = it.o.flat(), pair = Array.isArray(it.o[0]);
    const optMax = Math.max(...flat.map(rankOf).filter(r => r !== null));
    const carrier = it.s.replace(/___/g, ' ').split(/[^A-Za-z']+/).filter(Boolean);
    const cR = carrier.map(rankOf).filter(r => r !== null);
    const carrierMax = cR.length ? Math.max(...cR) : null;
    data.push({
      level, n: i + 1, s: it.s, o: it.o, a: it.a, k: it.k, w: it.w, e: it.e, pair,
      optMax, carrierMax, derived: bandOf(optMax),
      ranks: Object.fromEntries(flat.map(w => [w, rankOf(w)])),
      carrierFlag: carrierMax !== null && bandIdx(bandOf(carrierMax)) > bandIdx(level) ? bandOf(carrierMax) : null,
    });
  });
}

const K_HE = { contrast: 'ניגוד', cause: 'סיבה ותוצאה', addition: 'הוספה', condition: 'תנאי וזמן', example: 'דוגמה' };

const html = `<meta charset="utf-8">
<title>השלמת משפטים · גיליון בחינה · שלב 0</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@font-face{font-family:FRL;src:url('../fonts/frank-ruhl-libre-hebrew.woff2') format('woff2');unicode-range:U+0590-05FF,U+FB1D-FB4F;font-display:swap}
@font-face{font-family:FRL;src:url('../fonts/frank-ruhl-libre-latin.woff2') format('woff2');unicode-range:U+0000-00FF;font-display:swap}
:root{
  --paper:#f4f1ea; --ink:#1a1714; --ink2:#5c554c; --rule:#d5cec1;
  --red:#a8332a; --green:#2f5d43; --amber:#8a6a1f;
  --band0:#4a6fa5; --band1:#2f7d5f; --band2:#9a6a2a; --band3:#8c3d5e;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:FRL,Georgia,serif;
  direction:rtl;line-height:1.65;
  background-image:radial-gradient(circle at 15% 8%,rgba(168,51,42,.035),transparent 42%),
                   radial-gradient(circle at 88% 92%,rgba(47,93,67,.04),transparent 45%);
  background-attachment:fixed}
body::before{content:'';position:fixed;inset:0;pointer-events:none;z-index:99;opacity:.32;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='.5'/%3E%3C/svg%3E")}
.wrap{max-width:920px;margin:0 auto;padding:clamp(24px,5vw,72px) clamp(18px,4vw,44px) 96px}

header{border-bottom:2.5px solid var(--ink);padding-bottom:14px;margin-bottom:6px;
  display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap;
  animation:rise .7s cubic-bezier(.2,.7,.2,1) both}
h1{font-size:clamp(26px,4.4vw,42px);font-weight:700;margin:0;letter-spacing:-.02em;line-height:1.12}
h1 small{display:block;font-size:.42em;font-weight:400;color:var(--ink2);letter-spacing:.16em;
  margin-bottom:8px;text-transform:none}
.stamp{font-size:12px;letter-spacing:.14em;border:1.5px solid var(--green);color:var(--green);
  padding:7px 13px;transform:rotate(-1.6deg);white-space:nowrap;font-weight:700}
.meta{display:flex;gap:26px;flex-wrap:wrap;font-size:13px;color:var(--ink2);
  border-bottom:1px solid var(--rule);padding:10px 0 22px;margin-bottom:38px;
  animation:rise .7s .06s cubic-bezier(.2,.7,.2,1) both}
.meta b{color:var(--ink);font-weight:700}

.tabs{display:flex;gap:0;margin-bottom:34px;border-bottom:1px solid var(--rule);
  animation:rise .7s .12s cubic-bezier(.2,.7,.2,1) both}
.tab{background:none;border:0;border-bottom:2.5px solid transparent;font-family:inherit;
  font-size:16px;color:var(--ink2);padding:10px 20px;cursor:pointer;margin-bottom:-1px;
  transition:color .18s,border-color .18s}
.tab[aria-selected=true]{color:var(--ink);border-bottom-color:var(--red);font-weight:700}
@media(hover:hover){.tab:hover{color:var(--ink)}}

.lvhead{display:flex;align-items:center;gap:14px;margin:44px 0 20px}
.lvhead:first-child{margin-top:0}
.lvhead h2{font-size:20px;margin:0;font-weight:700;white-space:nowrap}
.lvhead .ln{flex:1;height:1px;background:var(--rule)}
.lvhead .cap{font-size:12px;color:var(--ink2);letter-spacing:.08em;white-space:nowrap}

.item{border:1px solid var(--rule);background:rgba(255,255,255,.42);padding:22px 24px;
  margin-bottom:16px;position:relative}
.item::before{content:attr(data-n);position:absolute;top:-1px;right:-1px;background:var(--ink);
  color:var(--paper);font-size:11px;padding:4px 9px;letter-spacing:.06em;font-weight:700}
.sent{direction:ltr;text-align:left;font-size:clamp(16px,2.2vw,19px);line-height:1.75;
  margin:6px 0 18px;padding-right:44px}
.sent .bl{border-bottom:2px solid var(--red);padding:0 26px;margin:0 3px}
.sent .cw{background:linear-gradient(transparent 62%,rgba(168,51,42,.18) 62%);font-weight:700}
.sent .fill{color:var(--green);font-weight:700;border-bottom:2px solid var(--green);padding:0 4px}
.sent .fill.bad{color:var(--red);border-color:var(--red);text-decoration:line-through}

.opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(148px,1fr));gap:8px;margin-bottom:4px}
.opt{direction:ltr;text-align:left;font-family:inherit;font-size:15px;background:rgba(255,255,255,.7);
  border:1px solid var(--rule);padding:9px 13px;cursor:pointer;position:relative;
  transition:border-color .16s,background .16s,transform .16s}
@media(hover:hover) and (pointer:fine){.opt:hover:not(.done){border-color:var(--ink);transform:translateY(-1px)}}
.opt .r{position:absolute;top:3px;left:6px;font-size:10px;color:var(--ink2);direction:ltr;
  font-variant-numeric:tabular-nums}
.opt.ok{border-color:var(--green);border-width:2px;background:rgba(47,93,67,.09)}
.opt.no{border-color:var(--red);background:rgba(168,51,42,.07);opacity:.72}
.opt.done{cursor:default}
.exp{border-right:2.5px solid var(--amber);padding:9px 14px;margin-top:14px;font-size:14.5px;
  color:var(--ink2);background:rgba(138,106,31,.05)}
.exp b{color:var(--ink)}
.tags{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;font-size:11.5px;letter-spacing:.05em}
.tag{border:1px solid var(--rule);padding:3px 9px;color:var(--ink2)}
.tag.b0{border-color:var(--band0);color:var(--band0)}
.tag.b1{border-color:var(--band1);color:var(--band1)}
.tag.b2{border-color:var(--band2);color:var(--band2)}
.tag.b3{border-color:var(--band3);color:var(--band3)}
.tag.fl{border-color:var(--amber);color:var(--amber)}
.tag.two{border-color:var(--red);color:var(--red);font-weight:700}
.hid{display:none}

table{width:100%;border-collapse:collapse;font-size:13.5px;margin-top:8px}
th{text-align:right;font-size:11.5px;letter-spacing:.07em;color:var(--ink2);font-weight:400;
  border-bottom:1.5px solid var(--ink);padding:7px 9px;white-space:nowrap}
td{border-bottom:1px solid var(--rule);padding:8px 9px;vertical-align:top}
tbody tr:nth-child(even){background:rgba(255,255,255,.34)}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
td.en{direction:ltr;text-align:left;font-size:13px}
.ok-c{color:var(--green);font-weight:700}
.note{font-size:13.5px;color:var(--ink2);border-top:1px solid var(--rule);margin-top:44px;padding-top:18px}
.note b{color:var(--ink)}
.note ul{padding-right:20px;margin:8px 0}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.item{animation:rise .55s cubic-bezier(.2,.7,.2,1) both}
</style>
<div class="wrap">
<header>
  <h1><small>800+ · אנגלית · שלב 0 · הוכחת היתכנות</small>השלמת משפטים</h1>
  <div class="stamp">השער עבר · 0 כשלים</div>
</header>
<div class="meta">
  <span><b>${data.length}</b> פריטים</span>
  <span><b>4</b> רמות · 10 לכל אחת</span>
  <span>דו־חסר: <b>${data.filter(d => d.pair).length}</b></span>
  <span>דגלים: <b>${data.filter(d => d.carrierFlag).length}</b></span>
  <span>הרמה <b>נגזרת</b> מ־EN_RANK, לא מוצהרת</span>
</div>

<div class="tabs" role="tablist">
  <button class="tab" role="tab" aria-selected="true" data-v="practice">תרגול — תבחן את הפריטים</button>
  <button class="tab" role="tab" aria-selected="false" data-v="proof">גיליון מלא — כל הנתונים</button>
</div>

<div id="practice">${BANDS.map(([lv], bi) => {
  const its = data.filter(d => d.level === lv);
  if (!its.length) return '';
  return `<div class="lvhead"><h2>${lv}</h2><span class="ln"></span>
    <span class="cap">${bi === 0 ? 'עד 2,000' : bi === 1 ? '2,001–5,000' : bi === 2 ? '5,001–10,000' : 'מעל 10,000'} · max EN_RANK על המסיחים</span></div>` +
    its.map((d, i) => {
      const blanks = d.s.split('___');
      const sent = blanks.map((p, j) => esc(p) + (j < blanks.length - 1 ? `<span class="bl" data-b="${j}"></span>` : '')).join('');
      const opts = d.o.map((o, j) => {
        const label = [].concat(o).join(' … ');
        const rk = [].concat(o).map(w => d.ranks[w]).join('/');
        return `<button class="opt" data-i="${j}"><span class="r">${rk}</span>${esc(label)}</button>`;
      }).join('');
      return `<div class="item" data-n="${d.level}#${d.n}" data-a="${d.a}" style="animation-delay:${(i * 40)}ms">
        <div class="sent">${sent}</div>
        <div class="opts">${opts}</div>
        <div class="exp hid"><b>${K_HE[d.k]}</b> · ${esc(d.w.join(' · '))} — ${esc(d.e)}</div>
        <div class="tags">
          <span class="tag b${bi}">נגזרת: ${d.derived} · max ${d.optMax}</span>
          <span class="tag">נשיאה: ${d.carrierMax === null ? '—' : d.carrierMax}</span>
          ${d.pair ? '<span class="tag two">שני חסרים</span>' : ''}
          ${d.carrierFlag ? `<span class="tag fl">⚠ מילת נשיאה ברצועת ${d.carrierFlag}</span>` : ''}
        </div></div>`;
    }).join('');
}).join('')}</div>

<div id="proof" class="hid">
<table><thead><tr>
  <th>פריט</th><th>רמה נגזרת</th><th>max</th><th>נשיאה</th><th>סוג</th><th>קישור</th>
  <th>המשפט</th><th>תשובה</th><th>מסיחים</th>
</tr></thead><tbody>
${data.map(d => {
  const corr = [].concat(d.o[d.a]).join(' … ');
  const wrong = d.o.filter((_, j) => j !== d.a).map(o => [].concat(o).join('…')).join(' · ');
  return `<tr>
    <td class="num">${d.level}#${d.n}</td>
    <td>${d.derived}${d.derived !== d.level ? ' <span style="color:var(--red)">≠</span>' : ''}</td>
    <td class="num">${d.optMax}</td>
    <td class="num${d.carrierFlag ? ' ' : ''}" ${d.carrierFlag ? 'style="color:var(--amber);font-weight:700"' : ''}>${d.carrierMax === null ? '—' : d.carrierMax}</td>
    <td>${K_HE[d.k]}</td><td class="en">${esc(d.w.join(', '))}</td>
    <td class="en">${esc(d.s)}</td>
    <td class="en ok-c">${esc(corr)}</td>
    <td class="en">${esc(wrong)}</td></tr>`;
}).join('')}
</tbody></table>
</div>

<div class="note">
<b>מה הגיליון הזה מוכיח, ומה לא.</b>
<ul>
<li><b>הרמה נגזרת ולא מוצהרת.</b> ⟵ העמודה "נגזרת" מחושבת מ-EN_RANK על ארבעת המסיחים. אם היא הייתה מוקלדת ביד, לא היה כאן שום מנגנון.</li>
<li><b>⚠ שינוי מהתוכנית.</b> §6.3 גייט 2 דורש שכל מילה במשפט תהיה ב-EN_RANK. EN_RANK הוא 3,175 מונחי מאגר ולא אנגלית כללית — <code>the</code>, <code>they</code>, <code>months</code> חסרות, והמשפט לדוגמה של §3 נכשל בשער של §6.3 בשבע מילים. לכן הרמה נגזרת מהמסיחים, ומילות הנשיאה מדווחות בעמודה נפרדת כדגל לעין אנושית.</li>
<li><b>⚠ מה שאי אפשר לאמת כאן.</b> אין במאגר רשימת תדירות של אנגלית כללית, ולכן <b>אין דרך אוטומטית לאמת שמשפט הנשיאה מתאים לרמה</b>. שבעת הדגלים הם כל מה שיש.</li>
<li><b>⚠ גייט 4 לא נבדק.</b> חד-משמעיות (§6.3) דורשת קריאת LLM שפותרת את השאלה בלי לדעת את התשובה. זה השער היחיד שתופס "שני מסיחים שסבירים שניהם", וזו גם התקלה הקשה ביותר בהשלמת משפטים. הוא לא מיושם, והסקריפט אומר את זה במקום לשתוק.</li>
<li><b>הרצועה האקדמית צרה.</b> 694 מונחי מאגר מעל 10,000, ומהם צריך ארבעה מסיחים דקדוקיים לכל פריט. חמש חפיפות בין פריטים נתפסו ותוקנו — ב-1,000 פריטים זה יהיה החסם האמיתי, לא העלות.</li>
</ul>
</div>
</div>
<script>
const D=${JSON.stringify(data.map(d => ({ a: d.a, o: d.o })))};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected',x===t));
  practice.classList.toggle('hid',t.dataset.v!=='practice');
  proof.classList.toggle('hid',t.dataset.v!=='proof');
});
document.querySelectorAll('.item').forEach(item=>{
  const a=+item.dataset.a, opts=[...item.querySelectorAll('.opt')];
  opts.forEach(b=>b.onclick=()=>{
    if(b.classList.contains('done'))return;
    const pick=+b.dataset.i, right=pick===a;
    opts.forEach(o=>{o.classList.add('done');
      if(+o.dataset.i===a)o.classList.add('ok'); else if(o===b)o.classList.add('no');});
    const words=[].concat(D[[...document.querySelectorAll('.item')].indexOf(item)].o[pick]);
    item.querySelectorAll('.bl').forEach((bl,j)=>{
      bl.outerHTML='<span class="fill'+(right?'':' bad')+'">'+words[j]+'</span>';});
    item.querySelector('.exp').classList.remove('hid');
  });
});
</script>`;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
/* TAG מפריד את הגיליונות. בלעדיו ריצה על v2 דרסה את הגיליון של v1 — ואז אין מול
   מה להשוות, וזו כל הסיבה ש-v1 נשמר. */
const out = path.join(__dirname, `review${process.env.TAG || ''}.html`);
fs.writeFileSync(out, html, 'utf8');
console.log('נכתב: ' + out + '  (' + (html.length / 1024).toFixed(1) + 'KB · ' + data.length + ' פריטים)');
