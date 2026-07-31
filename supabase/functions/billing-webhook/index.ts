/**
 * billing-webhook — קליטת callback שרת-לשרת מספק התשלומים.
 *
 * המסלול: אימות מקור → נרמול לסכמה הפנימית שלנו → קריאת RPC אחת
 *          (apply_billing_event) שעושה את כל השאר בטרנזקציה אחת.
 *
 * ⚠ הפונקציה **רדומה** עד ש-public.billing_enabled=true במסד וה-secret
 *   מוגדר ל-live. עם BILLING_ENV=test היא רק כותבת לספר האירועים ולא נוגעת
 *   בהרשאה של אף אחד — שלב 6 ב-apply_billing_event הוא מה שעוצר אותה.
 *
 * ⚠⚠ verify_jwt = false — ראה supabase/config.toml. בלי זה: 401 שקט,
 *    לקוחות משלמים לא מקבלים כלום, ואין שגיאה בשום מקום. זו התקלה מספר אחת
 *    בהטמעות האלה. נתיב /health בסוף הקובץ קיים רק כדי לבדוק את זה.
 *
 * משתני סביבה (Supabase → Edge Functions → Secrets):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   — מוזרקים אוטומטית
 *   BILLING_PROVIDER   = 'payplus' | 'tranzila' | 'paddle'   (ברירת מחדל payplus)
 *   BILLING_ENV        = 'test' | 'live'                     (ברירת מחדל test)
 *   BILLING_VERIFY_MODE= 'hmac' | 'secret_url' | 'none'      ← נקודת ההחלטה. ראה למטה.
 *   BILLING_WEBHOOK_SECRET   — הסוד ל-HMAC, או המחרוזת הסודית שב-URL
 *   BILLING_SIG_HEADER       — שם כותרת החתימה (רק ב-hmac)
 *   BILLING_SIG_SCHEME       = 'raw' | 'ts_colon' | 'ts_dot' (רק ב-hmac)
 *   PAYPLUS_API_BASE, PAYPLUS_API_KEY, PAYPLUS_SECRET_KEY    — לאימות החוזר
 *   BILLING_REVERIFY   = 'true' | 'false'                    — אימות חוזר מול הספק
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SB_URL      = Deno.env.get('SUPABASE_URL')!;
const SB_SERVICE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;  // service_role, לא anon.
const SECRET      = Deno.env.get('BILLING_WEBHOOK_SECRET') ?? '';  // anon כפוף ל-RLS,
const PROVIDER    = Deno.env.get('BILLING_PROVIDER')  ?? 'payplus'; // והכתיבה הייתה
const ENV         = Deno.env.get('BILLING_ENV')       ?? 'test';     // נכשלת בשקט.
const VERIFY_MODE = Deno.env.get('BILLING_VERIFY_MODE') ?? 'secret_url';
const SIG_HEADER  = Deno.env.get('BILLING_SIG_HEADER')  ?? 'X-PayPlus-Signature';
const SIG_SCHEME  = Deno.env.get('BILLING_SIG_SCHEME')  ?? 'raw';
const REVERIFY    = (Deno.env.get('BILLING_REVERIFY') ?? 'true') === 'true';
const TOLERANCE   = 300;   // שניות. הגנת replay, רלוונטית רק לסכמות עם חותמת זמן.

const enc = new TextEncoder();

/* ══════════════════════════════════════════════════════════════════════════
 * ‏1. אימות המקור — הענף היחיד שתלוי בתשובה שאין לנו עדיין מ-PayPlus.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ‏**נקודת ההחלטה, מסומנת במפורש:**
 * PayPlus אינה מתעדת בפומבי כותרת חתימה על ה-callback. SDK צד-שלישי
 * (Two-Solutions/payplus-python) מממש HMAC עם כותרת בשם X-PayPlus-Signature,
 * אבל זה **אימות צד-שלישי ולא תיעוד רשמי**, ולכן אסור לבנות עליו בלי לשאול.
 *
 *   ענף א — יש חתימה  → BILLING_VERIFY_MODE='hmac'
 *            למלא BILLING_SIG_HEADER ו-BILLING_SIG_SCHEME לפי מה שיגידו בטלפון.
 *            שלוש הסכמות הנפוצות כתובות למטה; כמעט בטוח שאחת מהן היא התשובה.
 *   ענף ב — אין חתימה → BILLING_VERIFY_MODE='secret_url'
 *            כתובת webhook ארוכה וסודית, **ואימות חוזר של כל חיוב מול ה-API
 *            של הספק לפני מתן גישה** (סעיף 2). כלומר ה-webhook הוא רמז
 *            להסתכל, לא מקור אמת. זו ברירת המחדל כאן, כי היא הבטוחה משתיהן:
 *            אם יתברר שיש חתימה, מדליקים גם אותה ולא מוותרים על האימות החוזר.
 *
 * ‏להחליף ענף = לשנות משתנה סביבה. לא לשנות קוד ולא לפרוס מחדש.
 */

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** השוואה בזמן קבוע. `a === b` על חתימות נעצרת בתו הראשון שנבדל,
 *  וההפרש הזה מדיד ברשת — מספיק כדי לנחש חתימה תו-תו. */
