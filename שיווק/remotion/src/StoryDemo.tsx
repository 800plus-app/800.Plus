import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, WORDS } from "./brand";
import { Frame } from "./Chrome";
import { PracticeCard } from "./PracticeCard";

/**
 * ס1 · ההדגמה החיה. 8 שניות, סטורי אינסטגרם.
 *
 * המסר היחיד: ככה זה נראה בפועל.
 *
 * למה זה הנכס החשוב ביותר ברשימה: כל שאר החומר השיווקי של 800+ *מספר* שהתרגול
 * עובד. זה *מראה*. אדם שרואה מילה מוקלדת ובדיקה שנדלקת בירוק יודע תוך שתי שניות
 * מה הוא מקבל, בלי שהבטחנו לו דבר.
 *
 * מבנה: מילה ראשונה נכתבת ונענית נכון, ואז מילה שנייה נכנסת ומתחילה להיכתב.
 * המילה השנייה נחתכת באמצע בכוונה, כי סטורי שנגמר באמצע פעולה נקרא כהמשך.
 */
const W1 = WORDS.commemorate;
const W2 = WORDS.reluctant;

export const StoryDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ציר הזמן, בשניות. מוחזק במקום אחד כדי שכיוונון תזמון לא ידרוש חיפוש במספרים.
  const t = {
    cardIn: 0.35,
    typeStart: 1.1,
    typeEnd: 3.0,
    ok: 3.25,
    cardOut: 4.5,
    card2In: 4.9,
    type2Start: 5.6,
  };

  const chars1 = interpolate(frame, [t.typeStart * fps, t.typeEnd * fps], [0, W1.en.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.5, 1),
  });

  const chars2 = interpolate(frame, [t.type2Start * fps, (t.type2Start + 1.9) * fps], [0, W2.en.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.5, 1),
  });

  const presence1 = interpolate(
    frame,
    [t.cardIn * fps, (t.cardIn + 0.45) * fps, t.cardOut * fps, (t.cardOut + 0.35) * fps],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const presence2 = interpolate(frame, [t.card2In * fps, (t.card2In + 0.45) * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const state1 = frame >= t.ok * fps ? "ok" : "typing";
  const showSecond = frame >= t.card2In * fps;

  return (
    <Frame footNote="תרגול אדפטיבי · לרמה שלך">
      <AbsoluteFill name="Headline" style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: 236 }}>
        <div
          style={{
            fontFamily: "Frank Ruhl Libre, serif",
            fontWeight: 900,
            fontSize: 62,
            color: C.accent,
            textAlign: "center",
            lineHeight: 1.16,
            opacity: interpolate(frame, [0.15 * fps, 0.9 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [0.15 * fps, 0.9 * fps], ["0px 26px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {/* הניסוח של חגי, 5.8. "אתה כותב · לא בוחר מרשימה" תיאר את המנגנון;
              זה מתאר את מה שקורה בראש, וזו הסיבה שמישהו לומד אחרת. */}
          תפסיק לתרגל מילים מתוך שינון
          <br />
          תתחיל לשלוף מהראש
        </div>
      </AbsoluteFill>

      {/* שני הכרטיסים חיים באותו מקום. הראשון יוצא, השני נכנס. */}
      <AbsoluteFill name="Cards" style={{ alignItems: "center", justifyContent: "center", paddingTop: 90 }}>
        {showSecond ? (
          <PracticeCard word={W2} typed={chars2} state="typing" presence={presence2} />
        ) : (
          <PracticeCard word={W1} typed={chars1} state={state1} presence={presence1} />
        )}
      </AbsoluteFill>
    </Frame>
  );
};
