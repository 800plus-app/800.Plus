/* גרסה 2 · 8 פריטים · השיטה המתוקנת (10.8.2026)
 *
 * מה שונה מ-v1, ולמה
 * ------------------
 * ב-v1 שלפתי מילה מרצועת דירוג ואילצתי סביבה משפט. שער כיסוי ההקשר פסל 73%:
 * שלושה פותרים שקיבלו רק את המשפט ייצרו פה-אחד מילה **אחרת** מהמפתח שלי
 * (cure מול defeat · resolve מול solve · break מול forsake). כלומר ההקשר הכריע
 * מילה — לא זו שכתבתי. ורב-הברירה נתן 100% רק מפני שהמסיחים היו אבסורדיים
 * (naval, bee, onion), ולכן אפשר היה לפתור באלימינציה בלי לקרוא את המשפט.
 *
 * ⭐ ההיפוך: **הקושי בא מקרבת המסיחים, לא מנדירות התשובה.**
 *   · המפתח הוא המילה הטבעית שההקשר מחייב  → דרישה 1 ו-2
 *   · ארבעת המסיחים הם שדה סמנטי אחד, ורק אחד מדויק  → הקושי
 *   · המסיח מהיחידה הגבוהה קובע את הרצועה  → דרישה 3
 *
 * ⚠ הכלל שמונע מקרבת-מסיחים להפוך לעמימות: **המשפט עצמו חייב להכיל את הרמז
 *   שפוסל את המסיחים הקרובים.** ב-cure המשפט שולל במפורש הקלה זמנית, ולכן treat
 *   ו-relieve נופלים בגוף המשפט ולא בהתרשמות. בלי הרמז הזה מסיח קרוב הוא לא
 *   פריט קשה אלא פריט שבור — וזה מה שהשער בא לתפוס.
 *   ⚠ חגי הכריע ב-10.8 שצירוף לשוני **כן** נבדק (המבחן האמיתי בודק אותו), ולכן
 *   הכלל מרוכך: צירוף חזק ומילוני נחשב הבחנה תקפה, וההסבר e מלמד אותו.
 *
 * ⭐ הרצועות סודרו מחדש ב-10.8 לפי **bands.js** — מספר היחידה ב-data-en.js שלנו,
 *   ולא לפי enrank.js (CC BY-SA 4.0). ארבעה פריטים זזו רצועה. הרצועה נגזרת ולא
 *   מוצהרת, ולכן הנגזרת היא זו שקובעת ואני לא נלחם בה.
 *   ⚠ ותוצאה שצריך לומר: **אין כאן אף פריט "בסיס".** לפי סולם הקושי של הבנק שלנו,
 *   פריט בסיסי דורש שכל ארבעת המסיחים יהיו מיחידות 1–2, ואף אחד מהשמונה אינו כזה.
 */
