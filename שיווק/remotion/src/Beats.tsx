import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { C, TOTAL_WORDS, daysToExam, freeUntilLabel } from "./brand";

/**
 * הביטים של סרטון התדמית, כרכיבים עצמאיים שמקבלים תזמון.
 *
 * ⚠ למה הופרד מ-BrandFilm.tsx (6.8.2026): חגי ביקש לפרק את סרטון 45 השניות
 * לשלושה סרטונים קצרים, כי "הפריימים ארוכים מדי". ביטים עם תזמון קשיח לא
 * ניתנים להרכבה מחדש, ולכן כל ביט מקבל עכשיו `from` ו-`dur` בשניות.
 *
 * ⚠ הקצב הודק בכל הביטים. בגרסת 45 השניות ההחזקות היו ארוכות בכ-30%,
 * וזה נכון לסרטון ארוך שנצפה ברצף. בקצר, כל שנייה מיותרת היא צופה שגלל.
 */

/** שקיפות שנכנסת ויוצאת בגבולות ביט. הכל בשניות, יחסית לתחילת הקומפוזיציה. */
const useAlive = (from: number, dur: number, fadeIn = 0.4, fadeOut = 0.35) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return interpolate(
    frame,
    [from * fps, (from + fadeIn) * fps, (from + dur - fadeOut) * fps, (from + dur) * fps],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.bezier(0.16, 1, 0.3, 1) },
  );
};

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

export const HE_WORD = { w: "בְּרַם", d: "אולם · אבל · אך" };
export const EN_WORD = { w: "superfluous", d: "מיותר, עודף" };

/* ── המילה לבדה, ואז השאלה הקטנה ──────────────────────────────────────── */
export const BeatWord: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useAlive(from, dur, 0.8, 0.45);
  const qAt = from + 2.2;

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive }}>
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 168, color: C.ink, letterSpacing: "-0.01em" }}>
        {HE_WORD.w}
      </div>
      <div
        style={{
          marginTop: 44,
          fontSize: 44,
          color: C.inkSoft,
          fontWeight: 300,
          opacity: interpolate(frame, [qAt * fps, (qAt + 0.5) * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        יודע מה זה?
      </div>
    </AbsoluteFill>
  );
};

/* ── הפירוש, המילה באנגלית, והמכה ─────────────────────────────────────── */
export const BeatReveal: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useAlive(from, dur);

  const row = (label: string, def: string, ltr: boolean, at: number) => (
    <div
      style={{
        opacity: interpolate(frame, [at * fps, (at + 0.45) * fps], [0, 1], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
        }),
        translate: interpolate(frame, [at * fps, (at + 0.45) * fps], ["0px 20px", "0px 0px"], {
          extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
        }),
        textAlign: "center",
        marginBottom: 40,
      }}
    >
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 88, color: C.ink, direction: ltr ? "ltr" : "rtl" }}>
        {label}
      </div>
      <div style={{ fontSize: 40, color: C.accent, marginTop: 10, fontWeight: 500 }}>{def}</div>
    </div>
  );

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 80px" }}>
      {row(HE_WORD.w, HE_WORD.d, false, from + 0.1)}
      {row(EN_WORD.w, EN_WORD.d, true, from + 1.5)}
      {/* הצירוף שהופך סקרנות לחרדה. לא "יש מילים קשות" אלא "שלך". */}
      <div
        style={{
          marginTop: 22,
          fontSize: 52,
          fontWeight: 700,
          color: C.accentDeep,
          background: C.card,
          border: `2px solid ${C.line}`,
          borderRadius: 999,
          padding: "22px 52px",
          opacity: interpolate(frame, [(from + 3.1) * fps, (from + 3.6) * fps], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}
      >
        שתיהן במבחן שלך
      </div>
    </AbsoluteFill>
  );
};

