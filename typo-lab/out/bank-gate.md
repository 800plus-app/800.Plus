# שער כל המאגר · אפס התנגשויות חדשות

נוצר: 2026-08-14T19:23:10.802Z · ‏`node typo-lab/bank_gate.js`

## הטענה

לכל ערך A ולכל ערך **אחר** B: שום צורה שמתקבלת עבור B, ושום וריאציה שהדאטהסט מתייג
ראויה-לקבל עבור B, אינה מתקבלת על הכרטיס של A · אלא אם B חולק פירוש עם A (‏glossAlts).
זהו סטנדרט ההוכחה שכתוב ב-app.js:781 ("zero new collisions across all 1,719 Hebrew terms").

## מה נבדק

· פרמטרים: `out/typo-rules.json` ver=`typo-lab/evolve/v1` · טביעת אצבע `5495c82628ba` · enabled=true
· חוק צד-הפירוש: `B1-union` · פיצול "או" מחלק · איחוד שני השומרים (ליבה≥2 או חלופה≥3)
· נרדפות: 55 קבוצות בסטטוס approved מתוך 102
· דאטהסט: 89375 שורות

| שכבה | EFF | צורות | מועמדים | זוגות שחושבו | חדשות | של היום | אותה מילה |
|---|---|---|---|---|---|---|---|
| he/he-word | 3 | 18249 | 2268155 | 2247775 | 13 | 12 | 28 |
| en/en-word | 3 | 25770 | 2009937 | 1977014 | 125 | 17 | 10 |
| he/gloss + B1-union | 3 | 6390 | 636278 | 629547 | 0 | 16 | 0 |
| en/gloss + B1-union | 3 | 9264 | 5325615 | 5311126 | 0 | 692 | 0 |
| נרדפות · 55 קבוצות | · | · | · | · | 0 | · | · |

**10165462** זוגות (צורה, כרטיס) הגיעו לחישוב מרחק אמיתי, מתוך 10239985 מועמדים
שהמסנן העלה, על 5663 ערכים.

הסינון נגזר מהפרמטרים ואינו היוריסטי: ‏EFF = min(MAX_OPS, floor(max(t)/min(W))) חוסם
את מספר הפעולות, ומעליו אינדקס-מחיקות שהוא שלם למרחק לוונשטיין. זוג שנפל מהמסנן
אינו יכול היה להתקבל, ולכן הספירה היא הוכחה ולא מדגם.

## התנגשויות חדשות

**138 התנגשויות חדשות. אין להעלות.**

