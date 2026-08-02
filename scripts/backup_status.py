#!/usr/bin/env python3
"""יש גיבוי / אין גיבוי — לכל נכס בפרויקט, נמדד ולא מוצהר.

למה סקריפט ולא מסמך
--------------------
מסמך שאומר "הכול מגובה" נכתב פעם אחת ונשאר נכון בדיוק עד השינוי הבא. הדבר היחיד ששווה
משהו ברגע שצריך אותו הוא בדיקה שרצה עכשיו ומסתכלת על הדיסק. לכן כל שורה כאן נבדקת מול
קובץ אמיתי, וכל שורה שאי אפשר לאמת מסומנת ✗ ולא "כנראה בסדר".

שלושה יעדי גיבוי, ולכל אחד תפקיד שונה
-------------------------------------
  git      · המאגר הפומבי. כל מה שאינו סודי ואינו מוגן בזכויות יוצרים.
  drive    · Google Drive. מה ש-.gitignore חוסם מהמאגר בכוונה — דוחות, מיגרציות.
  backups  · Hagay-BOT/800plus-backups. תוכן מסד הנתונים, שאינו קיים כקובץ בכלל.

טריות
-----
גיבוי שרץ פעם אחת לפני חודשיים אינו גיבוי. לכל יעד יש סף ימים, ומעליו הוא מסומן ⚠
גם כשהקבצים קיימים — "יש קובץ" ו"יש גיבוי" אינם אותו דבר.
"""
import json, os, subprocess, sys, time
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DRIVE = r'G:\\האחסון שלי\\800+ גיבוי'.replace('\\\\', '\\')

OK, WARN, BAD = '✔', '⚠', '✗'


def count(path):
    if not os.path.isdir(path):
        return 0
    return sum(len(f) for _, _, f in os.walk(path))


def newest(path):
    """הקובץ העדכני ביותר תחת נתיב, כחותמת זמן. None כשאין."""
    best = None
    if os.path.isfile(path):
        return os.path.getmtime(path)
    for base, _, files in os.walk(path):
        for f in files:
            try:
                t = os.path.getmtime(os.path.join(base, f))
            except OSError:
                continue
            if best is None or t > best:
                best = t
    return best


def days_old(t):
    return None if t is None else (time.time() - t) / 86400


def git_tracked(rel):
    """האם הנתיב באמת נמצא במאגר. `git ls-files` ולא בדיקת .gitignore — קובץ יכול
       להיות מוזכר ב-.gitignore ועדיין להיות מתועד מהעבר, ולהפך."""
    try:
        out = subprocess.run(['git', 'ls-files', '--', rel], cwd=ROOT,
                             capture_output=True, text=True, timeout=30,
                             encoding='utf-8', errors='replace')
        return bool(out.stdout.strip())
    except Exception:
        return False


def drive_has(name):
    p = os.path.join(DRIVE, name)
    return (os.path.exists(p), count(p) if os.path.isdir(p) else (1 if os.path.exists(p) else 0),
            days_old(newest(p)) if os.path.exists(p) else None)


# ---- הנכסים. כל שורה: (שם, נתיב מקומי, יעד, סף ימים) ----
ASSETS = [
    ('קוד האתר',            '.',                 'git',     None),
    ('בדיקות',              'tests',             'git',     None),
    ('פונקציות Supabase',   'supabase',          'git',     None),
    ('דוחות עבודה',         'דוחות',             'drive',   14),
    ('מיגרציות',            'migrations',        'drive',   14),
    ('config.js',           'config.js',         'drive',   14),
    ('בחינות נייט',         'בחינות-נייט',       'drive',   90),
    ('חומרי שיווק',         'שיווק',             'drive',   90),
    ('מסמכי הקמה',          'supabase-setup.md', 'drive',   30),
]

DRIVE_NAME = {'דוחות': 'דוחות', 'migrations': 'migrations', 'supabase': 'supabase',
              'tests': 'tests', 'config.js': 'config.js.txt'}


