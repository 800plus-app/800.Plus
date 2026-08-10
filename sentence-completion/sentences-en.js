/* השלמת משפטים באנגלית · שלב 0 · הוכחת היתכנות · 40 פריטים
 *
 * מבנה: window.SENT_EN[רמה] = [ {s,o,a,k,w,e}, ... ]  (לפי דוחות/השלמת-משפטים-אנגלית-תוכנית.md §3)
 *
 * ⚠ שינוי מהתוכנית, ומדידה היא שחייבה אותו
 * ----------------------------------------
 * §6.3 גייט 2 דורש ש"כל מילה במשפט קיימת ב-EN_RANK". EN_RANK הוא 3,175 ערכים
 * והם **מונחי המאגר**, לא אנגלית כללית: the · they · months · practiced · lost · won
 * כולן חסרות. המשפט לדוגמה של §3 עצמו נכשל בשער הזה בשבע מילים.
 *
 * לכן: **הרמה נגזרת מארבעת המסיחים בלבד** — max(EN_RANK) עליהם. זה גם נכון לגופו,
 * כי `the` ו-`months` אינן מה שהופך שאלה לקשה. תוצר-משנה שהוא יתרון: המסיחים
 * חייבים להיות מונחי מאגר, ולכן תרגול המשפטים מאמן בדיוק את אוצר המילים הנלמד.
 *
 * מילות הנשיאה נמדדות בנפרד (carrier_max) ומסומנות כדגל לעין אנושית — לא כפסילה.
 *
 * ⚠ מה שהשער **אינו** יכול לבדוק: אין כאן רשימת תדירות של אנגלית כללית, ולכן
 * אי אפשר לאמת אוטומטית שמשפט הנשיאה מתאים לרמה. זו מגבלה אמיתית, לא השמטה.
 *
 * הרצועות (§4): בסיס ≤2000 · בינוני 2001–5000 · מתקדם 5001–10000 · אקדמי >10000
 * שני חסרים = שני `___`, ואז כל איבר ב-o הוא זוג.
 */