| שפה | כיוון | כרטיס | יחידה | הוקלד | הפולש |
|---|---|---|---|---|---|
| he | term | אֶצְבָּעוֹן | 1 | אצבעונתיו | פכר את ידיו אצבעותיו |
| he | term | אֶצְבָּעוֹן | 1 | אצבעותיו | פכר את ידיו אצבעותיו |
| he | term | אֶצְבָּעוֹן | 1 | אצבעוותו | פכר את ידיו אצבעותיו |
| he | term | אֶצְבָּעוֹן | 1 | אצבעוטיו | פכר את ידיו אצבעותיו |
| he | term | אֶצְבָּעוֹן | 1 | אצבעויתו | פכר את ידיו אצבעותיו |
| he | term | צָפוּן | 4 | מצפווננו | נקפו לבו מצפונו |
| he | term | צָפוּן | 4 | מצפיוונו | נקפו לבו מצפונו |
| he | term | תְּמוּרָה | 7 | תיתוורהה | תיתורה תיתורת |
| he | term | תְּמוּרָה | 7 | תיתווירה | תיתורה תיתורת |
| he | term | הִתְוָוה | 8 | תיתוורהה | תיתורה תיתורת |
| he | term | מִתְוֶוה | 9 | תיתוורהה | תיתורה תיתורת |
| he | term | תְּשׁוּרָה | 9 | תיתוורהה | תיתורה תיתורת |
| he | term | תְּשׁוּרָה | 9 | תיתווירה | תיתורה תיתורת |
| en | term | 1st - first | 1 | 110th | 10th tenth |
| en | term | both | 1 | tootth | teeth tooth |
| en | term | both | 1 | toothh | teeth tooth |
| en | term | both | 1 | 110th | 10th tenth |
| en | term | bought | 1 | caughtt | catch caught |
| en | term | bought | 1 | caughht | catch caught |
| en | term | bought | 1 | tauught | teach taught |
| en | term | bought | 1 | taughht | teach taught |
| en | term | cash | 1 | cauhgt | catch caught |
| en | term | child | 1 | thirrd | 3rd third |
| en | term | child | 1 | thhird | 3rd third |
| en | term | death | 1 | teeeth | teeth tooth |
| en | term | death | 1 | teetth | teeth tooth |
| en | term | fire | 1 | frroze | freeze froze |
| en | term | force | 1 | frozze | freeze froze |
| en | term | force | 1 | frroze | freeze froze |
| en | term | from | 1 | frozze | freeze froze |
| en | term | from | 1 | frroze | freeze froze |
| en | term | into | 1 | nninth | 9th ninth |
| en | term | laugh | 1 | caughtt | catch caught |
| en | term | laugh | 1 | caughht | catch caught |
| en | term | laugh | 1 | tauught | teach taught |
| en | term | laugh | 1 | taughht | teach taught |
| en | term | laugh | 1 | cauhgt | catch caught |
| en | term | mouth | 1 | phourth | 4th fourth |
| en | term | mouth | 1 | tootth | teeth tooth |
| en | term | mouth | 1 | toothh | teeth tooth |
| en | term | North | 1 | phourth | 4th fourth |
| en | term | North | 1 | tootth | teeth tooth |
| en | term | North | 1 | toothh | teeth tooth |
| en | term | short | 1 | phourth | 4th fourth |
| en | term | South | 1 | phourth | 4th fourth |
| en | term | South | 1 | tootth | teeth tooth |
| en | term | South | 1 | toothh | teeth tooth |
| en | term | too | 1 | tootth | teeth tooth |
| en | term | too | 1 | toothh | teeth tooth |
| en | term | touch | 1 | tootth | teeth tooth |
| en | term | touch | 1 | toothh | teeth tooth |
| en | term | truth | 1 | tootth | teeth tooth |
| en | term | truth | 1 | toothh | teeth tooth |
| en | term | with | 1 | nninth | 9th ninth |
| en | term | with | 1 | 110th | 10th tenth |
| en | term | 10th - tenth | 2 | teeeth | teeth tooth |
| en | term | 10th - tenth | 2 | teetth | teeth tooth |
| en | term | 10th - tenth | 2 | nninth | 9th ninth |
| en | term | 10th - tenth | 2 | tootth | teeth tooth |
| en | term | 10th - tenth | 2 | toothh | teeth tooth |
| en | term | 4th - fourth | 2 | 110th | 10th tenth |
| en | term | 5th - fifth | 2 | 110th | 10th tenth |
| en | term | 5th - fifth | 2 | nninth | 9th ninth |
| en | term | 6th - sixth | 2 | 110th | 10th tenth |
| en | term | 6th - sixth | 2 | nninth | 9th ninth |
| en | term | 7th - seventh | 2 | 110th | 10th tenth |
| en | term | 8th - eighth | 2 | 110th | 10th tenth |
| en | term | 9th - ninth | 2 | 110th | 10th tenth |
| en | term | bath | 2 | 110th | 10th tenth |
| en | term | catch, caught | 2 | tauught | teach taught |
| en | term | catch, caught | 2 | taughht | teach taught |
| en | term | event | 2 | seventhh | 7th seventh |
| en | term | event | 2 | sevennth | 7th seventh |
| en | term | frog | 2 | frozze | freeze froze |
| en | term | frog | 2 | frroze | freeze froze |
| en | term | front | 2 | frozze | freeze froze |
| en | term | front | 2 | frroze | freeze froze |
| en | term | path | 2 | 110th | 10th tenth |
| en | term | role | 2 | frozze | freeze froze |
| en | term | role | 2 | frroze | freeze froze |
| en | term | root | 2 | toothh | teeth tooth |
| en | term | rope | 2 | frozze | freeze froze |
| en | term | rope | 2 | frroze | freeze froze |
| en | term | think, thought | 2 | thirrd | 3rd third |
| en | term | think, thought | 2 | thhird | 3rd third |
| en | term | think, thought | 2 | tauught | teach taught |
| en | term | unit | 2 | nninth | 9th ninth |
| en | term | court | 3 | phourth | 4th fourth |
| en | term | frame | 3 | frozze | freeze froze |
| en | term | frame | 3 | frroze | freeze froze |
| en | term | prize | 3 | phreeze | freeze froze |
| en | term | target | 3 | tauught | teach taught |
| en | term | target | 3 | taughht | teach taught |
| en | term | target | 3 | taugjt | teach taught |
| en | term | tent | 3 | teeeth | teeth tooth |
| en | term | tent | 3 | teetth | teeth tooth |
| en | term | cast | 4 | cauhgt | catch caught |
| en | term | faith | 4 | fiifth | 5th fifth |
| en | term | prove | 4 | frozze | freeze froze |
| en | term | prove | 4 | frroze | freeze froze |
| en | term | teach, taught | 4 | teeeth | teeth tooth |
| en | term | teach, taught | 4 | teetth | teeth tooth |
| en | term | teach, taught | 4 | caughtt | catch caught |
| en | term | teach, taught | 4 | caughht | catch caught |
| en | term | teach, taught | 4 | cauhgt | catch caught |
| en | term | tight | 4 | tauught | teach taught |
| en | term | tight | 4 | taughht | teach taught |
| en | term | boot | 5 | tootth | teeth tooth |
| en | term | boot | 5 | toothh | teeth tooth |
| en | term | cage | 5 | cauhgt | catch caught |
| en | term | cough | 5 | caughtt | catch caught |
| en | term | cough | 5 | caughht | catch caught |
| en | term | cough | 5 | cauhgt | catch caught |
| en | term | cult | 5 | cauhgt | catch caught |
| en | term | thick | 5 | thirrd | 3rd third |
| en | term | thick | 5 | thhird | 3rd third |
| en | term | robe | 7 | frozze | freeze froze |
| en | term | robe | 7 | frroze | freeze froze |
| en | term | sneeze | 7 | rreeze | freeze froze |
| en | term | forth | 8 | phourth | 4th fourth |
| en | term | herd | 8 | thirrd | 3rd third |
| en | term | herd | 8 | thhird | 3rd third |
| en | term | oath | 8 | tootth | teeth tooth |
| en | term | oath | 8 | toothh | teeth tooth |
| en | term | oath | 8 | 110th | 10th tenth |
| en | term | pinch | 8 | nninth | 9th ninth |
| en | term | probe | 8 | frozze | freeze froze |
| en | term | probe | 8 | frroze | freeze froze |
| en | term | heir | 9 | thhird | 3rd third |
| en | term | moth | 9 | tootth | teeth tooth |
| en | term | moth | 9 | toothh | teeth tooth |
| en | term | moth | 9 | 110th | 10th tenth |
| en | term | prone | 9 | frozze | freeze froze |
| en | term | prone | 9 | frroze | freeze froze |
| en | term | seek, sought | 9 | caughtt | catch caught |
| en | term | seek, sought | 9 | caughht | catch caught |
| en | term | seek, sought | 9 | tauught | teach taught |
| en | term | seek, sought | 9 | taughht | teach taught |

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

