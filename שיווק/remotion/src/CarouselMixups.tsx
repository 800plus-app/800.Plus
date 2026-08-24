import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, paperBackground } from "./brand";

/**
 * ק4 · קרוסלה · "אות אחת, מילה אחרת". 1080×1350, 8 שקופיות.
 *
 * ⭐ **פורמט רביעי, ובכוונה** (`/FP §1`, כלל אין-חזרה של חגי מ-23.8).
 * רשימה = עשר מילים ברוחב · ק3 = פריט אחד לעומק · **וזה: זוגות בעימות.**
 * המבנה הוא **השוואה**, וזה מה שלא ניסינו.
 *
 * המסר היחיד: **מילים שנראות כמעט זהות ומשמעותן רחוקה.** מי שקורא מהר
 * במבחן בוחר לפי הצורה, וזה בדיוק המקום שבו נופלות נקודות.
 *
 * ⛔ **שני האיברים של הזוג באותה שקופית**, לפי הכלל של חגי מ-23.8:
 * "אף אחד לא יתחיל לגלול קדימה אחורה בשביל התשובות." השוואה שדורשת לזכור
 * את הצד השני אינה השוואה.
 *
 * ⚠ אין כאן טענה על מה נבחנים טועים בפועל. אין לנו נתון, ולכן הניסוח הוא
 * `נראות כמעט אותו דבר` — תיאור של הכתיב, שנכון תמיד.
 *
 * המקור: `data-en.js`, יחידות 7 עד 10, מרחק עריכה 1-2 בין האיברים.
 */

type Pair = { a: string; am: string; b: string; bm: string; tip: string };

const PAIRS: Pair[] = [
  { a: "warfare", am: "לוחמה", b: "welfare", bm: "סעד, רווחה",
    tip: "אות אחת מפרידה בין מלחמה לרווחה" },
  { a: "inferior", am: "נחות", b: "interior", bm: "פנימי",
    tip: "‎f‎ מול ‎t‎ · איכות מול מיקום" },
  { a: "envious", am: "מקנא", b: "anxious", bm: "חרד, להוט",
    tip: "שתיהן רגש, ואין ביניהן שום קשר" },
  { a: "partial", am: "חלקי", b: "martial", bm: "צבאי, קרבי",
    tip: "‎p‎ מול ‎m‎ · כמות מול תחום" },
  { a: "distract", am: "להסיח את הדעת", b: "distinct", bm: "ברור, נפרד",
    tip: "שתי אותיות · פעולה מול תכונה" },
];

export const MIXUP_SLIDES = PAIRS.length + 3;

const Frame: React.FC<{ children: React.ReactNode; footer?: string }> = ({ children, footer }) => (
  <AbsoluteFill
    style={{
      ...paperBackground,
      fontFamily: "Heebo, sans-serif",
      direction: "rtl",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 72px",
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
      <div style={{ position: "absolute", bottom: 62, fontSize: 30, color: C.inkSoft, fontWeight: 300, direction: /^\d/.test(footer) ? "ltr" : "rtl" }}>
        {footer}
      </div>
    ) : null}
  </AbsoluteFill>
);

const Big: React.FC<{ children: React.ReactNode; size?: number; color?: string }> = ({ children, size = 96, color = C.ink }) => (
  <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: size, color, lineHeight: 1.1 }}>
    {children}
  </div>
);

/* צד אחד של הזוג. direction:ltr על המילה, אחרת RTL הופך אותיות בודדות. */
const Side: React.FC<{ w: string; m: string; tone: string }> = ({ w, m, tone }) => (
  <div
    style={{
      background: C.card, borderRadius: 30, padding: "38px 26px",
      border: `2px solid ${C.line}`, flex: 1,
    }}
  >
    <div
      style={{
        fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 60,
        color: tone, direction: "ltr", lineHeight: 1.05,
      }}
    >
      {w}
    </div>
    <div style={{ height: 3, width: 70, background: C.line, margin: "24px auto", borderRadius: 2 }} />
    <div style={{ fontSize: 38, color: C.ink, fontWeight: 500, lineHeight: 1.35 }}>{m}</div>
  </div>
);

export const CarouselMixups: React.FC = () => {
  const i = useCurrentFrame();

  /* 0 · שער */
  if (i === 0) {
    return (
      <Frame footer="החליקו ←">
        <div style={{ fontSize: 32, color: C.gold, fontWeight: 700, letterSpacing: "0.22em", marginBottom: 36 }}>
          אוצר מילים לפסיכומטרי
        </div>
        <Big size={122}>אות אחת,</Big>
        <Big size={122} color={C.accent}>מילה אחרת</Big>
        <div style={{ fontSize: 40, color: C.inkSoft, marginTop: 46, fontWeight: 300, lineHeight: 1.45 }}>
          חמישה זוגות שנראים כמעט זהים
          <br />
          ואין ביניהם שום קשר
        </div>
      </Frame>
    );
  }

  /* 1 עד 5 · הזוגות */
  if (i <= PAIRS.length) {
    const p = PAIRS[i - 1];
    return (
      <Frame footer={`${i} / ${PAIRS.length}`}>
        <div style={{ display: "flex", gap: 22, width: "100%", maxWidth: 920, alignItems: "stretch" }}>
          <Side w={p.a} m={p.am} tone={C.ink} />
          <Side w={p.b} m={p.bm} tone={C.accent} />
        </div>
        <div style={{ fontSize: 36, color: C.inkSoft, marginTop: 46, fontWeight: 300, lineHeight: 1.4, maxWidth: 860 }}>
          {p.tip}
        </div>
      </Frame>
    );
  }

  /* 6 · הכלל */
  if (i === PAIRS.length + 1) {
    return (
      <Frame footer="זה עובד על כל מילה, לא רק על החמש">
        <div style={{ fontSize: 30, color: C.gold, fontWeight: 700, letterSpacing: "0.2em", marginBottom: 40 }}>
          הכלל
        </div>
        <Big size={78}>
          אם המילה נראית
          <br />
          <span style={{ color: C.accent }}>מוכרת מדי, עצרו</span>
        </Big>
        <div style={{ fontSize: 40, color: C.ink, marginTop: 50, lineHeight: 1.5, maxWidth: 840 }}>
          במבחן קוראים מהר, והעין בוחרת לפי הצורה.
          <br />
          <b>הרגע שבו אתם בטוחים הוא הרגע לבדוק שוב.</b>
        </div>
      </Frame>
    );
  }

  /* 7 · סיום */
  return (
    <Frame>
      <Big size={88}>
        כמה מהחמישה
        <br />
        <span style={{ color: C.accent }}>הכרתם?</span>
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
