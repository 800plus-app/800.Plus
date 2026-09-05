-- ‏אחרי מחיקת חשבון בדיקה · סופר כמה שורות נשארו לאותו משתמש בכל טבלה שהפונקציה מוחקת · המספר הצפוי בכולן הוא 0.
--
-- הרשימה זהה אחד-לאחד לרשימת המחיקה בפונקציית מחיקת החשבון
-- (supabase/functions/delete-account/index.ts): שש טבלאות לפי user_id,
-- וטבלת הפרופילים לפי id. טבלה שנוספת לפונקציה — נוספת גם כאן.
--
-- ⛔ הדבק את מזהה חשבון הבדיקה במקום אחד בלבד — בשורת ה-uid למטה. שאר הקובץ לא משתנה.
-- ⛔ קריאה בלבד (select) · אין בפלט מייל או מזהה משתמש · רק ספירות.

with param as (
  select '00000000-0000-0000-0000-000000000000'::uuid as uid   -- ⬅ הדבק כאן את מזהה חשבון הבדיקה
)
select
  (select count(*) from public.progress     where user_id = (select uid from param)) as שורות_בהתקדמות,   -- ⭐ חייב 0
  (select count(*) from public.feedback     where user_id = (select uid from param)) as שורות_בדיווחים,    -- ⭐ חייב 0
  (select count(*) from public.assoc_shared where user_id = (select uid from param)) as שורות_באסוציאציות, -- ⭐ חייב 0
  (select count(*) from public.subscription where user_id = (select uid from param)) as שורות_במנוי,       -- ⭐ חייב 0
  (select count(*) from public.wtp_survey   where user_id = (select uid from param)) as שורות_בסקר,        -- ⭐ חייב 0
  (select count(*) from public.push_sub     where user_id = (select uid from param)) as שורות_בהתראות,     -- ⭐ חייב 0
  (select count(*) from public.profiles     where id      = (select uid from param)) as שורות_בפרופיל;     -- ⭐ חייב 0
