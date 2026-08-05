import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { C, WORDS } from "./brand";
import { Frame } from "./Chrome";
import { PracticeCard } from "./PracticeCard";

/**
 * ס1 · ההדגמה החיה. 16 שניות, סטורי אינסטגרם.
 *
 * המסר היחיד: ככה זה נראה בפועל.
 *
 * למה זה הנכס החשוב ביותר בסדרה: כל שאר החומר השיווקי של 800+ *מספר* שהתרגול
 * עובד. זה *מראה*. אדם שרואה מילה מוקלדת ובדיקה שנדלקת בירוק יודע תוך שתי
 * שניות מה הוא מקבל, בלי שהבטחנו לו דבר.
 *
 * ⚠ הגרסה הראשונה הייתה 8 שניות וחגי אמר שהיא קצרה מדי (5.8). שתי מילים
 * לא הספיקו כדי שהעין תספיק לתפוס את המחזור. שלוש מילים מייצרות **קצב**,
 * וקצב הוא מה שמשדר שהתרגול הוא דבר שחוזר ולא אירוע חד פעמי.
 *
 * המילה השלישית נחתכת באמצע ההקלדה בכוונה: סטורי שנגמר באמצע פעולה נקרא
 * כהמשך ולא כמודעה שנגמרה.
 */

type Beat = {
  word: keyof typeof WORDS;
  start: number;
  duration: number;
  /** האם להראות את סימון התשובה הנכונה. המילה האחרונה נחתכת לפניו. */
  resolve: boolean;
};

/**
 * ⚠ הביטים **חופפים** ב-0.25 שנייה. בגרסה קודמת הם היו רצופים עם פער קטן,
 * ובבדיקת פריים התגלה חור: הכרטיס היוצא כבר בשקיפות אפס והנכנס טרם התחיל,
 * ולרגע אמצע המסך ריק. חפיפה הופכת את המעבר להחלפה ולא להיעלמות.
 */
const BEATS: Beat[] = [
  { word: "commemorate", start: 0.35, duration: 4.6, resolve: true },
  { word: "reluctant", start: 4.7, duration: 4.6, resolve: true },
  { word: "inevitable", start: 9.05, duration: 4.6, resolve: true },
  { word: "candid", start: 13.4, duration: 2.6, resolve: false },
];

const BeatCard: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const w = WORDS[beat.word];

  const typeStart = 0.75 * fps;
  const typeEnd = typeStart + 1.9 * fps;
  const okAt = typeEnd + 0.3 * fps;

  const typed = interpolate(frame, [typeStart, typeEnd], [0, w.en.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.5, 1),
  });

  const presence = interpolate(
    frame,
    [0, 0.4 * fps, (beat.duration - 0.35) * fps, beat.duration * fps],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 90 }}>
      <PracticeCard
        word={w}
        typed={typed}
        state={beat.resolve && frame >= okAt ? "ok" : "typing"}
        presence={presence}
      />
    </AbsoluteFill>
  );
};

export const StoryDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

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

      {BEATS.map((b, i) => (
        <Sequence key={i} from={Math.round(b.start * fps)} durationInFrames={Math.round(b.duration * fps)} layout="none">
          <BeatCard beat={b} />
        </Sequence>
      ))}
    </Frame>
  );
};
