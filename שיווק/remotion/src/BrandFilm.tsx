import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, paperBackground, TOTAL_WORDS, daysToExam, freeUntilLabel } from "./brand";

/**
 * סרטון התדמית. 45 שניות, אנכי.
 *
 * המסר היחיד: הציון שלך תלוי במילים שאתה לא מכיר, ונשאר לך זמן קצוב.
 * הקשת הרגשית: פחד ואז פתרון. אושר על ידי חגי, 5.8.2026.
 *
 * ⚠ ההחלטה שקובעת את הסרטון היא הפתיחה הקרה: שלוש שניות של מילה עברית עירומה
 * על מסך ריק, **בלי לוגו ובלי מוזיקה**. נשקלה פתיחה בספירה ענקית ונדחתה, כי
 * מספר גדול עם דדליין הוא חתימה מובהקת של פרסומת, והצופה מסנן אותה בחצי שנייה.
 * מודעות לא נראות כמו מילה בודדת על נייר ריק, ולכן הצופה נתקע כדי להבין מה הוא
 * רואה. הספירה זזה לביט 6, ושם היא נוחתת על מישהו שכבר גילה שהוא לא יודע.
 *
 * ⚠ הקצב איטי בכוונה עד ביט 8. שתי שניות שקט אחרי כל מילה הן הזמן שבו הצופה
 * מנסה להיזכר ונכשל, וזה כל הסרטון. אם ממהרים שם, אין סרטון.
 */

const HE = { w: "בְּרַם", d: "אולם · אבל · אך", unit: "10" };
const EN = { w: "superfluous", d: "מיותר, עודף", unit: "10" };

/** ציר הזמן בשניות. מוחזק במקום אחד כדי שכיוונון לא ידרוש חיפוש במספרים. */
const T = {
  b1: 0, b2: 3, b3: 6, b4: 10, b5: 14, b6: 20, b7: 26, b8: 33, b9: 41,
  end: 45,
} as const;

/** עוזר: שקיפות שנכנסת ויוצאת בגבולות ביט. */
const useBeat = (from: number, to: number, fadeIn = 0.5, fadeOut = 0.4) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return interpolate(
    frame,
    [from * fps, (from + fadeIn) * fps, (to - fadeOut) * fps, to * fps],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) },
  );
};

/* ── ביטים 1 ו-2 · המילה לבדה, ואז השאלה הקטנה ─────────────────────────── */
const BeatWord: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useBeat(T.b1, T.b3, 0.9, 0.5);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive }}>
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 168, color: C.ink, letterSpacing: "-0.01em" }}>
        {HE.w}
      </div>
      {/* השאלה נכנסת רק בביט 2. עד אז המילה לבדה, וזה כל הכוח שלה. */}
      <div
        style={{
          marginTop: 44,
          fontSize: 44,
          color: C.inkSoft,
          fontWeight: 300,
          opacity: interpolate(frame, [T.b2 * fps, (T.b2 + 0.6) * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        יודע מה זה?
      </div>
    </AbsoluteFill>
  );
};

/* ── ביטים 3 ו-4 · הפירוש, המילה באנגלית, והמכה ────────────────────────── */
const BeatReveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useBeat(T.b3, T.b5, 0.5, 0.45);

  const row = (label: string, def: string, ltr: boolean, at: number) => (
    <div
      style={{
        opacity: interpolate(frame, [at * fps, (at + 0.5) * fps], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        translate: interpolate(frame, [at * fps, (at + 0.5) * fps], ["0px 22px", "0px 0px"], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        textAlign: "center",
        marginBottom: 44,
      }}
    >
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 88, color: C.ink, direction: ltr ? "ltr" : "rtl" }}>
        {label}
      </div>
      <div style={{ fontSize: 40, color: C.accent, marginTop: 12, fontWeight: 500 }}>{def}</div>
    </div>
  );

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 80px" }}>
      {row(HE.w, HE.d, false, T.b3)}
      {row(EN.w, EN.d, true, T.b3 + 1.8)}

      {/* ביט 4 · הצירוף שהופך סקרנות לחרדה. לא "יש לנו מילים קשות" אלא "שלך". */}
      <div
        style={{
          marginTop: 26,
          fontSize: 52,
          fontWeight: 700,
          color: C.accentDeep,
          background: C.card,
          border: `2px solid ${C.line}`,
          borderRadius: 999,
          padding: "22px 52px",
          opacity: interpolate(frame, [T.b4 * fps, (T.b4 + 0.6) * fps], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}
      >
        שתיהן במבחן שלך
      </div>
    </AbsoluteFill>
  );
};

/* ── ביט 5 · העובדה. ארבעה מלבנים מתוך שישה ────────────────────────────── */
const BeatFact: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useBeat(T.b5, T.b6, 0.5, 0.45);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 80px" }}>
      {/* שישה מלבנים: ארבעה מתוך שישה הוא דבר שהעין סופרת בשבריר שנייה.
          כל ייצוג עשיר יותר דורש פענוח, ופענוח בסרטון הוא מסר שאבד. */}
      <div style={{ display: "flex", gap: 16, marginBottom: 62 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const on = i < 4;
          return (
            <div
              key={i}
              style={{
                width: 128,
                height: 176,
                borderRadius: 20,
                background: on ? C.accent : C.card,
                border: `3px solid ${on ? C.accent : C.line}`,
                opacity: on
                  ? interpolate(frame, [(T.b5 + 0.5 + i * 0.22) * fps, (T.b5 + 0.9 + i * 0.22) * fps], [0.25, 1], {
                      extrapolateLeft: "clamp", extrapolateRight: "clamp",
                    })
                  : 1,
              }}
            />
          );
        })}
      </div>

      {/* nowrap על "פרקי הרב-ברירה": בלעדיו המקף שובר את המילה לשתי שורות
          ונקרא "הרב- / ברירה". הגודל הורד מ-92 ל-74 כדי שהשורה תיכנס שלמה. */}
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 74, color: C.ink, textAlign: "center", lineHeight: 1.18 }}>
        <span style={{ color: C.accent }}>4 מתוך 6</span>{" "}
        <span style={{ whiteSpace: "nowrap" }}>פרקי הרב-ברירה</span>
        <br />
        נשענים על אוצר מילים
      </div>
    </AbsoluteFill>
  );
};

