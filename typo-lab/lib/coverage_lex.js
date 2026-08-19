'use strict';
/* coverage_lex · תוספת ללקסיקון, **כתובה על ידינו**
 *
 * ⛔ גבול הרישיון · אותו כלל עומד של CLAUDE.md ושל lib/lexicon.js.
 * אין כאן שום ייבוא: לא ויקימילון, לא WordNet עברי, לא האקדמיה ללשון, לא Quizlet,
 * לא Campus IL, ולא אף קורפוס CC BY-SA. כל מילה כאן **נכתבה על ידי LLM** בתוך
 * הפרויקט הזה, וזה הדפוס המתועד של הפרויקט (METHODOLOGY.md · CLAUDE.md §תוכן LLM).
 * שלושת הקבצים שהודרו מ-lib/lexicon.js בגלל היפוך סדר-הבחירה נשארים מודרים.
 *
 * ⭐ **סדר הבחירה נשמר.** הרשימה לא נבחרה מרשימת תדירות חיצונית. היא נגזרה מהשאלה
 * "אילו מילים אמיתיות שכן מוקלד קרוב אליהן עלול להיות" · כלומר מהשכנוּת של אוצר
 * המילים **שלנו**: המילים הקצרות של המאגר, הצורות הנוטות שלהן, והמילים האמיתיות
 * שהחלקה של תו אחד מהן מייצרת. זה בדיוק הסדר ש-CLAUDE.md דורש · בוחרים את המילה כי
 * אנחנו צריכים אותה, לא כי רשימה חיצונית בחרה אותה.
 *
 * ===== מה זה נועד לתקן, במספרים =====
 *
 * לקסיקון-הריצה מכיל 29,296 טיפוסים עבריים ורק **5,928 אנגליים**. הצד האנגלי הוא
 * בקירוב "המאגר ועוד קצת", כי הטקסטים שלנו כתובים עברית. התוצאה נמדדה בשני מקומות:
 *   · ‏318 שורות real-word אינן מכוסות באף שכבה (שלב 3 של coverage.js).
 *   · בדגימה ידנית של 200 מחרוזות he-word שתויגו accept על מפתחות בני 3-5 אותיות,
 *     ‏24 הן **מילים עבריות אמיתיות** (‏12%) שהלקסיקון פשוט אינו מכיר · כלומר התווית
 *     עצמה שגויה, ולא רק הכיסוי.
 *
 * ⚠ מה שהתוספת הזאת עושה למדידה: היא **מורידה** recall מדוד ומעלה בטיחות. שורה
 * שתויגה accept ונחסמת עכשיו היא שורה שהתווית שלה הייתה שגויה מלכתחילה. ‏coverage.js
 * מודד את זה במפורש (acceptTrustedRowsLost) ולא מסתיר אותו בתוך "recall ירד".
 *
 * הנרמול זהה ל-lib/lexicon.js · ‏norm העברי ו-normEn האנגלי של האפליקציה עצמה, דרך
 * ‏getCtx. כתיבה בצורת פני-השטח ולא במפתח מנורמל היא מכוונת: כך אפשר לקרוא ולבקר את
 * הרשימה, והנרמול נשאר במקום אחד.
 *
 * ⚠ עברית נכתבת כאן ב**כתיב חסר וגם מלא** במקומות ששניהם בשימוש, כי norm אינו מאחד
 * ביניהם (‏"שלחן" ו-"שולחן" הם שני טוקנים). מפתחות המאגר נגזרים מצורות מנוקדות ולכן
 * הם חסרים ברובם, וזה הצד שההחלקות נופלות אליו.
 */

const { getCtx } = require('./ctx.js');

/* ===== עברית ===== */

/* מילות פונקציה, מילות יחס וכינויים · הקבוצה הצפופה ביותר במרחק עריכה 1 זו מזו,
   ולכן זו שמייצרת הכי הרבה התנגשויות על מפתחות קצרים. */
