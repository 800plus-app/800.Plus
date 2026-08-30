-- ‏אחרי מחיקת חשבון בדיקה · סופר כמה שורות נשארו לאותו משתמש בטבלת הסקר ובטבלת ההתראות · המספר הצפוי בשתיהן הוא 0.
--
-- ⛔ הדבק את מזהה חשבון הבדיקה במקום אחד בלבד — בשורת ה-uid למטה. שאר הקובץ לא משתנה.
-- ⛔ קריאה בלבד (select) · אין בפלט מייל או מזהה משתמש · רק שתי ספירות.

with param as (
  select '00000000-0000-0000-0000-000000000000'::uuid as uid   -- ⬅ הדבק כאן את מזהה חשבון הבדיקה
)
select
  (select count(*) from public.wtp_survey where user_id = (select uid from param)) as שורות_בסקר,       -- ⭐ חייב 0
  (select count(*) from public.push_sub  where user_id = (select uid from param)) as שורות_בהתראות;    -- ⭐ חייב 0
