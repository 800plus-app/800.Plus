/**
 * שפת המותג של 800+, זהה לזו שבאפליקציה ובסטוריז הסטטיים.
 *
 * למה קובץ אחד: מי שיגיע מהסטורי לאתר צריך לזהות מיד שהגיע למקום הנכון.
 * כל שינוי צבע כאן משנה את כל הסרטונים יחד, ולא משאיר אחד מאחור.
 * המקור: שיווק/תמונות/סטורי-מוצר.html
 */
export const C = {
  paper: "#f6f1e7",
  paperDeep: "#efe7d6",
  card: "#fffdf8",
  ink: "#2c2620",
  inkSoft: "#736a5c",
  gold: "#c9962f",
  accent: "#b5482e",
  accentDeep: "#8f3620",
  line: "#e3d8c4",
  ok: "#4a7c4e",
} as const;

/** רקע הנייר של האפליקציה. לא גרדיאנט: שתי הילות רכות על נייר חם. */
export const paperBackground = {
  backgroundColor: C.paper,
  backgroundImage: [
    `radial-gradient(circle at 16% 12%, rgba(201,150,47,.16), transparent 44%)`,
    `radial-gradient(circle at 86% 86%, rgba(181,72,46,.11), transparent 48%)`,
  ].join(","),
};

/** מידות הסטורי והרילס. אינסטגרם חותך כל מה שאינו בדיוק כאן. */
export const STORY = { width: 1080, height: 1920, fps: 30 } as const;

/**
 * מילים אמיתיות מתוך data-en.js, כולל היחידה שבה הן יושבות.
 * הן אינן מומצאות: מי שיפתח את האפליקציה אחרי הסרטון ימצא בדיוק אותן.
 */
export type Word = { en: string; he: string; unit: string };

export const WORDS: Record<string, Word> = {
  commemorate: { en: "commemorate", he: "להנציח, לציין זכר", unit: "10" },
  reluctant: { en: "reluctant", he: "מסויג, לא מעוניין", unit: "9" },
  inevitable: { en: "inevitable", he: "בלתי נמנע", unit: "8" },
  meticulous: { en: "meticulous", he: "קפדני", unit: "10" },
  obsolete: { en: "obsolete", he: "מיושן", unit: "9" },
  candid: { en: "candid", he: "כנה, ישיר", unit: "10" },
  deteriorate: { en: "deteriorate", he: "להידרדר", unit: "10" },
  ambiguous: { en: "ambiguous", he: "דו משמעי, לא לגמרי ברור", unit: "9" },
};

/** גודל המאגר. נספר מהקוד ב-5.8.2026, ומאומת ב-scripts/verify-counts.mjs */
export const TOTAL_WORDS = 5662;
export const FREE_UNTIL = "2026-08-30";

/**
 * מועד הפסיכומטרי שאליו מכוונים. מסר חגי, 5.8.2026.
 * ⚠ הספירה בסרטון התדמית מחושבת ממנו בזמן הרינדור ולכן היא נכונה ליום הרינדור
 * בלבד. לפני כל העלאה מחדש צריך לרנדר מחדש, אחרת הסרטון מכריז מספר שהתיישן.
 */
export const EXAM_DATE = "2026-09-03";

/** ימים שנותרו עד המועד, נכון לרגע הרינדור. */
export const daysToExam = () => {
  const exam = new Date(EXAM_DATE + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((exam.getTime() - now.getTime()) / 86400000));
};

export const freeUntilLabel = () => {
  const d = new Date(FREE_UNTIL + "T23:59:59");
  return `${d.getDate()}.${d.getMonth() + 1}`;
};