window.SENT_EN = {
  "בינוני": [
    { s: "The car started every morning, so the mechanic looked for a small ___ in the wiring rather than a broken cable.",
      o: ["fault", "break", "waste", "place"], a: 0, k: "cause", w: ["so"],
      e: "fault הוא הצירוף לתקל בחיווט. break נשלל בגוף המשפט — מכונית שמתניעה כל בוקר אינה מנותקת; waste ו-place אינם תקלים." }
  ],

  "מתקדם": [
    /* תוקן אחרי סבב 1: המסיח `waste` נפסל בביקורת כ-AMBIGUOUS, ובצדק — "a waste where
       nothing but thorn grows" תקין, וההפרדה מ-desert הייתה רגיסטר בלבד. עכשיו המשפט
       נושא רמז אקלימי מפורש ("bakes without shade or water") שפוסל את jungle, ו-waste
       הוחלף. זה הכלל שנגזר מהסבב: מסיח בלי רמז שפוסל אותו אינו מסיח. */
    { s: "Because two centuries of grazing stripped the slope, the valley now bakes without shade or water, and travellers call it a ___.",
      o: ["desert", "jungle", "territory", "estate"], a: 0, k: "cause", w: ["because"],
      e: "הרמז האקלימי במשפט — אופה, בלי צל ובלי מים — פוסל את jungle במפורש. territory הוא שטח בלי מטען של צחיחות, ו-estate הוא רכוש בבעלות. רק desert נושא את הצחיחות עצמה." },

    /* ⛔ באג דקדוקי שנתפס בסבב 2: הנוסח היה "he only ___ it", שדורש עבר — ו-"he only
       withdraw it" אינו דקדוקי. כל שאר הפריטים בנויים כך שצורת הבסיס מתאימה (אחרי to,
       cannot, can, או כשם עצם), וזה היחיד שנשמט. שלושת פותרי ה-cloze כתבו `withdrew`,
       ואני "תיקנתי" את המנקד שיקבל נטיות לא-רגולריות — כלומר כיסיתי על פגם תוכן במקום
       לתקן אותו. הנוסח שונה ל-"chose only to ___", ואז צורת הבסיס נכונה. */
    { s: "He did not give up the theory; he chose only to ___ it from the journal until the new data arrived.",
      o: ["withdraw", "abandon", "reject", "dismiss"], a: 0, k: "contrast", w: ["did not", "only"],
      e: "המשפט שולל נטישה במפורש ומגביל בזמן, ולכן abandon, reject ו-dismiss נופלים — שלושתם סופיים. רק withdraw הוא הסרה זמנית שניתן לחזור ממנה." },

    { s: "Unless the images improve, the laboratory cannot ___ the chemical composition, even though the crystals themselves are already clearly visible.",
      o: ["analyze", "examine", "observe", "survey"], a: 0, k: "condition", w: ["unless"],
      e: "composition נבדק ב-analyze. examine ו-observe הם ראייה — והמשפט כבר מוסר שרואים את הגבישים, ולכן הם מיותרים; survey חל על שטח או על אוכלוסייה." },

    { s: "The drug does not merely ease the symptoms for a few hours; taken daily, it can actually ___ the illness.",
      o: ["cure", "treat", "relieve", "remedy"], a: 0, k: "contrast", w: ["not merely"],
      e: "המשפט שולל במפורש הקלה זמנית, ולכן treat ו-relieve נופלים — הם בדיוק מה שנשלל. remedy חל על מצב או על פגם, לא על מחלה. רק cure הוא חיסול המחלה עצמה." },

  ],

  "אקדמי": [
    /* סבב 3 · הפריט הזה עבר שלושה גלגולים, וכל אחד מהם נכשל בשער אחר:
       1. "unless the registrar can ___ it" — הביקורת: נקרא כתנאי מקדים, ולכן verify מתאים.
       2. הוספת "already checked and found true" — הביקורת אישרה, אבל **כיסוי ההקשר עדיין
          פסל**: כותב שמקבל רק את המשפט כותב `ratify`, וזו לא הייתה בבנק. ובנוסף
          זיהמתי בעצמי — המילה `registrar` בתוך המשפט הזרימה את הפותרים ל-`register`.
       3. `ratify` נוספה לבנק (יחידה 9) בהוראת חגי, `registrar` הוסרה, והמושא הוחלף
          ל-treaty. **הצירוף ratify a treaty הוא הצירוף הקנוני**, וזה בדיוק סוג ההבחנה
          שחגי הכריע שכן נבדקת. authorize חל על אדם או על פעולה, לא על אמנה. */
    { s: "Every clause has already been checked and found true; even so, the treaty carries no legal force until both parliaments ___ it.",
      o: ["ratify", "authorize", "verify", "confirm"], a: 0, k: "contrast", w: ["even so"],
      e: "אמנה מאשררים — ratify. המשפט מוסר שהסעיפים כבר נבדקו ואומתו, ולכן verify ו-confirm כבר נעשו ואינם החסר; authorize חל על אדם או על פעולה, לא על אמנה. מה שחסר הוא תוקף, וזה אשרור." },

    { s: "She had given her word and everyone expected her to keep it; instead, she chose to ___ the promise without a word of explanation.",
      o: ["break", "abandon", "betray", "forsake"], a: 0, k: "contrast", w: ["instead"],
      e: "הבטחה באנגלית נשברת — break. ארבעתם פעלי נטישה, אבל abandon חל על תוכנית או מקום, betray על אדם או על אמון, ו-forsake על אנשים, מקומות ואמונות. אף אחד מהם אינו לוקח promise." },

    { s: "He apologised at length, but the committee doubted his ___; furthermore, he repeated the same conduct the following week.",
      o: ["sincerity", "virtue", "conduct", "confession"], a: 0, k: "addition", w: ["furthermore", "but"],
      e: "הספק הוא אם ההתנצלות הייתה כנה — sincerity. conduct דווקא אינו בספק, המשפט מוסר אותו כעובדה; virtue רחב מדי (אופי מוסרי כללי, לא ההתנצלות), ו-confession הוא מעשה דיבור אחר." }
  ]
};
