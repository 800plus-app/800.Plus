# מרנדר את plate.html ללוח PNG בגודל 2480×3508 (A4 ב-300dpi).
#
#   .\רנדר-לוח.ps1
#
# דורש: Microsoft Edge. אותן שלוש מלכודות שכבר עלו בפרויקט מטופלות כאן:
#   1. נתיב פלט בעברית נשבר בהעברה לתוכנית חיצונית, ולכן כותבים לנתיב אנגלי
#      ומעבירים אחר כך ב-PowerShell.
#   2. Edge לא מרנדר כשהוא כבר פתוח, אלא אם נותנים --user-data-dir נפרד.
#   3. השגיאות אינן נבלעות. אם הקובץ לא נוצר, השורה מדווחת כישלון.

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }
if (-not (Test-Path $edge)) { Write-Host "Edge לא נמצא" -ForegroundColor Red; exit 1 }

$src    = Join-Path $here 'plate.html'
$uri    = ([uri]$src).AbsoluteUri
$tmp    = Join-Path $env:TEMP '800plus-plate.png'
$out    = Join-Path $here 'threshold-notation-plate.png'
$profile= Join-Path $env:TEMP '800plus-plate-profile'
$log    = Join-Path $env:TEMP '800plus-plate.log'

if (Test-Path $tmp) { Remove-Item $tmp -Force }

# virtual-time-budget גדול: הלוח מצייר 5,662 אלמנטים ב-DOM וטוען גופן מהרשת.
$args = @(
  "--headless=new","--disable-gpu","--no-sandbox","--hide-scrollbars",
  "--user-data-dir=$profile",
  "--force-device-scale-factor=1","--window-size=2480,3508",
  "--virtual-time-budget=15000",
  "--screenshot=$tmp",$uri
)
Start-Process $edge -ArgumentList $args -Wait -WindowStyle Hidden `
              -RedirectStandardError $log -RedirectStandardOutput "$log.out" | Out-Null

if (Test-Path $tmp) {
  Move-Item $tmp $out -Force
  $mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
  Write-Host ("  threshold-notation-plate.png · {0} MB" -f $mb) -ForegroundColor Green
} else {
  Write-Host "  ✗ הרינדור נכשל" -ForegroundColor Red
  Get-Content $log -TotalCount 5
}
