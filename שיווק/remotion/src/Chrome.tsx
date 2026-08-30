import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, paperBackground, accessLabel } from "./brand";

/**
 * המסגרת שחוזרת בכל הנכסים: רקע הנייר, הסימן 800+ למעלה, והכתובת למטה.
 *
 * למה רכיב אחד ולא העתקה בכל סרטון: שלושת הנכסים חייבים להיראות כמו סדרה.
 * צופה שרואה שני סטוריז שלנו ברצף צריך לזהות שזה אותו מקור בלי לקרוא את השם.
 */
export const Frame: React.FC<{
  children: React.ReactNode;
  /** שורת התווית הקטנה שמעל הכתובת. משתנה בין הנכסים. */
  footNote?: string;
}> = ({ children, footNote }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  return (
    <AbsoluteFill name="Frame" style={{ ...paperBackground, fontFamily: "Heebo, sans-serif", direction: "rtl" }}>
      {/* הסימן נכנס ראשון ונשאר. הוא העוגן שמזהה את המותג גם אם צופים חצי שנייה. */}
      <AbsoluteFill
        name="Mark"
        style={{
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: 104,
          opacity: interpolate(frame, [0, 0.5 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        {/* direction:ltr חובה. בתוך מסגרת RTL הפלוס קופץ לתחילת המחרוזת ו-"800+" נקרא "800+‎" הפוך. */}
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 58, color: C.gold, letterSpacing: "-0.03em", direction: "ltr" }}>
          800+
        </div>
      </AbsoluteFill>

      {children}

      {/* הכתובת נכנסת בסוף. מוקדם מדי והיא מתחרה בתוכן על תשומת הלב. */}
      <AbsoluteFill
        name="Footer"
        style={{
          alignItems: "center",
          justifyContent: "flex-end",
          paddingBottom: 132,
          opacity: interpolate(
            frame,
            [durationInFrames - 3.2 * fps, durationInFrames - 2.4 * fps],
            [0, 1],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
          ),
        }}
      >
        {footNote ? (
          <div style={{ fontSize: 34, color: C.inkSoft, marginBottom: 16, fontWeight: 300 }}>{footNote}</div>
        ) : null}
        <div
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: "#fff",
            background: C.accent,
            borderRadius: 999,
            padding: "26px 64px",
            direction: "ltr",
            letterSpacing: "0.04em",
          }}
        >
          800-plus.com
        </div>
        <div style={{ fontSize: 30, color: C.inkSoft, marginTop: 18, fontWeight: 300 }}>
          {accessLabel()}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
