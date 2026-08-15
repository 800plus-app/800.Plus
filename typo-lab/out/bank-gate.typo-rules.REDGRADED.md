# שער כל המאגר · אפס התנגשויות חדשות

נוצר: 2026-08-15T06:55:55.868Z · ‏`node typo-lab/bank_gate.js`

## הטענה

לכל ערך A ולכל ערך **אחר** B: שום צורה שמתקבלת עבור B, ושום וריאציה שהדאטהסט מתייג
ראויה-לקבל עבור B, אינה מתקבלת על הכרטיס של A · אלא אם B חולק פירוש עם A (‏glossAlts).
זהו סטנדרט ההוכחה שכתוב ב-app.js:781 ("zero new collisions across all 1,719 Hebrew terms").

## מה נבדק

· פרמטרים: `out/typo-rules.json` ver=`typo-lab/evolve/v1` · טביעת אצבע `abec07b0e17d` · enabled=true
· חוק צד-הפירוש: `B1-union` · פיצול "או" מחלק · איחוד שני השומרים (ליבה≥2 או חלופה≥3)
· נרדפות: 55 קבוצות בסטטוס approved מתוך 102
· דאטהסט: 89375 שורות

| שכבה | EFF | צורות | מועמדים | זוגות שחושבו | חדשות | של היום | אותה מילה |
|---|---|---|---|---|---|---|---|
| he/he-word | 3 | 18249 | 2268155 | 2247775 | 0 | 12 | 25 |
| en/en-word | 3 | 25770 | 2009937 | 1977014 | 102 | 17 | 25 |
| he/gloss + B1-union | 3 | 6390 | 636278 | 629547 | 0 | 16 | 0 |
| en/gloss + B1-union | 3 | 9264 | 5325615 | 5311126 | 0 | 692 | 0 |
| נרדפות · 55 קבוצות | · | · | · | · | 0 | · | · |

**10165462** זוגות (צורה, כרטיס) הגיעו לחישוב מרחק אמיתי, מתוך 10239985 מועמדים
שהמסנן העלה, על 5663 ערכים.

הסינון נגזר מהפרמטרים ואינו היוריסטי: ‏EFF = min(MAX_OPS, floor(max(t)/min(W))) חוסם
את מספר הפעולות, ומעליו אינדקס-מחיקות שהוא שלם למרחק לוונשטיין. זוג שנפל מהמסנן
אינו יכול היה להתקבל, ולכן הספירה היא הוכחה ולא מדגם.

## התנגשויות חדשות

**102 התנגשויות חדשות. אין להעלות.**