38 מקרים. הראשונים:

| שפה | כיוון | כרטיס | הוקלד | הערך החולק |
|---|---|---|---|---|
| he | term | נוּגֶה | נוגה | נגה |
| he | term | נַקְבּוּבִית | נקבובית | נקב נקבובית |
| he | term | נַקְבּוּבִית | נקבוובית | נקב נקבובית |
| he | term | נַקְבּוּבִית | ננקבובית | נקב נקבובית |
| he | term | נַקְבּוּבִית | נקקבוובית | נקב נקבובית |
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
| he | term | הִתְנוֹדֵד | היתנווודד | נד התנודד |
| he | term | הִתְנוֹדֵד | היותנוודד | נד התנודד |
| he | term | הִתְנוֹדֵד | התננוודד | נד התנודד |
| he | term | הִתְנוֹדֵד | התניוודד | נד התנודד |
| he | term | הִתְנוֹדֵד | היטנוודד | נד התנודד |
| he | term | הִתְנוֹדֵד | היתנוודס | נד התנודד |
| ... | | ועוד 13 | | |

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

⛔ אדום · 138 התנגשויות חדשות, 0 זוגות צירה נפרצו.

## מה השער הזה **אינו** מוכיח

· שלוש השכבות נמדדות זו לצד זו ולא זו דרך זו. הנרדפות נמדדות במודל ההתאמה המדויקת
  של gate_synonyms, מפני שגם הריצה אינה מרכיבה אותן לתוך המרחק הממושקל.
· ‏via=exact הוא ההתנהגות של היום, והשער אינו מתיימר לתקן אותה.
· איכות התוכן, ניסוח ההודעה למשתמש, וההתנהגות בדפדפן אינן נמדדות כאן.

<!-- bank-gate: {"ver":"typo-lab/evolve/v1","paramsFp":"5495c82628ba","enabled":true,"cfg":"B1-union","cards":5663,"candidates":10239985,"pairs":10165462,"newCollisions":138,"baselineExact":737,"sameWord":38,"synonymGroups":55,"tsereRejected":5,"tserePairs":5,"layers":[{"lang":"he","set":"he-word","eff":3,"forms":18249,"pairs":2247775,"collisions":13},{"lang":"en","set":"en-word","eff":3,"forms":25770,"pairs":1977014,"collisions":125},{"lang":"he","set":"gloss","eff":3,"forms":6390,"pairs":629547,"collisions":0},{"lang":"en","set":"gloss","eff":3,"forms":9264,"pairs":5311126,"collisions":0}],"pass":false} -->
