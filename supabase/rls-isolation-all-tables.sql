-- ‏בידוד RLS · כל הטבלאות · שני כיוונים · **תוצאה אחת מאוחדת של 20 שורות**
--
-- ⭐ **המשפט לחגי:** בודק לכל טבלה אם משתמש אחד יכול לקרוא את השורות של
--    משתמש אחר · ומתחיל בטבלאות החיוב, לפני שיש בהן כסף אמיתי.
--
-- ⛔ **סדר ההרצה:** להריץ את **סעיף 0 לבדו** קודם. אם טבלה כלשהי אינה קיימת
--    שם · ⭐ **למחוק את הבלוק שלה** לפני הרצת השאר. הפניה לטבלה שאינה קיימת
--    נכשלת **בזמן פרסור**, והיא מפילה את כל מה שאחריה.


-- ══════════════════════════════════════════════════════════════════════
-- ⛔ למה אין כאן begin/rollback · וזה שינוי מכוון מההוראה
-- ══════════════════════════════════════════════════════════════════════
--
-- ⛔ **`set_config(...,false)` אינו שורד `rollback`.** לפי תיעוד PostgreSQL
--    על `SET`: *"If SET is issued within a transaction that is later aborted,
--    the effects of the SET command disappear when the transaction is rolled
--    back."* ‏`set_config` היא המקבילה הפונקציונלית, ולכן **גם ערך ברמת סשן
--    נמחק ברולבק** · והסלקט המאחד היה חוזר ריק. **אותו כשל, סיבה הפוכה.**
--
-- ⚠ **לא הצלחתי לאמת את זה בהרצה** · אין כאן psql ואין Postgres. הטענה
--    מבוססת על התיעוד בלבד, ולכן התכנון כאן נבנה **לעבוד בשני המקרים.**
--
-- ⭐ **והפתרון פשוט מהצפוי: הטרנזקציה מעולם לא נחוצה כאן.** היא מגנה מפני
--    כתיבה, ⛔ **ובקובץ הזה אין ולו פקודת כתיבה אחת** · רק `select`,
--    `set_config`, `set role` ו-`reset role`. אין מה לגלגל אחורה.
--
-- ⭐ **ומה שכן מחליף אותה:** כל בלוק מחזיר את התפקיד ב-`reset role`, ובסוף
--    הקובץ יש **ניקוי מפורש** של `request.jwt.claims` · כדי שהסשן של העורך
--    לא יישאר מתחזה למשתמש.
--
-- ══════════════════════════════════════════════════════════════════════
-- ⭐ איך קוראים כל שורה בתוצאה
-- ══════════════════════════════════════════════════════════════════════
--
--   רואה_את_האחר = 0  **וגם**  רואה_את_עצמו > 0   →  ⭐ **עבר**
--   רואה_את_האחר = 0  **אבל**  רואה_את_עצמו = 0   →  ⛔ **לא נבדק** · לא «עבר»
--   משתמשים_בטבלה < 2                              →  ⛔ **אין מול מי להשוות**
--   סך_השורות = 0                                  →  ⛔ **ריקה** · נמדד, לא משוער
--   רואה_את_האחר > 0                               →  ⛔⛔ **נכשל** · דליפה
--   כל ערך = 'לא רץ'                                   →  ⛔ **הבלוק לא רץ**
--
-- ⚠ המזהים ו-`request.jwt.claims` נשמרים ונקראים אך **לעולם אינם מודפסים.**


-- ══════════════════════════════════════════════════════════════════════
-- ‏0 · מפה · להריץ לבד קודם
-- ══════════════════════════════════════════════════════════════════════
select c.relname                                              as טבלה,
       c.relrowsecurity                                       as rls_דלוק,
       (select count(*) from pg_policies p
         where p.schemaname='public' and p.tablename=c.relname) as מדיניות,
       (xpath('/row/c/text()',
              query_to_xml(format('select count(*) as c from public.%I', c.relname),
                           false, true, '')))[1]::text::int    as סך_השורות
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind='r'
 order by c.relrowsecurity, c.relname;


