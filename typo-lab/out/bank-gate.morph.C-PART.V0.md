# שער כל המאגר · אפס התנגשויות חדשות

נוצר: 2026-08-15T15:53:53.410Z · ‏`node typo-lab/bank_gate.js`

## הטענה

לכל ערך A ולכל ערך **אחר** B: שום צורה שמתקבלת עבור B, ושום וריאציה שהדאטהסט מתייג
ראויה-לקבל עבור B, אינה מתקבלת על הכרטיס של A · אלא אם B חולק פירוש עם A (‏glossAlts).
זהו סטנדרט ההוכחה שכתוב ב-app.js:781 ("zero new collisions across all 1,719 Hebrew terms").

## מה נבדק

· פרמטרים: `out/typo-rules.json` ver=`typo-lab/evolve/v1` · טביעת אצבע `08d92b1f6975` · enabled=true
· חוק צד-הפירוש: `B1-union` · פיצול "או" מחלק · איחוד שני השומרים (ליבה≥2 או חלופה≥3)
· נרדפות: 55 קבוצות בסטטוס approved מתוך 102
· דאטהסט: 89375 שורות

| שכבה | EFF | צורות | מועמדים | זוגות שחושבו | חדשות | של היום | אותה מילה |
|---|---|---|---|---|---|---|---|
| he/he-word | 3 | 18249 | 2268155 | 2247775 | 0 | 12 | 27 |
| en/en-word | 3 | 25770 | 2009937 | 1977014 | 0 | 17 | 17 |
| he/gloss + B1-union | 3 | 6390 | 636278 | 629547 | 0 | 16 | 0 |
| en/gloss + B1-union | 3 | 9264 | 5325615 | 5311126 | 0 | 692 | 0 |
| he/morph:C-PART/V0 | 0 | 13905 | 375 | 29 | 4 | 2 | 0 |
| en/morph:C-PART/V0 | 0 | 33800 | 1070 | 279 | 39 | 118 | 0 |
| נרדפות · 55 קבוצות | · | · | · | · | 0 | · | · |

**10165770** זוגות (צורה, כרטיס) הגיעו לחישוב מרחק אמיתי, מתוך 10241430 מועמדים
שהמסנן העלה, על 5663 ערכים.

הסינון נגזר מהפרמטרים ואינו היוריסטי: ‏EFF = min(MAX_OPS, floor(max(t)/min(W))) חוסם
את מספר הפעולות, ומעליו אינדקס-מחיקות שהוא שלם למרחק לוונשטיין. זוג שנפל מהמסנן
אינו יכול היה להתקבל, ולכן הספירה היא הוכחה ולא מדגם.

## התנגשויות חדשות

**43 התנגשויות חדשות. אין להעלות.**

| שפה | כיוון | כרטיס | יחידה | הוקלד | הפולש |
|---|---|---|---|---|---|
| he | morph-rule | הֶרֶף עַיִן | 4 | רוגע | על מי מנוחות |
| he | morph-rule | מָאוֹר | 6 | זהר | גור |
| he | morph-rule | נְהָרָה | 8 | זהר | גור |
| he | morph-rule | נֹגַהּ | 9 | זהר | גור |
| en | morph-rule | 2nd - second | 1 | שוני | linguistic |
| en | morph-rule | death | 1 | מות | die |
| en | morph-rule | wide | 1 | רוחב | across |
| en | morph-rule | writer | 1 | ספר | confide |
| en | morph-rule | file | 2 | קבצ | group |
| en | morph-rule | guard | 2 | שמר | preserve |
| en | morph-rule | kind | 2 | סווג | categorize |
| en | morph-rule | market | 2 | שווק | marketing |
| en | morph-rule | size | 2 | גדל | grow |
| en | morph-rule | type | 2 | סווג | categorize |
| en | morph-rule | attractive | 3 | משכ | during |
| en | morph-rule | courage | 3 | אמצ | adopt |
| en | morph-rule | previous | 3 | קדמ | further |
| en | morph-rule | author | 4 | ספר | confide |
| en | morph-rule | class | 4 | סווג | categorize |
| en | morph-rule | favor | 4 | טבה | benefit |
| en | morph-rule | range | 4 | טוח | safe |
| en | morph-rule | speaker | 4 | דבר | speak spoke |
| en | morph-rule | willing | 4 | מכנ | mechanize |
| en | morph-rule | ultimate | 5 | ספי | financial |
| en | morph-rule | compatible | 6 | תאמ | correlate |
| en | morph-rule | former | 6 | קדמ | further |
| en | morph-rule | just | 6 | הגנ | protect |
| en | morph-rule | prior | 6 | קדמ | further |
| en | morph-rule | procedure | 6 | נהל | manage |
| en | morph-rule | pigeon | 7 | ינה | wisdom |
| en | morph-rule | recurring | 7 | חזר | refund |
| en | morph-rule | appeal | 8 | משכ | during |
| en | morph-rule | magnitude | 8 | גדל | grow |
| en | morph-rule | eventual | 9 | ספי | financial |
| en | morph-rule | fond | 9 | חבב | like |
| en | morph-rule | latter | 9 | שוני | linguistic |
| en | morph-rule | physician | 9 | רפא | cure |
| en | morph-rule | preceding | 9 | קדמ | further |
| en | morph-rule | scope | 9 | טוח | safe |
| en | morph-rule | demise | 10 | מות | die |
| en | morph-rule | forerunner | 10 | קדמ | further |
| en | morph-rule | genus | 10 | סווג | categorize |
| en | morph-rule | scribe | 10 | ספר | confide |

