# מרנדר את ad.html לסרטון אנכי 1080x1920.
#
# למה סקריפט ולא "לצלם ידנית": כל שינוי טקסט ב-ad.html מחייב רינדור מחדש, וצילום ידני
# מייצר גדלים לא עקביים. כאן זו פקודה אחת, והתוצאה זהה בכל פעם.
#
#   .\render.ps1
#
# דורש: ffmpeg ב-PATH · Microsoft Edge (מותקן בכל Windows 11)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$work = Join-Path $env:TEMP "800plus-ad-render"

# --- אימות המספר לפני שמרנדרים -------------------------------------------------
# הביט החמישי מכריז על גודל המאגר. מספר שהתיישן הוא הטעות היקרה ביותר בסרטון פרסומת,
# והיא קרתה: הגרסה הקודמת אמרה 5,413 אחרי שהמאגר כבר גדל.
$root = Resolve-Path (Join-Path $here "..\..")
Push-Location $root
$real = node -e "global.window=global;require('./data.js');require('./data-en.js');const c=o=>Object.values(o).reduce((a,b)=>a+b.length,0);console.log(c(UNIT_DATA)+c(UNIT_DATA_EN))"
Pop-Location
$shown = (Select-String -Path (Join-Path $here 'ad.html') -Pattern '<div class="huge">([\d,]+)</div>').Matches[0].Groups[1].Value
if ($shown -replace ',', '' -ne $real) {
  Write-Host "עצור. הסרטון מכריז $shown · המאגר בפועל הוא $real" -ForegroundColor Red
  Write-Host "עדכן את ad.html ורק אז רנדר." -ForegroundColor Red
  exit 1
}
Write-Host "המספר תואם: $real מילים" -ForegroundColor Green

# --- צילום ששת הביטים ----------------------------------------------------------
New-Item -ItemType Directory -Force $work | Out-Null
Copy-Item (Join-Path $here 'ad.html') (Join-Path $work 'ad.html') -Force

$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "C:\Program Files\Microsoft\Edge\Application\msedge.exe" }

foreach ($n in 1..6) {
  # force-device-scale-factor=1 — בלעדיו הצילום יוצא בגודל אחר על מסך עם קנה מידה
  & $edge --headless=new --disable-gpu --hide-scrollbars `
          --force-device-scale-factor=1 --window-size=1080,1920 `
          --screenshot="$work\f$n.png" "file:///$($work -replace '\\','/')/ad.html?beat=$n" 2>$null
  Write-Host "  ביט $n"
}

# --- הרכבה ---------------------------------------------------------------------
# 4.5 שניות לביט, 0.35 מעבר, והביט האחרון ארוך יותר כדי שהכתובת תישאר על המסך.
$out = Join-Path $here '800plus-ad.mp4'
ffmpeg -v error `
  -loop 1 -t 4.5 -i "$work\f1.png" -loop 1 -t 4.5 -i "$work\f2.png" -loop 1 -t 4.5 -i "$work\f3.png" `
  -loop 1 -t 4.5 -i "$work\f4.png" -loop 1 -t 4.5 -i "$work\f5.png" -loop 1 -t 5.5 -i "$work\f6.png" `
  -filter_complex "[0][1]xfade=transition=fade:duration=0.35:offset=4.15[a];[a][2]xfade=transition=fade:duration=0.35:offset=8.30[b];[b][3]xfade=transition=fade:duration=0.35:offset=12.45[c];[c][4]xfade=transition=fade:duration=0.35:offset=16.60[d];[d][5]xfade=transition=fade:duration=0.35:offset=20.75[v];[v]fps=30,format=yuv420p[o]" `
  -map "[o]" -c:v libx264 -preset slow -crf 20 -movflags +faststart $out -y

Write-Host "`nמוכן: $out" -ForegroundColor Green
