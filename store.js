'use strict';
/* ===== store.js — the ONLY file that talks to the backend =====
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
      // best-effort — auth.users.last_sign_in_at isn't readable via the client,
      // so the admin dashboard needs its own "last seen" it can actually query
      sb.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', data.user.id).then(()=>{});
    }
    return { user: data && data.user, session: data && data.session, error };
  },
  async signOut() { await sb.auth.signOut(); },
  async resetPasswordFor(email) {
    return sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  },
  async currentSession() {
    const { data } = await sb.auth.getSession();
    return data && data.session;
  },
  onAuthChange(cb) { sb.auth.onAuthStateChange((_evt, session) => cb(session)); },
  async myProfile() {
    const { data } = await sb.auth.getUser();
    if (!data || !data.user) return null;
    const { data: prof } = await sb.from('profiles').select('*').eq('id', data.user.id).maybeSingle();
    return prof;
  },

  /* ---------- progress: one JSON blob per (user, lang) ---------- */
  /* Returns {ok, data}. A bare null could not tell "the request failed" apart from
     "there is no row yet", and the caller answered both by overwriting the cloud. */
  async pullProgress(lang) {
    const { data: u } = await sb.auth.getUser();
    if (!u || !u.user) return { ok: false, data: null };
    // RLS already scopes this, but filtering explicitly means a mis-edited policy still can't
    // hand us someone else's row — and it guarantees at most one row for maybeSingle().
    const { data, error } = await sb.from('progress').select('data,updated_at')
      .eq('user_id', u.user.id).eq('lang', lang).maybeSingle();
    if (error) { console.warn('pullProgress failed', error.message); return { ok: false, data: null }; }
    return { ok: true, data: data ? data.data : null };
  },
  async pushProgress(lang, payload) {
    const { data: u } = await sb.auth.getUser();
    if (!u || !u.user) return false;
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
  /* How many reports are still waiting. head:true asks Postgres for the count only —
     no rows cross the wire, so this can run on every screen entry without costing anything.
     status is NOT NULL default 'new', so neq('done') really does mean "not handled yet". */
  async countOpenFeedback() {
    const { count, error } = await sb.from('feedback')
      .select('id', { count: 'exact', head: true }).neq('status', 'done');
    return error ? null : (count || 0);
  },

  /* ---------- admin ---------- */
  async adminListUsers() {
    const { data, error } = await sb.from('profiles')
      .select('id,username,email,created_at,last_seen,role').order('created_at', { ascending: false });
    if (error) return { users: [], error };
    return { users: data, error: null };
  },
  async adminUserProgress(userId) {
    const { data } = await sb.from('progress').select('lang,data,updated_at').eq('user_id', userId);
    return data || [];
  },
  async adminSendReset(email) { return this.resetPasswordFor(email); },

  /* ---------- shared associations ----------
     A separate table from the private ones on purpose: an association is personal writing,
     made under the assumption nobody would read it. Nothing already written is ever copied
     here — sharing is an explicit act, one association at a time. */
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
     account could pull every shared association ever written TOGETHER WITH its user_id — the text
     is meant to be shared, the authorship behind it is not, and RLS cannot hide a column.
     public.shared_assoc is SECURITY DEFINER and simply never returns user_id; it computes is_mine
     server-side instead. The table's own select policy is now own-rows-only. */
  async listSharedAssoc(lang, wordKey) {
    const { data, error } = await sb.rpc('shared_assoc', { p_lang: lang, p_word_key: wordKey });
    if (error) {
      // 42883 = the function does not exist, i.e. migrations/9.sql was never run. Silence here
      // meant the whole "what others wrote" feature simply never appeared, with no error anywhere.
      console.warn('shared_assoc נכשלה' + (error.code === '42883'
        ? ' — נראה ש-migrations/9.sql לא הורץ' : ': ' + error.message));
      return { ok: false, rows: [], mine: false };
    }
    const rows = data || [];
    return { ok: true, rows: rows.filter(r => !r.is_mine), mine: rows.some(r => r.is_mine) };
  },

  /* Re-authentication. The password is verified BY SUPABASE against the stored hash —
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
     auth.users, so a deleted row was never recreated — and accessOk() treats a missing
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
     API, because removing the row from auth.users needs service_role — a key that can never
     be in a browser. Without that step the account still signs in, and "מחיקת החשבון" is a
     button that lies.

     Returns {ok} or {ok:false, error}. `notDeployed` distinguishes "the function is not
     there yet" from "the deletion failed", because the two need different words on screen. */
  async deleteMyAccount() {
    const { data: s } = await sb.auth.getSession();
    const token = s && s.session && s.session.access_token;
    if (!token) return { ok: false, error: { message: 'אין חיבור פעיל — התחבר שוב ונסה' } };
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
