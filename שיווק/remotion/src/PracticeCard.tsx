import React from "react";
import { Easing, interpolate } from "remotion";
import { C, type Word } from "./brand";

export type CardState = "typing" | "ok" | "wrong";

/**
 * כרטיס התרגול, זהה במבנה למסך האמיתי באפליקציה.
 *
 * למה נבנה ב-CSS ולא צילום מסך: צילום מתיישן ברגע שהמסך באפליקציה משתנה,
 * וכבר נשרף לנו פעם מספר שהתיישן בסרטון. כאן העדכון הוא שורת קוד.
 *
 * הרכיב עצמו חסר-זיכרון: הוא מקבל כמה אותיות להציג ובאיזה מצב, והקומפוזיציה
 * שמעליו היא זו שמחליטה מתי. כך אותו כרטיס משרת גם סטורי של 8 שניות
 * וגם סרטון של 15.
 */
export const PracticeCard: React.FC<{
  word: Word;
  /** כמה אותיות מהתשובה כבר הוקלדו. שבר עשרוני מתקבל ונחתך. */
  typed: number;
  state: CardState;
  /** 0 עד 1. שולט בכניסה והיציאה של הכרטיס. */
  presence?: number;
  /** מה שהוקלד בפועל, אם שונה מהתשובה הנכונה. */
  override?: string;
}> = ({ word, typed, state, presence = 1, override }) => {
  const full = override ?? word.en;
  const shown = full.slice(0, Math.max(0, Math.floor(typed)));
  const caret = state === "typing" && shown.length < full.length;

  const border = state === "ok" ? C.ok : state === "wrong" ? C.accent : C.gold;

  return (
    <div
      style={{
        width: 872,
        background: C.card,
        border: `3px solid ${C.line}`,
        borderRadius: 44,
        padding: "44px 40px 48px",
        boxShadow: "0 40px 90px rgba(44,38,32,.14)",
        opacity: presence,
        scale: interpolate(presence, [0, 1], [0.94, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
          output: "perceptual-scale",
        }),
      }}
    >
      <div style={{ fontSize: 28, color: C.inkSoft, marginBottom: 30, textAlign: "right" }}>
        יחידה {word.unit}
      </div>

      <div
        style={{
          background: C.paper,
          border: `2px solid ${C.line}`,
          borderRadius: 28,
          padding: "38px 34px",
        }}
      >
        <div style={{ fontSize: 27, color: C.gold, fontWeight: 700, letterSpacing: "0.1em", marginBottom: 20 }}>
          כתוב את המילה באנגלית
        </div>

        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 56, color: C.ink, lineHeight: 1.15 }}>
          {word.he}
        </div>

        {/* שדה התשובה. הגובה קבוע כדי שהכרטיס לא יקפוץ כשהטקסט גדל. */}
        <div
          style={{
            marginTop: 30,
            border: `3px solid ${border}`,
            borderRadius: 20,
            padding: "24px 26px",
            background: C.card,
            direction: "ltr",
            textAlign: "left",
            minHeight: 96,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span style={{ fontSize: 46, color: state === "wrong" ? C.accent : C.ink, letterSpacing: "0.01em" }}>
            {shown}
          </span>
          {caret ? (
            <span style={{ fontSize: 46, color: C.gold, opacity: 0.9 }}>|</span>
          ) : null}
        </div>

        {/* שורת התוצאה. תופסת מקום קבוע גם כשהיא ריקה, מאותה סיבה. */}
        <div style={{ minHeight: 54, marginTop: 22, display: "flex", alignItems: "center", gap: 14 }}>
          {state === "ok" ? (
            <span style={{ fontSize: 36, color: C.ok, fontWeight: 700 }}>✓ נכון</span>
          ) : state === "wrong" ? (
            <span style={{ fontSize: 34, color: C.accent, fontWeight: 700 }}>
              התשובה: <span style={{ direction: "ltr", display: "inline-block" }}>{word.en}</span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
};
