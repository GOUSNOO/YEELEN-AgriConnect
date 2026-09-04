// reCAPTCHA v3 côté frontend (Abonnement Phase 1, Lot 4). Miroir du repli gracieux côté
// serveur (utils/recaptcha.js) : sans VITE_RECAPTCHA_SITE_KEY, getRecaptchaToken() renvoie
// undefined sans jamais charger le script Google — l'inscription reste utilisable en dev/tant
// que l'utilisateur n'a pas créé ses clés. Même garde import.meta que lib/api.js (Vite en
// prod, undefined sous Jest).
const SITE_KEY =
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_RECAPTCHA_SITE_KEY) || '';

let scriptPromise = null;

function chargerScript() {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    if (window.grecaptcha) return resolve(true);
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${SITE_KEY}`;
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export async function getRecaptchaToken(action = 'register') {
  if (!SITE_KEY) return undefined;
  const charge = await chargerScript();
  if (!charge || !window.grecaptcha) return undefined;
  return new Promise((resolve) => {
    window.grecaptcha.ready(() => {
      window.grecaptcha.execute(SITE_KEY, { action }).then(resolve).catch(() => resolve(undefined));
    });
  });
}