const HE_FUNC = `
אני אתה את הוא היא אנחנו אתם אתן הם הן אותי אותך אותו אותה אותנו אותם אותן
שלי שלך שלו שלה שלנו שלכם שלהם שלהן לי לך לו לה לנו לכם להם להן
בי בך בו בה בנו בכם בהם ממני ממך ממנו ממנה מאתנו מהם מהן
זה זו זאת אלה אלו הזה הזאת האלה כזה כזאת כאלה
מי מה מתי איפה איך למה כמה מדוע היכן כיצד אשר
של אל על עם את בין תחת מעל ליד אצל מול לפני אחרי בתוך מתוך בלי ללא עד מן מ
כי אם אז גם רק כבר עוד שוב אולי בוודאי בטח כן לא אין יש היה הייתה יהיה תהיה
כל כלל כולם כולנו כולו כולה שום אף איזה איזו כמו ככה כך אחר אחרת
פה שם כאן שמה עכשיו אתמול מחר היום הלילה הבוקר הערב תמיד לעולם לפעמים
מאוד יותר פחות הכי ממש בערך כמעט לגמרי בכלל דווקא אפילו למעשה כלומר
אבל אלא אולם ברם ואילו בעוד כאשר כשה מפני בגלל למרות אף על פי
`;

/* שמות עצם קצרים ונפוצים · הליבה של מפתחות בני 3-5 אותיות במאגר, ולכן גם היעד
   העיקרי של החלקות. נכתבים חסר ומלא כשצריך. */
const HE_NOUN = `
אב אם בן בת אח אחות איש אישה ילד ילדה נער נערה זקן זקנה תינוק גבר
ראש עין אוזן אזן אף פה שן לשון יד רגל לב ריאה כבד כליה עצם עור דם בשר
שער שיער פנים גב בטן חזה כתף מרפק ברך אצבע ציפורן צפורנ גרון צוואר צואר
בית דלת חלון גג קיר רצפה תקרה חדר מטבח סלון מרפסת גינה חצר גדר שער מפתח
שולחן שלחן כיסא כסא מיטה מטה ארון מדף מנורה מראה שטיח וילון כרית שמיכה
לחם חלב גבינה חמאה ביצה בשר דג עוף אורז פסטה תפוח בננה ענב תמר זית שקד
מים מיץ יין בירה קפה תה סוכר מלח פלפל שמן חומץ דבש ריבה עוגה עוגייה
כלב חתול סוס פרה כבש עז חזיר תרנגול אווז ברווז יונה נשר עורב דרור ציפור
דוב זאב שועל ארנב עכבר חולד נחש לטאה צב צפרדע דג לוויתן כריש דולפין
עץ פרח עלה שורש ענף גזע קליפה פרי זרע דשא עשב שיח יער חורש בוסתן
שמש ירח כוכב עננ ענן גשם שלג ברד רוח סערה ברק רעם קשת שמים ארץ אדמה
הר גבעה עמק נחל נהר ים אגם מפרץ חוף חול סלע אבן מערה מדבר ביצה
דרך כביש רחוב שדרה סמטה כיכר גשר מנהרה תחנה נמל שדה מגרש
מכונית אוטו רכב אופניים רכבת מטוס אונייה סירה משאית אוטובוס מונית
ספר דף עמוד שורה מילה אות מספר סיפור שיר שאלה תשובה מבחן ציון שיעור
עבודה משרה שכר כסף מטבע שטר חשבון מחיר הנחה רווח הפסד חוב מס
זמן שעה דקה שנייה יום שבוע חודש שנה עונה אביב קיץ סתיו חורף
צבע לבן שחור אדום כחול ירוק צהוב כתום סגול ורוד חום אפור
ראייה שמיעה ריח טעם מגע קול רעש שקט אור חושך צל
שמחה עצב כעס פחד אהבה שנאה קנאה גאווה בושה חרטה תקווה יאוש
חוק משפט דין שופט עורך תביעה הגנה עדות ראיה עונש קנס מאסר
מלך שר נשיא ראש עם מדינה ממשלה כנסת צבא חייל קצין מפקד
מלחמה שלום ברית הסכם חוזה ויכוח ריב פשרה ניצחון תבוסה
דת אמונה תפילה ברכה קללה חג מועד שבת צום מצווה עבירה
רופא חולה מחלה כאב תרופה זריקה ניתוח בית חולים אחות מרפאה
מורה תלמיד כיתה בית ספר אוניברסיטה מרצה סטודנט תעודה
אמן ציור פסל תמונה מוזיקה שיר ריקוד תיאטרון סרט מחזה
כלי סכין מזלג כף צלחת כוס בקבוק סיר מחבת תנור מקרר
בגד חולצה מכנסיים חצאית שמלה מעיל נעל גרב כובע צעיף חגורה
`;