/* ── העובדה. ארבעה מלבנים מתוך שישה ───────────────────────────────────── */
export const BeatFact: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useAlive(from, dur);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 80px" }}>
      {/* ארבעה מתוך שישה הוא דבר שהעין סופרת בשבריר שנייה. כל ייצוג עשיר
          יותר דורש פענוח, ופענוח בסרטון הוא מסר שאבד. */}
      <div style={{ display: "flex", gap: 16, marginBottom: 58 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const on = i < 4;
          return (
            <div
              key={i}
              style={{
                width: 128, height: 176, borderRadius: 20,
                background: on ? C.accent : C.card,
                border: `3px solid ${on ? C.accent : C.line}`,
                opacity: on
                  ? interpolate(frame, [(from + 0.4 + i * 0.18) * fps, (from + 0.75 + i * 0.18) * fps], [0.25, 1], {
                      extrapolateLeft: "clamp", extrapolateRight: "clamp",
                    })
                  : 1,
              }}
            />
          );
        })}
      </div>
      {/* הניסוח הוכרע על ידי חגי. ההסתייגות מתועדת בתסריט ולא חוזרת כאן. */}
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 68, color: C.ink, textAlign: "center", lineHeight: 1.2 }}>
        <span style={{ color: C.accent }}>4 מתוך 6</span> פרקים
        <br />
        במבחן הפסיכומטרי
        <br />
        נשענים על אוצר מילים
      </div>
    </AbsoluteFill>
  );
};

/* ── הספירה ───────────────────────────────────────────────────────────── */
export const BeatCountdown: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useAlive(from, dur);
  const days = daysToExam();

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive }}>
      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 300,
          lineHeight: 0.9, color: C.accent, direction: "ltr",
          scale: interpolate(frame, [from * fps, (from + 0.7) * fps], [0.8, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: EASE, output: "perceptual-scale",
          }),
        }}
      >
        {days}
      </div>
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 66, color: C.ink, marginTop: 18 }}>
        ימים עד המבחן
      </div>
    </AbsoluteFill>
  );
};

/* ── נקודת השבירה. השאלה האישית ───────────────────────────────────────── */
export const BeatQuestion: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useAlive(from, dur);

  // ⚠ כאן ישבו שתי המילים (בְּרַם · superfluous) כתזכורת קטנה למעלה. הן הוסרו
  // ב-6.8: בסרטון של 45 השניות הן היו הגיוניות, כי הצופה ראה אותן דקה קודם.
  // אחרי הפיצול, סרטון 2 אינו מציג אותן כלל, והן הופיעו משום מקום. חגי תפס
  // את זה מיד. **הלקח: כשמפצלים נכס, כל הפניה להקשר קודם הופכת לשארית.**
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 80px" }}>
      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 86,
          color: C.ink, textAlign: "center", lineHeight: 1.14,
          translate: interpolate(frame, [from * fps, (from + 0.7) * fps], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
          }),
        }}
      >
        אתה מוכן שהציון שלך
        <br />
        <span style={{ color: C.accent }}>ייפול על אוצר מילים?</span>
      </div>
    </AbsoluteFill>
  );
};

/* ── שינון מול שליפה. גרסת וידאו של הסטורי הסטטי ──────────────────────── */
export const BeatShinun: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useAlive(from, dur);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 88px" }}>
      {/* החלק שנעזב. עמום ומחוק, כדי שהעין תעבור מהר אל מה שמתחת. */}
      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif", fontWeight: 700, fontSize: 62,
          color: C.inkSoft, lineHeight: 1.16, textAlign: "center",
          textDecoration: "line-through", textDecorationThickness: 4,
          textDecorationColor: "rgba(181,72,46,.55)",
          opacity: interpolate(frame, [from * fps, (from + 0.5) * fps], [0, 0.62], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}
      >
        לתרגל מילים
        <br />
        מתוך שינון
      </div>

      <div
        style={{
          fontSize: 54, color: C.gold, margin: "32px 0 28px", lineHeight: 1,
          opacity: interpolate(frame, [(from + 0.9) * fps, (from + 1.3) * fps], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}
      >
        ↓
      </div>

      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 96,
          color: C.ink, lineHeight: 1.08, textAlign: "center",
          opacity: interpolate(frame, [(from + 1.3) * fps, (from + 1.8) * fps], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
          }),
          translate: interpolate(frame, [(from + 1.3) * fps, (from + 1.8) * fps], ["0px 26px", "0px 0px"], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
          }),
        }}
      >
        לשלוף אותן
        <br />
        בצורה <span style={{ color: C.accent }}>אקטיבית</span>
      </div>
    </AbsoluteFill>
  );
};

