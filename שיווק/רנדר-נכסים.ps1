# מרנדר את נכסי 10.8: שתי קרוסלות ל-PNG וריל אחד ל-MP4.
#
#   .\רנדר-נכסים.ps1              כל השלושה
#   .\רנדר-נכסים.ps1 -Only ק2     רק אחד
#
# ⚠ ק2 מכריזה את מספר הימים עד המבחן, והמספר מחושב בזמן הרינדור.
#   **לרנדר אותה מחדש ביום ההעלאה.** קרוסלה מאתמול מכריזה מספר שגוי היום.

param([string]$Only = "")

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$remotion = Join-Path $here 'remotion'

# ⚠ נתיב פלט בעברית נשבר בהעברה ל-Chrome של Remotion מאותה סיבה שהוא נשבר
#   ב-Edge: PowerShell מעביר ארגומנטים לתוכנית חיצונית בקידוד ANSI. כותבים
#   לנתיב אנגלי ב-TEMP ומעבירים אחר כך עם Move-Item.
$stage = Join-Path $env:TEMP '800plus-assets'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

# ⚠ Remotion מושך את שני הגופנים מ-fonts.gstatic.com בכל רינדור, וההורדה
#   נכשלת מדי פעם ב-ERR_CONNECTION_RESET. כישלון כזה מפיל שקופית אחת באמצע
#   סדרה, ובלי ניסיון חוזר מגלים את זה רק כשמסתכלים בתיקייה. שלושה ניסיונות.
function Invoke-WithRetry {
  param([scriptblock]$Cmd, [string]$Expect, [string]$Label)
  foreach ($try in 1..3) {
    & $Cmd
    if (Test-Path $Expect) { return $true }
    if ($try -lt 3) { Write-Host "  ~ $Label נכשל, ניסיון $($try+1)" -ForegroundColor Yellow }
  }
  return $false
}

Push-Location $remotion
try {
  # ── הקרוסלות · שקופית לפריים ──────────────────────────────────────────
  $carousels = @(
    @{ id = 'CarouselPairs'; slides = 7; dir = 'ק1-זוגות-מבלבלים' },
    @{ id = 'CarouselPlan';  slides = 7; dir = 'ק2-תוכנית-ימים' }
  )

  foreach ($c in $carousels) {
    if ($Only -and $Only -ne $c.dir.Split('-')[0]) { continue }
    Write-Host "`n$($c.dir)" -ForegroundColor Cyan
    $outDir = Join-Path $here "תמונות\$($c.dir)"
    New-Item -ItemType Directory -Force $outDir | Out-Null

    for ($f = 0; $f -lt $c.slides; $f++) {
      $name = '{0:d2}.png' -f $f
      $tmp  = Join-Path $stage $name
      $id = $c.id
      $ok = Invoke-WithRetry -Expect $tmp -Label "שקופית $f" -Cmd {
        npx remotion still $id $tmp --frame=$f --log=error
      }
      if (-not $ok) { Write-Host "  x שקופית $f נכשלה" -ForegroundColor Red; exit 1 }
      Move-Item $tmp (Join-Path $outDir $name) -Force
      Write-Host "  $name"
    }
  }

  # ── הריל ──────────────────────────────────────────────────────────────
  if (-not $Only -or $Only -eq 'ר1') {
    Write-Host "`nר1 · פתיחה קרה" -ForegroundColor Cyan
    $tmp = Join-Path $stage 'reel.mp4'
    $ok = Invoke-WithRetry -Expect $tmp -Label "הריל" -Cmd {
      npx remotion render ReelCold $tmp --log=error
    }
    if (-not $ok) { Write-Host "  x הרינדור נכשל" -ForegroundColor Red; exit 1 }
    $out = Join-Path $here 'סרטונים\ר1-פתיחה-קרה.mp4'
    Move-Item $tmp $out -Force
    $mb = [math]::Round((Get-Item $out).Length / 1MB, 2)
    Write-Host ("  ר1-פתיחה-קרה.mp4 · {0} MB" -f $mb) -ForegroundColor Green
  }
}
finally { Pop-Location }

Write-Host "`nמוכן" -ForegroundColor Green
