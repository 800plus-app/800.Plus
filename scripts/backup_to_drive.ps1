# גיבוי יומי של האתר כולו לגוגל דרייב.
#
# מה כבר היה מגובה, ומה לא
# --------------------------
# הנתונים (חמש טבלאות סופאבייס) מגובים כל יום ל-Hagay-BOT/800plus-backups, וזה עובד —
# אומת ב-5.8.2026: שלוש ריצות אחרונות הצליחו. הקוד יושב ב-800plus-app/800.Plus.
#
# אבל שניהם על גיטהאב, ותחת אותו חשבון. חשבון שננעל, נפרץ או נמחק לוקח איתו את הקוד
# *ואת* הגיבויים באותו רגע — כלומר לא היה עותק אחד מחוץ לגיטהאב. זה מה שהסקריפט הזה
# סוגר, וזה מה שחגי ביקש: "או בדרייב או בכונן שלי".
#
# מה נשמר
# --------
#   קוד.bundle   — git bundle של המאגר כולו: כל ההיסטוריה, כל הענפים, בקובץ אחד.
#                  שחזור: git clone <שם>.bundle
#   נתונים\      — קובצי ה-JSON של הטבלאות, כפי שהגיבוי היומי הפיק אותם.
#   מצב.txt      — מתי רץ, מה נשמר, ומה גודלו.
#
# למה bundle ולא העתקת התיקייה: תיקיית עבודה היא צילום של רגע אחד. bundle הוא המאגר
# עצמו — אפשר לשחזר ממנו כל גרסה שהייתה, כולל היסטוריית הקומיטים.
#
# הרצה ידנית:   powershell -ExecutionPolicy Bypass -File scripts\backup_to_drive.ps1
# אוטומטית:     ראה scripts\backup_to_drive_register.ps1 (משימה מתוזמנת יומית)

$ErrorActionPreference = 'Stop'

$Root  = Split-Path -Parent $PSScriptRoot
$Drive = 'G:\האחסון שלי\800+ גיבויים'
$Keep  = 7           # כמה ימים לשמור

# --- הדרייב חייב להיות מחובר. בלי זה נכתוב לתיקייה מקומית שנראית כמו הדרייב ---
if (-not (Test-Path 'G:\')) {
  Write-Host "עצור. כונן G: אינו קיים — Google Drive for Desktop כנראה אינו רץ." -ForegroundColor Red
  Write-Host "הגיבוי לא בוצע. הפעל את Drive ונסה שוב." -ForegroundColor Red
  exit 1
}

$Stamp  = Get-Date -Format 'yyyy-MM-dd'
$Target = Join-Path $Drive $Stamp
New-Item -ItemType Directory -Force $Target | Out-Null

Write-Host "גיבוי אל: $Target"

# --- 1. הקוד, כ-bundle ---------------------------------------------------------
# --all כולל כל ה-refs (ענפים ותגיות), ולא רק את הענף הפעיל.
$BundlePath = Join-Path $Target 'קוד.bundle'
Push-Location $Root
try {
  git bundle create $BundlePath --all 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "git bundle נכשל" }
} finally { Pop-Location }
$BundleMB = [math]::Round((Get-Item $BundlePath).Length / 1MB, 2)
Write-Host "  קוד:    $BundleMB MB"

# --- 2. הנתונים, מריפו הגיבויים ------------------------------------------------
# נמשך דרך gh api ולא דרך clone: רק קובצי ה-JSON נחוצים, לא ההיסטוריה שלהם.
$DataDir = Join-Path $Target 'נתונים'
New-Item -ItemType Directory -Force $DataDir | Out-Null
$files = @('profiles.json','progress.json','feedback.json','assoc_shared.json','subscription.json')
$dataOk = 0
foreach ($f in $files) {
  try {
    $url = gh api "repos/Hagay-BOT/800plus-backups/contents/data/$f" --jq '.download_url' 2>$null
    if ($url) {
      Invoke-WebRequest -Uri $url -OutFile (Join-Path $DataDir $f) -UseBasicParsing
      $dataOk++
    }
  } catch {
    # קובץ אחד שנכשל אינו מבטל את הגיבוי — הוא נרשם ב-מצב.txt וזהו.
    Write-Host "  אזהרה: $f לא נמשך" -ForegroundColor Yellow
  }
}
Write-Host "  נתונים: $dataOk מתוך $($files.Count) קבצים"

# --- 3. שורת מצב ---------------------------------------------------------------
# הקובץ הזה הוא מה שמאפשר לראות בסייר, בלי לפתוח כלום, שהגיבוי אכן רץ ומה הוא תפס.
$rev = (Select-String -Path (Join-Path $Root 'sw.js') -Pattern "const REV = '(\d+)'").Matches[0].Groups[1].Value
@"
גיבוי 800+
נוצר:   $(Get-Date -Format 'yyyy-MM-dd HH:mm')
גרסה:   REV $rev
קוד:    קוד.bundle · $BundleMB MB · שחזור: git clone "קוד.bundle" 800plus
נתונים: $dataOk מתוך $($files.Count) טבלאות
"@ | Out-File (Join-Path $Target 'מצב.txt') -Encoding utf8

# --- 4. ניקוי ישנים ------------------------------------------------------------
# תיקיות בשם yyyy-MM-dd בלבד, כדי ששום דבר אחר בתיקייה לא יימחק בטעות.
$old = Get-ChildItem $Drive -Directory |
       Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}$' } |
       Sort-Object Name -Descending | Select-Object -Skip $Keep
foreach ($d in $old) { Remove-Item $d.FullName -Recurse -Force; Write-Host "  נמחק ישן: $($d.Name)" }

Write-Host "`nהושלם: $Target" -ForegroundColor Green