def main():
    rows, missing = [], []

    for name, rel, target, limit in ASSETS:
        local = os.path.join(ROOT, rel)
        n = count(local) if os.path.isdir(local) else (1 if os.path.exists(local) else 0)
        if n == 0:
            rows.append((BAD, name, target, 'אינו קיים מקומית'))
            continue

        if target == 'git':
            # מספר הקבצים המתועדים בפועל, לא מספר הקבצים על הדיסק. "קוד האתר · 1 קבצים"
            # היה נכון טכנית (נבדק app.js) ומטעה לחלוטין למי שקורא את השורה.
            try:
                tracked = len(subprocess.run(['git', 'ls-files', '--', rel], cwd=ROOT,
                                             capture_output=True, text=True, timeout=30,
                                             encoding='utf-8', errors='replace').stdout.splitlines())
            except Exception:
                tracked = 0
            rows.append((OK if tracked else BAD, name, 'git',
                         '%d קבצים במאגר' % tracked if tracked else 'אינו במאגר'))
            if not tracked:
                missing.append(name)
            continue

        # drive
        exists, dn, age = drive_has(DRIVE_NAME.get(rel, rel))
        if not exists:
            rows.append((BAD, name, 'drive', '%d קבצים מקומית · אין עותק' % n))
            missing.append(name)
        elif limit is not None and age is not None and age > limit:
            rows.append((WARN, name, 'drive', '%d קבצים · גובה לפני %d ימים' % (dn, age)))
        else:
            rows.append((OK, name, 'drive', '%d קבצים · גובה לפני %d ימים' % (dn, age or 0)))

    # ---- מסד הנתונים. אינו קובץ מקומי, ולכן נבדק מול המאגר שמחזיק אותו. ----
    try:
        out = subprocess.run(
            ['gh', 'api', 'repos/Hagay-BOT/800plus-backups/contents/data',
             '--jq', '[.[] | select(.name|endswith(".json")) | {n:.name, s:.size}] | tostring'],
            capture_output=True, text=True, timeout=60,
            encoding='utf-8', errors='replace')
        files = json.loads(out.stdout.strip() or '[]')
        # commit אחרון = מתי הגיבוי באמת רץ. קיום קבצים אינו מעיד על טריות.
        c = subprocess.run(['gh', 'api', 'repos/Hagay-BOT/800plus-backups/commits',
                            '--jq', '.[0].commit.committer.date'],
                           capture_output=True, text=True, timeout=60,
            encoding='utf-8', errors='replace').stdout.strip()
        age = (datetime.now(timezone.utc) - datetime.fromisoformat(c.replace('Z', '+00:00'))).days
        big = sum(f['s'] for f in files)
        mark = OK if age <= 2 else WARN
        rows.append((mark, 'מסד הנתונים', 'backups',
                     '%d טבלאות · %d KB · רץ לפני %d ימים' % (len(files), big // 1024, age)))
    except Exception as e:
        rows.append((BAD, 'מסד הנתונים', 'backups', 'לא ניתן לאמת (%s)' % type(e).__name__))
        missing.append('מסד הנתונים')

    w = max(len(r[1]) for r in rows)
    print('\nיש גיבוי / אין גיבוי — %s\n' % datetime.now().strftime('%Y-%m-%d %H:%M'))
    for mark, name, target, note in rows:
        print('  %s  %-*s  %-8s  %s' % (mark, w, name, target, note))

    bad = sum(1 for r in rows if r[0] == BAD)
    warn = sum(1 for r in rows if r[0] == WARN)
    print('\n  %d נכסים · %d מגובים · %d ישנים · %d ללא גיבוי'
          % (len(rows), len(rows) - bad - warn, warn, bad))
    if missing:
        print('\n  ללא גיבוי: ' + ' · '.join(missing))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