| שפה | כיוון | כרטיס | יחידה | הוקלד | הפולש |
|---|---|---|---|---|---|
| en | term | 1st - first | 1 | 10ht | 10th tenth |
| en | term | 1st - first | 1 | 10h | 10th tenth |
| en | term | and | 1 | 2nd | 2nd second |
| en | term | at | 1 | 9tj | 9th ninth |
| en | term | at first | 1 | ffirst | 1st first |
| en | term | bought | 1 | fought | fight fought |
| en | term | bought | 1 | sought | seek sought |
| en | term | bought | 1 | foughht | fight fought |
| en | term | bought | 1 | fougght | fight fought |
| en | term | bought | 1 | sougght | seek sought |
| en | term | bought | 1 | souught | seek sought |
| en | term | earth | 1 | eghth | 8th eighth |
| en | term | gift | 1 | egihth | 8th eighth |
| en | term | new | 1 | knew | know knew |
| en | term | send | 1 | ssecond | 2nd second |
| en | term | so that | 1 | souhgt | seek sought |
| en | term | spend | 1 | ssecond | 2nd second |
| en | term | sweet | 1 | sveenth | 7th seventh |
| en | term | teeth, tooth | 1 | teenth | 10th tenth |
| en | term | teeth, tooth | 1 | sveenth | 7th seventh |
| en | term | teeth, tooth | 1 | teth | 10th tenth |
| en | term | with | 1 | egihth | 8th eighth |
| en | term | 10th - tenth | 2 | teeth | teeth tooth |
| en | term | 10th - tenth | 2 | teth | teeth tooth |
| en | term | 10th - tenth | 2 | sveenth | 7th seventh |
| en | term | 4th - fourth | 2 | 5th | 5th fifth |
| en | term | 4th - fourth | 2 | 6th | 6th sixth |
| en | term | 4th - fourth | 2 | 7th | 7th seventh |
| en | term | 4th - fourth | 2 | 8th | 8th eighth |
| en | term | 4th - fourth | 2 | 9th | 9th ninth |
| en | term | 4th - fourth | 2 | 0th | 10th tenth |
| en | term | 4th - fourth | 2 | 6thh | 6th sixth |
| en | term | 4th - fourth | 2 | 10h | 10th tenth |
| en | term | 5th - fifth | 2 | 4th | 4th fourth |
| en | term | 5th - fifth | 2 | 6th | 6th sixth |
| en | term | 5th - fifth | 2 | 7th | 7th seventh |
| en | term | 5th - fifth | 2 | 8th | 8th eighth |
| en | term | 5th - fifth | 2 | 9th | 9th ninth |
| en | term | 5th - fifth | 2 | 0th | 10th tenth |
| en | term | 5th - fifth | 2 | 6thh | 6th sixth |
| en | term | 5th - fifth | 2 | 10h | 10th tenth |
| en | term | 6th - sixth | 2 | 4th | 4th fourth |
| en | term | 6th - sixth | 2 | 5th | 5th fifth |
| en | term | 6th - sixth | 2 | 7th | 7th seventh |
| en | term | 6th - sixth | 2 | 8th | 8th eighth |
| en | term | 6th - sixth | 2 | 9th | 9th ninth |
| en | term | 6th - sixth | 2 | 0th | 10th tenth |
| en | term | 6th - sixth | 2 | 10h | 10th tenth |
| en | term | 7th - seventh | 2 | 4th | 4th fourth |
| en | term | 7th - seventh | 2 | 5th | 5th fifth |
| en | term | 7th - seventh | 2 | 6th | 6th sixth |
| en | term | 7th - seventh | 2 | 8th | 8th eighth |
| en | term | 7th - seventh | 2 | 9th | 9th ninth |
| en | term | 7th - seventh | 2 | 0th | 10th tenth |
| en | term | 7th - seventh | 2 | 6thh | 6th sixth |
| en | term | 7th - seventh | 2 | 10h | 10th tenth |
| en | term | 8th - eighth | 2 | 4th | 4th fourth |
| en | term | 8th - eighth | 2 | 5th | 5th fifth |
| en | term | 8th - eighth | 2 | 6th | 6th sixth |
| en | term | 8th - eighth | 2 | 7th | 7th seventh |
| en | term | 8th - eighth | 2 | 9th | 9th ninth |
| en | term | 8th - eighth | 2 | 0th | 10th tenth |
| en | term | 8th - eighth | 2 | 6thh | 6th sixth |
| en | term | 8th - eighth | 2 | 10h | 10th tenth |
| en | term | 9th - ninth | 2 | 4th | 4th fourth |
| en | term | 9th - ninth | 2 | 5th | 5th fifth |
| en | term | 9th - ninth | 2 | 6th | 6th sixth |
| en | term | 9th - ninth | 2 | 7th | 7th seventh |
| en | term | 9th - ninth | 2 | 8th | 8th eighth |
| en | term | 9th - ninth | 2 | 0th | 10th tenth |
| en | term | 9th - ninth | 2 | 6thh | 6th sixth |
| en | term | 9th - ninth | 2 | 10h | 10th tenth |
| en | term | catch, caught | 2 | taught | teach taught |
| en | term | edit | 2 | egihth | 8th eighth |
| en | term | event | 2 | seventh | 7th seventh |
| en | term | event | 2 | deventh | 7th seventh |
| en | term | event | 2 | seventu | 7th seventh |
| en | term | event | 2 | sveenth | 7th seventh |
| en | term | flew | 3 | flee | flee fled |
| en | term | flew | 3 | fled | flee fled |
| en | term | tent | 3 | tenth | 10th tenth |
| en | term | tent | 3 | teenth | 10th tenth |
| en | term | lead, led | 4 | dled | flee fled |
| en | term | teach, taught | 4 | caught | catch caught |
| en | term | teach, taught | 4 | daught | catch caught |
| en | term | teach, taught | 4 | thught | think thought |
| en | term | though | 4 | thought | think thought |
| en | term | though | 4 | thoughtt | think thought |
| en | term | though | 4 | thougght | think thought |
| en | term | though | 4 | thkught | think thought |
| en | term | sheet | 5 | sveenth | 7th seventh |
| en | term | e.g. | 6 | 4gh | 4th fourth |
| en | term | e.g. | 6 | 6gh | 6th sixth |
| en | term | lend | 6 | led | lead led |
| en | term | regain | 7 | beggin | begin an un |
| en | term | sneeze | 7 | freeze | freeze froze |
| en | term | sneeze | 7 | rreeze | freeze froze |
| en | term | arise | 8 | arose | arise arose |
| en | term | forth | 8 | fourth | 4th fourth |
| en | term | forth | 8 | fourthh | 4th fourth |
| en | term | emit | 9 | egihth | 8th eighth |
| en | term | speck | 10 | speak | speak spoke |

