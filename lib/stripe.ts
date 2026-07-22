import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Lazily construct the Stripe client on first use rather than at module
 * load time. The SDK throws immediately if no key is provided, which
 * would crash `next build` (which evaluates route modules to collect
 * page data) in any environment that hasn't set STRIPE_SECRET_KEY yet —
 * including CI or a fresh clone before .env is configured.
 */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to .env.local (see .env.example)."
    );
  }

  _stripe = new Stripe(key, {
    apiVersion: "2026-05-27.dahlia",
  });
  return _stripe;
}
