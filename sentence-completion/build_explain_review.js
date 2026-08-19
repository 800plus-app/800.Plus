/* בונה דף ביקורת אינטראקטיבי לפורמט ההסבר החדש.
 *
 *   node sentence-completion/build_explain_review.js
 *   → sentence-completion/explain-review.html
 *
 * למה אינטראקטיבי ולא טבלה: ההסבר **תלוי בבחירה**. תא `r` נכתב כדי להיקרא לבד,
 * ואי אפשר לשפוט אותו בטבלה שמציגה את כל הארבעה זה ליד זה. הדף הזה מדמה את
 * המסך האמיתי: לוחצים אפשרות, ורואים בדיוק מה הלומד היה רואה ולא יותר.
 *
 * ⚠ הדף הוא כלי ביקורת, לא קוד המוצר. הוא נועד לעין של חגי לפני שהפורמט נכנס
 * לאפליקציה.
 */
const fs = require('fs'), path = require('path');
const B = require('./bands.js');
const dir = path.join(__dirname, 'batches');

const items = [];
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')))
  JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).forEach((it, i) => {
    const flat = [].concat(...it.o.map(o => [].concat(o)));
    const mx = Math.max(...flat.map(w => B.unitOf(w) || 0));
    items.push({ ...it, src: `${path.basename(f, '.json')}#${i + 1}`, band: B.bandOfUnit(mx) });
  });

const ORDER = B.BANDS.map(x => x.name);
items.sort((a, b) => ORDER.indexOf(a.band) - ORDER.indexOf(b.band) || a.src.localeCompare(b.src));

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* `**…**` הוא סימון ההדגשה בשדה t. כאן הוא נהפך ל-<b>. */
const bold = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const lbl = o => Array.isArray(o) ? o.join(' + ') : String(o);

const done = items.filter(x => x.t && (x.r || []).every(Boolean)).length;
const cards = items.map((it, n) => {
  const opts = it.o.map((o, j) =>
    `<button class="opt" data-i="${j}">${esc(lbl(o))}</button>`).join('');
  const gl = (it.g || []).map((g, j) =>
    `<div class="g${j === it.a ? ' key' : ''}">${j === it.a ? '✓ ' : ''}${esc(g)}</div>`).join('');
  return `<article class="card${it.t ? '' : ' todo'}" data-a="${it.a}" id="c${n}">
  <header><span class="band b-${ORDER.indexOf(it.band)}">${esc(it.band)}</span>
    <span class="src">${esc(it.src)}</span>${it.t ? '' : '<span class="warn">טרם נכתב</span>'}</header>
  <p class="sent">${esc(it.s).replace(/_{2,}/g, '<span class="blank">___</span>')}</p>
  <div class="opts">${opts}</div>
  <div class="reveal">
    <div class="sec"><h4>המילים</h4>${gl}</div>
    <div class="sec"><h4>המשפט</h4><p class="tr">${bold(it.t)}</p></div>
    <div class="sec why"></div>
  </div>
  <script type="application/json" class="data">${
    /* `<` נחלט תמיד. תא r שיכיל `</script>` היה סוגר את התג ושובר את הדף בשקט. */
    JSON.stringify({ r: it.r || [], o: it.o.map(lbl), a: it.a }).replace(/</g, '\\u003c')
  }</script>
</article>`;
}).join('\n');

