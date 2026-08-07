import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { C, paperBackground } from "./brand";

/**
 * ר2 · "5 מילים שרוב האנשים לא יודעים". 32 שניות, ריל אנכי.
 *
 * המסר היחיד: תבדוק את עצמך עכשיו.
 *
 * ⚠ ההימור המרכזי: **שתי שניות של מילה לבדה לפני שהפירוש נחשף.** זה הזמן שבו
 * הצופה מנסה לענות לעצמו, וזה מה שגורם לו לעצור על הריל במקום לגלול. עצירה
 * היא הסיגנל החזק ביותר לאלגוריתם, חזק יותר מלייק.
 *
 * ⚠ אם מקצרים את השתיקה, הריל הופך לרשימת מילים ומאבד את כל הכוח. **אל תקצר.**
 *
 * המילים מיחידות 9 ו-10 של המאגר האמיתי, כלומר הרמה שבה מילה נראית מוכרת אבל
 * אינך באמת יודע אותה. שלוש בעברית ושתיים באנגלית, כדי שגם קהל אמיר"ם ייכנס.
 */

type Q = { w: string; d: string; unit: string; ltr?: boolean };

/**
 * ⚠ חמש מילים **שלא הופיעו באף נכס אחר**. חגי, 7.8: "אל תשתמש במילים
 * שכבר השתמשנו בהן בפרסומת". ריל שחוזר על המילים של סרטוני התדמית
 * ושל הקרוסלה נקרא כמיחזור, וצופה שכבר ראה אותן לא יעצור.
 * הרשימה המלאה של מה שכבר נשרף: שיווק/תוכניות/מילים-בשימוש.md
 *
 * הקריטריון לבחירה: המילה צריכה להרגיש "אני אמור לדעת את זה" ולא
 * "אף אחד לא יודע את זה". השנייה מייצרת התנגדות במקום סקרנות.
 * "albeit" ו-"allusion" נבחרו גם כי הן נתפסות כמוכרות ומתבלבלות
 * בקלות (allusion מול illusion), וזה בדיוק רגע ההיסוס שהריל מחפש.
 */
const WORDS: Q[] = [
  { w: "בְּצַוְותָּא", d: "ביחד · עם עוד אנשים", unit: "10" },
  { w: "albeit", d: "אף על פי ש · אם כי", unit: "10", ltr: true },
  { w: "הַלְמוּת", d: "דפיקה בקצב קבוע · נקישה", unit: "10" },
  { w: "allusion", d: "אזכור, רמיזה", unit: "10", ltr: true },
  { w: "אֲסוּפָה", d: "מקבץ מאמרים בנושא מסוים", unit: "10" },
];

/** שניות לכל מילה: 2.0 ניחוש + 2.6 חשיפה. */
const GUESS = 2.0;
const SHOW = 2.6;
const SLOT = GUESS + SHOW;
const INTRO = 3.0;
const OUTRO = 6.0;
export const REEL_QUIZ_SEC = INTRO + WORDS.length * SLOT + OUTRO;

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const Card: React.FC<{ q: Q; index: number }> = ({ q, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const alive = interpolate(
    frame,
    [0, 0.3 * fps, (SLOT - 0.3) * fps, SLOT * fps],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // מונה קטן שמראה לצופה כמה נשאר. נותן סיבה להישאר עד הסוף.
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 80px" }}>
      <div style={{ fontSize: 34, color: C.gold, fontWeight: 700, letterSpacing: "0.2em", marginBottom: 54 }}>
        {index + 1} מתוך {WORDS.length}
      </div>

      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif",
          fontWeight: 900,
          fontSize: q.ltr ? 116 : 132,
          color: C.ink,
          direction: q.ltr ? "ltr" : "rtl",
          textAlign: "center",
          lineHeight: 1.1,
          scale: interpolate(frame, [0, 0.5 * fps], [0.9, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: EASE, output: "perceptual-scale",
          }),
        }}
      >
        {q.w}
      </div>

      {/* פס הזמן של הניחוש. מראה לצופה שמשהו עומד לקרות, ולכן הוא ממתין. */}
      <div style={{ width: 300, height: 8, background: C.line, borderRadius: 999, marginTop: 56, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            background: C.gold,
            borderRadius: 999,
            width: `${interpolate(frame, [0, GUESS * fps], [0, 100], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            })}%`,
          }}
        />
      </div>

      {/* הפירוש. נחשף רק אחרי שתי שניות של שתיקה. */}
      <div
        style={{
          marginTop: 48,
          fontSize: 52,
          fontWeight: 500,
          color: C.accent,
          textAlign: "center",
          lineHeight: 1.3,
          opacity: interpolate(frame, [GUESS * fps, (GUESS + 0.4) * fps], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
          }),
          translate: interpolate(frame, [GUESS * fps, (GUESS + 0.4) * fps], ["0px 22px", "0px 0px"], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
          }),
        }}
      >
        {q.d}
      </div>
    </AbsoluteFill>
  );
};