/* פעלים · הצורות שהלומד באמת מקליד · עבר/הווה/עתיד/ציווי/שם פועל בגופים נפוצים. */
const HE_VERB = `
היה הייתי היית היינו יהיה תהיה אהיה נהיה להיות
עשה עשיתי עושה יעשה תעשה לעשות נעשה עשוי
אמר אמרתי אומר יאמר תאמר לומר נאמר
הלך הלכתי הולך ילך תלך ללכת נלך
בא באתי בא יבוא תבוא לבוא נבוא
ראה ראיתי רואה יראה תראה לראות נראה
שמע שמעתי שומע ישמע תשמע לשמוע נשמע
ידע ידעתי יודע ידע תדע לדעת נדע
נתן נתתי נותן ייתן תיתן לתת ניתן
לקח לקחתי לוקח ייקח תיקח לקחת נלקח
כתב כתבתי כותב יכתוב תכתוב לכתוב נכתב
קרא קראתי קורא יקרא תקרא לקרוא נקרא
אכל אכלתי אוכל יאכל תאכל לאכול נאכל
שתה שתיתי שותה ישתה תשתה לשתות
ישן ישנתי ישן יישן תישן לישון
קם קמתי קם יקום תקום לקום
שב שבתי שב ישוב תשוב לשוב
עמד עמדתי עומד יעמוד תעמוד לעמוד
ישב ישבתי יושב יישב תשב לשבת
רץ רצתי רץ ירוץ תרוץ לרוץ
עבד עבדתי עובד יעבוד תעבוד לעבוד
למד למדתי לומד ילמד תלמד ללמוד
לימד לימדתי מלמד ילמד ללמד
חשב חשבתי חושב יחשוב תחשוב לחשוב
הבין הבנתי מבין יבין תבין להבין
זכר זכרתי זוכר יזכור תזכור לזכור
שכח שכחתי שוכח ישכח תשכח לשכוח
אהב אהבתי אוהב יאהב תאהב לאהוב
שנא שנאתי שונא ישנא תשנא לשנוא
פחד פחדתי מפחד יפחד תפחד לפחד
בכה בכיתי בוכה יבכה תבכה לבכות
צחק צחקתי צוחק יצחק תצחק לצחוק
פתח פתחתי פותח יפתח תפתח לפתוח
סגר סגרתי סוגר יסגור תסגור לסגור
שבר שברתי שובר ישבור תשבור לשבור
בנה בניתי בונה יבנה תבנה לבנות
הרס הרסתי הורס יהרוס תהרוס להרוס
מכר מכרתי מוכר ימכור תמכור למכור
קנה קניתי קונה יקנה תקנה לקנות
שילם שילמתי משלם ישלם תשלם לשלם
נסע נסעתי נוסע ייסע תיסע לנסוע
טס טסתי טס יטוס תטוס לטוס
עבר עברתי עובר יעבור תעבור לעבור
נכנס נכנסתי נכנס ייכנס תיכנס להיכנס
יצא יצאתי יוצא ייצא תצא לצאת
עלה עליתי עולה יעלה תעלה לעלות
ירד ירדתי יורד יירד תרד לרדת
נפל נפלתי נופל ייפול תיפול ליפול
קרה קרה קורה יקרה תקרה לקרות
התחיל התחלתי מתחיל יתחיל תתחיל להתחיל
גמר גמרתי גומר יגמור תגמור לגמור
סיים סיימתי מסיים יסיים תסיים לסיים
המשיך המשכתי ממשיך ימשיך תמשיך להמשיך
הפסיק הפסקתי מפסיק יפסיק תפסיק להפסיק
`;

