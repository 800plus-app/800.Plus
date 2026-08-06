import React from "react";
import { AbsoluteFill } from "remotion";
import { paperBackground } from "./brand";
import {
  BeatWord, BeatReveal, BeatFact, BeatCountdown,
  BeatQuestion, BeatShinun, BeatWake, BeatOffer, BeatClose,
} from "./Beats";

/**
 * שלושת הסרטונים הקצרים, 6.8.2026.
 *
 * ⚠ מחליפים את סרטון התדמית של 45 השניות. חגי: "הפריימים קצת ארוכים מדי,
 * בוא נחלק את זה לשלושה סרטונים". הנימוק נכון גם מעבר לקצב: סרטון אחד ארוך
 * הוא נכס אחד שאפשר להעלות פעם אחת, ושלושה קצרים הם שלושה ימי תוכן.
 *
 * ⚠ כולם **ללא פסקול**. המוזיקה נוספת בעת ההעלאה מספריית המוזיקה של
 * אינסטגרם, שהיא מורשית לשימוש בפלטפורמה. פסקול שנלקח מהאינטרנט הוא הפרת
 * זכויות יוצרים ברורה, וזה בדיוק מה שאסור עכשיו. ראה שיווק/תוכניות/מוזיקה.md
 */

const Paper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ ...paperBackground, fontFamily: "Heebo, sans-serif", direction: "rtl" }}>
    {children}
  </AbsoluteFill>
);

/* ── 1 · המילים · 21 שניות ─────────────────────────────────────────────
   הקשת: מילה שאתה לא מכיר, ואז מה שיש לנו בשבילה.
   נפתח קר: שלוש שניות של מילה עברית עירומה על מסך ריק, בלי לוגו. */
export const FilmWords: React.FC = () => (
  <Paper>
    <BeatWord from={0} dur={4.6} />
    <BeatReveal from={4.4} dur={6.4} />
    <BeatOffer from={10.6} dur={6.8} />
    <BeatClose from={17.2} />
  </Paper>
);
export const FILM_WORDS_SEC = 21;

/* ── 2 · העובדה · 15 שניות ─────────────────────────────────────────────
   הקשת: כמה מהמבחן תלוי במילים, ואז השאלה האישית.
   הסרטון היחיד מהשלושה שאינו מזכיר מילה ספציפית. הוא כולו טיעון. */
export const FilmFact: React.FC = () => (
  <Paper>
    <BeatFact from={0} dur={6.2} />
    <BeatQuestion from={6} dur={5.6} />
    <BeatClose from={11.4} />
  </Paper>
);
export const FILM_FACT_SEC = 15;

/* ── 3 · ההתעוררות · 17 שניות ──────────────────────────────────────────
   הקשת: הזמן אוזל, יש דרך אחרת ללמוד, קח את זה לידיים.
   זה הסרטון היחיד שנגמר בקריאה רגשית ולא בעובדה, ולכן הוא היחיד
   שדורש פסקול דרמטי. */
export const FilmWake: React.FC = () => (
  <Paper>
    <BeatCountdown from={0} dur={4.8} />
    <BeatShinun from={4.6} dur={5.6} />
    <BeatWake from={10} dur={4.2} />
    <BeatClose from={14} />
  </Paper>
);
export const FILM_WAKE_SEC = 17;
