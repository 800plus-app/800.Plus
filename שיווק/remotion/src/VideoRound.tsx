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
  { word: "obsolete", outcome: "ok", start: 9.4, duration: 3.6 },
];

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

export const VideoRound: React.FC = () => {
  const { fps } = useVideoConfig();

  return (
    <Frame footNote="אתה מתרגל את מה שאתה לא יודע">
      {BEATS.map((b, i) => (
        <Sequence key={i} from={Math.round(b.start * fps)} durationInFrames={Math.round(b.duration * fps)} layout="none">
          <BeatCard beat={b} />
        </Sequence>
      ))}
    </Frame>
  );
};