function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

type VerifyResult = { ok: boolean; method: string; reason?: string };

async function verifyOrigin(req: Request, raw: string, url: URL): Promise<VerifyResult> {
  // ── ענף א: HMAC על ה-bytes הגולמיים ──────────────────────────────────
  if (VERIFY_MODE === 'hmac') {
    if (!SECRET) return { ok: false, method: 'hmac', reason: 'אין סוד מוגדר' };
    const header = req.headers.get(SIG_HEADER) ?? '';
    if (!header) return { ok: false, method: 'hmac', reason: `אין כותרת ${SIG_HEADER}` };

    if (SIG_SCHEME === 'raw') {
      // הכותרת היא ה-hex עצמו. HMAC-SHA256 על הגוף הגולמי, בלי חותמת זמן.
      // אין הגנת replay מובנית; האידמפוטנטיות במסד היא מה שמכסה את זה.
      const bare = header.trim().replace(/^sha256=/i, '');
      return { ok: safeEq(await hmacHex(SECRET, raw), bare), method: 'hmac' };
    }
    // 'ts_colon'  → `ts=...;h1=<hex>`   והחתימה על `${ts}:${raw}`   (סגנון Paddle)
    // 'ts_dot'    → `t=...,v1=<hex>`    והחתימה על `${ts}.${raw}`   (סגנון Stripe)
    const sep  = SIG_SCHEME === 'ts_colon' ? ';' : ',';
    const glue = SIG_SCHEME === 'ts_colon' ? ':' : '.';
    const kv = Object.fromEntries(
      header.split(sep).map(s => s.split('=').map(x => x.trim())) as [string, string][]);
    const ts  = kv.ts ?? kv.t;
    const sig = kv.h1 ?? kv.v1;
    if (!ts || !sig) return { ok: false, method: 'hmac', reason: 'כותרת בפורמט לא צפוי' };
    if (Math.abs(Date.now() / 1000 - Number(ts)) > TOLERANCE)
      return { ok: false, method: 'hmac', reason: 'חותמת זמן מחוץ לחלון' };
    return { ok: safeEq(await hmacHex(SECRET, `${ts}${glue}${raw}`), sig), method: 'hmac' };
  }

  // ── ענף ב: הסוד יושב בכתובת עצמה ─────────────────────────────────────
  // כתובת ארוכה ואקראית שרק אנחנו והספק מכירים. זה לא תחליף לחתימה —
  // זה מסנן סריקות אקראיות. מה שבאמת מגן הוא האימות החוזר בסעיף 2,
  // ולכן REVERIFY חייב להיות true במצב הזה.
  if (VERIFY_MODE === 'secret_url') {
    if (!SECRET) return { ok: false, method: 'secret_url', reason: 'אין סוד מוגדר' };
    const given = url.searchParams.get('k')
      ?? url.pathname.split('/').filter(Boolean).pop() ?? '';
    return { ok: safeEq(given, SECRET), method: 'secret_url' };
  }

  // ── 'none' — רק לפיתוח מקומי. לא ב-live, לעולם. ──────────────────────
  if (VERIFY_MODE === 'none' && ENV !== 'live')
    return { ok: true, method: 'none' };

  return { ok: false, method: VERIFY_MODE, reason: 'מצב אימות לא מוכר' };
}

