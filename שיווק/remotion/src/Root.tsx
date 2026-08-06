import "./index.css";
import { Composition } from "remotion";
import { loadFont as loadFrank } from "@remotion/google-fonts/FrankRuhlLibre";
import { loadFont as loadHeebo } from "@remotion/google-fonts/Heebo";
import { STORY } from "./brand";
import { StoryDemo } from "./StoryDemo";
import { VideoRound } from "./VideoRound";
import {
  FilmWords, FILM_WORDS_SEC,
  FilmFact, FILM_FACT_SEC,
  FilmWake, FILM_WAKE_SEC,
} from "./Films";

/**
 * שני הגופנים של 800+, נטענים פעם אחת לכל הקומפוזיציות.
 * בלי זה הרינדור תופס גופן ברירת מחדל, וזו בדיוק הטעות שלא רואים עד שהסרטון מוכן.
 */
loadFrank();
loadHeebo();

const sec = (s: number) => Math.round(s * STORY.fps);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ס1 · ההדגמה החיה. ארבע מילים, 16 שניות. */}
      <Composition
        id="StoryDemo"
        component={StoryDemo}
        durationInFrames={sec(16)}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      {/* ו1 · סבב תרגול מלא, כולל מילה שנכשלת. 16.5 שניות. */}
      <Composition
        id="VideoRound"
        component={VideoRound}
        durationInFrames={sec(16.5)}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      {/* ── שלושת הסרטונים הקצרים, 6.8. מחליפים את BrandFilm של 45 שניות,
             שנמחק כי "הפריימים ארוכים מדי". הקוד שלו בהיסטוריה (3b941aa).
             ⚠ הספירה בסרטון 3 מחושבת מ-EXAM_DATE ומתיישנת כל יום. ── */}

      <Composition
        id="FilmWords"
        component={FilmWords}
        durationInFrames={sec(FILM_WORDS_SEC)}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      <Composition
        id="FilmFact"
        component={FilmFact}
        durationInFrames={sec(FILM_FACT_SEC)}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      <Composition
        id="FilmWake"
        component={FilmWake}
        durationInFrames={sec(FILM_WAKE_SEC)}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />
    </>
  );
};
