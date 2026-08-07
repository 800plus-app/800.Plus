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

const WORDS: Slide[] = [
  { w: "בְּרַם", d: "אולם · אבל · עם זאת" },
  { w: "superfluous", d: "מיותר, עודף", ltr: true },
  { w: "אָשְׁיוֹת", d: "מסד · בסיס · יסוד" },
  { w: "obstinate", d: "עקשן", ltr: true },
  { w: "גַּחֲמָה", d: "רצון פתאומי בלי טעם הגיוני · קפריזה" },
  { w: "disparage", d: "לזלזל, להמעיט בערך", ltr: true },
  { w: "הַלָּה", d: "ההוא · המדובר" },
  { w: "frugal", d: "חסכני", ltr: true },
  { w: "הִלְעִיז", d: "השמיץ · פרסם שקרים על מישהו" },
  { w: "condone", d: "לסלוח, למחול", ltr: true },
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
    {footer ? (
      <div style={{ position: "absolute", bottom: 62, fontSize: 30, color: C.inkSoft, fontWeight: 300 }}>
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
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 74, color: C.accent, lineHeight: 1.15, marginTop: 18 }}>
          מהיחידה הקשה ביותר
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
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 92, color: C.ink, lineHeight: 1.12 }}>
          כמה ידעת?
          <br />
          <span style={{ color: C.accent }}>כתבו בתגובות</span>
        </div>
        <div style={{ fontSize: 42, color: C.ink, marginTop: 52, lineHeight: 1.5 }}>
          יש עוד{" "}
          <b style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, color: C.accentDeep, fontSize: 54 }}>
            5,652
          </b>{" "}
          כאלה
          <br />
          <span style={{ fontSize: 34, color: C.inkSoft }}>בעברית ובאנגלית</span>
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
        <div style={{ fontSize: 32, color: C.inkSoft, marginTop: 20, fontWeight: 300 }}>חינם עד 30.8</div>
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