export const ReelQuiz: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const introAlive = interpolate(frame, [0, 0.4 * fps, (INTRO - 0.35) * fps, INTRO * fps], [0, 1, 1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const outroAt = INTRO + WORDS.length * SLOT;

  return (
    <AbsoluteFill style={{ ...paperBackground, fontFamily: "Heebo, sans-serif", direction: "rtl" }}>
      {/* פתיח · ההזמנה לשחק. בלי זה הצופה לא יודע שמצפים ממנו לנחש. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: introAlive, padding: "0 80px" }}>
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 96, color: C.ink, textAlign: "center", lineHeight: 1.1 }}>
          5 מילים שרוב
          <br />
          האנשים <span style={{ color: C.accent }}>לא יודעים</span>
        </div>
        <div style={{ fontSize: 44, color: C.inkSoft, marginTop: 44, fontWeight: 300 }}>
          כמה מהן אתה מכיר?
        </div>
      </AbsoluteFill>

      {WORDS.map((q, i) => (
        <Sequence
          key={i}
          from={Math.round((INTRO + i * SLOT) * fps)}
          durationInFrames={Math.round(SLOT * fps)}
          layout="none"
        >
          <Card q={q} index={i} />
        </Sequence>
      ))}

      {/* סיום · הקריאה לפעולה. שאלה בתגובות היא מה שמרים ריל. */}
      <AbsoluteFill
        style={{
          alignItems: "center", justifyContent: "center", padding: "0 76px",
          opacity: interpolate(frame, [outroAt * fps, (outroAt + 0.5) * fps], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 84, color: C.ink, textAlign: "center", lineHeight: 1.12 }}>
          כמה ידעת?
          <br />
          <span style={{ color: C.accent }}>כתבו בתגובות</span>
        </div>

        <div style={{ marginTop: 64, fontSize: 42, color: C.ink, textAlign: "center", lineHeight: 1.5 }}>
          יש עוד <b style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, color: C.accentDeep }}>5,657</b> כאלה
        </div>

        <div
          style={{
            marginTop: 44, fontSize: 46, fontWeight: 700, color: "#fff",
            background: C.accent, borderRadius: 999, padding: "26px 64px",
            direction: "ltr", letterSpacing: "0.04em",
          }}
        >
          800-plus.com
        </div>
        <div style={{ fontSize: 34, color: C.inkSoft, marginTop: 20, fontWeight: 300 }}>
          חינם עד 30.8
        </div>
      </AbsoluteFill>

      {/* הסימן נשאר לאורך כל הריל, כדי שמי שנכנס באמצע ידע מי מדבר. */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 104 }}>
        <div
          style={{
            fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 48,
            color: C.gold, direction: "ltr", letterSpacing: "-0.03em",
            opacity: interpolate(frame, [durationInFrames - 0.5 * fps, durationInFrames], [1, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            }),
          }}
        >
          800+
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