window.SENT_EN = {
  "בסיס": [
    { s: "Although she studied all night, she still could not ___ the last question.",
      o: ["explain", "consider", "recognize", "prepare"], a: 0, k: "contrast", w: ["although"],
      e: "although פותח ניגוד: למרות הלימוד — התוצאה הפוכה." },

    { s: "The road was closed because a heavy ___ had blocked the bridge.",
      o: ["stone", "signal", "memory", "pleasure"], a: 0, k: "cause", w: ["because"],
      e: "because מחייב סיבה פיזית שחוסמת. רק stone יכול לחסום גשר." },

    { s: "The new medicine reduced the pain, and it also helped patients ___ more easily.",
      o: ["breathe", "blame", "destroy", "owe"], a: 0, k: "addition", w: ["also"],
      e: "also ממשיך באותו כיוון חיובי; רק breathe הוא שיפור רפואי." },

    { s: "You will not ___ the trip unless you book the tickets today.",
      o: ["afford", "invite", "record", "carry"], a: 0, k: "condition", w: ["unless"],
      e: "unless מציב תנאי: בלי הזמנה מוקדמת הנסיעה לא תהיה בהישג יד." },

    { s: "Simple daily habits, such as walking and drinking milk, help you ___ your health.",
      o: ["support", "destroy", "blame", "owe"], a: 0, k: "example", w: ["such as"],
      e: "such as מביא דוגמאות חיוביות, ולכן הפועל חייב להיות באותו כיוון." },

    { s: "The engine looked perfect, but the mechanic found a small ___ in the design.",
      o: ["fault", "chance", "group", "trip"], a: 0, k: "contrast", w: ["but"],
      e: "but הופך את הכיוון: נראה מושלם — ובפועל נמצא פגם." },

    { s: "Since the prison had no free ___, the new inmate waited in the hallway.",
      o: ["cell", "wall", "light", "engine"], a: 0, k: "cause", w: ["since"],
      e: "since מציין סיבה; בכלא cell הוא המקום שאליו מכניסים אדם." },

    { s: "The teacher explained the rule, and she also gave the class a short ___ to practice at home.",
      o: ["question", "castle", "forest", "divorce"], a: 0, k: "addition", w: ["also"],
      e: "also מוסיף עוד דבר מאותו סוג — משימה לימודית, לא מקום." },

    { s: "Once the alarm stopped, everyone in the building felt ___ again.",
      o: ["quiet", "guilty", "heavy", "slow"], a: 0, k: "condition", w: ["once"],
      e: "once מסמן רצף בזמן: אחרי שהאזעקה נפסקה חוזרת השלווה." },

    { s: "The plan was cheap; however, it was much harder to ___ than anyone expected.",
      o: ["handle", "invite", "owe", "copy"], a: 0, k: "contrast", w: ["however"],
      e: "however הופך כיוון: זול מצד אחד, קשה לביצוע מצד שני." }
  ],

  "בינוני": [
    { s: "Although the company had a strong ___, sales fell sharply last year.",
      o: ["reputation", "confession", "conspiracy", "rumor"], a: 0, k: "contrast", w: ["although"],
      e: "although פותח ניגוד: מוניטין חזק מול ירידה במכירות." },

    { s: "The farmers could not grow enough wheat because the ___ was poor.",
      o: ["soil", "statue", "wagon", "envelope"], a: 0, k: "cause", w: ["because"],
      e: "because מצביע על הסיבה החקלאית — רק soil מסביר יבול דל." },

    { s: "The new law protects workers; moreover, it lets them ___ a dangerous order without losing their job.",
      o: ["ignore", "embrace", "spoil", "approve"], a: 0, k: "addition", w: ["moreover"],
      e: "moreover מוסיף עוד הגנה באותו כיוון — הזכות לא לציית להוראה מסוכנת." },

    { s: "The bank will release the ___ provided that both partners sign the document.",
      o: ["deposit", "illness", "jungle", "beard"], a: 0, k: "condition", w: ["provided that"],
      e: "provided that מציב תנאי חוקי; רק deposit הוא דבר שבנק משחרר." },

    { s: "Practical skills matter: for instance, a worker who can ___ a conflict is valuable to any team.",
      o: ["solve", "spoil", "scare", "drag"], a: 0, k: "example", w: ["for instance"],
      e: "for instance מביא דוגמה שמדגימה את הכלל — כישור מעשי חיובי." },

    { s: "Despite the heavy ___, the ambassador continued his visit as planned.",
      o: ["threat", "pride", "noon", "bee"], a: 0, k: "contrast", w: ["despite"],
      e: "despite פותח ניגוד: איום כבד מול המשך הביקור." },

    { s: "The factory dumped fuel into the river, and as a result the whole ___ was poisoned.",
      o: ["territory", "conference", "kingdom", "estate"], a: 0, k: "cause", w: ["as a result"],
      e: "as a result גורר תוצאה ישירה של הזיהום — השטח כולו." },

    { s: "The school raised money for books; in addition, it asked local shops to ___ the project.",
      o: ["support", "bury", "warn", "dump"], a: 0, k: "addition", w: ["in addition"],
      e: "in addition מוסיף פעולה באותו כיוון חיובי — לתמוך." },

    { s: "The medicine will not ___ the illness unless the patient takes it daily.",
      o: ["defeat", "describe", "demand", "deliver"], a: 0, k: "condition", w: ["unless"],
      e: "unless מציב תנאי; רק defeat מתאים למחלה שמנוצחת." },

    { s: "His courage was obvious, yet his ___ of the danger was completely wrong.",
      o: ["knowledge", "charity", "wagon", "tribe"], a: 0, k: "contrast", w: ["yet"],
      e: "yet הופך כיוון: אומץ מצד אחד, הבנה שגויה מצד שני." }
  ],

  "מתקדם": [
    { s: "The evidence was weak; nevertheless, the scholar refused to ___ his theory.",
      o: ["withdraw", "conquer", "rehearse", "relieve"], a: 0, k: "contrast", w: ["nevertheless"],
      e: "nevertheless פותח ניגוד: ראיות חלשות — ובכל זאת סירב לחזור בו." },

    { s: "The lens was cracked; hence the laboratory could not ___ the sample properly.",
      o: ["examine", "conquer", "depart", "trim"], a: 0, k: "cause", w: ["hence"],
      e: "hence גורר תוצאה: עדשה סדוקה מונעת בדיקה מדויקת." },

    { s: "The first trial failed, and likewise the second could not ___ the result.",
      o: ["justify", "hesitate", "bounce", "glance"], a: 0, k: "addition", w: ["likewise"],
      e: "likewise מוסיף מקרה זהה בכיוון: גם השני לא הצליח להצדיק." },

    { s: "The council will not ___ the request unless every document is valid.",
      o: ["satisfy", "conquer", "rehearse", "bounce"], a: 0, k: "condition", w: ["unless"],
      e: "unless מציב תנאי: בלי מסמכים תקפים הבקשה לא תסופק." },

    { s: "Some traditions survive for centuries — a wedding ___, for instance, rarely changes.",
      o: ["ritual", "luxury", "dentist", "onion"], a: 0, k: "example", w: ["for instance"],
      e: "for instance מביא דוגמה למסורת — ritual הוא הטקס עצמו." },

    { s: "The northern province is fertile, whereas the south is almost a ___.",
      o: ["wilderness", "stadium", "laboratory", "exhibition"], a: 0, k: "contrast", w: ["whereas"],
      e: "whereas מציב ניגוד גיאוגרפי: פורה מול שממה." },

    { s: "The tourists hesitated because the path ahead looked ___.",
      o: ["bizarre", "organic", "facial", "naval"], a: 0, k: "cause", w: ["because"],
      e: "because מסביר את ההיסוס — מסלול שנראה מוזר." },

    { s: "The scholar published widely; moreover, his insight helped others ___ the whole field.",
      o: ["analyze", "conquer", "depart", "drip"], a: 0, k: "addition", w: ["moreover"],
      e: "moreover מוסיף תרומה נוספת באותו כיוון — יכולת לנתח." },

    { s: "Once the crew managed to ___ the storm, the voyage finally resumed.",
      o: ["endure", "sketch", "rehearse", "adjust"], a: 0, k: "condition", w: ["once"],
      e: "once מסמן רצף: רק לאחר שעמדו בסערה ההפלגה מתחדשת." },

    { s: "The recipe seemed simple; however, the result was far more ___ than the author claimed.",
      o: ["sophisticated", "convenient", "organic", "naval"], a: 0, k: "contrast", w: ["however"],
      e: "however הופך כיוון: פשוט למראה, מתוחכם בפועל." }
  ],

  "אקדמי": [
    { s: "Although the report seemed ___, the committee found its conclusions entirely ___.",
      o: [["articulate", "incomprehensible"], ["articulate", "widespread"], ["passive", "incomprehensible"], ["passive", "widespread"]],
      a: 0, k: "contrast", w: ["although"],
      e: "although דורש ניגוד בין שני החסרים: מסודר למראה — ובלתי מובן בתוכן." },

    { s: "Because the dialect was nearly ___, the linguist could not ___ the old inscription.",
      o: [["unclear", "decipher"], ["unclear", "imitate"], ["passive", "decipher"], ["passive", "imitate"]],
      a: 0, k: "cause", w: ["because"],
      e: "because מקשר סיבה לתוצאה: ניב עמום — ולכן אי אפשר לפענח." },

    { s: "Because the government wants growth, the new rule will ___ local commerce; similarly, it will ___ the confidence of foreign investors.",
      o: [["stimulate", "stabilize"], ["stimulate", "minimize"], ["neglect", "stabilize"], ["neglect", "minimize"]],
      a: 0, k: "addition", w: ["similarly", "because"],
      e: "similarly דורש שני חסרים באותו כיוון, והמשפט קובע שהכיוון חיובי — צמיחה." },

    { s: "Unless the committee can ___ the document, its ___ will remain in doubt.",
      o: [["authorize", "accuracy"], ["authorize", "mischief"], ["harass", "accuracy"], ["harass", "mischief"]],
      a: 0, k: "condition", w: ["unless"],
      e: "unless מציב תנאי: בלי אישור רשמי, הדיוק נשאר בספק." },

    { s: "The critic praised the film's aesthetic, yet called its plot utterly ___.",
      o: ["mediocre", "irresistible", "esteemed", "disciplined"], a: 0, k: "contrast", w: ["yet"],
      e: "yet הופך כיוון: שיבח את הצד החזותי — ופסל את העלילה." },

    { s: "Because the epidemic spread so fast, the ministry had to ___ new limits on travel.",
      o: ["impose", "minimize", "imitate", "exaggerate"], a: 0, k: "cause", w: ["because"],
      e: "because גורר תגובה מוסדית — הטלת הגבלות." },

    { s: "Some habits reveal character — a person who will ___ a promise, for instance, is rarely trusted again.",
      o: ["forsake", "clarify", "visualize", "elect"], a: 0, k: "example", w: ["for instance"],
      e: "for instance מדגים את הכלל; מי שנוטש הבטחה מאבד אמון." },

    { s: "The activist was expelled from the union; furthermore, the newspaper questioned her ___ altogether.",
      o: ["sincerity", "commerce", "dialect", "glacier"], a: 0, k: "addition", w: ["furthermore"],
      e: "furthermore מוסיף מהלך נוסף באותו כיוון שלילי — ערעור על היושרה." },

    { s: "Provided that the trait is ___, breeders can transmit it to the next generation.",
      o: ["continuous", "reluctant", "rural", "biblical"], a: 0, k: "condition", w: ["provided that"],
      e: "provided that מציב תנאי ביולוגי — תכונה רציפה עוברת בהורשה." },

    { s: "The village looked ___ at sundown, but by dawn the streets were ___ with traders.",
      o: [["desolate", "hectic"], ["hectic", "desolate"], ["desolate", "damp"], ["orderly", "damp"]],
      a: 0, k: "contrast", w: ["but"],
      e: "but דורש ניגוד בין שני החסרים: שומם בערב — הומה בבוקר. אפשרות 2 היא אותן מילים בסדר הפוך — המלכודת המתועדת ב-§1.4." }
  ]
};