/* ── ההתעוררות. שורת הסיום של סרטון 3 ─────────────────────────────────── */
export const BeatWake: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useAlive(from, dur, 0.35, 0.35);

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 76px" }}>
      <div
        style={{
          fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 92,
          color: C.ink, textAlign: "center", lineHeight: 1.12,
          scale: interpolate(frame, [from * fps, (from + 0.6) * fps], [0.88, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
            easing: EASE, output: "perceptual-scale",
          }),
        }}
      >
        <span style={{ color: C.accent }}>הגיע הזמן להתעורר</span>
        <br />
        ולקחת את הציון שלך
        <br />
        בידיים
      </div>
    </AbsoluteFill>
  );
};

/* ── מה אנחנו מביאים ──────────────────────────────────────────────────── */
export const BeatOffer: React.FC<{ from: number; dur: number }> = ({ from, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = useAlive(from, dur, 0.35, 0.3);

  // שלוש שורות ולא חמש. ארבע כבר יותר מדי לשש שניות.
  const rows: [string, string][] = [
    [`${TOTAL_WORDS.toLocaleString("en-US")} מילים`, "בעברית ובאנגלית"],
    ["תרגול אדפטיבי", "רק מה שאתה לא יודע"],
    ["שליפה אקטיבית", "אתה כותב, לא בוחר"],
  ];

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive, padding: "0 76px" }}>
      {rows.map(([head, sub], i) => {
        const at = from + 0.35 + i * 0.6;
        return (
          <div
            key={i}
            style={{
              width: "100%", background: C.card, border: `2px solid ${C.line}`,
              borderRadius: 26, padding: "30px 38px", marginBottom: 22, textAlign: "center",
              opacity: interpolate(frame, [at * fps, (at + 0.35) * fps], [0, 1], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp",
              }),
              translate: interpolate(frame, [at * fps, (at + 0.35) * fps], ["0px 24px", "0px 0px"], {
                extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE,
              }),
            }}
          >
            <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 58, color: C.accentDeep }}>{head}</div>
            <div style={{ fontSize: 36, color: C.ink, marginTop: 8 }}>{sub}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* ── הסגירה. ההזמנה לאתר ──────────────────────────────────────────────── */
export const BeatClose: React.FC<{ from: number }> = ({ from }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const alive = interpolate(frame, [from * fps, (from + 0.45) * fps], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: alive }}>
      <div style={{ fontFamily: "Frank Ruhl Libre, serif", fontWeight: 900, fontSize: 104, color: C.gold, direction: "ltr", letterSpacing: "-0.03em" }}>
        800+
      </div>
      <div style={{ fontSize: 46, color: C.accent, fontWeight: 700, direction: "ltr", letterSpacing: "0.06em", marginTop: 26 }}>
        800-plus.com
      </div>
      {/* ⚠ שורת "המבחן ב-3.9" הוסרה ב-6.8 בהוראת חגי: לא רלוונטית בשקופית
          הסוגרת. היא נועדה לגרום לצופה לעשות את החשבון בעצמו, אבל בסוף
          סרטון קצר היא רק מוסיפה תאריך שני ומטשטשת את הקריאה לפעולה. */}
      <div style={{ marginTop: 58, textAlign: "center" }}>
        <div style={{ fontSize: 46, fontWeight: 700, color: C.ink }}>גישה חינם עד {freeUntilLabel()}</div>
      </div>
    </AbsoluteFill>
  );
};
