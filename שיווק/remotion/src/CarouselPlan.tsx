import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, accessLabel, daysToExam, paperBackground } from "./brand";

/**
 * ק2 · קרוסלה · "תוכנית אוצר מילים לימים שנשארו". 1080×1350, 7 שקופיות.
 *
 * המסר היחיד: יש עוד זמן, אבל רק אם משנים את אופן הלמידה.
 *
 * ⚠ למה קרוסלת תוכנית ולא עוד רשימת מילים: רשימת מילים נשמרת, **תוכנית
 * נשלחת**. אדם שניגש למבחן עם חבר שולח לו את זה בלי לחשוב, וזה בדיוק
 * טריגר השיתוף שאנחנו מחפשים (`/MKT` §5). לכן שקופית הסיום שואלת "מי ניגש
 * איתכם" ולא "מה דעתכם".
 *
 * ⚠⚠ **הספירה מחושבת מ-EXAM_DATE בזמן הרינדור ומתיישנת כל יום.**
 * קרוסלה שרונדרה אתמול מכריזה מספר שגוי היום. **לרנדר מחדש ביום ההעלאה,
 * בלי יוצא מן הכלל.** זו בדיוק התקלה ש-`/VIS` §4 נוצר בגללה.
 *
 * ⚠ ארבעת הצעדים הראשונים מתארים משהו שהמוצר באמת עושה. **אין בהם מספר
 * שלא נספר או שלא אושר.**
 *
 * ⛔ **צעד 05 הוחלף ב-30.8.2026.** קודם היה כתוב בו "עברית ואנגלית ביחד",
 * ומתחתיו "4 מתוך 6 פרקי הפסיכומטרי נשענים על אוצר מילים". חגי: *"המשפט
 * שכתבת מתחת לא קשור לכותרת."* **והוא צדק: העובדה נכונה ואושרה ב-3.8,
 * אבל היא מנמקת למה ללמוד אוצר מילים בכלל, לא למה ללמוד את שתי השפות יחד.**
 *
 * ⚠ **הצעד החדש הוא הראשון בקרוסלה שאינו עובדה על המוצר**, והוא נכנס
 * בהנחיית חגי לתת טיפ שעוזר לזיכרון או לוויסות לחץ. **ולכן הוא גם היחיד
 * שאי אפשר לאמת מול הקוד**, בניגוד לכלל של `/FP` §3.
 *
 * ⚠ כל פריים הוא שקופית. הרינדור הוא 7 stills, לא סרטון.
 */

/**
 * ⚠ הכותרת היא **מערך שורות**, לא מחרוזת. שבירה אוטומטית השאירה את "רשימה"
 * לבדה בשורה שנייה בצעד 03, וזו בדיוק הפרט שנתפס רק בהסתכלות על ה-PNG.
 * כאן השבירה מפורשת, ולכן היא לא משתנה כשגופן או רוחב משתנים (`/VIS` §4).
 */
type Step = { n: string; title: string[]; why: string };

const STEPS: Step[] = [
  {
    n: "01",
    title: ["אל תפתח מאגר חדש"],
    why: "מילה שכבר נגעת בה קרובה יותר לשליטה ממילה שלא ראית מעולם",
  },
  {
    n: "02",
    title: ["קבע מספר קבוע ליום"],
    why: "אותו מספר בכל יום הופך ערימה לרשימה שנגמרת",
  },
  {
    n: "03",
    title: ["שלוף מהראש", "אל תקרא רשימה"],
    why: "קריאה מרגישה כמו ידיעה. כתיבת התשובה מוכיחה אותה",
  },
  {
    n: "04",
    title: ["חזור רק על מה", "שאתה לא שולט בו"],
    why: "כל דקה על מילה שאתה כבר יודע היא דקה שלא הושקעה בחולשה",
  },
  {
    n: "05",
    title: ["בלילה שלפני", "תישן, אל תשנן"],
    why: "סבב אחרון בשעה מאוחרת מוסיף מעט. מה שתרגלת נשלף טוב יותר אחרי שינה מלאה",
  },
];

export const PLAN_SLIDES = STEPS.length + 2; // שער + חמישה צעדים + סיום