-- ══════════════════════════════════════════════════════════════════════
-- ⛔⛔ טבלאות הכסף · ראשונות בכוונה
-- ══════════════════════════════════════════════════════════════════════

-- ‏1 · billing_customers
select set_config('r.bc_n',(select count(*)::text from public.billing_customers),false),
       set_config('r.bc_u',(select count(distinct user_id)::text from public.billing_customers),false),
       set_config('x.a',coalesce((select user_id::text from public.billing_customers group by user_id order by count(*) desc, user_id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select user_id::text from public.billing_customers group by user_id order by count(*) desc, user_id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.bc_ba_o',(select count(*)::text from public.billing_customers where user_id=current_setting('x.a')::uuid),false),
       set_config('r.bc_ba_s',(select count(*)::text from public.billing_customers),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.bc_ab_o',(select count(*)::text from public.billing_customers where user_id=current_setting('x.b')::uuid),false),
       set_config('r.bc_ab_s',(select count(*)::text from public.billing_customers),false);
reset role;

-- ‏2 · billing_subscriptions
select set_config('r.bs_n',(select count(*)::text from public.billing_subscriptions),false),
       set_config('r.bs_u',(select count(distinct user_id)::text from public.billing_subscriptions),false),
       set_config('x.a',coalesce((select user_id::text from public.billing_subscriptions group by user_id order by count(*) desc, user_id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select user_id::text from public.billing_subscriptions group by user_id order by count(*) desc, user_id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.bs_ba_o',(select count(*)::text from public.billing_subscriptions where user_id=current_setting('x.a')::uuid),false),
       set_config('r.bs_ba_s',(select count(*)::text from public.billing_subscriptions),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.bs_ab_o',(select count(*)::text from public.billing_subscriptions where user_id=current_setting('x.b')::uuid),false),
       set_config('r.bs_ab_s',(select count(*)::text from public.billing_subscriptions),false);
reset role;

-- ‏3 · payments
select set_config('r.pm_n',(select count(*)::text from public.payments),false),
       set_config('r.pm_u',(select count(distinct user_id)::text from public.payments),false),
       set_config('x.a',coalesce((select user_id::text from public.payments group by user_id order by count(*) desc, user_id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select user_id::text from public.payments group by user_id order by count(*) desc, user_id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.pm_ba_o',(select count(*)::text from public.payments where user_id=current_setting('x.a')::uuid),false),
       set_config('r.pm_ba_s',(select count(*)::text from public.payments),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.pm_ab_o',(select count(*)::text from public.payments where user_id=current_setting('x.b')::uuid),false),
       set_config('r.pm_ab_s',(select count(*)::text from public.payments),false);
reset role;

-- ‏4 · subscription
select set_config('r.sb_n',(select count(*)::text from public.subscription),false),
       set_config('r.sb_u',(select count(distinct user_id)::text from public.subscription),false),
       set_config('x.a',coalesce((select user_id::text from public.subscription group by user_id order by count(*) desc, user_id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select user_id::text from public.subscription group by user_id order by count(*) desc, user_id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.sb_ba_o',(select count(*)::text from public.subscription where user_id=current_setting('x.a')::uuid),false),
       set_config('r.sb_ba_s',(select count(*)::text from public.subscription),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.sb_ab_o',(select count(*)::text from public.subscription where user_id=current_setting('x.b')::uuid),false),
       set_config('r.sb_ab_s',(select count(*)::text from public.subscription),false);
reset role;

-- ‏5 · assoc_shared  ⚠ שיתוף מכוון בין לומדים · «רואה_את_האחר > 0» עשוי להיות תכנון
select set_config('r.as_n',(select count(*)::text from public.assoc_shared),false),
       set_config('r.as_u',(select count(distinct user_id)::text from public.assoc_shared),false),
       set_config('x.a',coalesce((select user_id::text from public.assoc_shared group by user_id order by count(*) desc, user_id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select user_id::text from public.assoc_shared group by user_id order by count(*) desc, user_id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.as_ba_o',(select count(*)::text from public.assoc_shared where user_id=current_setting('x.a')::uuid),false),
       set_config('r.as_ba_s',(select count(*)::text from public.assoc_shared),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.as_ab_o',(select count(*)::text from public.assoc_shared where user_id=current_setting('x.b')::uuid),false),
       set_config('r.as_ab_s',(select count(*)::text from public.assoc_shared),false);
reset role;

-- ‏6 · wtp_survey
select set_config('r.wt_n',(select count(*)::text from public.wtp_survey),false),
       set_config('r.wt_u',(select count(distinct user_id)::text from public.wtp_survey),false),
       set_config('x.a',coalesce((select user_id::text from public.wtp_survey group by user_id order by count(*) desc, user_id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select user_id::text from public.wtp_survey group by user_id order by count(*) desc, user_id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.wt_ba_o',(select count(*)::text from public.wtp_survey where user_id=current_setting('x.a')::uuid),false),
       set_config('r.wt_ba_s',(select count(*)::text from public.wtp_survey),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.wt_ab_o',(select count(*)::text from public.wtp_survey where user_id=current_setting('x.b')::uuid),false),
       set_config('r.wt_ab_s',(select count(*)::text from public.wtp_survey),false);
reset role;

-- ‏7 · progress
select set_config('r.pg_n',(select count(*)::text from public.progress),false),
       set_config('r.pg_u',(select count(distinct user_id)::text from public.progress),false),
       set_config('x.a',coalesce((select user_id::text from public.progress group by user_id order by count(*) desc, user_id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select user_id::text from public.progress group by user_id order by count(*) desc, user_id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.pg_ba_o',(select count(*)::text from public.progress where user_id=current_setting('x.a')::uuid),false),
       set_config('r.pg_ba_s',(select count(*)::text from public.progress),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.pg_ab_o',(select count(*)::text from public.progress where user_id=current_setting('x.b')::uuid),false),
       set_config('r.pg_ab_s',(select count(*)::text from public.progress),false);
reset role;

-- ‏8 · profiles  ⚠ העמודה היא id
select set_config('r.pr_n',(select count(*)::text from public.profiles),false),
       set_config('r.pr_u',(select count(distinct id)::text from public.profiles),false),
       set_config('x.a',coalesce((select id::text from public.profiles group by id order by count(*) desc, id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select id::text from public.profiles group by id order by count(*) desc, id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.pr_ba_o',(select count(*)::text from public.profiles where id=current_setting('x.a')::uuid),false),
       set_config('r.pr_ba_s',(select count(*)::text from public.profiles),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.pr_ab_o',(select count(*)::text from public.profiles where id=current_setting('x.b')::uuid),false),
       set_config('r.pr_ab_s',(select count(*)::text from public.profiles),false);
reset role;

-- ‏9 · feedback
select set_config('r.fb_n',(select count(*)::text from public.feedback),false),
       set_config('r.fb_u',(select count(distinct user_id)::text from public.feedback),false),
       set_config('x.a',coalesce((select user_id::text from public.feedback group by user_id order by count(*) desc, user_id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select user_id::text from public.feedback group by user_id order by count(*) desc, user_id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.fb_ba_o',(select count(*)::text from public.feedback where user_id=current_setting('x.a')::uuid),false),
       set_config('r.fb_ba_s',(select count(*)::text from public.feedback),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.fb_ab_o',(select count(*)::text from public.feedback where user_id=current_setting('x.b')::uuid),false),
       set_config('r.fb_ab_s',(select count(*)::text from public.feedback),false);
reset role;

-- ‏10 · push_sub
select set_config('r.ps_n',(select count(*)::text from public.push_sub),false),
       set_config('r.ps_u',(select count(distinct user_id)::text from public.push_sub),false),
       set_config('x.a',coalesce((select user_id::text from public.push_sub group by user_id order by count(*) desc, user_id limit 1),'00000000-0000-0000-0000-000000000000'),false),
       set_config('x.b',coalesce((select user_id::text from public.push_sub group by user_id order by count(*) desc, user_id offset 1 limit 1),'00000000-0000-0000-0000-000000000000'),false);
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.b'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.ps_ba_o',(select count(*)::text from public.push_sub where user_id=current_setting('x.a')::uuid),false),
       set_config('r.ps_ba_s',(select count(*)::text from public.push_sub),false);
reset role;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('x.a'),'role','authenticated')::text,false);
set role authenticated;
select set_config('r.ps_ab_o',(select count(*)::text from public.push_sub where user_id=current_setting('x.b')::uuid),false),
       set_config('r.ps_ab_s',(select count(*)::text from public.push_sub),false);
reset role;


-- ══════════════════════════════════════════════════════════════════════
-- ⛔ ניקוי · שהסשן של העורך לא יישאר מתחזה למשתמש
-- ══════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims','',false),
       set_config('x.a','',false),
       set_config('x.b','',false);


-- ══════════════════════════════════════════════════════════════════════
-- ⭐ התוצאה · 20 שורות · ההוראה האחרונה, ולכן זו שתוצג
-- ══════════════════════════════════════════════════════════════════════
select * from (values
 ('billing_customers','ב→א',coalesce(current_setting('r.bc_n',true),'לא רץ'),coalesce(current_setting('r.bc_u',true),'לא רץ'),coalesce(current_setting('r.bc_ba_o',true),'לא רץ'),coalesce(current_setting('r.bc_ba_s',true),'לא רץ')),
 ('billing_customers','א→ב',coalesce(current_setting('r.bc_n',true),'לא רץ'),coalesce(current_setting('r.bc_u',true),'לא רץ'),coalesce(current_setting('r.bc_ab_o',true),'לא רץ'),coalesce(current_setting('r.bc_ab_s',true),'לא רץ')),
 ('billing_subscriptions','ב→א',coalesce(current_setting('r.bs_n',true),'לא רץ'),coalesce(current_setting('r.bs_u',true),'לא רץ'),coalesce(current_setting('r.bs_ba_o',true),'לא רץ'),coalesce(current_setting('r.bs_ba_s',true),'לא רץ')),
 ('billing_subscriptions','א→ב',coalesce(current_setting('r.bs_n',true),'לא רץ'),coalesce(current_setting('r.bs_u',true),'לא רץ'),coalesce(current_setting('r.bs_ab_o',true),'לא רץ'),coalesce(current_setting('r.bs_ab_s',true),'לא רץ')),
 ('payments','ב→א',coalesce(current_setting('r.pm_n',true),'לא רץ'),coalesce(current_setting('r.pm_u',true),'לא רץ'),coalesce(current_setting('r.pm_ba_o',true),'לא רץ'),coalesce(current_setting('r.pm_ba_s',true),'לא רץ')),
 ('payments','א→ב',coalesce(current_setting('r.pm_n',true),'לא רץ'),coalesce(current_setting('r.pm_u',true),'לא רץ'),coalesce(current_setting('r.pm_ab_o',true),'לא רץ'),coalesce(current_setting('r.pm_ab_s',true),'לא רץ')),
 ('subscription','ב→א',coalesce(current_setting('r.sb_n',true),'לא רץ'),coalesce(current_setting('r.sb_u',true),'לא רץ'),coalesce(current_setting('r.sb_ba_o',true),'לא רץ'),coalesce(current_setting('r.sb_ba_s',true),'לא רץ')),
 ('subscription','א→ב',coalesce(current_setting('r.sb_n',true),'לא רץ'),coalesce(current_setting('r.sb_u',true),'לא רץ'),coalesce(current_setting('r.sb_ab_o',true),'לא רץ'),coalesce(current_setting('r.sb_ab_s',true),'לא רץ')),
 ('assoc_shared','ב→א',coalesce(current_setting('r.as_n',true),'לא רץ'),coalesce(current_setting('r.as_u',true),'לא רץ'),coalesce(current_setting('r.as_ba_o',true),'לא רץ'),coalesce(current_setting('r.as_ba_s',true),'לא רץ')),
 ('assoc_shared','א→ב',coalesce(current_setting('r.as_n',true),'לא רץ'),coalesce(current_setting('r.as_u',true),'לא רץ'),coalesce(current_setting('r.as_ab_o',true),'לא רץ'),coalesce(current_setting('r.as_ab_s',true),'לא רץ')),
 ('wtp_survey','ב→א',coalesce(current_setting('r.wt_n',true),'לא רץ'),coalesce(current_setting('r.wt_u',true),'לא רץ'),coalesce(current_setting('r.wt_ba_o',true),'לא רץ'),coalesce(current_setting('r.wt_ba_s',true),'לא רץ')),
 ('wtp_survey','א→ב',coalesce(current_setting('r.wt_n',true),'לא רץ'),coalesce(current_setting('r.wt_u',true),'לא רץ'),coalesce(current_setting('r.wt_ab_o',true),'לא רץ'),coalesce(current_setting('r.wt_ab_s',true),'לא רץ')),
 ('progress','ב→א',coalesce(current_setting('r.pg_n',true),'לא רץ'),coalesce(current_setting('r.pg_u',true),'לא רץ'),coalesce(current_setting('r.pg_ba_o',true),'לא רץ'),coalesce(current_setting('r.pg_ba_s',true),'לא רץ')),
 ('progress','א→ב',coalesce(current_setting('r.pg_n',true),'לא רץ'),coalesce(current_setting('r.pg_u',true),'לא רץ'),coalesce(current_setting('r.pg_ab_o',true),'לא רץ'),coalesce(current_setting('r.pg_ab_s',true),'לא רץ')),
 ('profiles','ב→א',coalesce(current_setting('r.pr_n',true),'לא רץ'),coalesce(current_setting('r.pr_u',true),'לא רץ'),coalesce(current_setting('r.pr_ba_o',true),'לא רץ'),coalesce(current_setting('r.pr_ba_s',true),'לא רץ')),
 ('profiles','א→ב',coalesce(current_setting('r.pr_n',true),'לא רץ'),coalesce(current_setting('r.pr_u',true),'לא רץ'),coalesce(current_setting('r.pr_ab_o',true),'לא רץ'),coalesce(current_setting('r.pr_ab_s',true),'לא רץ')),
 ('feedback','ב→א',coalesce(current_setting('r.fb_n',true),'לא רץ'),coalesce(current_setting('r.fb_u',true),'לא רץ'),coalesce(current_setting('r.fb_ba_o',true),'לא רץ'),coalesce(current_setting('r.fb_ba_s',true),'לא רץ')),
 ('feedback','א→ב',coalesce(current_setting('r.fb_n',true),'לא רץ'),coalesce(current_setting('r.fb_u',true),'לא רץ'),coalesce(current_setting('r.fb_ab_o',true),'לא רץ'),coalesce(current_setting('r.fb_ab_s',true),'לא רץ')),
 ('push_sub','ב→א',coalesce(current_setting('r.ps_n',true),'לא רץ'),coalesce(current_setting('r.ps_u',true),'לא רץ'),coalesce(current_setting('r.ps_ba_o',true),'לא רץ'),coalesce(current_setting('r.ps_ba_s',true),'לא רץ')),
 ('push_sub','א→ב',coalesce(current_setting('r.ps_n',true),'לא רץ'),coalesce(current_setting('r.ps_u',true),'לא רץ'),coalesce(current_setting('r.ps_ab_o',true),'לא רץ'),coalesce(current_setting('r.ps_ab_s',true),'לא רץ'))
) as t(טבלה, כיוון, סך_השורות, משתמשים_בטבלה, רואה_את_האחר, רואה_את_עצמו);


-- ‏11–13 · `billing_events` · `uptime_log` נעולות (0 מדיניות, אין עמודת משתמש)
--          `app_config` ציבורית בכוונה. ⛔ אינן במחלקת הבידוד ולא ידווחו כ«עברו».
