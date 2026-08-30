import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, paperBackground } from "./brand";

/**
 * פ1 · קרוסלה · "10 מילים מהיחידה הקשה ביותר". 1080×1350, 12 שקופיות.
 *
 * המסר היחיד: הנה עשר מילים אמיתיות. כמה מהן אתה יודע?
 *
 * ⚠ למה קרוסלה ולא פוסט בודד: **קרוסלה נשמרת.** שמירה היא הסיגנל החזק ביותר
 * באינסטגרם, חזק מלייק ומתגובה, ולומדים שומרים רשימות מילים כדי לחזור אליהן.
 * פוסט שנשמר ממשיך להגיע לאנשים חדשים שבועות אחרי שעלה.
 *
 * ⚠ הכותרת "מהיחידה הקשה ביותר" ולא "שרוב הנבחנים לא יודעים": השנייה היא טענה
 * סטטיסטית שאין לנו נתון עליה. הראשונה נכונה ומאומתת מול המאגר: יחידה 10 היא
 * היחידה האחרונה, המדורגת כקשה ביותר.
 *
 * ⚠ כל פריים הוא שקופית. הרינדור הוא 12 stills, לא סרטון. ראה רנדר-קרוסלה.ps1
 */

type Slide = { w: string; d: string; ltr?: boolean };

/* ⚠ עשר המילים של 9.8 **נשרפו** ומתועדות ב-`תוכניות/מילים-בשימוש.md`.
   הסט הזה הוא הסבב השני, נשלף מיחידות 8 עד 10 ב-`data.js` וב-`data-en.js`
   ונבדק מול רשימת השרופות. **לפני כל סבב הבא — לבדוק שם שוב.**
   סבב ב (20.8) נשרף אף הוא. זהו **סבב ג**, 22.8. */
const WORDS: Slide[] = [
  { w: "נֵאוֹת", d: "הסכים · נענה לבקשה" },
  { w: "deceive", d: "להונות", ltr: true },
  { w: "פּוֹחֵז", d: "חסר אחריות · פזיז" },
  { w: "nuisance", d: "מטרד", ltr: true },
  { w: "לְמַפְרֵעַ", d: "לאחר מעשה · על מה שהיה" },
  { w: "exquisite", d: "מצוין; חד, מעודן", ltr: true },
  { w: "מִנְשָׁר", d: "הצהרה · כרוז" },
  { w: "wilderness", d: "ערבה, שממה", ltr: true },
  { w: "נִקְהַל", d: "נקבץ · נאסף" },
  { w: "vagueness", d: "עמימות, ערפול", ltr: true },
];

export const CAROUSEL_SLIDES = WORDS.length + 2; // שער + עשר מילים + סיום

const Frame: React.FC<{ children: React.ReactNode; footer?: string }> = ({ children, footer }) => (
  <AbsoluteFill
    style={{
      ...paperBackground,
      fontFamily: "Heebo, sans-serif",
      direction: "rtl",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 84px",
      textAlign: "center",
    }}
  >
    <div
      style={{
        position: "absolute", top: 68, fontFamily: "Frank Ruhl Libre, serif",
        fontWeight: 900, fontSize: 46, color: C.gold, direction: "ltr", letterSpacing: "-0.03em",
      }}
    >
      800+
    </div>
    {children}
    {/* ⚠ המונה חייב direction:ltr, אחרת המסגרת ה-RTL הופכת את "1 / 10" ל-"10 / 1"
        והקרוסלה סופרת אחורה. **הגרסה שפורסמה ב-9.8 יצאה עם הבאג הזה.** התוקן
        כאן ב-10.8; לרנדר מחדש לפני כל שימוש חוזר בפ1. הכיתוב "החליקו ←" נשאר RTL. */}
    {footer ? (
      <div
        style={{
          position: "absolute", bottom: 62, fontSize: 30, color: C.inkSoft, fontWeight: 300,
          direction: /^\d/.test(footer) ? "ltr" : "rtl",
        }}
      >
        {footer}
      </div>
    ) : null}
  </AbsoluteFill>
);

