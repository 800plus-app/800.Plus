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
import { ReelQuiz, REEL_QUIZ_SEC } from "./ReelQuiz";
import { ReelCold, REEL_COLD_SEC } from "./ReelCold";
import { Carousel, CAROUSEL_SLIDES } from "./Carousel";
import { CarouselPairs, PAIRS_SLIDES } from "./CarouselPairs";
import { CarouselPlan, PLAN_SLIDES } from "./CarouselPlan";
import { CarouselTrap, TRAP_SLIDES } from "./CarouselTrap";

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

      {/* ר2 · ריל החידון. חמש מילים, שתי שניות ניחוש לכל אחת. */}
      <Composition
        id="ReelQuiz"
        component={ReelQuiz}
        durationInFrames={sec(REEL_QUIZ_SEC)}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      {/* פ1 · קרוסלה לאינסטגרם. **כל פריים הוא שקופית**, לא סרטון.
          המידה 1080×1350 (4:5), ו-fps=1 כדי שמספר הפריים יהיה מספר השקופית.
          לרינדור: רנדר-קרוסלה.ps1 */}
      <Composition
        id="CarouselTrap"
        component={CarouselTrap}
        durationInFrames={TRAP_SLIDES}
        fps={1}
        width={1080}
        height={1350}
      />
      <Composition
        id="Carousel"
        component={Carousel}
        durationInFrames={CAROUSEL_SLIDES}
        fps={1}
        width={1080}
        height={1350}
      />

      {/* ר1 · הריל עם הפתיחה הקרה. **אין פתיח** — הפריים הראשון הוא כבר
          המילה הראשונה. תיקון ישיר לר2, שבזבז 3 שניות על שקופית כותרת
          וקיבל 70 צפיות מול 621 של הקרוסלה באותו יום. */}
      <Composition
        id="ReelCold"
        component={ReelCold}
        durationInFrames={sec(REEL_COLD_SEC)}
        fps={STORY.fps}
        width={STORY.width}
        height={STORY.height}
      />

      {/* ק1 · קרוסלת הזוגות המבלבלים. ההדגשה נופלת על האותיות הנבדלות בלבד. */}
      <Composition
        id="CarouselPairs"
        component={CarouselPairs}
        durationInFrames={PAIRS_SLIDES}
        fps={1}
        width={1080}
        height={1350}
      />

      {/* ק2 · קרוסלת התוכנית.
          ⚠ הספירה מחושבת מ-EXAM_DATE ומתיישנת כל יום. **לרנדר ביום ההעלאה.** */}
      <Composition
        id="CarouselPlan"
        component={CarouselPlan}
        durationInFrames={PLAN_SLIDES}
        fps={1}
        width={1080}
        height={1350}
      />
    </>
  );
};
