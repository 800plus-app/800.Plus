# מרנדר קובץ HTML לתמונת PNG במידה קבועה — לסטוריז (1080×1920) ולפוסטים (1080×1350).
#
# למה סקריפט ולא צילום מסך ידני: צילום ידני מייצר גדלים לא עקביים, ואינסטגרם ופייסבוק
# חותכים כל מה שאינו במידה המדויקת. כאן התוצאה זהה בכל פעם.
#
#   .\רנדר.ps1                                # כל הסטוריז בתיקייה · 1080×1920
#   .\רנדר.ps1 סטורי-אמירם.html               # סטורי אחד · 1080×1920
#   .\רנדר.ps1 פוסט-פייסבוק.html -Height 1350  # פוסט פייסבוק אנכי · 1080×1350
#
# דורש: Microsoft Edge (מותקן בכל Windows 11). ffmpeg אינו נדרש — זו תמונה, לא סרטון.

param(
  [string]$File,
  [int]$Width  = 1080,
  [int]$Height = 1920
)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $edge)) { Write-Host "Edge לא נמצא" -ForegroundColor Red; exit 1 }

if ($File) { $targets = @(Get-Item (Join-Path $here $File)) }
else       { $targets = Get-ChildItem $here -Filter *.html | Where-Object { $_.BaseName -like 'סטורי*' } }

# פרופיל נפרד. בלעדיו הרינדור נכשל בשקט כשEdge כבר פתוח — הוא אינו מוכן לחלוק את
# תיקיית המשתמש הראשית עם המופע שרץ, יוצא בקוד 0, ופשוט אינו כותב קובץ.
$profile = Join-Path $env:TEMP "800plus-shot-profile"

foreach ($t in $targets) {
  $out = Join-Path $here ($t.BaseName + '.png')
  # AbsoluteUri מקודד את האותיות העבריות שבנתיב. file:/// עם עברית גולמית אינו נטען.
  $uri = ([uri]$t.FullName).AbsoluteUri

  # מצלמים את הקובץ במקומו ולא בעותק זמני: סטורי-אמירם.html טוען את ../../data-en.js
  # כדי לספור את המילים, והנתיב הזה נשבר בכל תיקייה אחרת.
  #
  # virtual-time-budget — נותן לגופנים של Google ולסקריפט הספירה לסיים לפני הצילום.
  # בלעדיו הצילום עלול לתפוס גופן ברירת מחדל, או את הקו המפריד "—" במקום המספר.
  if (Test-Path $out) { Remove-Item $out -Force }   # אחרת PNG ישן ייראה כמו רינדור שהצליח

  # ⚠ הפלט חייב להיכתב לנתיב באנגלית בלבד. PowerShell מעביר ארגומנטים לתוכנית חיצונית
  # בקידוד ANSI של המערכת, האותיות העבriות ב-‎--screenshot=‎ נשברות, ו-Edge קורא את מה
  # שנשאר כארגומנט נוסף ונופל על "Multiple targets are not supported in headless mode".
  # ה-URI של המקור דווקא תקין — AbsoluteUri כבר קידד אותו ל-%D7%… שהוא ASCII.
  $tmpOut = Join-Path $env:TEMP "800plus-shot.png"
  if (Test-Path $tmpOut) { Remove-Item $tmpOut -Force }

  $args = @(
    "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
    "--user-data-dir=$profile",
    "--force-device-scale-factor=1", "--window-size=$Width,$Height",
    "--virtual-time-budget=4000",
    "--screenshot=$tmpOut", $uri
  )
  # RedirectStandardError אינו לניפוי שגיאות — בלעדיו Start-Process חוזר לפני שEdge
  # סיים לכתוב, והבדיקה למטה מכריזה על כישלון על קובץ שנוצר שנייה אחר כך.
  $log = Join-Path $env:TEMP "800plus-shot.log"
  Start-Process $edge -ArgumentList $args -Wait -WindowStyle Hidden `
                -RedirectStandardError $log -RedirectStandardOutput "$log.out" | Out-Null

  # ההעברה חזרה לשם העברי נעשית ב-PowerShell, שמטפל ב-Unicode כראוי.
  if (Test-Path $tmpOut) { Move-Item $tmpOut $out -Force }

  if (Test-Path $out) {
    $kb = [math]::Round((Get-Item $out).Length / 1KB)
    Write-Host ("  {0} · {1} KB" -f (Split-Path $out -Leaf), $kb) -ForegroundColor Green
  } else {
    Write-Host ("  נכשל: " + $t.Name) -ForegroundColor Red
  }
}
