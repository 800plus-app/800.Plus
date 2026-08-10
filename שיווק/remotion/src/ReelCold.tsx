import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { C, paperBackground } from "./brand";

/**
 * ר1 · "פתיחה קרה". חמש מילים, ריל אנכי 1080×1920, ~25 שניות.
 *
 * ⚠⚠ **זה תיקון ישיר של ר2, ולא גרסה שנייה שלו.**
 * ר2 קיבל 70 צפיות ביום שבו הקרוסלה קיבלה 621. הוא בזבז את שלוש השניות
 * הראשונות על שקופית כותרת סטטית ("5 מילים שרוב האנשים לא יודעים"), כלומר
 * בדיוק בחלון שבו מחליטים אם להישאר. **כאן אין פתיח.** הפריים הראשון הוא
 * כבר המילה הראשונה, במלוא האטימות, בלי דהייה מלמטה.
 *
 * ⚠ הסתייגות שחייבת להישאר רשומה: ר2 פורסם באותו יום עם הקרוסלה, ופרסום
 * כפול ביום אחד מפצל טווח הגעה. מִשְׁנֵי נכסים אי אפשר להפריד בין שתי
 * הסיבות. שתיהן דוחפות לאותה מסקנה מעשית, ולכן פועלים לפיה, **אבל אסור
 * להציג את זה כמוכח** (`/MKT` §4).
 *
 * ⚠ שתי שניות של מילה לבדה לפני החשיפה. זה הזמן שבו הצופה מנסה לענות
 * לעצמו, וזו העצירה שהאלגוריתם מתגמל. **אל תקצר** — ההערה הזאת כבר נכתבה
 * ב-ReelQuiz והיא עומדת.
 *
 * ⚠ חמש המילים מיחידה 10 ואף אחת מהן לא הופיעה בשום נכס קודם. נבדק מול
 * `שיווק/תוכניות/מילים-בשימוש.md` ומול `data.js` / `data-en.js` ב-10.8.2026.
 * הפירושים הם **בדיוק** הטקסט שבמאגר, בלי עריכה: מי שיפתח את האפליקציה
 * אחרי הריל ימצא אותם מילה במילה (`/VIS` §4).
 */

type Q = { w: string; d: string; ltr?: boolean };

const WORDS: Q[] = [
  { w: "אָקוּטִי", d: "חריף, חמוּר, דחוף, קריטי" },
  { w: "appease", d: "לפייס", ltr: true },
  { w: "בִּיכֵּר", d: "העדיף" },
  { w: "ascertain", d: "לוודא", ltr: true },
  { w: "הִתְלַהֵם", d: "התכתש, השתולל, התנהג בתוקפנות" },
];

/** שניות לכל מילה: 2.0 ניחוש + 2.2 חשיפה. אין INTRO. זו כל הנקודה. */
const GUESS = 2.0;
const SHOW = 2.2;
const SLOT = GUESS + SHOW;
const OUTRO = 4.6;
export const REEL_COLD_SEC = WORDS.length * SLOT + OUTRO;

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const Card: React.FC<{ q: Q; index: number }> = ({ q, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ⚠ הכרטיס הראשון נכנס באטימות מלאה מהפריים הראשון. דהייה של שליש שנייה
  //   נשמעת זניחה, אבל היא שליש שנייה מתוך שלוש שבהן מחליטים לגלול הלאה.
  const fadeIn = index === 0
    ? 1
    : interpolate(frame, [0, 0.28 * fps], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(frame, [(SLOT - 0.28) * fps, SLOT * fps], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const alive = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 80px" }}>
      {/* המונה הוא מה שמחליף את שקופית הכותרת: הוא מסביר את הפורמט בלי לעצור
          אותו, ונותן סיבה להישאר עד הסוף. */}
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
          // הכרטיס הראשון גם אינו גדל. הוא פשוט שם, מהפריים הראשון.
          scale: index === 0 ? 1 : interpolate(frame, [0, 0.5 * fps], [0.9, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: EASE, output: "perceptual-scale",
          }),
        }}
      >
        {q.w}
      </div>

      {/* פס הזמן של הניחוש. מראה שמשהו עומד לקרות, ולכן הצופה ממתין. */}
      <div style={{ width: 300, height: 8, background: C.line, borderRadius: 999, marginTop: 56, overflow: "hidden" }}>
        <div
          style={{
            height: "100%", background: C.gold, borderRadius: 999,
            width: `${interpolate(frame, [0, GUESS * fps], [0, 100], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            })}%`,
          }}
        />
      </div>

      {/* הפירוש. נחשף רק אחרי שתי שניות של שתיקה. */}
      <div
        style={{
          marginTop: 48, fontSize: 52, fontWeight: 500, color: C.accent,
          textAlign: "center", lineHeight: 1.3,
          opacity: interpolate(frame, [GUESS * fps, (GUESS + 0.35) * fps], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
          }),
          translate: interpolate(frame, [GUESS * fps, (GUESS + 0.35) * fps], ["0px 22px", "0px 0px"], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
          }),
        }}
      >
        {q.d}
      </div>
    </AbsoluteFill>
  );
};

export const ReelCold: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const outroAt = WORDS.length * SLOT;

  return (
    <AbsoluteFill style={{ ...paperBackground, fontFamily: "Heebo, sans-serif", direction: "rtl" }}>
      {WORDS.map((q, i) => (
        <Sequence
          key={i}
          from={Math.round(i * SLOT * fps)}
          durationInFrames={Math.round(SLOT * fps)}
          layout="none"
        >
          <Card q={q} index={i} />
        </Sequence>
      ))}

      {/* סיום. הקריאה היא לשליחה בפרטי ולא לתגובה: שיתוף שוקל פי 3 עד 5
          מלייק להגעה לקהל שאינו עוקב, ואנחנו בגילוי מוחלט (`/MKT` §5). */}
      <AbsoluteFill
        style={{
          alignItems: "center", justifyContent: "center", padding: "0 76px",
          opacity: interpolate(frame, [outroAt * fps, (outroAt + 0.45) * fps], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}
      >
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 96, color: C.ink, textAlign: "center", lineHeight: 1.12 }}>
          כמה ידעת?
        </div>
        <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 66, color: C.accent, textAlign: "center", lineHeight: 1.25, marginTop: 34 }}>
          שלח את זה למי
          <br />
          שבטוח שהוא יודע הכל
        </div>

        <div
          style={{
            marginTop: 58, fontSize: 46, fontWeight: 700, color: "#fff",
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
          }}
        >
          800+
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
