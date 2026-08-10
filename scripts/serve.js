/* שרת סטטי מקומי לבדיקה בדפדפן. לא חלק מהמוצר — GitHub Pages מגיש את האתר.
   נדרש כי `file://` חוסם רישום service worker ומודולים, ולכן בדיקה על הדיסק
   אינה מודדת את מה שהמשתמש מקבל. */
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), PORT = Number(process.env.PORT) || 8787;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.webmanifest':'application/manifest+json', '.png':'image/png', '.svg':'image/svg+xml',
  '.woff2':'font/woff2', '.tsv':'text/plain; charset=utf-8', '.md':'text/plain; charset=utf-8' };
http.createServer((req, res) => {
  const clean = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(ROOT, clean === '/' ? 'index.html' : clean);
  /* ⛔ אף בקשה לא יוצאת מתיקיית הפרויקט, גם אם היא נושאת ../ */
  if (!path.resolve(f).startsWith(path.resolve(ROOT))) { res.writeHead(403).end(); return; }
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404, {'content-type':'text/plain; charset=utf-8'}).end('404'); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
