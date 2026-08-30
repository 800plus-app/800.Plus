import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { C, accessLabel, paperBackground } from "./brand";

/**
 * ק1 · קרוסלה · "כמעט אותו דבר". 1080×1350, 7 שקופיות.
 *
 * המסר היחיד: שתי מילים שנראות זהות, ופירוש שונה לגמרי.
 *
 * ⚠ למה דווקא זוגות מבלבלים, ולא עוד רשימת מילים: זה **טריגר השיתוף** החזק
 * ביותר שיש לנו. אדם ששולח את זה לחבר לא משתף תוכן, הוא מתגרה בו. שיתוף בפרטי
 * שוקל פי 3 עד 5 מלייק להגעה לקהל שאינו עוקב (`/MKT` §5), ולכן הקרוסלה הזאת
 * בנויה סביבו ולא סביב תגובות.
 *
 * ⚠ **שני האיברים של כל זוג קיימים במאגר האמיתי.** נבדק ב-10.8.2026 מול
 * `data-en.js`. זוגות מפורסמים כמו averse/adverse ו-elicit/illicit נפסלו
 * דווקא כי איבר אחד מהם חסר אצלנו, ומילה שאין באפליקציה שוברת את כל ההבטחה
 * (`/VIS` §4). היחידה של כל מילה רשומה למטה לצד הפירוש.
 *
 * ⚠ ההדגשה נופלת **אך ורק על האותיות שנבדלות**. זהו `/VIS` §3 בצורתו
 * המילולית ביותר: לא צובעים את המילה, צובעים את ההבדל. אם נצבע יותר, הצופה
 * לא ידע במה בדיוק להסתכל, וזה כל מה שהשקופית באה לומר.
 *
 * ⚠ כל פריים הוא שקופית. הרינדור הוא 7 stills, לא סרטון. ראה רנדר-קרוסלאות.ps1
 */

/** מקטע של מילה. `d` מסמן שהמקטע הוא ההבדל, ולכן הוא זה שנצבע. */
type Seg = { t: string; d?: boolean };
type Item = { segs: Seg[]; he: string; unit: string };
type Pair = { a: Item; b: Item };

const PAIRS: Pair[] = [
  {
    a: { segs: [{ t: "af", d: true }, { t: "fluence" }], he: "שפע", unit: "10" },
    b: { segs: [{ t: "in", d: true }, { t: "fluence" }], he: "השפעה, להשפיע", unit: "3" },
  },
  {
    a: { segs: [{ t: "devi" }, { t: "s", d: true }, { t: "e" }], he: "לתכנן, להמציא", unit: "10" },
    b: { segs: [{ t: "devi" }, { t: "c", d: true }, { t: "e" }], he: "מכשיר", unit: "3" },
  },
  {
    a: { segs: [{ t: "princip" }, { t: "al", d: true }], he: "מנהל בית ספר · ראשי, עיקרי", unit: "8" },
    b: { segs: [{ t: "princip" }, { t: "le", d: true }], he: "עיקרון, כלל יסוד", unit: "5" },
  },
  {
    a: { segs: [{ t: "ad" }, { t: "a", d: true }, { t: "pt" }], he: "להתאים · להסתגל", unit: "5" },
    b: { segs: [{ t: "ad" }, { t: "o", d: true }, { t: "pt" }], he: "לאמץ", unit: "7" },
  },
  {
    a: { segs: [{ t: "moral" }], he: "מוסר", unit: "5" },
    b: { segs: [{ t: "moral" }, { t: "e", d: true }], he: "מורל", unit: "7" },
  },
];

export const PAIRS_SLIDES = PAIRS.length + 2; // שער + חמישה זוגות + סיום

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
      padding: "0 84px",
      textAlign: "center",
    }}
  >
    {/* ⚠ direction:ltr, אחרת הפלוס קופץ לתחילת המחרוזת ומוצג ‎+800 (`/VIS` §9). */}
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

/** מילה אחת. האותיות הנבדלות בצבע ההדגשה, כל השאר בדיו. */
const Word: React.FC<{ item: Item }> = ({ item }) => (
  <div
    style={{
      fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 104,
      color: C.ink, direction: "ltr", lineHeight: 1.06, letterSpacing: "-0.01em",
    }}
  >
    {item.segs.map((s, k) => (
      <span key={k} style={s.d ? { color: C.accent } : undefined}>
        {s.t}
      </span>
    ))}
  </div>
);

const Side: React.FC<{ item: Item }> = ({ item }) => (
  <>
    <Word item={item} />
    <div style={{ fontSize: 46, color: C.inkSoft, fontWeight: 400, marginTop: 16, lineHeight: 1.3 }}>
      {item.he}
    </div>
  </>
);

export const CarouselPairs: React.FC = () => {
  const i = useCurrentFrame();

  // ── שער ──────────────────────────────────────────────────────────────
  if (i === 0) {
    return (
      <Frame footer="החליקו ←">
        <div style={{ fontSize: 32, color: C.gold, fontWeight: 700, letterSpacing: "0.22em", marginBottom: 34 }}>
          אוצר מילים לפסיכומטרי
        </div>
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 132, color: C.ink, lineHeight: 1.02 }}>
          כמעט אותו דבר
        </div>
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 72, color: C.accent, lineHeight: 1.15, marginTop: 20 }}>
          5 זוגות שקל להתבלבל ביניהם
        </div>
        <div style={{ fontSize: 38, color: C.inkSoft, marginTop: 48, fontWeight: 300, lineHeight: 1.45 }}>
          ההבדל הוא אות או שתיים
          <br />
          הפירוש שונה לגמרי
        </div>
      </Frame>
    );
  }

  // ── סיום ─────────────────────────────────────────────────────────────
  if (i === PAIRS_SLIDES - 1) {
    return (
      <Frame>
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 96, color: C.ink, lineHeight: 1.12 }}>
          כמה מהחמישה ידעת?
        </div>
        {/* טריגר השיתוף. הוא בתוכן, לא בקריאה לפעולה: זו התגרות, לא בקשה. */}
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 62, color: C.accent, marginTop: 34, lineHeight: 1.25 }}>
          שלחו את זה למי
          <br />
          שבטוח שהוא יודע הכל
        </div>
        <div
          style={{
            marginTop: 56, fontSize: 44, fontWeight: 700, color: "#fff",
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

  // ── שקופית זוג ───────────────────────────────────────────────────────
  const p = PAIRS[i - 1];
  return (
    <Frame count={`${i} / ${PAIRS.length}`}>
      <Side item={p.a} />

      {/* המפריד. רחב מספיק כדי שהעין תקרא שתי יחידות ולא רשימה אחת. */}
      <div
        style={{
          height: 3, width: 300, borderRadius: 2, margin: "62px 0",
          background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)`,
        }}
      />

      <Side item={p.b} />
    </Frame>
  );
};