/* ── ביט 6 · הספירה ────────────────────────────────────────────────────── */
const BeatCountdown: React.FC = () => {
  const { fps } = useVideoConfig();
  const frame = useCurrentFrame();
  const alive = useBeat(T.b6, T.b7, 0.5, 0.45);
  const days = daysToExam();

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive }}>
      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif",
          fontWeight: 900,
          fontSize: 300,
          lineHeight: 0.9,
          color: C.accent,
          direction: "ltr",
          scale: interpolate(frame, [T.b6 * fps, (T.b6 + 0.8) * fps], [0.8, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1), output: "perceptual-scale",
          }),
        }}
      >
        {days}
      </div>
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 66, color: C.ink, marginTop: 18 }}>
        ימים עד הפסיכומטרי
      </div>
    </AbsoluteFill>
  );
};

/* ── ביט 7 · נקודת השבירה. השאלה האישית ────────────────────────────────── */
const BeatQuestion: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useBeat(T.b7, T.b8, 0.5, 0.4);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 80px" }}>
      {/* שתי המילים חוזרות קטנות. הן ההוכחה שהשאלה למטה אינה תיאורטית. */}
      <div style={{ display: "flex", gap: 30, marginBottom: 66, alignItems: "center" }}>
        <span style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 46, color: C.inkSoft }}>{HE.w}</span>
        <span style={{ color: C.line, fontSize: 34 }}>·</span>
        <span style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 46, color: C.inkSoft, direction: "ltr" }}>{EN.w}</span>
      </div>

      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif",
          fontWeight: 900,
          fontSize: 86,
          color: C.ink,
          textAlign: "center",
          lineHeight: 1.14,
          translate: interpolate(frame, [T.b7 * fps, (T.b7 + 0.8) * fps], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        אתה מוכן שהציון שלך
        <br />
        <span style={{ color: C.accent }}>ייפול על אוצר מילים?</span>
      </div>
    </AbsoluteFill>
  );
};

/* ── ביט 8 · המעבר היחיד לקצב מהיר. מה אנחנו מביאים ────────────────────── */
const BeatOffer: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useBeat(T.b8, T.b9, 0.4, 0.35);

  // שלוש שורות ולא חמש: ארבע כבר יותר מדי לשמונה שניות.
  const rows: [string, string][] = [
    [`${TOTAL_WORDS.toLocaleString("en-US")} מילים`, "בעברית ובאנגלית"],
    ["תרגול אדפטיבי", "רק מה שאתה לא יודע"],
    ["שליפה אקטיבית", "אתה כותב, לא בוחר"],
  ];

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 76px" }}>
      {rows.map(([head, sub], i) => {
        const at = T.b8 + 0.5 + i * 0.75;
        return (
          <div
            key={i}
            style={{
              width: "100%",
              background: C.card,
              border: `2px solid ${C.line}`,
              borderRadius: 26,
              padding: "30px 38px",
              marginBottom: 22,
              textAlign: "center",
              opacity: interpolate(frame, [at * fps, (at + 0.4) * fps], [0, 1], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [at * fps, (at + 0.4) * fps], ["0px 26px", "0px 0px"], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 58, color: C.accentDeep }}>{head}</div>
            <div style={{ fontSize: 36, color: C.ink, marginTop: 8 }}>{sub}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ── ביט 9 · הסגירה. שני התאריכים בלי איפור ────────────────────────────── */
const BeatClose: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = interpolate(frame, [T.b9 * fps, (T.b9 + 0.5) * fps], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive }}>
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 104, color: C.gold, direction: "ltr", letterSpacing: "-0.03em" }}>
        800+
      </div>
      <div style={{ fontSize: 46, color: C.accent, fontWeight: 700, direction: "ltr", letterSpacing: "0.06em", marginTop: 26 }}>
        800-plus.com
      </div>

      {/* שתי עובדות, אחת מעל השנייה. הצופה עושה את החשבון בעצמו.
          לא נוסח כתכנון פדגוגי: זה היה מייפה החלטה עסקית ומצייר אותה כטובה. */}
      <div style={{ marginTop: 64, textAlign: "center" }}>
        <div style={{ fontSize: 46, fontWeight: 700, color: C.ink }}>גישה חינם עד {freeUntilLabel()}</div>
        <div style={{ fontSize: 34, color: C.inkSoft, marginTop: 12, fontWeight: 300 }}>המבחן ב-3.9</div>
      </div>
    </AbsoluteFill>
  );
};

export const BrandFilm: React.FC = () => {
  return (
    <AbsoluteFill style={{ ...paperBackground, fontFamily: "Heebo, sans-serif", direction: "rtl" }}>
      <BeatWord />
      <BeatReveal />
      <BeatFact />
      <BeatCountdown />
      <BeatQuestion />
      <BeatOffer />
      <BeatClose />
    </AbsoluteFill>
  );
};
