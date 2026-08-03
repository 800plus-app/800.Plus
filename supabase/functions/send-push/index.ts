/* שולח את ההתראה היומית ל-Web Push.
 *
 * למה זה קיים
 * ------------
 * periodicSync מכסה Chrome באנדרואיד בלבד. באייפון ההתראה מגיעה היום רק כשהאפליקציה
 * נפתחת — כלומר רק למי שכבר חזר, ולא למי שהפסיק, שהוא בדיוק מי שההתראה נועדה לו.
 * iOS 16.4+ תומך ב-Web Push לאפליקציה שהותקנה למסך הבית, וזה הערוץ היחיד שנשאר.
 *
 * למה אין כאן הצפנה
 * ------------------
 * הודעת Push עם תוכן חייבת הצפנה לפי RFC 8291 — ECDH מול מפתח המנוי, HKDF, ואז
 * AES-128-GCM. זה קוד קריפטוגרפי לא מבוטל, וכשלון בו אינו מתפוצץ אלא מייצר התראה
 * שפשוט לעולם אינה מוצגת. זה גם מיותר: sw.js כבר שומר את העובדות במכשיר ומרכיב את
 * הנוסח ברגע האירוע (כך עובד periodicSync). לכן ה-Push יוצא ריק — הוא רק אומר "עכשיו".
 *
 * ויש לזה גם תוצאה שלא תכננו מראש והיא הטובה ביותר כאן: שום דבר על ההתקדמות של אף
 * לומד אינו עובר דרך אפל או גוגל. אין מה להצפין כי אין מה לשלוח.
 *
 * VAPID
 * -----
 * חתימת ES256 על JWT קטן שמוכיח מי השולח. נעשית ב-SubtleCrypto של Deno, בלי שום
 * תלות חיצונית — ספרייה חיצונית בפונקציה ששולחת לכל המשתמשים היא שטח תקיפה מיותר.
 *
 * סודות (Supabase → Edge Functions → Secrets):
 *   VAPID_PUBLIC   · אותו ערך שנמצא ב-config.js. פומבי.
 *   VAPID_PRIVATE  · לעולם לא בקוד ולא במאגר.
 *   VAPID_SUBJECT  · mailto:admin@800-plus.com
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUB    = Deno.env.get('VAPID_PUBLIC') ?? '';
const VAPID_PRIV   = Deno.env.get('VAPID_PRIVATE') ?? '';
const VAPID_SUB    = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@800-plus.com';
/* שער הרשאה. verify_jwt של Supabase (ברירת מחדל) דורש רק JWT חתום — והמפתח האנונימי,
   שמספיק לו, פומבי (config.js). כלומר כל מי שקורא את config.js יכול להפעיל בליץ' התראות
   לכל המנויים. הסוד הזה, שרק המפעיל האוטומטי מחזיק, הוא ההרשאה האמיתית.
   ⚠ פריסה: (1) הגדר PUSH_TRIGGER_SECRET ב-Supabase → Edge Functions → Secrets.
             (2) עדכן את הקורא (cron/Action) לשלוח אותו ככותרת x-trigger-secret.
   עד שהסוד יוגדר הפונקציה מסרבת לכולם — עדיף אפס התראות על פני פתוח לכל. */
const TRIGGER_SECRET = Deno.env.get('PUSH_TRIGGER_SECRET') ?? '';

/* base64url בלי ריפוד — הקידוד שכל תקני ה-Push וה-JWT משתמשים בו. */
const b64url = (b: Uint8Array) =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s: string) => {
  const p = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
};

/* המפתח הפרטי מגיע כ-32 בתים גולמיים (d), וזה מה ש-web-push מייצר. SubtleCrypto רוצה
   JWK, ולכן מרכיבים אותו כאן מ-d ומהמפתח הפומבי המפוצל ל-x ול-y. */
async function importKey(priv: string, pub: string) {
  const raw = unb64url(pub);          // 65 בתים: 0x04 ואז x ואז y
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('VAPID_PUBLIC אינו מפתח P-256 תקין');
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC', crv: 'P-256', ext: true,
      d: priv,
      x: b64url(raw.slice(1, 33)),
      y: b64url(raw.slice(33, 65)),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

async function vapidHeader(endpoint: string) {
  const aud = new URL(endpoint).origin;
  const head = b64url(new TextEncoder().encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  // 12 שעות. התקן מתיר עד 24, וחצי מזה משאיר מרווח לשעון שאינו מסונכרן בדיוק.
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: VAPID_SUB,
  })));
  const key = await importKey(VAPID_PRIV, VAPID_PUB);
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`)));
  return { Authorization: `vapid t=${head}.${body}.${b64url(sig)}, k=${VAPID_PUB}` };
}

async function rest(path: string, init: RequestInit = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json', ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  // ההרשאה האמיתית: סוד שרק המפעיל האוטומטי מחזיק. סוד לא מוגדר = סירוב לכולם (fail-closed).
  if (!TRIGGER_SECRET || req.headers.get('x-trigger-secret') !== TRIGGER_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  if (!VAPID_PRIV || !VAPID_PUB) {
    // נכשל בקול. פונקציה ששולחת אפס התראות ומחזירה 200 היא בדיוק סוג התקלה שנמשכת חודשים.
    return new Response(JSON.stringify({ error: 'VAPID_PUBLIC/VAPID_PRIVATE חסרים' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  const dry = new URL(req.url).searchParams.get('dry') === 'true';

  const subs = await rest('push_sub?select=id,endpoint,fail_count').then(r => r.json());
  if (!Array.isArray(subs)) {
    return new Response(JSON.stringify({ error: 'push_sub לא נקראה', detail: subs }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let sent = 0, gone = 0, failed = 0;

  for (const s of subs) {
    if (dry) { sent++; continue; }
    try {
      const r = await fetch(s.endpoint, {
        method: 'POST',
        headers: {
          ...(await vapidHeader(s.endpoint)),
          TTL: '86400',            // יום. התראה מאתמול אינה מעניינת אף אחד.
          Urgency: 'normal',
          'Content-Length': '0',   // ריק במפורש — בלי זה חלק מהספקים דוחים
        },
      });
      if (r.status === 404 || r.status === 410) {
        // המכשיר נמחק או האפליקציה הוסרה. ממשיכים לנסות = פגיעה במוניטין מול הספק.
        gone++;
        await rest(`push_sub?id=eq.${s.id}`, { method: 'DELETE' });
      } else if (r.ok || r.status === 201) {
        sent++;
        await rest(`push_sub?id=eq.${s.id}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ last_ok: new Date().toISOString(), fail_count: 0 }),
        });
      } else {
        failed++;
        await rest(`push_sub?id=eq.${s.id}`, {
          method: 'PATCH', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ fail_count: (s.fail_count ?? 0) + 1 }),
        });
      }
    } catch (_) {
      failed++;
    }
  }

  return new Response(JSON.stringify({ subs: subs.length, sent, gone, failed, dry }),
    { headers: { 'Content-Type': 'application/json' } });
});
