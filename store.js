'use strict';
/* ===== store.js -- the ONLY file that talks to the backend =====
   Swapping Supabase for something else later means editing this file alone;
   app.js only ever calls the functions below. */

const sb = window.supabase.createClient(window.SUPA_URL, window.SUPA_KEY, {
  auth: { persistSession: true, autoRefreshToken: true }
});

/* ---------- auth ---------- */
const Store = {
  async signUp(email, password, username) {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { username: username || email.split('@')[0] } }
    });
    return { user: data && data.user, session: data && data.session, error };
  },
  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (data && data.user) {
      // best-effort -- auth.users.last_sign_in_at isn't readable via the client,
      // so the admin dashboard needs its own "last seen" it can actually query
      sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', data.user.id).then(()=>{});
    }
    return { user: data && data.user, session: data && data.session, error };
  },
  async signOut() { await sb.auth.signOut(); },
  /* Re-sends the sign-up confirmation to an account that exists but was never confirmed.
     This is NOT signUp() again: calling signUp with an address that is already registered
     returns success and sends nothing -- deliberately, so nobody can probe which addresses
     exist. Two real users were stranded by exactly that: the first mail was delivered and
     landed in spam, the retry sent nothing, and the screen kept promising a mail was coming.
     Errors come back as a value rather than a throw, because the interesting one is routine:
     Supabase rate-limits this per address (the SMTP screen's "minimum interval per user"),
     so a second tap inside a minute is a 429 and the learner must be told that in words. */
  /* מנוי Push אחד למכשיר. upsert על endpoint ולא insert: הדפדפן מחדש מנוי מדי פעם
     מיוזמתו, ו-insert היה מייצר שורה נוספת לכל חידוש · כלומר אותו אדם היה מקבל את
     אותה התראה פעמיים, ואז שלוש. */
  async savePushSub(endpoint, p256dh, auth) {
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return false;
      const { error } = await sb.from('push_sub')
        .upsert({ user_id: user.id, endpoint, p256dh, auth }, { onConflict: 'endpoint' });
      return !error;
    } catch (e) { return false; }
  },

  async resendConfirmation(email) {
    const to = String(email == null ? '' : email).trim();
    if (!to) return { ok: false, error: { message: 'no address' } };
    try {
      const { error } = await sb.auth.resend({ type: 'signup', email: to });
      return { ok: !error, error: error || null };
    } catch (e) {
      // a dropped connection must not leave the button disabled forever
      return { ok: false, error: e };
    }
  },
  async resetPasswordFor(email) {
    return sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  },
  async currentSession() {
    const { data } = await sb.auth.getSession();
    return data && data.session;
  },
  /* הפעלה שמורה, נקראת מהדיסק בלבד · בלי רשת ובלי המתנה.
     getSession() נראית מקומית ואינה: כשה-token פג היא יוצאת לרענון ברשת, וברשת איטית או
     בלי רשת היא פשוט לא חוזרת. האתחול מריץ אותה במרוץ מול פסק זמן, ולכן התוצאה הייתה
     "אין הפעלה" · כלומר מסך התחברות למי שמעולם לא התנתק. זה מה שהוציא את המשתמש שוב ושוב.
     כאן קוראים ישירות את מה ש-supabase-js שמר. token שפג עדיין מזהה מי המשתמש, וזה כל מה
     שנדרש כדי להציג את החשבון ולטעון את הנתונים המקומיים; autoRefreshToken יחדש אותו
     ברקע כשתהיה רשת. */
  cachedSession() {
    try {
      const ref = String(window.SUPA_URL || '').match(/https?:\/\/([^.]+)\./);
      if (!ref) return null;
      const raw = localStorage.getItem('sb-' + ref[1] + '-auth-token');
      if (!raw) return null;
      const s = JSON.parse(raw);
      // supabase-js שמר בעבר גם בעטיפה {currentSession:…}. שתי הצורות נתמכות.
      const sess = (s && s.currentSession) ? s.currentSession : s;
      return (sess && sess.user && sess.user.id) ? sess : null;
    } catch (e) { return null; }
  },

  /* האירוע מועבר הלאה ולא נבלע. "אין הפעלה" ו"המשתמש התנתק" הם שני מצבים שונים לגמרי:
     supabase-js משדר INITIAL_SESSION עם null כשהיא לא הצליחה לקרוא הפעלה · למשל בלי רשת ·
     ומי שמתייחס לזה כאל התנתקות מוחק את המשתמש בדיוק אחרי שהאתחול שחזר אותו מהדיסק. */
  onAuthChange(cb) { sb.auth.onAuthStateChange((evt, session) => cb(session, evt)); },
  async myProfile() {
    const { data } = await sb.auth.getUser();
    if (!data || !data.user) return null;
    const { data: prof } = await sb.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
    return prof;
  },

  /* ההכרעה על מנוי, חתוכה בשרת. מחזירה את ה-jsonb של my_entitlement או null.
     null בכל מצב של כשל · אין רשת, אין הפעלה, או שהפונקציה לא נפרסה · ו-accessOk
     נופלת חזרה לבדיקה המקומית. **לא לשנות את זה ל-throw**: השער הזה נכשל־פתוח
     בכוונה, וחריגה כאן הייתה נועלת מכשיר שאין לו רשת. ראה app.js › entVerdict. */
  async myEntitlement() {
    const { data, error } = await sb.rpc('my_entitlement');
    if (error) {
      // 42883 = הפונקציה אינה קיימת, כלומר migrations/11.sql לא הורץ.
      console.warn('my_entitlement נכשלה' + (error.code === '42883'
        ? ' · נראה ש-migrations/11.sql לא הורץ' : ': ' + error.message));
      return null;
    }
    return data || null;
  },

  /* ---------- progress: one JSON blob per (user, lang) ---------- */
  /* Returns {ok, data}. A bare null could not tell "the request failed" apart from
     "there is no row yet", and the caller answered both by overwriting the cloud. */
  async pullProgress(lang) {
    const { data: u } = await sb.auth.getUser();
    if (!u || !u.user) return { ok: false, data: null };
    // RLS already scopes this, but filtering explicitly means a mis-edited policy still can't
    // hand us someone else's row -- and it guarantees at most one row for maybeSingle().
    const { data, error } = await sb.from('progress').select('data,updated_at')
      .eq('user_id', u.user.id).eq('lang', lang).maybeSingle();
    if (error) { console.warn('pullProgress failed', error.message); return { ok: false, data: null }; }
    /* Three states, not two. `no row at all` is a genuinely empty cloud and the device may fill
       it. `a row whose data is not an object` is a read we cannot trust -- a renamed column, a
       truncated response, a half-written row -- and it must NOT look like an empty cloud, because
       the caller answers an empty cloud by pushing the device up. On a fresh device that push is
       `{}` written over a full row. Refusing to sync is recoverable; overwriting is not. */
    if (data && !(data.data && typeof data.data === 'object')) {
      console.warn('pullProgress: the row exists but carries no usable data -- refusing to treat it as an empty cloud');
      return { ok: false, data: null };
    }
    return { ok: true, data: data ? data.data : null };
  },
  /* expectUserId is the account the CALLER believes it is writing for. The account is resolved
     twice per sync -- once by pullProgress, once here -- and it can change in between: a
     confirmation link opened in the same tab, a second tab signing in, a token refreshed into
     another account. The read then merged A's row into local state and this wrote all of it into
     B's row, under B's own RLS, entirely legally. RLS cannot see this; only the caller knows
     which account it started with. */
  async pushProgress(lang, payload, expectUserId) {
    const { data: u } = await sb.auth.getUser();
    if (!u || !u.user) return false;
    if (expectUserId && u.user.id !== expectUserId) {
      console.warn('pushProgress aborted: the account changed between the read and the write');
      return false;
    }
    const { error } = await sb.from('progress').upsert(
      { user_id: u.user.id, lang, data: payload, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,lang' }
    );
    if (error) { console.warn('pushProgress failed', error.message); return false; }
    return true;
  },

  /* ---------- feedback / bug reports ---------- */
  async sendFeedback(kind, body, context) {
    const { data: u } = await sb.auth.getUser();
    const user = u && u.user;
    const { error } = await sb.from('feedback').insert({
      user_id: user ? user.id : null,
      email: user ? user.email : null,
      kind, body, context
    });
    // 42P01 = table missing (migration not run yet); the caller falls back to email
    if (error) return { ok: false, missingTable: error.code === '42P01', error };
    return { ok: true };
  },
  async adminListFeedback() {
    const { data, error } = await sb.from('feedback')
      .select('id,email,kind,body,context,status,created_at')
      .order('created_at', { ascending: false }).limit(200);
    if (error) return { rows: [], error };
    return { rows: data, error: null };
  },
  async adminMarkFeedback(id, status) {
    const { error } = await sb.from('feedback').update({ status }).eq('id', id);
    return !error;
  },
  /* How many reports are still waiting. head:true asks Postgres for the count only -- 
     no rows cross the wire, so this can run on every screen entry without costing anything.
     status is NOT NULL default 'new', so neq('done') really does mean "not handled yet". */
  async countOpenFeedback() {
    const { count, error } = await sb.from('feedback')
      .select('id', { count: 'exact', head: true }).neq('status', 'done');
    return error ? null : (count || 0);
  },

  /* ---------- willingness-to-pay survey (one shot per learner) ---------- */
  /* Asked once, ever. The flag lives in the table and not only in localStorage, because a
     learner who switches phone or clears storage would otherwise be asked a second time --
     and a survey that reappears reads as nagging rather than as a question.
     Returns true = already asked (answered or dismissed) → do not show.
     On any error, including the table not existing yet (42P01), returns true: never show a
     card whose submit would fail. */
  async wtpAsked() {
    const { data: u } = await sb.auth.getUser();
    const user = u && u.user;
    if (!user) return true;                       // signed out -- nothing to write to
    /* head:true returns the count and no rows -- `data` is null here, so the answer has to come
       from `count`. Reading data.length instead would always say "never asked". */
    const { count, error } = await sb.from('wtp_survey')
      .select('user_id', { count: 'exact', head: true }).eq('user_id', user.id);
    if (error) return true;
    return (count || 0) > 0;
  },
  /* dismissed:true is written for a ✕ with no answer. It is a real data point -- the ratio of
     dismissals to answers says how much appetite there was for the question at all -- and it is
     also what stops the card from coming back. */
  async wtpSave(row) {
    const { data: u } = await sb.auth.getUser();
    const user = u && u.user;
    if (!user) return { ok: false };
    const { error } = await sb.from('wtp_survey').insert({
      user_id: user.id,
      price_bucket: row.price_bucket || null,
      what_helped: row.what_helped || null,
      what_would_stop: row.what_would_stop || null,
      dismissed: !!row.dismissed
    });
    if (error) return { ok: false, missingTable: error.code === '42P01', error };
    return { ok: true };
  },

  /* ---------- admin ---------- */
  async adminListUsers() {
    const { data, error } = await sb.from('profiles')
      .select('id,username,email,created_at,last_seen,role').order('created_at', { ascending: false });
    if (error) return { users: [], error };
    return { users: data, error: null };
  },
  /* The admin panel counts practice; it must never receive what the learner wrote.
     `data` is the whole blob -- {assoc, stats, deleted, added, dir, extras} -- and `assoc` is the
     learner's own associations, written on the assumption nobody would read them. The privacy
     policy promises the service owner does not see them; selecting `data` handed every one of
     them to an admin screen on every panel load, whether or not anything rendered them.
     So exactly one key is projected out of the jsonb, by name, PostgREST-side:
     `stats:data->stats` reads the `stats` key and returns it under the alias `stats`.
     `added` is excluded along with `assoc` on purpose: the policy allows knowing how much you
     practised, and a word the learner typed in with the meaning they wrote for it is writing,
     not a count. Nothing in the panel ever used it. Anything the panel needs later gets added
     here by name -- never by widening this back to the blob. */
  async adminUserProgress(userId) {
    const { data } = await sb.from('progress')
      .select('lang,updated_at,stats:data->stats').eq('user_id', userId);
    return data || [];
  },
  async adminSendReset(email) { return this.resetPasswordFor(email); },

  /* ---------- shared associations ----------
     A separate table from the private ones on purpose: an association is personal writing,
     made under the assumption nobody would read it. Nothing already written is ever copied
     here -- sharing is an explicit act, one association at a time. */
  async shareAssoc(lang, wordKey, word, text) {
    const { data: u } = await sb.auth.getUser();
    if (!u || !u.user) return { ok: false };
    const body = String(text || '').trim();
    if (body.length < 2) return { ok: false };
    const { error } = await sb.from('assoc_shared').upsert(
      { user_id: u.user.id, lang, word_key: wordKey, word, text: body.slice(0, 300) },
      { onConflict: 'user_id,lang,word_key' });
    if (error) { console.warn('shareAssoc failed', error.message); return { ok: false, error }; }
    return { ok: true };
  },
  async unshareAssoc(lang, wordKey) {
    const { data: u } = await sb.auth.getUser();
    if (!u || !u.user) return { ok: false };
    const { error } = await sb.from('assoc_shared').delete()
      .eq('user_id', u.user.id).eq('lang', lang).eq('word_key', wordKey);
    return { ok: !error };
  },
  /* Read through an RPC, not the table. The old select policy was `using (true)`, so any signed-in
     account could pull every shared association ever written TOGETHER WITH its user_id -- the text
     is meant to be shared, the authorship behind it is not, and RLS cannot hide a column.
     public.shared_assoc is SECURITY DEFINER and simply never returns user_id; it computes is_mine
     server-side instead. The table's own select policy is now own-rows-only. */
  async listSharedAssoc(lang, wordKey) {
    const { data, error } = await sb.rpc('shared_assoc', { p_lang: lang, p_word_key: wordKey });
    if (error) {
      // 42883 = the function does not exist, i.e. migrations/9.sql was never run. Silence here
      // meant the whole "what others wrote" feature simply never appeared, with no error anywhere.
      console.warn('shared_assoc נכשלה' + (error.code === '42883'
        ? ' · נראה ש-migrations/9.sql לא הורץ' : ': ' + error.message));
      return { ok: false, rows: [], mine: false };
    }
    const rows = data || [];
    return { ok: true, rows: rows.filter(r => !r.is_mine), mine: rows.some(r => r.is_mine) };
  },

  /* Re-authentication. The password is verified BY SUPABASE against the stored hash -- 
     nothing is compared in the browser and no secret lives in this file. */
  async verifyMyPassword(password) {
    const { data } = await sb.auth.getUser();
    const email = data && data.user && data.user.email;
    if (!email || !password) return false;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    return !error;
  },

  /* Deletes the DATA, not the account: auth.users can only be removed with a
     service_role key, which must never reach the browser. The caller says so plainly.

     The profiles row is CLEARED, not deleted. handle_new_user only fires on INSERT into
     auth.users, so a deleted row was never recreated -- and accessOk() treats a missing
     profile as "the subscription columns aren't deployed yet" and lets the user through.
     Deleting the data therefore handed that account unlimited access forever, which is the
     exact opposite of what the button says. */
  async adminDeleteUserData(userId) {
    if (!userId) return { ok: false, error: { message: 'חסר מזהה משתמש' } };
    const steps = [
      sb.from('progress').delete().eq('user_id', userId),
      sb.from('feedback').delete().eq('user_id', userId),
      sb.from('profiles').update({ sub_status: 'none', sub_until: null, sub_note: 'הנתונים נמחקו על ידי מנהל' })
        .eq('id', userId),
    ];
    for (const p of steps) { const { error } = await p; if (error) return { ok: false, error }; }
    return { ok: true };
  },

  /* Self-service account deletion. Goes through an Edge Function and not through the table
     API, because removing the row from auth.users needs service_role · a key that can never
     be in a browser. Without that step the account still signs in, and "מחיקת החשבון" is a
     button that lies.

     Returns {ok} or {ok:false, error}. `notDeployed` distinguishes "the function is not
     there yet" from "the deletion failed", because the two need different words on screen. */
  async deleteMyAccount() {
    const { data: s } = await sb.auth.getSession();
    const token = s && s.session && s.session.access_token;
    if (!token) return { ok: false, error: { message: 'אין חיבור פעיל. התחבר שוב ונסה' } };
    let res;
    try {
      res = await fetch(window.SUPA_URL + '/functions/v1/delete-account', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, apikey: window.SUPA_KEY,
                   'content-type': 'application/json' },
        body: '{}',
      });
    } catch (e) {
      return { ok: false, error: { message: 'אין חיבור לרשת' } };
    }
    if (res.status === 404) return { ok: false, notDeployed: true, error: { message: 'השירות אינו זמין כרגע' } };
    let body = null;
    try { body = await res.json(); } catch (e) { /* a non-JSON body is still a failure */ }
    if (!res.ok || !body || body.ok !== true)
      return { ok: false, error: { message: (body && body.error) || 'המחיקה נכשלה' } };
    return { ok: true, removed: body.removed };
  },

  /* status: none | grace | active | past_due | canceled */
  async adminSetSubscription(userId, { status, until, plan, note }) {
    const patch = { sub_status: status };
    if (until !== undefined) patch.sub_until = until;
    if (plan  !== undefined) patch.plan = plan;
    if (note  !== undefined) patch.sub_note = note;
    const { error } = await sb.from('profiles').update(patch).eq('id', userId);
    return { ok: !error, error };
  }
};
window.Store = Store;
