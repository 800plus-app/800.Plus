# רושם את הגיבוי היומי לדרייב כמשימה מתוזמנת של Windows.
#
# להריץ פעם אחת. אחרי זה הגיבוי רץ לבד כל יום ב-21:00, וגם משלים ריצה שהוחמצה
# (StartWhenAvailable) — מחשב שהיה כבוי בשעה היעודה יגבה ברגע שיידלק, במקום לדלג על היום.
#
#   powershell -ExecutionPolicy Bypass -File scripts\backup_to_drive_register.ps1
#
# לבדוק מתי רץ לאחרונה:
#   Get-ScheduledTaskInfo -TaskName 'גיבוי 800+ לדרייב'
# להריץ עכשיו בלי לחכות:
#   Start-ScheduledTask -TaskName 'גיבוי 800+ לדרייב'
# לבטל:
#   Unregister-ScheduledTask -TaskName 'גיבוי 800+ לדרייב' -Confirm:$false

$ErrorActionPreference = 'Stop'

$Name   = 'גיבוי 800+ לדרייב'
$Script = Join-Path $PSScriptRoot 'backup_to_drive.ps1'

if (-not (Test-Path $Script)) { throw "לא נמצא: $Script" }

# -WindowStyle Hidden כדי שחלון לא יקפוץ באמצע עבודה.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Script`""

# 21:00 ולא בבוקר: הגיבוי היומי של הנתונים בגיטהאב רץ ב-04:00 UTC, כך שבערב כבר יש
# גיבוי טרי של אותו יום למשוך ממנו.
$trigger = New-ScheduledTaskTrigger -Daily -At 21:00

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -DontStopIfGoingOnBatteries `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20)

Register-ScheduledTask -TaskName $Name -Action $action -Trigger $trigger `
  -Settings $settings -Description 'גיבוי יומי של קוד 800+ ונתוני סופאבייס לגוגל דרייב' -Force | Out-Null

Write-Host "נרשם: $Name · כל יום ב-21:00" -ForegroundColor Green
Get-ScheduledTask -TaskName $Name | Select-Object TaskName, State
