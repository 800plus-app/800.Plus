/**
 * delete-account — מחיקת חשבון ביוזמת המשתמש.
 *
 * למה זו פונקציית שרת ולא כפתור בדפדפן:
 * מחיקת שורה מ-auth.users דורשת service_role. המפתח הזה נותן שליטה מלאה על
 * כל המסד, ולכן הוא לא יכול להגיע לדפדפן בשום צורה. הדפדפן יכול למחוק את
 * הנתונים של המשתמש (RLS מרשה לו), אבל **לא** את החשבון עצמו — והתוצאה היא
 * "מחיקה" שאחריה אפשר עדיין להתחבר. זו הבטחה שבורה, ולכן היא כאן.
 *
 * מי מורשה: רק בעל החשבון, על עצמו. ה-JWT מגיע מהלקוח, נבדק מול Supabase,
 * וה-uid ממנו הוא היחיד שנמחק. אין פרמטר של מזהה משתמש בגוף הבקשה —
 * במכוון, כדי שלא תהיה דרך לבקש מחיקה של מישהו אחר.
 *
 * verify_jwt נשאר true (ברירת המחדל) — כאן זה בדיוק מה שרוצים.
 *
 * הסדר קריטי: הנתונים לפני החשבון. אם המחיקה נכשלת באמצע, נשארים נתונים
 * בלי משתמש — שורות יתומות שאפשר לנקות. הסדר ההפוך משאיר משתמש בלי
 * נתונים, שנראה כמו חשבון תקין שהתרוקן מעצמו.
 *
 * פריסה:
 *   supabase functions deploy delete-account
 * אין צורך בשום סוד: SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY מוזרקים
 * אוטומטית לכל Edge Function.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!url || !service) return json({ error: 'not configured' }, 500);

  const auth = req.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return json({ error: 'unauthenticated' }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });

  // Whose token is this? Supabase answers; we never take the caller's word for it.
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  const uid = who?.user?.id;
  if (whoErr || !uid) return json({ error: 'unauthenticated' }, 401);

  /* A last stop for the owner's own account. Deleting it would take the admin panel with it,
     and there would be no way back in. If he ever really means it, he can do it from the
     dashboard — where the consequence is visible. */
  const email = (who.user.email || '').toLowerCase();
  if (email === 'admin@800-plus.com' || email === '03hagay@gmail.com')
    return json({ error: 'זהו חשבון הניהול — מחיקה שלו נעשית רק מהדשבורד' }, 403);

  const removed: Record<string, number | string> = {};
  for (const [table, col] of [
    ['progress', 'user_id'],
    ['feedback', 'user_id'],
    ['assoc_shared', 'user_id'],
    ['subscription', 'user_id'],
  ] as const) {
    const { error, count } = await admin.from(table).delete({ count: 'exact' }).eq(col, uid);
    // A table that does not exist in this project is not a failure — assoc_shared and
    // subscription were both added later and may be absent in an older environment.
    // Any OTHER error is: a delete that silently "succeeds" leaves the user's rows on the
    // server while the UI reports the account gone — the exact broken promise the privacy
    // audit flagged. Abort BEFORE deleteUser, so the user can retry with their account intact.
    if (error && !/does not exist/i.test(error.message))
      return json({ error: `מחיקת ${table} נכשלה: ${error.message}`, removed }, 500);
    removed[table] = error ? `skipped: ${error.message}` : (count ?? 0);
  }

  const { error: pErr } = await admin.from('profiles').delete().eq('id', uid);
  if (pErr && !/does not exist/i.test(pErr.message))
    return json({ error: `מחיקת profiles נכשלה: ${pErr.message}`, removed }, 500);
  removed['profiles'] = pErr ? `skipped: ${pErr.message}` : 1;

  // and only now the account itself
  const { error: dErr } = await admin.auth.admin.deleteUser(uid);
  if (dErr) return json({ error: dErr.message, removed }, 500);

  return json({ ok: true, removed });
});