export const Carousel: React.FC = () => {
  const i = useCurrentFrame();

  // ── שער ──────────────────────────────────────────────────────────────
  if (i === 0) {
    return (
      <Frame footer="החליקו ←">
        <div style={{ fontSize: 32, color: C.gold, fontWeight: 700, letterSpacing: "0.22em", marginBottom: 34 }}>
          אוצר מילים לפסיכומטרי
        </div>
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 128, color: C.ink, lineHeight: 1.02 }}>
          10 מילים
        </div>
        {/* ⚠ `מהיחידה הקשה ביותר` בלשון יחיד היה נכון לסט של 9.8, שכולו יחידה 10.
            סט ב' נשלף מיחידות 8 עד 10, ולכן **לשון רבים**. פרט שגוי אחד הופך
            את הנכס לתפאורה, וזה בדיוק מה ש-`/VIS §4` בא למנוע. */}
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 74, color: C.accent, lineHeight: 1.15, marginTop: 18 }}>
          מהיחידות הקשות
        </div>
        <div style={{ fontSize: 40, color: C.inkSoft, marginTop: 46, fontWeight: 300, lineHeight: 1.45 }}>
          כמה מהן אתה מכיר?
          <br />
          שמרו את הפוסט וחזרו אליו
        </div>
      </Frame>
    );
  }

  // ── סיום ─────────────────────────────────────────────────────────────
  if (i === CAROUSEL_SLIDES - 1) {
    return (
      <Frame>
        {/* ⚠ שתי הסרות מכוונות, 20.8:
            · **מספר המילים ירד.** הוא התיישן פעמיים,
              וחגי כבר הורה במפורש לא לפרט מספרי מילים — מספר גדול נקרא כפרסומת.
            · **הבטחת התאריך ירדה.** הגבייה מתחילה באמצע ספטמבר, ונכס עם
              תאריך שנשרף בתוכו הופך לשקר ביום שאחרי.
            · **`כתבו בתגובות` הוחלף בבקשת שמירה ושליחה.** נמדד: 4 תגובות
              מ-3,657 צפיות, ושמירות 0.14% מול סף בריא של 1.5%. */}
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 92, color: C.ink, lineHeight: 1.12 }}>
          כמה ידעת?
          <br />
          <span style={{ color: C.accent }}>שמרו לחזרה</span>
        </div>
        <div style={{ fontSize: 42, color: C.ink, marginTop: 52, lineHeight: 1.5 }}>
          מכירים מישהו שניגש?
          <br />
          <span style={{ fontSize: 36, color: C.inkSoft }}>שלחו לו את זה</span>
        </div>
        <div
          style={{
            marginTop: 52, fontSize: 44, fontWeight: 700, color: "#fff",
            background: C.accent, borderRadius: 999, padding: "24px 58px",
            direction: "ltr", letterSpacing: "0.04em",
          }}
        >
          800-plus.com
        </div>
      </Frame>
    );
  }

  // ── שקופית מילה ──────────────────────────────────────────────────────
  const q = WORDS[i - 1];
  return (
    <Frame footer={`${i} / ${WORDS.length}`}>
      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif",
          fontWeight: 900,
          fontSize: q.ltr ? 108 : 124,
          color: C.ink,
          direction: q.ltr ? "ltr" : "rtl",
          lineHeight: 1.08,
        }}
      >
        {q.w}
      </div>

      <div style={{ height: 4, width: 168, background: `linear-gradient(90deg, ${C.gold}, transparent)`, borderRadius: 2, margin: "46px 0" }} />

      <div style={{ fontSize: 50, color: C.accent, fontWeight: 500, lineHeight: 1.32, maxWidth: 820 }}>
        {q.d}
      </div>
    </Frame>
  );
};
