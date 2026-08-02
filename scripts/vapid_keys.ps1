# מפתחות VAPID ל-Web Push — גרסת PowerShell.
#
# למה קיימת גם גרסת ps1
# ----------------------
# vapid_keys.sh דורש bash, ובטרמינל של Windows אין bash. הפניה ל-Git Bash הייתה עובדת
# והייתה משאירה אצל חגי צעד ידני שאפשר לטעות בו. כאן הכול קורה מעצמו חוץ מדבר אחד.
#
# מה הסקריפט עושה בעצמו
#   · מייצר זוג מפתחות P-256 (openssl מגיע עם Git ונמצא ב-PATH)
#   · כותב את המפתח הפומבי ישירות ל-config.js
#   · מעתיק את המפתח הפרטי ללוח
#
# מה נשאר לחגי: להדביק בסודות של Supabase. זה הצעד היחיד, והוא נשאר שלו בכוונה.
#
# המפתח הפרטי לעולם אינו מודפס למסך ואינו נכתב לשום קובץ. זה לא הידור יתר: פלט
# שמודפס מגיע ל-scrollback, לצילומי מסך ולצ'אט, ומפתח שהודפס פעם אחת הוא מפתח שרוף.

$ErrorActionPreference = 'Stop'

$proj = Split-Path -Parent $PSScriptRoot
$cfg  = Join-Path $proj 'config.js'

if (-not (Get-Command openssl -ErrorAction SilentlyContinue)) {
  Write-Host "openssl לא נמצא. הוא מגיע עם Git for Windows — התקן אותו ונסה שוב." -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $cfg)) { Write-Host "config.js לא נמצא ב-$proj" -ForegroundColor Red; exit 1 }

# base64url בלי ריפוד — הקידוד שתקן ה-Push דורש בשני המפתחות.
function ConvertTo-B64Url([byte[]]$b) {
  [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_')
}

$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("vapid_" + [Guid]::NewGuid().ToString('N') + ".pem")
try {
  & openssl ecparam -name prime256v1 -genkey -noout -out $tmp 2>$null

  # הפומבי: ה-DER עוטף את הנקודה, ו-65 הבתים האחרונים הם 0x04 ואחריו x ו-y.
  $pubDer = & openssl ec -in $tmp -pubout -outform DER 2>$null | ForEach-Object { $_ }
  $pubBytes = [byte[]](& { $ms = New-Object IO.MemoryStream
    $p = Start-Process -FilePath (Get-Command openssl).Source `
         -ArgumentList @('ec','-in',$tmp,'-pubout','-outform','DER') `
         -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$tmp.pub" -RedirectStandardError "$tmp.err"
    [IO.File]::ReadAllBytes("$tmp.pub") })
  $pub = ConvertTo-B64Url $pubBytes[($pubBytes.Length-65)..($pubBytes.Length-1)]

  # הפרטי: 32 הבתים של d, בהיסט 7 ב-DER מסוג SEC1.
  $p2 = Start-Process -FilePath (Get-Command openssl).Source `
        -ArgumentList @('ec','-in',$tmp,'-outform','DER') `
        -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$tmp.prv" -RedirectStandardError "$tmp.err2"
  $prvDer = [IO.File]::ReadAllBytes("$tmp.prv")
  $priv = ConvertTo-B64Url $prvDer[7..38]

  if ($pub.Length -ne 87) { Write-Host "המפתח הפומבי יצא באורך $($pub.Length) במקום 87." -ForegroundColor Red; exit 1 }
  if ($priv.Length -ne 43) { Write-Host "המפתח הפרטי יצא באורך $($priv.Length) במקום 43." -ForegroundColor Red; exit 1 }

  # כתיבה ל-config.js. השורה חייבת להיות קיימת — יצירתה כאן הייתה מסתירה שינוי מבנה.
  $txt = Get-Content $cfg -Raw
  if ($txt -notmatch "window\.VAPID_PUBLIC\s*=\s*'") {
    Write-Host "לא נמצאה השורה window.VAPID_PUBLIC ב-config.js" -ForegroundColor Red; exit 1
  }
  $new = [regex]::Replace($txt, "window\.VAPID_PUBLIC\s*=\s*'[^']*'", "window.VAPID_PUBLIC = '$pub'")
  Set-Content -Path $cfg -Value $new -Encoding utf8 -NoNewline

  Set-Clipboard -Value $priv

  Write-Host ""
  Write-Host "  המפתח הפומבי נכתב ל-config.js" -ForegroundColor Green
  Write-Host "  המפתח הפרטי הועתק ללוח (לא הודפס, לא נשמר בקובץ)" -ForegroundColor Green
  Write-Host ""
  Write-Host "  נשאר צעד אחד:" -ForegroundColor Yellow
  Write-Host "  Supabase -> Edge Functions -> Secrets -> New secret"
  Write-Host "     VAPID_PRIVATE  = הדבק (Ctrl+V)"
  Write-Host "     VAPID_SUBJECT  = mailto:admin@800-plus.com"
  Write-Host ""
}
finally {
  foreach ($f in @($tmp, "$tmp.pub", "$tmp.prv", "$tmp.err", "$tmp.err2")) {
    if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue }
  }
}