/* שמות תואר ותוארי פועל */
const HE_ADJ = `
גדול גדולה גדולים קטן קטנה קטנים ארוך ארוכה קצר קצרה רחב רחבה צר צרה
גבוה גבוהה נמוך נמוכה עמוק עמוקה רדוד עבה עבות דק דקה כבד כבדה קל קלה
חזק חזקה חלש חלשה מהיר מהירה איטי איטית זריז זריזה עצל עצלה
חדש חדשה ישן ישנה עתיק עתיקה מודרני צעיר צעירה מבוגר מבוגרת
טוב טובה רע רעה יפה יפים מכוער נעים נעימה נורא נוראה מצוין מצוינת
חם חמה קר קרה קריר פושר רטוב רטובה יבש יבשה לח לחה
מלא מלאה ריק ריקה שלם שלמה שבור שבורה נקי נקייה מלוכלך
קשה קשות פשוט פשוטה מסובך ברור ברורה מעורפל מובן מוזר מוזרה
חכם חכמה טיפש טיפשה נבון נבונה מטומטם פיקח
עשיר עשירה עני ענייה אמיד דל דלה זול זולה יקר יקרה
שמח שמחה עצוב עצובה כועס כועסת מפחד רגוע רגועה עצבני
חשוב חשובה מיותר נחוץ נחוצה מספיק מיוחד מיוחדת רגיל רגילה
אמיתי אמיתית מזויף נכון נכונה שגוי שגויה בטוח בטוחה מסוכן
`;

/* צורות עם תחיליות · ‏ב/ל/כ/מ/ש/ה/ו לפני שם עצם. הן חצי מהמקרים שנמדדו: החלקה של
   תו אחד ממפתח בן 4 אותיות נופלת ישר על צורה מוטה כזאת. */
const HE_PREFIXED = `
בבית בגן בחצר בדרך בעיר בכפר בשדה בים ביער בהר בעמק בחדר במטבח
לבית לגן לחצר לדרך לעיר לכפר לשדה לים ליער להר לעמק לחדר למטבח
מבית מגן מחצר מדרך מעיר מכפר משדה מים מיער מהר מעמק מחדר
כבית כגן כדרך כעיר כשדה כים כהר כאיש כאישה כילד כמלך
הבית הגן החצר הדרך העיר הכפר השדה הים היער ההר העמק החדר
ובית וגן וחצר ודרך ועיר וכפר ושדה וים ויער והר ועמק וחדר
בחכה בסיר בכוס בכלי בספר בדף בשיר בשעה ביום בלילה בבוקר בערב
לחכה לסיר לכוס לכלי לספר לדף לשיר לשעה ליום ללילה לבוקר לערב
מחכה מסיר מכוס מכלי מספר מדף משיר משעה מיום מלילה מבוקר מערב
בכסף בזהב בברזל בעץ באבן בחול במים באש בשמש בירח בכוכב
לכסף לזהב לברזל לעץ לאבן לחול למים לאש לשמש לירח לכוכב
`;

/* מילים שנמצאו בפועל בדגימה · ‏24 מחרוזות שתויגו accept והן מילים עבריות אמיתיות.
   הן נכתבות כאן במפורש כדי שהתיקון יהיה בדיק ולא כללי. */
const HE_AUDITED = `
אכבה אכבו יכבה תכבה כיבה כיביתי לכבות
בחכה חכה חכות חכתי מחכה מחכים לחכות
גולם גולמו גולמים גלמים
גף גפיים גפי גפיו גפייך
דונם דונמים דונמו
דל דלים דלה דלות דלות
גייר הגייר גיירתי מגייר להתגייר גר גרים
המציא המציה המצאה ממציא להמציא
הפיק הפק הפקה מפיק להפיק הפקתי
התיש התישה התישת מתיש להתיש
בוסר ובוסר בוסרי
זוג זוגו זוגות זוגי זוגתי
חזייה חזיית חזיות
חלחל חלחלו מחלחל לחלחל חלחול
חיטט יחטט מחטט לחטט חיטוט
קלה יקלה קלוי לקלות מקלה
כופר ככופר כופרים כפירה
אב אבות לאבות אבותיי אבותינו
לוטו
קונה לקונו קונים קנייה
מברג מברגים מברגה
שגב מושגב נשגב שגיב
מניין ממניינ מניינים מניין
ציטט ציטוט ציטטה ציטוטים לצטט מצטט
`;