## קבלות חוצות-ערכים שקיימות היום (‏via=exact)

אלה אינן תוצר של השכבה החדשה: זו ההתנהגות של האפליקציה כמו שהיא, והן מדווחות כאן
כדי שלא ייבלעו לתוך המספר של ההתנגשויות החדשות.

857 מקרים. הראשונים:

| שפה | כיוון | כרטיס | הוקלד | הפולש |
|---|---|---|---|---|
| he | term | חָשׁ | פעמיו | פעמיו |
| he | term | עָכוּר | נוגה | נגה |
| he | term | מָאוֹר | נוגה | נוגה |
| he | term | זָח | התנודד | התנודד |
| he | term | זָח | היתנודד | התנודד |
| he | term | זָח | התנוודד | התנודד |
| he | term | זָח | היתנוודד | התנודד |
| he | term | נְהָרָה | נוגה | נוגה |
| he | term | מָש | התנודד | התנודד |
| he | term | מָש | היתנודד | התנודד |
| he | term | מָש | התנוודד | התנודד |
| he | term | מָש | היתנוודד | התנודד |
| en | term | jump | spring | spring |
| en | term | jump | sprang | sprang |
| en | term | scene | ring | ring rang |
| en | term | plant | sprang | spring sprang |
| en | term | request | seek | seek sought |
| en | term | rise | arise | arise arose |
| en | term | appear | arise | arise arose |
| en | term | view | saw | saw |
| en | term | dedicated | saw | saw see |
| en | term | scale | arise | arise arose |
| en | term | appeal | seek | seek sought |
| en | term | emerge | arise | arise arose |
| en | term | exhale | blew | blew |
| en | term | perceive | saw | saw |
| en | term | solicit | seek | seek sought |
| en | term | sprang | spring | spring |
| en | term | staunch | saw | saw see |
| he | gloss | אֲלוּמָּת אוֹר | קרנ אור | אלומה |
| he | gloss | אַרְכִיב / אַרְכִיּוֹן | מקומ לאכסונ מסמכימ | גנזכ |
| he | gloss | הִסְלִים | חריפ | אקוטי |
| he | gloss | הִסְלִים | קצינ | מצביא |
| he | gloss | חֲרִישִׁי | בשקט | בלאט |
| he | gloss | שָׁכַך | בשקט | בלאט |
| he | gloss | בַּלָאט | שקט | חרישי |
| he | gloss | גַּנְזַך | מקומ אכסונ למסמכימ | ארכיב ארכיונ |
| he | gloss | דּוּמָם | שקט | חרישי |
| he | gloss | מַצְבִּיא | הקצינ | הסלימ |
| he | gloss | בֵּית גְּנָזִים | מקומ לאכסונ מסמכימ | גנזכ |
| ... | | ועוד 817 | | |

## אותה מילה, שני ערכים

קבלות שבהן הערך "הפולש" חולק עם הכרטיס צורה קבילה · כלומר אותה מילה מופיעה במאגר
פעמיים (יחידה אחרת, או חלופת כתיב בתוך ערך אחר). וריאציה שלה היא וריאציה של המילה
של הכרטיס עצמו, ולכן אינה התנגשות. מה שכן נשאר אדום: מחרוזת שהיא **צורה קבילה** של
הערך האחר ואינה צורה קבילה של הכרטיס.

44 מקרים. הראשונים:

