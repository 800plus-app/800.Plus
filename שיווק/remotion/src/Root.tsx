import "./index.css";
import { Composition } from "remotion";
import { loadFont as loadFrank } from "@remotion/google-fonts/FrankRuhlLibre";
import { loadFont as loadHeebo } from "@remotion/google-fonts/Heebo";
import { STORY } from "./brand";
import { StoryDemo } from "./StoryDemo";
import { VideoRound } from "./VideoRound";
import { VideoNumber } from "./VideoNumber";

/**
 * שני הגופנים של 800+, נטענים פעם אחת לכל הקומפוזיציות.
 * בלי זה הרינדור תופס גופן ברירת מחדל, וזו בדיוק הטעות שלא רואים עד שהסרטון מוכן.
 */
loadFrank();
loadHeebo();

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ס1 · ההדגמה החיה. 8 שניות. */}
      <Composition
        id="StoryDemo"
        component={StoryDemo}
        durationInFrames={8 * STORY.fps}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      {/* ו1 · סבב תרגול מלא, כולל מילה שנכשלת. 15 שניות. */}
      <Composition
        id="VideoRound"
        component={VideoRound}
        durationInFrames={15 * STORY.fps}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      {/* ו2 · המספר שאי אפשר לשנן. 20 שניות. */}
      <Composition
        id="VideoNumber"
        component={VideoNumber}
        durationInFrames={20 * STORY.fps}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />
    </>
  );
};