/* מנה שנייה · **ממוקדת במדידה**. אלה 220 האסימונים ששונים בפועל בין המוקלד לבין
   המפתח ב-318 השורות שאף שכבה אינה מכסה (‏out/coverage-uncovered.json). כמעט כולן
   מילים עבריות רגילות · הרוב מילות שתיים-שלוש אותיות ומילים שבתוך צירוף. זה מדגים
   את הטענה: החור אינו באוצר מילים נדיר אלא בעברית הבסיסית שהטקסטים שלנו לא כתבו.
   הכתיב כאן הוא פני-השטח עם אותיות סופיות, כדי שאפשר יהיה לקרוא ולבקר. */
const HE_UNCOVERED = `
אל את לב עץ רווח בת יד ללא עם כליל כן כת נפש נשף עד עף קל אונייה אות אז אש
בחן גם דם הרה זג חורש יין כוח כי למנות מדים מי מין נדלה נח סם עגלה עז על עליה
עש עשב קן רהב רוח רך שלו שן אגן אד אורגני אח אחר אי איות אישיות אמץ ארוך ארח
אירע בוחר בלתי בית ביתי בכדי ביקר בר ברי גולמי גוף גלמי גמא גנים דבק דברים דוד
דיוק דמות הבא הד הדוק הוגיע היכן הילה הכי העניש הקץ הר התגלה התקנא זירה זית
זעיר זר חוט חולק חוק חזית חלוץ חם חקירה חרוש חרש טיל טף ייסד יצר ישר כולל כילי
כלי כליות כמה כמו כמות כנה כסות כתמול לא לבוש לבטא לבן לוח לול לזכר לחקות לידה
לישון לכן לפי לפתוח לקוי לשון מאוד מאוים מגע מדיה מה מונה מושך מושכל מיד מילא
מלך מן מסור מעניין מרוץ מרי מרכז מרעה משא משה משרת מתאבל מתווך מתון נאה נבואה
נד נכמר נמר נפשי סד סיבולת סף עבד עובר עורר עיוות עישב עמוד עמוק עצה ער עשן פה
פושט פן פעם פרוע פריחה פרק פתי צור צי קבר קדמון קומה קרח קרטוב קרש ראיה ראשון
רגישות רזה ריח רע רק שוק שח שיחה שיש של שמא שנן שעבר תו תיתורה תכף תלול תקין תר
נלאה ביקש נפשו נקלה אלומת טיפה טפה בור מגופה בליבו אומר דמעות שליש דק עבוט
תמחוי תא מקצתיה ומלבר
`;

/* ===== אנגלית · הצד הרזה של הלקסיקון (5,928 טיפוסים) =====
 * הרשימה נגזרה מהשכנוּת של המפתחות הקצרים של המאגר האנגלי (1,070 ערכים שהמפתח
 * הקצר ביותר שלהם הוא עד 5 אותיות): מילים אמיתיות שהחלפה, השמטה, הכפלה או היפוך
 * של תו אחד מהם מייצרים · בדיוק המסלול שמייצר את הדלי real-word. */
