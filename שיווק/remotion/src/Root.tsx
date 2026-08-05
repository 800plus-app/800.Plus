import "./index.css";
import { Composition } from "remotion";
import { loadFont as loadFrank } from "@remotion/google-fonts/FrankRuhlLibre";
import { loadFont as loadHeebo } from "@remotion/google-fonts/Heebo";
import { STORY } from "./brand";
import { StoryDemo } from "./StoryDemo";
import { VideoRound } from "./VideoRound";

/**
 * שני הגופנים של 800+, נטענים פעם אחת לכל הקומפוזיציות.
 * בלי זה הרינדור תופס גופן ברירת מחדל, וזו בדיוק הטעות שלא רואים עד שהסרטון מוכן.
 */
loadFrank();
loadHeebo();

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ס1 · ההדגמה החיה. ארבע מילים, 16 שניות. */}
      <Composition
        id="StoryDemo"
        component={StoryDemo}
        durationInFrames={16 * STORY.fps}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      {/* ו1 · סבב תרגול מלא, כולל מילה שנכשלת. 16.5 שניות. */}
      <Composition
        id="VideoRound"
        component={VideoRound}
        durationInFrames={Math.round(16.5 * STORY.fps)}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      {/* ו2 "המספר" נמחק ב-5.8 בהחלטת חגי. הקוד נשמר בהיסטוריית git (b2655f8)
          אם נרצה לחזור אליו. */}
    </>
  );
};