/**
 * ⚠ `count` ולא `footer` למונה. המונה חייב `direction:ltr`, אחרת המסגרת
 * ה-RTL הופכת את "1 / 5" ל-"5 / 1" והקרוסלה סופרת אחורה. הכיתוב "החליקו ←"
 * חייב להישאר RTL. שני שדות נפרדים, כי דגל אחד היה מזמין את הטעות ההפוכה.
 */
const Frame: React.FC<{ children: React.ReactNode; footer?: string; count?: string }> = ({ children, footer, count }) => (
  <AbsoluteFill
    style={{
      ...paperBackground,
      fontFamily: "Heebo, sans-serif",
      direction: "rtl",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 92px",
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
    {footer || count ? (
      <div
        style={{
          position: "absolute", bottom: 62, fontSize: 30, color: C.inkSoft, fontWeight: 300,
          direction: count ? "ltr" : "rtl",
        }}
      >
        {count ?? footer}
      </div>
    ) : null}
  </AbsoluteFill>
);

export const CarouselPlan: React.FC = () => {
  const i = useCurrentFrame();
  const days = daysToExam();

  // ── שער ──────────────────────────────────────────────────────────────
  // ⚠ "2 ימים" אינו עברית (`/HEB` §5). מתחת לשלושה ימים אין מספר-ענק בכלל,
  //    ובמקומו משפט תקין. הקרוסלה הזאת ממילא מאבדת טעם ביומיים האחרונים.
  if (i === 0) {
    const bigNumber = days >= 3;
    return (
      <Frame footer="החליקו ←">
        <div style={{ fontSize: 32, color: C.gold, fontWeight: 700, letterSpacing: "0.22em", marginBottom: 30 }}>
          אוצר מילים לפסיכומטרי
        </div>

        {bigNumber ? (
          <>
            <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 236, color: C.ink, lineHeight: 0.94 }}>
              {days}
            </div>
            <div style={{ fontSize: 48, color: C.inkSoft, fontWeight: 300, marginTop: 10 }}>
              ימים עד מועד ספטמבר
            </div>
          </>
        ) : (
          <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 104, color: C.ink, lineHeight: 1.1 }}>
            {days === 0 ? "המבחן היום" : days === 1 ? "המבחן מחר" : "נשארו יומיים"}
          </div>
        )}

        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 78, color: C.accent, lineHeight: 1.15, marginTop: 44 }}>
          5 דברים שכדאי
          <br />
          לעשות עכשיו
        </div>
      </Frame>
    );
  }

  // ── סיום ─────────────────────────────────────────────────────────────
  if (i === PLAN_SLIDES - 1) {
    return (
      <Frame>
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 104, color: C.ink, lineHeight: 1.12 }}>
          מי ניגש איתכם?
        </div>
        {/* טריגר השיתוף. שאלה שמכריחה לחשוב על אדם מסוים היא מה שמייצר שליחה. */}
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 64, color: C.accent, marginTop: 34, lineHeight: 1.25 }}>
          שלחו לו את התוכנית
        </div>
        <div
          style={{
            marginTop: 60, fontSize: 44, fontWeight: 700, color: "#fff",
            background: C.accent, borderRadius: 999, padding: "24px 58px",
            direction: "ltr", letterSpacing: "0.04em",
          }}
        >
          800-plus.com
        </div>
        <div style={{ fontSize: 32, color: C.inkSoft, marginTop: 20, fontWeight: 300 }}>{accessLabel()}</div>
      </Frame>
    );
  }

  // ── שקופית צעד ───────────────────────────────────────────────────────
  const s = STEPS[i - 1];
  return (
    <Frame count={`${i} / ${STEPS.length}`}>
      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 92,
          color: C.gold, direction: "ltr", lineHeight: 1, marginBottom: 46,
        }}
      >
        {s.n}
      </div>

      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 84, color: C.ink, lineHeight: 1.18 }}>
        {s.title.map((line, k) => (
          <React.Fragment key={k}>
            {k > 0 ? <br /> : null}
            {line}
          </React.Fragment>
        ))}
      </div>

      <div style={{ height: 3, width: 220, background: C.line, borderRadius: 2, margin: "50px 0" }} />

      <div style={{ fontSize: 44, color: C.inkSoft, fontWeight: 400, lineHeight: 1.45, maxWidth: 800 }}>
        {s.why}
      </div>
    </Frame>
  );
};