const html = `<meta charset="utf-8"><title>ביקורת פורמט ההסבר</title>
<style>
:root{--bg:#0f1115;--card:#191d24;--line:#2a3038;--tx:#e7ebf0;--dim:#98a2b0;--ok:#4ade80;--bad:#f87171;--acc:#60a5fa}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:var(--bg);color:var(--tx);direction:rtl;
 font:16px/1.65 "Segoe UI",system-ui,sans-serif}
h1{font-size:20px;margin:0 0 4px}
.lead{color:var(--dim);margin:0 0 20px;max-width:70ch}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:0 0 14px}
.card.todo{opacity:.5}
header{display:flex;gap:8px;align-items:center;font-size:12px;margin-bottom:10px}
.band{padding:2px 8px;border-radius:99px;font-weight:600}
.b-0{background:#14532d;color:#bbf7d0}.b-1{background:#1e3a5f;color:#bfdbfe}
.b-2{background:#4c1d95;color:#ddd6fe}.b-3{background:#7c2d12;color:#fed7aa}
.src{color:var(--dim);font-family:ui-monospace,monospace}
.warn{color:var(--bad)}
.sent{direction:ltr;text-align:left;font-size:17px;margin:0 0 12px}
.blank{color:var(--acc);font-weight:700;letter-spacing:1px}
.opts{display:flex;flex-wrap:wrap;gap:8px}
.opt{direction:ltr;font:15px/1 ui-monospace,monospace;padding:9px 14px;cursor:pointer;
 background:#212732;color:var(--tx);border:1px solid var(--line);border-radius:8px}
.opt:hover{border-color:var(--acc)}
.opt.picked{border-color:var(--acc);background:#1e293b}
.opt.right{border-color:var(--ok);background:#052e16}
.opt.wrong{border-color:var(--bad);background:#3f1414}
.reveal{display:none;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.card.open .reveal{display:block}
.sec{margin-bottom:12px}
.sec:last-child{margin-bottom:0}
h4{font-size:12px;color:var(--dim);margin:0 0 6px;font-weight:600;letter-spacing:.4px}
.g{direction:ltr;text-align:left;font-size:14px;color:var(--dim);padding:1px 0}
.g.key{color:var(--tx);font-weight:600}
.tr{margin:0;font-size:16px}
.tr b{color:var(--ok)}
.why p{margin:0 0 8px}
.why .verdict{font-weight:600}
.why .bad{color:var(--bad)}.why .ok{color:var(--ok)}
code{direction:ltr;display:inline-block;font-family:ui-monospace,monospace;background:#212732;
 padding:0 4px;border-radius:4px}
</style>
<h1>ביקורת פורמט ההסבר · ${items.length} פריטים · ${done} הושלמו</h1>
<p class="lead">לחץ אפשרות בכל פריט כדי לראות בדיוק מה הלומד רואה: פירוש ארבע
המילים, תרגום המשפט עם התשובה מושלמת ומודגשת, ואז הנימוק לבחירה שלך ולתשובה
הנכונה. ההסבר תלוי בבחירה, ולכן אין דרך לשפוט אותו מטבלה.</p>
${cards}
<script>
/* הנימוק נכנס ל-innerHTML, ולכן נחלט. סוגר זווית בטקסט עברי היה מבליע חלק
   מהנימוק בלי הודעת שגיאה, וזה בדיוק סוג הכשל שקשה לראות בביקורת. */
const H = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
document.querySelectorAll('.card').forEach(card => {
  const D = JSON.parse(card.querySelector('.data').textContent);
  card.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
    const i = +btn.dataset.i, right = i === D.a;
    card.querySelectorAll('.opt').forEach((b, j) => {
      b.className = 'opt' + (j === D.a ? ' right' : (j === i ? ' wrong' : ''));
    });
    const why = card.querySelector('.why');
    why.innerHTML = right
      ? '<h4>למה זה נכון</h4><p class="verdict ok">בחרת <code>' + H(D.o[i]) + '</code> וצדקת</p><p>' + H(D.r[i] || '⛔ חסר') + '</p>'
      : '<h4>למה הבחירה שלך אינה נכונה</h4><p class="verdict bad">בחרת <code>' + H(D.o[i]) + '</code></p><p>'
        + H(D.r[i] || '⛔ חסר') + '</p><p class="verdict ok">התשובה: <code>' + H(D.o[D.a]) + '</code></p><p>'
        + H(D.r[D.a] || '⛔ חסר') + '</p>';
    card.classList.add('open');
  });
});
</script>`;

const out = path.join(__dirname, 'explain-review.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`נכתב: ${path.relative(process.cwd(), out)}`);
console.log(`${items.length} פריטים · ${done} עם פורמט שלם · ${items.length - done} ממתינים`);
