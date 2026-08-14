/* גאדג'ט "מילת היום" של 800+ — למסך הבית של אייפון, דרך האפליקציה Scriptable.
 *
 * למה דרך Scriptable ולא ישירות: ⛔ iOS **חוסם** יצירת ווידג'טים מ-PWA. ווידג'ט
 * באייפון מחייב WidgetKit, כלומר קוד Swift באפליקציה נייטיב, חשבון מפתח בתשלום
 * ומק (או CI). Scriptable היא אפליקציה חינמית שמריצה JavaScript ומרנדרת ווידג'ט
 * נייטיב אמיתי — וזו הדרך היחידה לתת גאדג'ט לאייפון בלי כלום מכל אלה.
 *
 * ההתקנה למשתמש:
 *   1. להתקין Scriptable מה-App Store (חינם)
 *   2. סקריפט חדש ← להדביק את הקובץ הזה ← לקרוא לו "800+"
 *   3. לחיצה ארוכה על מסך הבית ← + ← Scriptable ← לבחור את הסקריפט
 *
 * ⚠ iOS מחליט מתי לרענן ווידג'טים. `refreshAfterDate` היא בקשה, לא הבטחה.
 */

const ENDPOINT = 'https://800-plus.com/widget/widget.json';
const SITE = 'https://800-plus.com';

/* צבעי המותג, מ-index.html */
const C = {
  paper: new Color('#f6f1e7'),
  ink: new Color('#2b2118'),
  brand: new Color('#b5482e'),
  gold: new Color('#a8863c'),
  muted: new Color('#7a6a58'),
};

async function load() {
  const req = new Request(ENDPOINT);
  req.timeoutInterval = 10;
  const j = await req.loadJSON();
  if (!j || !j.today || !j.today.show) throw new Error('bad payload');
  return j.today;
}

/* ⚠ ווידג'ט שנופל מציג ריק, והמשתמש חושב שהאפליקציה שבורה. לכן יש מצב נפילה
   מפורש שאומר מה קרה, ולא מסך ריק. */
function fallback(w, msg) {
  const t = w.addText('800+');
  t.font = Font.boldSystemFont(20);
  t.textColor = C.brand;
  t.rightAlignText();
  w.addSpacer(6);
  const s = w.addText(msg);
  s.font = Font.systemFont(12);
  s.textColor = C.muted;
  s.rightAlignText();
}

const w = new ListWidget();
w.backgroundColor = C.paper;
w.setPadding(14, 14, 14, 14);
w.url = SITE;

try {
  const d = await load();

  const head = w.addText('מילת היום');
  head.font = Font.boldSystemFont(11);
  head.textColor = C.gold;
  head.rightAlignText();

  w.addSpacer(6);

  const term = w.addText(d.show);
  term.font = Font.boldSystemFont(28);
  term.textColor = C.ink;
  term.minimumScaleFactor = 0.5;
  term.lineLimit = 1;
  term.rightAlignText();

  w.addSpacer(4);

  const gl = w.addText(d.gloss);
  gl.font = Font.systemFont(14);
  gl.textColor = C.muted;
  gl.minimumScaleFactor = 0.7;
  gl.lineLimit = 3;
  gl.rightAlignText();

  w.addSpacer();

  const foot = w.addText(`יחידה ${d.unit}  ·  800-plus.com`);
  foot.font = Font.systemFont(10);
  foot.textColor = C.brand;
  foot.rightAlignText();

  if (d.url) w.url = d.url;
} catch (e) {
  fallback(w, 'אין חיבור כרגע. הווידג\'ט יתעדכן מעצמו.');
}

/* בקשה לרענון בעוד שעה — מספיק כדי לתפוס את מעבר היום */
w.refreshAfterDate = new Date(Date.now() + 60 * 60 * 1000);

if (config.runsInWidget) Script.setWidget(w);
else await w.presentSmall();
Script.complete();