## קבלות חוצות-ערכים שקיימות היום (‏via=exact)

אלה אינן תוצר של השכבה החדשה: זו ההתנהגות של האפליקציה כמו שהיא, והן מדווחות כאן
כדי שלא ייבלעו לתוך המספר של ההתנגשויות החדשות.

737 מקרים. הראשונים:

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
| ... | | ועוד 697 | | |

## אותה מילה, שני ערכים

קבלות שבהן הערך "הפולש" חולק עם הכרטיס צורה קבילה · כלומר אותה מילה מופיעה במאגר
פעמיים (יחידה אחרת, או חלופת כתיב בתוך ערך אחר). וריאציה שלה היא וריאציה של המילה
של הכרטיס עצמו, ולכן אינה התנגשות. מה שכן נשאר אדום: מחרוזת שהיא **צורה קבילה** של
הערך האחר ואינה צורה קבילה של הכרטיס.

50 מקרים. הראשונים:

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
| he | term | הִתְנוֹדֵד | התנוודג | נד התנודד |
| he | term | הִתְנוֹדֵד | התנווגד | נד התנודד |
| he | term | מַשְׂאַת לֵב / נֶפֶש | נפש | פזור דעת נפש |
| he | term | מַשְׂאַת לֵב / נֶפֶש | נפשש | פזור דעת נפש |
| he | term | פִּזּוּר דַּעַת / נֶפֶש | נפש | משאת לב נפש |
| he | term | פִּזּוּר דַּעַת / נֶפֶש | נפשש | משאת לב נפש |
| he | term | פְּעָמָיו | פעמיו | החיש את צעדיו פעמיו |
| he | term | פְּעָמָיו | פפעמיו | החיש את צעדיו פעמיו |
| ... | | ועוד 25 | | |

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

⛔ אדום · 102 התנגשויות חדשות, 0 זוגות צירה נפרצו.

## מה השער הזה **אינו** מוכיח

· שלוש השכבות נמדדות זו לצד זו ולא זו דרך זו. הנרדפות נמדדות במודל ההתאמה המדויקת
  של gate_synonyms, מפני שגם הריצה אינה מרכיבה אותן לתוך המרחק הממושקל.
· ‏via=exact הוא ההתנהגות של היום, והשער אינו מתיימר לתקן אותה.
· איכות התוכן, ניסוח ההודעה למשתמש, וההתנהגות בדפדפן אינן נמדדות כאן.

<!-- bank-gate: {"ver":"typo-lab/evolve/v1","paramsFp":"abec07b0e17d","enabled":true,"cfg":"B1-union","cards":5663,"candidates":10239985,"pairs":10165462,"newCollisions":102,"baselineExact":737,"sameWord":50,"synonymGroups":55,"tsereRejected":5,"tserePairs":5,"layers":[{"lang":"he","set":"he-word","eff":3,"forms":18249,"pairs":2247775,"collisions":0},{"lang":"en","set":"en-word","eff":3,"forms":25770,"pairs":1977014,"collisions":102},{"lang":"he","set":"gloss","eff":3,"forms":6390,"pairs":629547,"collisions":0},{"lang":"en","set":"gloss","eff":3,"forms":9264,"pairs":5311126,"collisions":0}],"pass":false} -->