/* ══════════════════════════════════════════════════════════════════════════
 * ‏2. אימות חוזר מול הספק — "ה-webhook הוא רמז להסתכל, לא מקור אמת"
 * ══════════════════════════════════════════════════════════════════════════
 * מושך את מצב החיוב מה-API של PayPlus ומשווה. אם הספק לא מכיר את החיוב —
 * לא נותנים גישה, גם אם ה-webhook נראה מושלם.
 *
 * ⚠ **מסלול ה-API והכותרות כאן טעונים אישור ואינם מומצאים בקוד**: הכול
 *   מגיע ממשתני סביבה עם ברירת מחדל שנגזרה מהתיעוד שבדוח הספקים
 *   (`GET /RecurringPayments/{uid}/ViewRecurringCharge`). אם הנתיב או מבנה
 *   ההרשאה שונים — לשנות את משתני הסביבה, לא את הקוד.
 */
async function reVerifyWithProvider(recurringUid: string | null): Promise<boolean | null> {
  if (!REVERIFY) return null;                 // כובה במפורש
  if (PROVIDER !== 'payplus') return null;    // חלופה אחרת = מימוש אחר
  const base = Deno.env.get('PAYPLUS_API_BASE');
  const key  = Deno.env.get('PAYPLUS_API_KEY');
  const sec  = Deno.env.get('PAYPLUS_SECRET_KEY');
  if (!base || !key || !sec || !recurringUid) return null;   // null = "לא ידוע"

  const path = (Deno.env.get('PAYPLUS_VERIFY_PATH')
    ?? '/RecurringPayments/{uid}/ViewRecurringCharge').replace('{uid}', recurringUid);

  try {
    const res = await fetch(base.replace(/\/+$/, '') + path, {
      method: 'GET',
      headers: {
        // PayPlus מצפה לאובייקט JSON בכותרת Authorization. אם השיחה עם התמיכה
        // תגלה מבנה אחר — זה המקום היחיד לתקן.
        'Authorization': JSON.stringify({ api_key: key, secret_key: sec }),
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    if (!body) return false;
    // "החיוב קיים אצל הספק" — הבדיקה המינימלית והיחידה שאנחנו סומכים עליה.
    return JSON.stringify(body).includes(recurringUid);
  } catch (e) {
    console.error('re-verify failed', recurringUid, String(e));
    return null;   // תקלת רשת אינה הוכחה להונאה. null → נרשם ומסומן לבדיקה.
  }
}

/* ══════════════════════════════════════════════════════════════════════════
 * ‏3. הסכמה הפנימית + המיפוי — **המקום היחיד בקוד שמכיר שמות שדות של ספק**
 * ══════════════════════════════════════════════════════════════════════════
 * כל מה שמתחת לשכבה הזאת (הפונקציה במסד, הטבלאות, האפליקציה) אינו יודע מי
 * הספק. אם PayPlus יקראו לשדה בשם אחר ממה שכתוב כאן — התיקון הוא בבלוק אחד.
 *
 * ⚠ מה שמאושר מהתיעוד: המטען כולל אובייקט `recurring_charge_information`
 *   ובתוכו `recurring_uid` ו-`charge_uid`. **כל שאר השמות כאן הם ניחוש
 *   מושכל וטעונים אישור מול callback אמיתי אחד** — ולכן כל שדה נקרא דרך
 *   pick() עם כמה שמות חלופיים, ו-`payload` הגולמי נשמר במלואו במסד כדי
 *   שאפשר יהיה לתקן בדיעבד בלי לאבד אירועים.
 */
type Norm = {
  event_id: string;
  event_type: string;
  event_at: string | null;
  customer_id: string | null;
  subscription_id: string | null;
  user_id: string | null;
  plan: string | null;
  status: string | null;
  period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  payment: Record<string, unknown> | null;
};

/** קורא את המפתח הראשון שקיים, מתוך רשימת שמות חלופיים. */
function pick(obj: any, ...keys: string[]): any {
  for (const k of keys) {
    const v = k.split('.').reduce((o: any, p) => (o == null ? o : o[p]), obj);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

/** סטטוס הספק → הסטטוס המנורמל שלנו. כל מה שלא ברשימה מוחזר null,
 *  ו-apply_billing_event תסמן את האירוע לבדיקה במקום לנחש. */
const STATUS_MAP: Record<string, string> = {
  // PayPlus / כללי
  'approved': 'active', 'success': 'active', 'active': 'active', 'ok': 'active',
  'trial': 'trialing', 'trialing': 'trialing',
  'failed': 'past_due', 'declined': 'past_due', 'unpaid': 'past_due', 'past_due': 'past_due',
  'canceled': 'canceled', 'cancelled': 'canceled', 'stopped': 'canceled',
  'paused': 'paused', 'suspended': 'paused',
  'expired': 'expired', 'finished': 'expired',
  'refund': 'refunded', 'refunded': 'refunded',
  'chargeback': 'chargeback', 'disputed': 'chargeback',
};

const PROVIDER_MAP = {
  payplus(evt: any): Norm {
    const d   = evt?.transaction ?? evt?.data ?? evt;
    const rec = evt?.recurring_charge_information ?? d?.recurring_charge_information ?? {};
    const isRefund = /refund|זיכוי/i.test(String(pick(evt, 'type', 'event_type') ?? ''))
                  || Number(pick(d, 'amount', 'total') ?? 0) < 0;

    const amount = Number(pick(d, 'amount', 'total', 'sum') ?? 0);
    const kind   = isRefund ? 'refund' : 'charge';

    return {
      // ← מזהה האירוע. הוא מה שמזין את האילוץ הייחודי, כלומר את האידמפוטנטיות.
      //   סדר העדיפויות מתחיל בשדה שהכי ייחודי לחיוב הבודד.
      event_id: String(pick(rec, 'charge_uid')
                    ?? pick(d, 'transaction_uid', 'uid', 'page_request_uid', 'voucher_num')
                    ?? crypto.randomUUID()),
      event_type: String(pick(evt, 'type', 'event_type', 'status_description') ?? 'transaction'),
      // ← חותמת הזמן של **הספק**. זה השדה שמגן מפני אירועים שהגיעו לא בסדר.
      //   אם הוא null, apply_billing_event תסמן needs_review — כלומר אם הוא
      //   מגיע null באופן קבוע, המיפוי כאן שגוי וצריך לתקן אותו.
      event_at: pick(d, 'date', 'created_at', 'transaction_date', 'updated_at'),
      customer_id: pick(d, 'customer_uid', 'customer.uid', 'customer_id'),
      subscription_id: pick(rec, 'recurring_uid') ?? pick(d, 'recurring_uid'),
      // ← מה שקושר תשלום למשתמש. נקבע **בשרת** בעת פתיחת ה-checkout ולא ע"י
      //   הדפדפן. ב-PayPlus זה נכנס לשדה more_info.
      user_id: pick(d, 'more_info', 'more_info_1', 'client_reference_id',
                       'custom_data.user_id'),
      plan: pick(d, 'product_name', 'plan', 'items.0.name'),
      status: STATUS_MAP[String(pick(d, 'status', 'status_code', 'transaction_type')
                                ?? '').toLowerCase()] ?? null,
      period_end: pick(rec, 'next_charge_date', 'next_payment_date')
               ?? pick(d, 'period_end', 'valid_until'),
      trial_end: pick(rec, 'trial_end', 'trial_ends_at'),
      cancel_at_period_end: Boolean(pick(rec, 'cancel_at_period_end') ?? false),
      payment: amount ? {
        id: String(pick(rec, 'charge_uid') ?? pick(d, 'transaction_uid', 'uid') ?? ''),
        kind,
        status: 'succeeded',
        // amount_cents: PayPlus מדווח בשקלים. כאן ההמרה, במקום אחד.
        amount_cents: Math.round(Math.abs(amount) * 100) * (isRefund ? -1 : 1),
        currency: String(pick(d, 'currency', 'currency_code') ?? 'ILS'),
        period_start: pick(d, 'period_start'),
        period_end:   pick(rec, 'next_charge_date') ?? pick(d, 'period_end'),
        occurred_at:  pick(d, 'date', 'created_at'),
        email: pick(d, 'customer_email', 'customer.email', 'email'),
      } : null,
    };
  },

  // חלופה: Tranzila (STO API v2 + notify_url). שלד בלבד — למלא ביום שעוברים.
  tranzila(evt: any): Norm {
    const d = evt?.transaction ?? evt;
    return {
      event_id: String(pick(d, 'transaction_id', 'index', 'ConfirmationCode')
                    ?? crypto.randomUUID()),
      event_type: String(pick(evt, 'type') ?? 'transaction'),
      event_at: pick(d, 'transaction_date', 'date'),
      customer_id: pick(d, 'customer_id', 'myid'),
      subscription_id: pick(d, 'sto_id', 'recurring_id'),
      user_id: pick(d, 'client_reference_id', 'myid'),
      plan: pick(d, 'product'),
      status: STATUS_MAP[String(pick(d, 'status') ?? '').toLowerCase()] ?? null,
      period_end: pick(d, 'next_charge'),
      trial_end: null,
      cancel_at_period_end: false,
      payment: null,
    };
  },
} as const;

function normalize(evt: any): Norm {
  const fn = (PROVIDER_MAP as any)[PROVIDER] ?? PROVIDER_MAP.payplus;
  return fn(evt);
}

/* ══════════════════════════════════════════════════════════════════════════
 * ‏4. הטיפול בבקשה
 * ══════════════════════════════════════════════════════════════════════════ */
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // בדיקת חיים. קיימת בשביל דבר אחד: לוודא ש-verify_jwt=false באמת נתפס.
  // אם זה מחזיר 401 במקום 200 — הקונפיגורציה לא נפרסה, וכל webhook ייפול בשקט.
  if (req.method === 'GET' && url.pathname.endsWith('/health')) {
    return json({ ok: true, provider: PROVIDER, env: ENV,
                  verify_mode: VERIFY_MODE, reverify: REVERIFY }, 200);
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  // הגוף הגולמי, **לפני** כל פענוח. JSON.parse משנה רווחים וסדר מפתחות ושובר
  // כל חתימה — או גרוע מזה, מריץ פענוח על קלט שעוד לא אומת.
  const raw = await req.text();

  const v = await verifyOrigin(req, raw, url);
  if (!v.ok) {
    console.error('אימות מקור נכשל', v.method, v.reason ?? '');
    // 400 ולא 500: מקור שגוי לא ישתפר בניסיון חוזר, ואין טעם שהספק ינסה שוב.
    return new Response('bad signature', { status: 400 });
  }

  let evt: any;
  try { evt = JSON.parse(raw); }
  catch { return new Response('bad json', { status: 400 }); }

  const n = normalize(evt);

  // אימות חוזר — לפני שנוגעים בהרשאה של מישהו.
  // true = הספק מאשר · false = הספק לא מכיר · null = לא ידוע (רשת/כבוי)
  const confirmed = await reVerifyWithProvider(n.subscription_id);
  if (confirmed === false) {
    console.error('הספק לא מכיר את החיוב', n.event_id, n.subscription_id);
    // נרשם בספר ולא מוחל: מעבירים כסטטוס null כדי שהאירוע לא ייתן גישה,
    // ומסמנים אותו לבדיקה. לא מחזירים 400 — ה-webhook עצמו היה תקין.
    n.status = null;
  }

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  const { data, error } = await sb.rpc('apply_billing_event', {
    p_provider: PROVIDER,
    p_event_id: n.event_id,
    p_event_type: n.event_type,
    p_event_at: n.event_at,        // ← חותמת הספק. הגנת הסדר מול sub_synced_at
    p_env: ENV,                    //   מתבצעת במסד, מולה, ולא מול זמן הקבלה.
    p_customer_id: n.customer_id,
    p_subscription_id: n.subscription_id,
    p_user_id: n.user_id,
    p_plan: n.plan,
    p_status: n.status,
    p_period_end: n.period_end,
    p_trial_end: n.trial_end,
    p_cancel_at_period_end: n.cancel_at_period_end,
    p_payment: n.payment,
    p_payload: evt,                // המטען הגולמי נשמר כמו שהוא. תמיד.
    p_verified: v.ok && confirmed !== false,
    p_verify_method: confirmed === true ? `${v.method}+reverify` : v.method,
  });

  if (error) {
    console.error('apply_billing_event נכשלה', n.event_id, error.message);
    // 500 = הספק ינסה שוב. אף פעם לא 200 על כישלון אמיתי —
    // זה מוחק את רשת הביטחון היחידה שיש, וההודעה נעלמת לתמיד.
    return json({ error: error.message }, 500);
  }

  // 200 מהר. ספקים קוצבים 10–30 שניות; כל העבודה היא קריאת RPC אחת.
  return json(data ?? { ok: true }, 200);
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
}
