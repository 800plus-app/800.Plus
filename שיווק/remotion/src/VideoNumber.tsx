import React, { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { C, TOTAL_WORDS } from "./brand";
import { Frame } from "./Chrome";

/**
 * ו2 · המספר שאי אפשר לשנן. 20 שניות.
 *
 * המסר היחיד: השאלה אינה כמה מילים יש, אלא אילו מהן אתה לא יודע.
 *
 * המהלך: המסך מתמלא במילים עד שהוא צפוף מכדי לקרוא אותו, וזו בדיוק ההרגשה של
 * מי שפותח מאגר של 5,662 מילים. ואז רובן דוהות ונשארות מעטות. ההקלה הזאת היא
 * המסר, והיא נמסרת בלי משפט אחד שמסביר אותה.
 *
 * ⚠ המילים כאן הן קישוט ויזואלי בלבד, ולכן הן נבחרות מרשימה קצרה ולא מהמאגר.
 * המספר 5,662 הוא הנתון היחיד שנטען כאן כעובדה, והוא נספר מהקוד.
 */

/**
 * 84 מילים **ייחודיות**, נדגמו מיחידות 8 עד 10 של המאגר האמיתי.
 *
 * ⚠ למה רשימה קבועה ולא הגרלה מתוך מאגר קטן: בגרסה הראשונה המילים נבחרו
 * באקראי מרשימה של 30, ו-"lucid" הופיעה פעמיים על אותו מסך. חגי תפס את זה.
 * מילה כפולה בענן מילים היא בדיוק סוג הפרט שמסגיר שהתוכן לא אמיתי.
 * מספר הפריטים כאן שווה לאורך הרשימה, ולכן כפילות אינה אפשרית.
 */
const POOL = [
  "absorb", "affection", "appeal", "breed", "civil", "conserve", "crucial",
  "descend", "dispose", "eager", "exaggerate", "fellow", "furthermore", "habitat",
  "humiliate", "inevitable", "likewise", "maturity", "moist", "nursery", "overtake",
  "plaster", "prohibit", "recur", "resemble", "salvation", "skinned", "superficial",
  "treaty", "viper", "accentuate", "alienation", "apparatus", "augment", "circulate",
  "conception", "counsel", "defer", "disciples", "dwelling", "essence", "familiarize",
  "foster", "hasty", "incentive", "intervene", "legislation", "mischief", "noted",
  "overdue", "pollutant", "prevalent", "pursuit", "renovate", "score", "spectacle",
  "subsequent", "tremendous", "vessel", "abacus", "affinity", "ancestry", "attire",
  "capitalize", "conceive", "congenital", "dampen", "depreciate", "devoid", "dissent",
  "embark", "ensue", "facilitate", "fraternal", "goblet", "immersion", "inherent",
  "leniency", "momentous", "obedience", "pastime", "plight", "pretext", "rearing",
];

/** כמה מילים נשארות בשלב הביניים. אלה "המילים לחיזוק" של הלומד ההיפותטי. */
const KEEP = 6;

export const VideoNumber: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // הפיזור נקבע פעם אחת מזרע קבוע, אחרת כל פריים היה מגריל מחדש והמסך היה רועד.
  const items = useMemo(() => {
    // אחד לאחד מול הרשימה. אין הגרלה של הטקסט, ולכן אין כפילות.
    return POOL.map((text, i) => {
      const seed = `w${i}`;
      return {
        text,
        x: 60 + random(seed + "x") * (width - 220),
        y: 300 + random(seed + "y") * (height - 900),
        size: 26 + random(seed + "s") * 26,
        rot: (random(seed + "r") - 0.5) * 10,
        appearAt: 0.6 + random(seed + "a") * 4.6,
        keep: i < KEEP,
      };
    });
  }, [width, height]);

  const fadeStart = 7.4 * fps;
  const fadeEnd = 9.2 * fps;
  // ניקוי מלא של המסך לפני משפט הסיום, בהוראת חגי (5.8).
  // הנימוק: מילים שנשארות מאחורי הכיתוב מתחרות בו על העין, והמשפט הוא המסר.
  const clearStart = 9.5 * fps;
  const clearEnd = 10.2 * fps;
  const clear = interpolate(frame, [clearStart, clearEnd], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <Frame footNote="השאלה אינה כמה. השאלה אילו">
      <AbsoluteFill name="WordCloud">
        {items.map((it, i) => {
          const appear = interpolate(frame, [it.appearAt * fps, (it.appearAt + 0.5) * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          // מה שאינו נשאר דוהה כמעט לגמרי. לא לאפס: השאר עדיין קיים, רק לא במוקד.
          const fade = it.keep
            ? 1
            : interpolate(frame, [fadeStart, fadeEnd], [1, 0.07], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              });

          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: it.x,
                top: it.y,
                direction: "ltr",
                fontSize: it.size,
                fontWeight: it.keep ? 700 : 400,
                color: it.keep ? C.accentDeep : C.inkSoft,
                opacity: appear * fade * clear,
                rotate: `${it.rot}deg`,
                whiteSpace: "nowrap",
              }}
            >
              {it.text}
            </div>
          );
        })}
      </AbsoluteFill>

      {/* המספר עולה בזמן שהמסך מתמלא, ויורד כשהמיקוד מצטמצם. */}
      <AbsoluteFill name="Counter" style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            fontFamily: "Frank Ruhl Libre, serif",
            fontWeight: 900,
            fontSize: 200,
            color: C.accent,
            direction: "ltr",
            textShadow: `0 0 60px ${C.paper}, 0 0 120px ${C.paper}`,
            opacity: interpolate(frame, [1.2 * fps, 2.2 * fps, 6.8 * fps, 7.8 * fps], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          {Math.round(
            interpolate(frame, [1.2 * fps, 6.2 * fps], [0, TOTAL_WORDS], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          ).toLocaleString("en-US")}
        </div>
      </AbsoluteFill>

      {/* המשפט שנשאר על המסך אחרי שהרעש שקט. */}
      <AbsoluteFill name="Punchline" style={{ alignItems: "center", justifyContent: "center" }}>
        <div
          style={{
            fontFamily: "Frank Ruhl Libre, serif",
            fontWeight: 900,
            fontSize: 78,
            color: C.ink,
            textAlign: "center",
            lineHeight: 1.14,
            padding: "0 90px",
            opacity: interpolate(frame, [10.1 * fps, 11.1 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            translate: interpolate(frame, [10.1 * fps, 11.1 * fps], ["0px 24px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {/* ההדגשה על "שלך" בלבד, בהוראת חגי (5.8). קודם כל "בחולשות שלך" היה
              מודגש, וההדגשה נפלה על החולשה. המילה שמבדילה אותנו היא ההתאמה
              האישית, ולכן היא זו שצריכה לקבל את הצבע. */}
          התרגול מתמקד
          <br />
          בחולשות <span style={{ color: C.accent }}>שלך</span>
        </div>
      </AbsoluteFill>
    </Frame>
  );
};
