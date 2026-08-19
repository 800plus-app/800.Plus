/* Supabase project config. The publishable key is DESIGNED to be public -- 
   it is meaningless without the RLS policies enforced server-side, which are
   the actual security boundary. Never put the secret/service_role key here. */
window.SUPA_URL = 'https://oycypbnzcvtjliovfsxn.supabase.co';
window.SUPA_KEY = 'sb_publishable_iU2ZF4HHduq_a972pp8naQ_VB8Ar_NH';

/* מפתח VAPID הפומבי · Web Push. פומבי מעצם הגדרתו: הדפדפן שולח אותו לספק ה-Push
   כדי לזהות את השולח, והמפתח הפרטי (שאינו כאן ולעולם לא יהיה) הוא מה שחותם.
   ריק = אין Push, והאפליקציה ממשיכה לעבוד עם שני ערוצי ההתראה האחרים.
   לייצור: bash scripts/vapid_keys.sh ואז להדביק כאן את הפומבי בלבד. */
window.VAPID_PUBLIC = 'BNPRpotOtCLCsfbjLlOrU_UjvGdr3FhBOeAlw_KRQTZQY7GZQgbTh-6aX5awREoQocdNk7jKSxAyhvqQR7oEq3s';
