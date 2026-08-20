'use strict';
/* ⛔ שער · פסקי שלב 2 · typo-lab/gate_blind2.js
 *
 *   node typo-lab/gate_blind2.js            → מצב כל האצוות
 *   node typo-lab/gate_blind2.js --selftest → ⛔ שיניים · יוצא 1 אם קלט פסול עובר
 *
 * ⭐ למה הוא קיים: סוכן שנהרג באמצע השאיר **פסק חסר בשקט**, וזה נראה זהה
 * לאצווה שטרם שוגרה. השער הופך את זה לכשל רועש.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const OUT = path.join(__dirname, 'out', 'blind');
const say = s => process.stdout.write(s + '\n');

function check(batchFile, verdictFile) {
  const b = fs.readFileSync(batchFile, 'utf8').split(/\r?\n/).filter(Boolean).slice(1);
  const want = new Map(b.map(l => { const p = l.split('\t'); return [p[0], p[2].split(' | ').length]; }));
  if (!fs.existsSync(verdictFile)) return { ok: false, why: '⛔ אין קובץ פסק', n: 0, want: want.size };
  const lines = fs.readFileSync(verdictFile, 'utf8').split(/\r?\n/).filter(l => l.trim());
  const seen = new Set(); const bad = [];
  for (const l of lines) {
    const p = l.split('\t');
    if (p.length !== 3) { bad.push('עמודות ' + p.length); continue; }
    const k = p[0].trim();
    if (!want.has(k)) { bad.push('מפתח זר ' + k); continue; }
    if (!/^[כל]+$/.test(p[1])) { bad.push('תווית פסולה ' + k); continue; }
    if (p[1].length !== want.get(k)) { bad.push('אורך ' + k + ' ' + p[1].length + '≠' + want.get(k)); continue; }
    seen.add(k);
  }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(verdictFile)).digest('hex').slice(0, 8);
  const missing = [...want.keys()].filter(k => !seen.has(k));
  return { ok: bad.length === 0 && missing.length === 0, n: seen.size, want: want.size, bad: bad, missing: missing.length, sha: sha };
}

if (process.argv.includes('--selftest')) {
  const t = path.join(OUT, '_gt'); fs.mkdirSync(t, { recursive: true });
  fs.writeFileSync(path.join(t, 'b.tsv'), 'k\tterm\tcands\nw0001\tx\tא | ב\nw0002\ty\tג\n');
  let fail = 0; const ok = (c, m) => { say((c ? '  ✅ ' : '  ⛔ ') + m); if (!c) fail++; };
  fs.writeFileSync(path.join(t, 'v.tsv'), 'w0001\tכל\tנימוק\nw0002\tכ\tנימוק\n');
  ok(check(path.join(t, 'b.tsv'), path.join(t, 'v.tsv')).ok, 'קלט תקין עובר');
  fs.writeFileSync(path.join(t, 'v.tsv'), 'w0001\tכ\tנימוק\nw0002\tכ\tנימוק\n');
  ok(!check(path.join(t, 'b.tsv'), path.join(t, 'v.tsv')).ok, '⛔ אורך רצף שגוי נתפס');
  fs.writeFileSync(path.join(t, 'v.tsv'), 'w0001\tכל\tנימוק\n');
  ok(check(path.join(t, 'b.tsv'), path.join(t, 'v.tsv')).missing === 1, '⛔ שורה חסרה נתפסת');
  fs.writeFileSync(path.join(t, 'v.tsv'), 'w0009\tכל\tנימוק\nw0002\tכ\tנ\n');
  ok(!check(path.join(t, 'b.tsv'), path.join(t, 'v.tsv')).ok, '⛔ מפתח מומצא נתפס');
  fs.rmSync(path.join(t, 'v.tsv'));
  ok(!check(path.join(t, 'b.tsv'), path.join(t, 'v.tsv')).ok, '⛔ קובץ חסר = כשל רועש');
  fs.rmSync(t, { recursive: true, force: true });
  say(fail ? '⛔ ' + fail + ' נפילות' : '✅ השער נושך');
  process.exit(fail ? 1 : 0);
}

const batches = fs.readdirSync(path.join(OUT, 'batch2')).filter(f => /^C-\d+\.tsv$/.test(f)).sort();
let done = 0, part = 0, none = 0;
for (const bf of batches) {
  const id = bf.replace('.tsv', '');
  for (const j of ['J1', 'J2']) {
    const r = check(path.join(OUT, 'batch2', bf), path.join(OUT, 'verdict2', id + '-' + j + '.tsv'));
    if (r.why) { none++; continue; }
    const tag = r.ok ? '✅' : '⚠';
    if (r.ok) done++; else part++;
    say('  ' + tag + ' ' + id + '-' + j + '  ' + r.n + '/' + r.want +
        (r.bad && r.bad.length ? '  פגומות: ' + r.bad.length + ' [' + r.bad.slice(0, 3).join(' · ') + ']' : '') +
        (r.missing ? '  חסרות: ' + r.missing : '') + '  sha ' + r.sha);
  }
}
say('\nשלמים ' + done + ' · חלקיים ' + part + ' · לא שוגרו ' + none + '  (מתוך ' + batches.length * 2 + ')');