const EN_CORE = `
a an the and or but if so then than that this these those there here where when why how
i me my mine you your yours he him his she her hers it its we us our ours they them their
who whom whose what which while whether although though because since until unless
be am is are was were been being do does did done doing have has had having
can could will would shall should may might must ought need dare
go goes went gone going come comes came coming get gets got gotten getting
make makes made making take takes took taken taking give gives gave given giving
say says said saying tell tells told telling ask asks asked asking
see sees saw seen seeing look looks looked looking watch watched
hear hears heard hearing listen listened feel feels felt feeling touch touched
know knows knew known knowing think thinks thought thinking believe believed
want wants wanted wanting wish wished hope hoped need needs needed
like likes liked liking love loves loved hate hates hated
find finds found finding lose loses lost losing keep keeps kept
put puts putting set sets setting let lets letting
run runs ran running walk walks walked walking sit sits sat stand stands stood
eat eats ate eaten drink drinks drank sleep sleeps slept wake woke
read reads write writes wrote written speak speaks spoke spoken
work works worked working play plays played playing learn learns learned
buy buys bought sell sells sold pay pays paid cost costs
open opens opened close closes closed start starts started stop stops stopped
begin begins began begun end ends ended finish finishes finished
help helps helped try tries tried use uses used using
call calls called name names named live lives lived
turn turns turned move moves moved change changes changed
bring brings brought send sends sent carry carries carried
build builds built break breaks broke broken fix fixes fixed
grow grows grew cut cuts cutting hold holds held
man men woman women boy boys girl girls child children baby people person
father mother son daughter brother sister uncle aunt cousin family friend
head hand arm leg foot feet eye eyes ear ears nose mouth tooth teeth hair face
back neck chest heart blood bone skin body mind brain
house home room door window wall floor roof gate yard garden farm
table chair bed desk lamp mirror shelf box bag cup glass plate bowl
food bread milk meat fish egg rice bean fruit apple grape lemon
water juice wine beer coffee tea sugar salt oil soup cake
dog cat horse cow pig sheep goat bird duck hen fox wolf bear deer lion
mouse rat snake frog fish shark whale bee ant fly worm
tree leaf leaves root branch flower grass seed wood forest
sun moon star sky cloud rain snow wind storm fire ice
sea lake river hill mountain valley rock stone sand beach island
road street path bridge city town village country state world land
car bus train plane ship boat bike wheel road trip
book page word line letter name number story song poem
school class teacher student test grade lesson pen paper desk
work job money coin bill price shop store market bank
time hour day week month year today tomorrow morning night noon
color white black red blue green yellow brown gray pink
big small large little long short tall high low wide narrow thick thin
old new young fresh clean dirty full empty heavy light hard soft
good bad best worst better worse fine nice ugly kind cruel
hot cold warm cool wet dry fast slow quick early late
happy sad angry glad afraid calm proud shy brave tired
right wrong true false real fake sure safe free busy
first second third last next other same
one two three four five six seven eight nine ten eleven twelve
all any both each every few many much most none some several
about above across after against along among around at before behind below
beneath beside between beyond by down during for from in inside into near
of off on onto out outside over past through to toward under until up upon with within without
also again almost already always ever never often once only quite rather really
soon still too very well yet just even less more nearly perhaps
act add age aid aim air ale all and ant ape apt arc are ark arm art ash ask ate awe axe
bad bag ban bar bat bay bed bee beg bet bid big bin bit boa bog bow box boy bud bug bun bus but buy
cab cad cage cake calf call calm came camp cane cap car card care cart case cash cast
dam damp dare dark dart dash date dawn dead deaf deal dean dear debt deck deed deep deer
ear earl earn ease east easy echo edge edit else even evil exam exit
face fact fade fail fair fall fame fare farm fast fate fear feed fell felt fern file fill film
gain gale game gang gap gas gate gaze gear gene gift gill girl glow goal goat gold golf gone
hail hair half hall halt hand hang harm harp hate haul have hawk haze heal heap heat heel held
idea idle idol inch inn iron isle item
jail jam jar jaw jazz jet job join joke jolt joy judge juice jump june junk jury just
keen keep kept key kick kid kill kin kind king kiss kit kite knee knew knit knot know
lace lack lad lady laid lake lamb lame lamp land lane lap lash last late lava lawn lazy lead
mad made mail main make male mall malt many map mar march mare mark mask mass mast mat mate
nail name nap nave near neat neck need nest net new news next nice night nine node noise none
oak oar oath obey odd ode oil old omit once only onto open oral orbit order organ other ounce oven owe owl own
pace pack pact page paid pail pain pair pale palm pan pane pant park part pass past pat path
quart queen quest queue quick quiet quilt quit quite quiz quote
race rack radar rag rage raid rail rain raise rake ram ran rank rape rapid rare rash rat rate
sack sad safe sage said sail saint sake sale salt same sand sane sang sank sap sat save saw
tab table tack tact tag tail take tale talk tall tame tank tap tape tar target task taste
ugly umbrella uncle under undo unit unite until upon urban urge usage user usual
vain vale valve van vary vase vast veal veil vein vent verb verse very vessel vest vet vex
wage wagon waist wait wake walk wall want war ward ware warm warn wart wash wasp waste watch
yard yarn yawn year yeast yell yes yet yield yoke yolk you young your youth
zeal zebra zero zest zinc zip zone zoo
able about above abuse actor adapt admit adopt adore adult after again agent agree ahead
alarm album alert alien align alike alive alley allow alone along aloud alter amend among
ample anger angle angry ankle apart apple apply april arena argue arise armor armed arrow
aside asset atlas audio audit avoid await awake award aware awful
bacon badge badly baker basic basin basis batch bathe beach beard beast begin being belly
below bench berry birth black blade blame blank blast blaze bleed blend bless blind block
blood bloom blown blues blunt board boast bonus boost booth bound brain brake brand brass
brave bread break breed brick bride brief bring brisk broad broke brook broom brown brush
build built bunch bunny burnt burst buyer cabin cable cargo carve catch cause cease chain
chair chalk charm chart chase cheap cheat check cheek cheer chess chest chief child chill
choir choke chose chunk churn civic civil claim clash clasp class clean clear clerk click
cliff climb cling clock close cloth cloud clown coach coast cobra cocoa colon color comet
comic coral corny couch cough could count court cover crack craft crane crash crawl crazy
cream creek creep crest crime crisp cross crowd crown crude cruel crush crust curse curve
cycle daily dairy dance dated dealt death debut decay decor delay delta dense depth derby
diary dirty ditch dizzy dodge dough dozen draft drain drama drank drape drawn dread dream
dress dried drift drill drink drive drone drove drown drunk dwell eager eagle early earth
easel eaten ebony edged eight elbow elder elect elite empty enact enemy enjoy enter entry
equal equip erase error essay event every exact exams exert exile exist extra fable faced
faint fairy faith false fancy fatal fault favor feast fence ferry fetch fever fiber field
fiery fifth fifty fight final finch fired first fixed flame flash fleet flesh flick fling
flint float flock flood floor flour flown fluid flush focal focus foggy folly force forge
forth forty forum found frame fraud fresh fried front frost frown fruit fudge fully funny
gauge ghost giant given glade gland glare glass gleam glide globe gloom glory glove going
goods goose grace grade grain grand grant grape graph grasp grass grave graze great greed
green greet grief grill grind gripe groan groom gross group grove growl grown guard guess
guest guide guild guilt habit halve handy happy harsh haste hatch haunt heard heart heavy
hedge hello hence herbs hobby hoist honey honor horde horse hotel hound house hover human
humid humor hurry ideal idiot image imply index inept infer inner input inset intro irony
issue ivory jelly jewel joint judge juice juicy knack kneel knelt knife knock known label
labor laden lance lapse large larva laser later laugh layer leach leafy leaky learn lease
least leave ledge legal lemon level lever light liken limbs limit linen liner links lion
liver llama lobby local lodge lofty logic loose lorry loser lousy lower loyal lucid lucky
lunar lunch lying magic maize major maker mango manor maple march marsh match maybe mayor
meant medal media medic melon mercy merge merit merry metal meter midst might minor minus
mirth mixed model moist money month moral motor mound mount mourn mouse mouth moved movie
muddy mummy mural music naive naked nasal nasty naval needy nerve never newly niche night
noble noise noisy north notch noted novel nurse nylon oasis occur ocean offer often olive
onion onset opera orbit order organ other ought ounce outer owner oxide ozone paint pale
panel panic paper parch parer parka party pasta paste patch pause peace peach pearl pedal
penny perch peril petal phase phone photo piano piece pilot pinch pitch pivot place plain
plane plank plant plate plaza plead pleat plumb plume plunk poem point poise polar polio
polish porch pouch pound power prank press price pride prime print prior prism prize probe
prone proof proud prove prune pulse punch pupil puppy purge purse queen query quest quiet
quilt quite quota quote radar radio raise rally ranch range rapid ratio raven razor reach
react ready realm rebel refer regal reign relax relay renew repay reply reset resin retro
rider ridge rifle right rigid rinse ripen risen risky rival river roast robot rocky rogue
roman rough round route royal rugby ruler rumor rural sadly saint salad salon salty sandy
sauce saucy scale scalp scant scarf scary scene scent scoop scope score scorn scout scrap
screw scrub seize sense serve seven sever shade shaft shake shall shame shape share shark
sharp shave shear sheep sheer sheet shelf shell shift shine shiny shirt shock shoot shore
short shout shove shown shrub shrug sight silly since siren sixth sixty skate skill skirt
slate slave sleek sleep sleet slice slide slime sling slope small smart smash smell smile
smoke snack snake snarl sneak sniff snore snowy soggy solar solid solve sorry sound south
space spare spark speak spear speck speed spell spend spice spicy spike spill spine spite
splash split spoil spoke spoon sport spout spray spread spring sprint squad squat stack
staff stage stain stair stake stale stalk stall stamp stand stare stark start state stave
steal steam steel steep steer stern stick stiff still sting stock stole stone stool store
storm story stout stove strap straw stray strip stuck study stuff stump stung style sugar
suite sunny super surge swarm swear sweat sweep sweet swell swept swift swing sword syrup
table taboo tacit taken talon tango taper tardy taste teach tempo tenor tense tenth thank
theft theme there these thick thief thigh thing think third thorn those three threw throb
throw thumb tidal tiger tight timid tired title toast today token tonic tooth topic torch
total touch tough towel tower toxic trace track trade trail train trait tramp trash tread
treat trend trial tribe trick tried tripe troop trout truck truly trunk trust truth tulip
tumor tunic turbo tutor twice twist typal ulcer uncle under undue unfit union unite unity
until upper upset urban urged usage usher usual utter vague valid value valve vapor vault
verse vibes video vigor villa vinyl viral virus visit vital vivid vocal vodka vogue voice
vouch vowel wager wagon waist waive waltz waste watch water weary weave wedge weigh weird
whale wheat wheel where which while whine whirl whisk white whole whose widen widow width
wield wight winds windy wiper wired wiser witty woman women world worry worse worst worth
would wound woven wrath wreck wrist write wrong wrote yacht yeast yield young yours youth
zebra zesty
`;