| שפה | כיוון | כרטיס | הוקלד | הערך החולק |
|---|---|---|---|---|
| he | term | נוּגֶה | נוגה | נגה |
| he | term | נַקְבּוּבִית | נקבובית | נקב נקבובית |
| he | term | נַקְבּוּבִית | נקבוובית | נקב נקבובית |
| he | term | נַקְבּוּבִית | ננקבובית | נקב נקבובית |
| he | term | נֶקֶב / נַקְבּוּבִית | נקבובית | נקבובית |
| he | term | נֶקֶב / נַקְבּוּבִית | נקבוובית | נקבובית |
| he | term | הֵחִישׁ (אֶת) צְעָדָיו / פְּעָמָיו | פעמיו | פעמיו |
| he | term | נֹגַהּ | נוגה | נוגה |
| he | term | נָד / הִתְנוֹדֵד | התנודד | התנודד |
| he | term | נָד / הִתְנוֹדֵד | היתנודד | התנודד |
| he | term | נָד / הִתְנוֹדֵד | התנוודד | התנודד |
| he | term | נָד / הִתְנוֹדֵד | היתנוודד | התנודד |
| he | term | הִתְנוֹדֵד | התנודד | נד התנודד |
| he | term | הִתְנוֹדֵד | היתנודד | נד התנודד |
| he | term | הִתְנוֹדֵד | התנוודד | נד התנודד |
| he | term | הִתְנוֹדֵד | היתנוודד | נד התנודד |
| he | term | הִתְנוֹדֵד | היתננודד | נד התנודד |
| he | term | הִתְנוֹדֵד | היתונודד | נד התנודד |
| he | term | הִתְנוֹדֵד | התנודדד | נד התנודד |
| he | term | הִתְנוֹדֵד | תהנודד | נד התנודד |
| he | term | הִתְנוֹדֵד | תהנוודד | נד התנודד |
| he | term | מַשְׂאַת לֵב / נֶפֶש | נפש | פזור דעת נפש |
| he | term | מַשְׂאַת לֵב / נֶפֶש | נפשש | פזור דעת נפש |
| he | term | פִּזּוּר דַּעַת / נֶפֶש | נפש | משאת לב נפש |
| he | term | פִּזּוּר דַּעַת / נֶפֶש | נפשש | משאת לב נפש |
| ... | | ועוד 19 | | |

## הכיוון ההפוך · חמשת זוגות הצירה שהוחזרו

‏app.js:687 מתעד כלל צירה שנוסה והוחזר, מפני שהוא הצית חמש התנגשויות אמיתיות.
הזוגות האלה חייבים להמשיך לדחות זה את זה גם תחת הסובלנות החדשה.

| זוג | פסק | פירוט |
|---|---|---|
| רְדִיד ~ רִדֵּד | ✅ נדחה | 3 צורות, כולן נדחו |
| הִגִיר ~ הִגֵּר | ✅ נדחה | 4 צורות, כולן נדחו |
| נִיכָּר ~ נֵכַר | ✅ נדחה | 2 צורות, כולן נדחו |
| גִּבֵּן ~ גָבִין | ✅ נדחה | 4 צורות, כולן נדחו |
| גִּלְעֵן ~ גַּלְעִין | ✅ נדחה | 4 צורות, כולן נדחו |

## פסק דין

⛔ אדום · 43 התנגשויות חדשות, 0 זוגות צירה נפרצו.

## מה השער הזה **אינו** מוכיח

· שלוש השכבות נמדדות זו לצד זו ולא זו דרך זו. הנרדפות נמדדות במודל ההתאמה המדויקת
  של gate_synonyms, מפני שגם הריצה אינה מרכיבה אותן לתוך המרחק הממושקל.
· ‏via=exact הוא ההתנהגות של היום, והשער אינו מתיימר לתקן אותה.
· איכות התוכן, ניסוח ההודעה למשתמש, וההתנהגות בדפדפן אינן נמדדות כאן.

<!-- bank-gate: {"ver":"typo-lab/evolve/v1","paramsFp":"08d92b1f6975","enabled":true,"cfg":"B1-union","cards":5663,"candidates":10241430,"pairs":10165770,"newCollisions":43,"baselineExact":857,"sameWord":44,"synonymGroups":55,"tsereRejected":5,"tserePairs":5,"layers":[{"lang":"he","set":"he-word","eff":3,"forms":18249,"pairs":2247775,"collisions":0},{"lang":"en","set":"en-word","eff":3,"forms":25770,"pairs":1977014,"collisions":0},{"lang":"he","set":"gloss","eff":3,"forms":6390,"pairs":629547,"collisions":0},{"lang":"en","set":"gloss","eff":3,"forms":9264,"pairs":5311126,"collisions":0},{"lang":"he","set":"morph:C-PART/V0","eff":0,"forms":13905,"pairs":29,"collisions":4},{"lang":"en","set":"morph:C-PART/V0","eff":0,"forms":33800,"pairs":279,"collisions":39}],"pass":false} -->
