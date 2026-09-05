-- ‏שאילתת הדשבורד השבועי · 8 שורות · קריאה בלבד · ספירות בלבד, אפס מיילים ומזהים
--
-- ⭐ **המשפט לחגי:** מדפיס 8 מספרים על השבוע שעבר — כמה נרשמו ומאיפה, כמה
--    תרגלו, ומי חזר אחרי יום/שבוע/חודש — בלי לחשוף שום פרט אישי.
--
-- מקור: דוח E (3.9.2026), סקיצות (ג)+(ד). דורש: migrations/25.sql (activity_days).
-- שורה 1 מפולחת לפי ft_source; עד שמנגנון המקור (משימה 1) נפרס, כולם 'unknown'.
-- מיועד לרוץ ב-GitHub Action עם role לקריאה בלבד (pooler, session mode, 5432).

with bounds as (
  select date_trunc('week', current_date)::date        as week_start,   -- שני הנוכחי
         date_trunc('week', current_date)::date - 7    as prev_start    -- שני שעבר
),
u as (
  select id as user_id, created_at::date as d0,
         coalesce(nullif(trim(ft_source), ''), 'unknown') as src
  from public.profiles
),
a as (select distinct user_id, day from public.activity_days),
coh as (  -- D1/D7/D30 לפי גיל הקוהורטה, קוהורטות בוגרות בלבד
  select u.user_id, u.d0,
         bool_or(a.day = u.d0 + 1)                       as d1,
         bool_or(a.day between u.d0 + 7  and u.d0 + 13)  as d7,
         bool_or(a.day between u.d0 + 30 and u.d0 + 36)  as d30
  from u left join a using (user_id)
  where u.d0 >= current_date - 120
  group by 1, 2
)

select 1 as row_no, 'נרשמים השבוע שעבר · לפי מקור' as metric,
       coalesce(string_agg(src || ': ' || n, ' · ' order by n desc), '0') as value
from (
  select u.src, count(*) as n
  from u, bounds b
  where u.d0 >= b.prev_start and u.d0 < b.week_start
  group by u.src
) t

union all
select 2, 'הפעלה · % שתרגלו ביום ההרשמה או למחרת (נרשמי השבוע שעבר)',
       coalesce(round(100.0 * count(*) filter (where activated) / nullif(count(*), 0), 1)::text, '—')
from (
  select u.user_id, bool_or(a.day between u.d0 and u.d0 + 1) as activated
  from u join bounds b on u.d0 >= b.prev_start and u.d0 < b.week_start
  left join a using (user_id)
  group by u.user_id
) t

union all
select 3, 'פעילים השבוע שעבר (WAU)',
       count(distinct a.user_id)::text
from a, bounds b
where a.day >= b.prev_start and a.day < b.week_start

union all
select 4, 'D1 · % שחזרו למחרת (נרשמי השבוע שעבר)',
       coalesce(round(100.0 * count(*) filter (where d1) / nullif(count(*), 0), 1)::text, '—')
from coh, bounds b
where d0 >= b.prev_start and d0 < b.week_start - 1   -- רק מי שכבר יכול היה לחזור למחרת

union all
select 5, 'D7 · % שחזרו בימים 7–13 (קוהורטת לפני שבועיים)',
       coalesce(round(100.0 * count(*) filter (where d7) / nullif(count(*), 0), 1)::text, '—')
from coh, bounds b
where d0 >= b.prev_start - 7 and d0 < b.prev_start

union all
select 6, 'D30 · % שחזרו בימים 30–36 (קוהורטת לפני 5 שבועות)',
       coalesce(round(100.0 * count(*) filter (where d30) / nullif(count(*), 0), 1)::text, '—')
from coh, bounds b
where d0 >= b.prev_start - 28 and d0 < b.prev_start - 21

union all
select 7, 'שימור מצטבר · פעילים השבוע מתוך כלל הנרשמים',
       count(distinct a.user_id)::text || ' מתוך ' || (select count(*) from u)::text
from a, bounds b
where a.day >= b.prev_start and a.day < b.week_start

union all
select 8, 'סה"כ נרשמים עד היום',
       count(*)::text
from u

order by row_no;
