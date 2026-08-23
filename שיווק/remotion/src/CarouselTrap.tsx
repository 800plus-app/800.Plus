import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, paperBackground } from "./brand";

/**
 * ק3 · קרוסלה · "המילה שנראית נכונה". 1080×1350, 8 שקופיות.
 *
 * ⭐ **פורמט חדש, ובכוונה.** חגי, 23.8: "בוא נוסיף כלל שהפרסומות לא חוזרות על
 * עצמן." ארבעה מתוך שבעה פרסומים היו קרוסלת רשימה. זה ההפך ממנה: **פריט אחד
 * לעומק במקום עשרה ברוחב.**
 *
 * המסר היחיד: **המשפט מגדיר את התשובה.** מי שקורא את ההגדרה במקום לנחש
 * בין ארבע מילים דומות, עונה נכון בלי לדעת את המילה.
 *
 * ⚠ למה זה נשמר ולא רק נצפה: רשימת מילים נשמרת כדי לשנן. **טכניקה נשמרת כדי
 * ליישם**, והיא עובדת על כל פריט במבחן ולא רק על העשרה שהיו בפוסט.
 *
 * ⛔ אין כאן טענה על מה "רוב הנבחנים" בוחרים. אין לנו נתון כזה, ו-`/VIS §4`
 * אוסר פרט שאי אפשר לאמת. הניסוח הוא `נראה מתאים`, וזה נכון תמיד.
 *
 * הפריט: `data-sent-en.js` · אקדמי #22 · `aca4#10`. הנימוקים הם שדה `r`.
 */

const ITEM = {
  sentence: ["Unless an earlier ruling of the same kind can be found,", "the claim has no ___ and the court will not hear it."],
  options: ["example", "model", "precedent", "rule"],   // ⚠ הנכונה במשבצת 3
  answer: "precedent",
  gloss: "תקדים",
  trap: "example",
  trapGloss: "דוגמה",
  trapWhy: "דוגמה ממחישה ואין לה כוח מחייב · והמשפט תולה בה את הזכות להישמע",
  signal: "an earlier ruling of the same kind",
  answerWhy: "הכרעה קודמת שמקנה תוקף להכרעה חדשה",
};

export const TRAP_SLIDES = 8;

const Frame: React.FC<{ children: React.ReactNode; footer?: string }> = ({ children, footer }) => (
  <AbsoluteFill
    style={{
      ...paperBackground,
      fontFamily: "Heebo, sans-serif",
      direction: "rtl",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 78px",
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
    {footer ? (
      <div style={{ position: "absolute", bottom: 62, fontSize: 30, color: C.inkSoft, fontWeight: 300, direction: "rtl" }}>
        {footer}
      </div>
    ) : null}
  </AbsoluteFill>
);

const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 30, color: C.gold, fontWeight: 700, letterSpacing: "0.2em", marginBottom: 40 }}>
    {children}
  </div>
);

const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string }> = ({ children, size = 96, color = C.ink }) => (
  <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: size, color, lineHeight: 1.1 }}>
    {children}
  </div>
);

/* המשפט באנגלית · direction:ltr חובה, אחרת הפסיקים קופצים לצד הלא נכון */
const Sentence: React.FC<{ mark?: string }> = ({ mark }) => (
  <div
    style={{
      background: C.card, borderRadius: 34, padding: "48px 44px",
      direction: "ltr", textAlign: "left", fontFamily: "Frank Ruhl Libre, serif",
      fontSize: 44, lineHeight: 1.5, color: C.ink, maxWidth: 900,
      border: `2px solid ${C.line}`,
    }}
  >
    {ITEM.sentence[0]}
    <br />
    {ITEM.sentence[1].split("___")[0]}
    {mark ? (
      <span style={{ color: C.accent, fontWeight: 900 }}>{mark}</span>
    ) : (
      <span style={{ display: "inline-block", width: 168, borderBottom: `5px solid ${C.accent}`, transform: "translateY(-10px)" }} />
    )}
    {ITEM.sentence[1].split("___")[1]}
  </div>
);

