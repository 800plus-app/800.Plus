import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { C, WORDS } from "./brand";
import { Frame } from "./Chrome";
import { PracticeCard } from "./PracticeCard";

/**
 * ו1 · סבב תרגול מלא. 15 שניות.
 *
 * המסר היחיד: ככה נראית דקה של תרגול.
 *
 * ההחלטה היחידה שמשנה כאן הכל: **המילה השנייה נכשלת בכוונה.**
 * סרטון מוצר שבו הכל מושלם נקרא כפרסומת ולא כהדגמה, ומי שמתכונן לפסיכומטרי
 * יודע היטב שהוא לא יודע הכל. הכישלון הוא גם מה שמאפשר להראות את הדבר האמיתי
 * שהאפליקציה עושה: המילה שנפלה חוזרת לחיזוק.
 */

type Beat = {
  word: keyof typeof WORDS;
  /** מה שהוקלד. שונה מהתשובה כשהמילה נכשלת. */
  typedText?: string;
  outcome: "ok" | "wrong";
  /** שנייה שבה הביט מתחיל, יחסית לתחילת הסרטון. */
  start: number;
  duration: number;
};

const BEATS: Beat[] = [
  { word: "inevitable", outcome: "ok", start: 0.6, duration: 4.0 },
  { word: "meticulous", outcome: "wrong", typedText: "metic", start: 4.8, duration: 4.4 },
  // קוצר מ-3.6 ל-2.9 כדי לפנות מקום למשפט הסיום, שהוא עכשיו שיא הסרטון.
  { word: "obsolete", outcome: "ok", start: 9.4, duration: 2.9 },
];

/** השנייה שבה משפט הסיום נכנס. אחרי שהכרטיס האחרון יצא, לא מעליו. */
const PUNCH_AT = 12.5;

const BeatCard: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const w = WORDS[beat.word];
  const text = beat.typedText ?? w.en;

  const typeStart = 0.7 * fps;
  const typeEnd = typeStart + 1.5 * fps;
  const resultAt = typeEnd + 0.35 * fps;

  const typed = interpolate(frame, [typeStart, typeEnd], [0, text.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.4, 0, 0.5, 1),
  });

  const presence = interpolate(
    frame,
    [0, 0.4 * fps, (beat.duration - 0.4) * fps, beat.duration * fps],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const state = frame >= resultAt ? beat.outcome : "typing";

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", paddingTop: 40 }}>
      <PracticeCard word={w} typed={typed} state={state} presence={presence} override={beat.typedText} />

      {/* התווית שמסבירה מה קרה. מופיעה רק אחרי התוצאה, כדי לא להסגיר אותה מראש. */}
      <div
        style={{
          marginTop: 42,
          fontSize: 38,
          fontWeight: 700,
          color: beat.outcome === "ok" ? C.ok : C.accentDeep,
          background: C.card,
          border: `2px solid ${C.line}`,
          borderRadius: 999,
          padding: "18px 40px",
          opacity: interpolate(frame, [resultAt, resultAt + 0.3 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }) * presence,
        }}
      >
        {beat.outcome === "ok" ? "בשליטה · לא תישאל עליה שוב בקרוב" : "נכנסה למילים לחיזוק"}
      </div>
    </AbsoluteFill>
  );
};

/**
 * משפט הסיום. עלה מהשורה הקטנה בתחתית אל מרכז המסך בהוראת חגי, 5.8.
 *
 * הנימוק: זה המסר של הסרטון, ולא הערת שוליים. שורה קטנה מתחת לכתובת נקראת
 * על ידי מי שכבר משוכנע. משפט שנכנס בגדול למרכז עוצר את מי שעדיין גולל.
 *
 * הכניסה משלבת קנה מידה ותנועה כלפי מעלה: תנועה מושכת את העין יותר מהופעה,
 * וקנה מידה שמתחיל מתחת ל-1 קורא כמו משהו שנוחת ולא כמו משהו שהיה שם תמיד.
 */
const Punchline: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t0 = PUNCH_AT * fps;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: "0 80px" }}>
      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif",
          fontWeight: 900,
          fontSize: 88,
          color: C.ink,
          textAlign: "center",
          lineHeight: 1.12,
          opacity: interpolate(frame, [t0, t0 + 0.45 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [t0, t0 + 0.7 * fps], [0.86, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
          translate: interpolate(frame, [t0, t0 + 0.7 * fps], ["0px 40px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        אתה מתרגל <span style={{ color: C.accent }}>רק</span>
        <br />
        את מה שאתה לא יודע
      </div>
    </AbsoluteFill>
  );
};

export const VideoRound: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <Frame>
      {BEATS.map((b, i) => (
        <Sequence key={i} from={Math.round(b.start * fps)} durationInFrames={Math.round(b.duration * fps)} layout="none">
          <BeatCard beat={b} />
        </Sequence>
      ))}
      <Punchline />
    </Frame>
  );
};