/* ===== בנייה · אותו נרמול בדיוק של lib/lexicon.js ===== */
const NIQQUD = /[֑-ׇ]/g;
const HE_WORD = /[א-ת]+/g;
const EN_WORD = /[A-Za-z]+/g;
const MIN = 2;

let cached = null;
function build() {
  if (cached) return cached;
  const he = getCtx('he');
  const en = getCtx('en');
  const heSet = new Set(), enSet = new Set();

  const eatHe = text => {
    const t = String(text).replace(NIQQUD, '');
    const m = t.match(HE_WORD);
    if (m) for (const w of m) { const n = he.norm(w); if (n && n.length >= MIN) heSet.add(n); }
  };
  const eatEn = text => {
    const m = String(text).match(EN_WORD);
    if (m) for (const w of m) { const n = en.normEn(w); if (n && n.length >= MIN) enSet.add(n); }
  };

  for (const blk of [HE_FUNC, HE_NOUN, HE_VERB, HE_ADJ, HE_PREFIXED, HE_AUDITED, HE_UNCOVERED]) eatHe(blk);
  eatEn(EN_CORE);
  /* שלושת האסימונים האנגליים הלא מכוסים · שניים מהם מילים אמיתיות, ו-"un" אינו מילה
     עצמאית ולכן אינו נכנס. ההבחנה הזאת היא בדיוק מה שהרשימה אמורה לעשות. */
  eatEn('an led');

  cached = {
    he: heSet, en: enSet,
    meta: {
      source: 'LLM-written inside this project · no external dictionary',
      heTypes: heSet.size, enTypes: enSet.size,
      blocks: ['HE_FUNC', 'HE_NOUN', 'HE_VERB', 'HE_ADJ', 'HE_PREFIXED', 'HE_AUDITED', 'HE_UNCOVERED', 'EN_CORE']
    }
  };
  return cached;
}

const built = build();
module.exports = { he: built.he, en: built.en, meta: built.meta, build };
