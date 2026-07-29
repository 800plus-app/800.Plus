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
  async pullProgress(lang) {
    const { data: u } = await sb.auth.getUser();
    if (!u || !u.user) return null;
    // RLS already scopes this, but filtering explicitly means a mis-edited policy still can't
    // hand us someone else's row — and it guarantees at most one row for maybeSingle().
    const { data, error } = await sb.from('progress').select('data,updated_at')
      .eq('user_id', u.user.id).eq('lang', lang).maybeSingle();
    if (error) { console.warn('pullProgress failed', error.message); return null; }
    return data ? data.data : null;
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
  async adminSendReset(email) { return this.resetPasswordFor(email); }
};
window.Store = Store;