export const CarouselTrap: React.FC = () => {
  const i = useCurrentFrame();

  /* 0 · שער */
  if (i === 0) {
    return (
      <Frame footer="החליקו ←">
        <Kicker>השלמת משפטים · רמה אקדמית</Kicker>
        <Big size={118}>המילה</Big>
        <Big size={118} color={C.accent}>שנראית נכונה</Big>
        <div style={{ fontSize: 42, color: C.inkSoft, marginTop: 48, fontWeight: 300, lineHeight: 1.45 }}>
          ואיך לזהות אותה
          <br />
          בלי לדעת את התשובה
        </div>
      </Frame>
    );
  }

  /* 1 · המשפט */
  if (i === 1) {
    return (
      <Frame footer="איזו מילה נכנסת?">
        <Sentence />
      </Frame>
    );
  }

  /* 2 · האפשרויות */
  if (i === 2) {
    return (
      <Frame footer="כל הארבע נשמעות סבירות">
        <Kicker>ארבע אפשרויות</Kicker>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 26, width: "100%", maxWidth: 880 }}>
          {ITEM.options.map((o) => (
            <div
              key={o}
              style={{
                background: C.card, borderRadius: 999, padding: "30px 20px",
                fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 52,
                color: C.ink, direction: "ltr", border: `2px solid ${C.line}`,
              }}
            >
              {o}
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  /* 3 · המלכודת */
  if (i === 3) {
    return (
      <Frame>
        <Kicker>המלכודת</Kicker>
        <Big size={104} color={C.accent}>
          <span style={{ direction: "ltr", display: "inline-block" }}>{ITEM.trap}</span>
        </Big>
        <div style={{ fontSize: 40, color: C.inkSoft, marginTop: 22, fontWeight: 300 }}>{ITEM.trapGloss}</div>
        <div style={{ fontSize: 44, color: C.ink, marginTop: 52, lineHeight: 1.5, maxWidth: 820 }}>
          נראה מתאים לגמרי במשפט,
          <br />
          <b>וזה בדיוק מה שהופך אותו למסיח</b>
        </div>
      </Frame>
    );
  }

  /* 4 · למה המסיח נופל */
  if (i === 4) {
    return (
      <Frame>
        <Kicker>למה הוא לא נכון</Kicker>
        <div style={{ fontSize: 50, color: C.ink, lineHeight: 1.55, maxWidth: 860 }}>
          {ITEM.trapWhy}
        </div>
      </Frame>
    );
  }

  /* 5 · ⭐ הטכניקה · הלב של הנכס */
  if (i === 5) {
    return (
      <Frame footer="זה עובד על כל פריט, לא רק על זה">
        <Kicker>הטכניקה</Kicker>
        <Big size={80}>
          המשפט
          <br />
          <span style={{ color: C.accent }}>מגדיר את התשובה</span>
        </Big>
        <div
          style={{
            marginTop: 48, background: C.card, borderRadius: 26, padding: "34px 30px",
            direction: "ltr", fontFamily: "Frank Ruhl Libre, serif", fontSize: 40,
            color: C.accentDeep, fontWeight: 900, border: `2px solid ${C.line}`, maxWidth: 880,
          }}
        >
          {ITEM.signal}
        </div>
        <div style={{ fontSize: 38, color: C.inkSoft, marginTop: 34, fontWeight: 300, lineHeight: 1.45 }}>
          ההגדרה כתובה במשפט עצמו.
          <br />
          קראו אותה לפני שבוחרים.
        </div>
      </Frame>
    );
  }

  /* 6 · התשובה */
  if (i === 6) {
    return (
      <Frame>
        <Kicker>התשובה</Kicker>
        <Big size={104} color={C.accentDeep}>
          <span style={{ direction: "ltr", display: "inline-block" }}>{ITEM.answer}</span>
        </Big>
        <div style={{ fontSize: 44, color: C.ink, marginTop: 20, fontWeight: 500 }}>{ITEM.gloss}</div>
        <div style={{ fontSize: 40, color: C.inkSoft, marginTop: 44, lineHeight: 1.5, maxWidth: 820, fontWeight: 300 }}>
          {ITEM.answerWhy}
        </div>
      </Frame>
    );
  }

  /* 7 · סיום */
  return (
    <Frame>
      <Big size={86}>
        הטכניקה עובדת
        <br />
        <span style={{ color: C.accent }}>על כל פריט</span>
      </Big>
      <div style={{ fontSize: 42, color: C.ink, marginTop: 50, lineHeight: 1.5 }}>
        שמרו את זה לפני המועד
        <br />
        <span style={{ fontSize: 36, color: C.inkSoft }}>ומי שניגש איתכם ירצה את זה גם</span>
      </div>
      <div
        style={{
          marginTop: 54, fontSize: 44, fontWeight: 700, color: "#fff",
          background: C.accent, borderRadius: 999, padding: "24px 58px",
          direction: "ltr", letterSpacing: "0.04em",
        }}
      >
        800-plus.com
      </div>
    </Frame>
  );
};
