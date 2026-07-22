# Hibr — English → Arabic Document Translator

Pay-per-document English-to-Arabic translation for `.docx`, `.pptx`, and `.txt` files, built for individuals and SMEs rather than enterprise buyers — no account, no subscription, just an upfront price and a download. Powered by Gemini 2.5 Flash. Structure-preserving: tables, bold/italic formatting, fonts, and images survive translation untouched — only the text content changes, plus RTL flags are injected so Word/PowerPoint render Arabic correctly.

## How it works (product flow)

1. User drops in a document → `/api/estimate` parses it (no Gemini call) and returns a word count and price
2. User clicks "Pay & translate" → `/api/checkout` re-derives the price server-side, creates a Stripe Checkout Session, and stashes the uploaded file in a short-lived store keyed by the session ID
3. User pays on Stripe's hosted checkout page → redirected to `/success?session_id=...`
4. **Two independent paths now both try to fulfill the order, and the second one to arrive just reuses the first one's work:**
   - The success page calls `/api/confirm-and-translate`, which verifies the session is paid, translates the document, and returns it as base64 so the user can download it directly in the browser
   - The Stripe webhook (`/api/webhook`) fires on `checkout.session.completed` independently of whether the customer's browser ever loads the success page, translates the same session, and emails **you** a copy of the finished file as an attachment — for every paid order, not just expert-review ones
5. Both paths call the same `translateForSession()` (`lib/translate-for-session.ts`), which caches the result per session ID and de-duplicates concurrent/in-flight requests — so a single document is only ever translated once, regardless of which path gets there first or whether Stripe retries the webhook

This means you always get a copy of every completed order by email, even if the customer never sees the success page — the webhook is the operational source of truth, the success page is just the customer's fastest path to a download.

## How translation works (technical)

Both `.docx` and `.pptx` are zip archives of XML. Rather than extracting plain text and rebuilding a document from scratch (which loses formatting), this engine:

1. Unzips the file and parses each XML part with `fast-xml-parser` in `preserveOrder` mode (keeps element order and attributes intact for lossless round-tripping)
2. Walks the tree to find every text-bearing node (`<w:t>` in Word, `<a:t>` in PowerPoint) and collects the text in document order
3. Batches the text segments to Gemini 2.5 Flash, asking for strict JSON output mapped by segment ID — this guarantees translations land back on the correct node even when the model reorders sentences internally
4. Splices translated text back into the original nodes in place
5. Injects RTL formatting (`<w:bidi>`/`<w:rtl>` for Word, the `rtl="1"` attribute for PowerPoint) so the output displays correctly
6. Re-zips into a valid `.docx`/`.pptx`

`.txt` files skip steps 1-2 and 5-6 since there's no structure to preserve — lines are batched and translated directly.

The core XML logic is shared between formats in `lib/ooxml-engine.ts`; `lib/docx-engine.ts` and `lib/pptx-engine.ts` are thin format-specific wrappers (which tag holds text, which RTL rule applies). `lib/pricing.ts` reuses the same segment-extraction code for the upfront estimate, so the word count quoted to the user matches exactly what gets translated.

## Pricing model

- **$0.015/word**, **$0.99 minimum** per document
- A 600-word letter: ~$9. A 4,000-word contract: ~$60. Compare to professional human translation at $0.08-0.20/word — this is positioned as fast and affordable, not as a replacement for certified/legal translation
- Raw Gemini 2.5 Flash cost is roughly $0.0001-0.0005/word depending on output length, so margins are wide even at this price point — see `estimatedGeminiCostUsd` in `lib/pricing.ts` if you want to tune the per-word rate
- The pure pricing math (no document parsing) lives in `lib/pricing-shared.ts` so it can be imported by client components like the landing-page slider without pulling Node-only docx/pptx parsing into the browser bundle

To change pricing, edit `PRICE_PER_WORD_USD` and `MINIMUM_CHARGE_USD` in `lib/pricing-shared.ts`.

### Landing-page price slider

A drag-to-estimate calculator (`app/components/PriceSlider.tsx`) sits in the hero, before any upload — lets a visitor get a feel for pricing by page count (assuming 500 words/page) without committing to anything. It's purely illustrative; the real, exact price always comes from `/api/estimate` once they actually upload a document.

### Expert human review add-on

A checkbox in the price card lets the user add a human review pass for **+20% of the translation price** (`EXPERT_REVIEW_PERCENTAGE` in `lib/pricing-shared.ts`). When selected:
- A second Stripe line item is added for the review fee (always recomputed server-side from the real price — the client's checkbox state is only a request, never a trusted amount)
- The flag is stored alongside the pending file and surfaced on the success page with a message that a linguist will follow up by email
- **The webhook sends two emails for these orders**: one flagging that a review was requested (filename, word count, fee paid, customer email), and the standard order-delivery email with the actual translated file attached — so you have both "this needs your attention" and "here's what was delivered" without digging through Stripe's dashboard
- **There's still no reviewer pool or queue** — you (or whoever you assign) open the attached file, review it, and reply to the customer directly. Fine for low volume; revisit once requests are frequent enough to need a real queue.

## Webhook setup

The webhook now does real work for every paid order: it translates the document and emails you a copy as an attachment, plus a separate notification email if the customer opted into expert review. This is what makes order fulfillment reliable even if the customer closes their browser tab right after paying — without it, you'd only get the file if their browser happened to load the success page.

1. **Local development**: install the [Stripe CLI](https://docs.stripe.com/stripe-cli), then run:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhook
   ```
   This prints a `whsec_...` value — put it in `STRIPE_WEBHOOK_SECRET` in `.env.local`. Leave this running in a terminal alongside `npm run dev` while testing.

2. **Production**: in the [Stripe Dashboard](https://dashboard.stripe.com/webhooks), add an endpoint at `https://<your-domain>/api/webhook`, subscribed to the `checkout.session.completed` event. Copy the signing secret it gives you into `STRIPE_WEBHOOK_SECRET` in your Vercel environment variables.

3. **Email**: sign up at [resend.com](https://resend.com) (free tier covers low volume easily), grab an API key for `RESEND_API_KEY`, and set `REVIEW_NOTIFICATION_EMAIL` to wherever you want order copies and review notifications to land — almost certainly your own inbox. `RESEND_FROM_EMAIL` can stay as the default Resend sandbox address (`onboarding@resend.dev`) until you verify your own domain with Resend.

Without `STRIPE_WEBHOOK_SECRET` set, `/api/webhook` will reject every request (correctly — Stripe webhooks must be signature-verified, never trusted blindly). Without `RESEND_API_KEY`/`REVIEW_NOTIFICATION_EMAIL` set, the webhook will still acknowledge Stripe's event and run the translation, but log an error instead of emailing — meaning **a paid order could complete with no copy sent anywhere** until these are configured, so set them up before launching.

### A note on Stripe's webhook timeout vs. translation time

Stripe expects a response within roughly 10-20 seconds before it considers an attempt failed and retries the same event. Translating a real document (many sequential Gemini batch calls) can easily take longer than that for anything beyond a short letter. This means **Stripe will likely retry the webhook while the first attempt is still translating** — that's expected and handled: `translateForSession()` (`lib/translate-for-session.ts`) caches results and de-duplicates in-flight requests per session ID, and the webhook separately tracks whether it's already sent each email (`hasDeliveryEmailBeenSent`/`hasReviewNotificationBeenSent` in `lib/sent-email-markers.ts`), so retries reuse cached work instead of re-translating or sending duplicate emails. If you ever see duplicate delivery emails for the same order, that's the first thing to check.

## Setup

```bash
npm install
cp .env.example .env.local
# add your Gemini API key — https://aistudio.google.com/apikey
# add your Stripe TEST secret key — https://dashboard.stripe.com/test/apikeys
npm run dev
```

Open http://localhost:3000, drop in a document, and use a [Stripe test card](https://docs.stripe.com/testing#cards) (e.g. `4242 4242 4242 4242`, any future expiry, any CVC) to complete a test payment end-to-end.

## Deploying

Standard Next.js app — deploys to Vercel with zero config:

```bash
git push
```

Import the repo at vercel.com/new, then add `GEMINI_API_KEY` and `STRIPE_SECRET_KEY` (your **live** secret key once ready to charge real cards) as environment variables in the project settings.

## Known limitation: the pending-file store

Between "Checkout session created" and "payment confirmed," the uploaded file is held in `lib/pending-uploads.ts` — currently an **in-memory `TtlMap`** (a tiny shared helper in `lib/ttl-map.ts`, also used by `lib/translation-cache.ts`'s result cache and `lib/sent-email-markers.ts`'s dedup markers). This is fine for a single server instance, but on multiple instances (e.g. Vercel scaling out under load, or multiple regions) each instance has its own empty copy of these maps. Concretely, this means:

- A request that lands on a different instance than the one holding the pending file will fail to find it (the "file has expired" error path) even though it hasn't actually expired
- Worse: if the webhook and the success-page request land on *different* instances, neither sees the other's in-flight/cached state, and **both will independently call Gemini and translate the same document** — not a double charge to the customer (Stripe only charges once), but a real double cost to you, and possibly two delivery emails if both complete before either's dedup marker would have caught it

Before scaling past a single instance, swap `lib/ttl-map.ts`'s implementation for Redis (Upstash has a generous free tier and a near-identical API) or object storage (S3/R2) with a TTL, and use a proper distributed lock (e.g. Redis `SETNX`) in place of the in-memory `IN_FLIGHT` map in `lib/translation-cache.ts`. Since every store (`pending-uploads.ts`, `translation-cache.ts`, `sent-email-markers.ts`) is built on the same `TtlMap` class, swapping that one class's internals is most of the work.

## Bug audit (this pass)

A full pass through every file turned up several real issues, now fixed:

- **Removed `/api/translate`** — a leftover, completely unauthenticated endpoint from before the paid checkout flow existed. It had no payment check and translated any uploaded document for free. Nothing in the app called it, but it was live and reachable — a full monetization bypass and an open cost-exposure risk. Deleted entirely.
- **Gemini responses are now validated** — previously, if Gemini dropped, merged, or malformed a segment in its JSON response, the affected sentence would silently stay in English in the final document with zero error surfaced anywhere. Now every batch is checked against the segments sent, and a mismatch throws (with one automatic retry for transient failures) rather than ever returning a partial translation.
- **Expert review fee floor** — the +20% fee could fall below Stripe's 50-cent minimum charge for documents near the base price floor (e.g. $0.99 × 20% = $0.20), which would have failed checkout outright for short documents. Fixed with a $0.50 minimum on the review fee itself.
- **Memory leak in the email dedup markers** — the sets tracking "has this order's delivery/review email already been sent" grew forever with no cleanup, unlike every other store. Now on the same TTL-based cleanup cycle as everything else (and since this audit, all three stores share one `TtlMap` implementation in `lib/ttl-map.ts`, so this class of bug can't recur independently in each one).
- **`wantsExpertReview` could go stale** — both the webhook and the success page independently re-fetched this flag from the short-lived pending-input store, which expires (30 min) well before the cached translation result does (1 hour). An order revisited or processed in that window would incorrectly report "no expert review requested" even if it was paid for. Fixed by storing the flag on the cached result itself.
- **Silent "sent" markers on failed sends** — if `REVIEW_NOTIFICATION_EMAIL` wasn't configured, the notification functions logged an error and returned, but the webhook still marked the email as "sent" regardless. Misconfiguring the env var on day one would have permanently suppressed that order's email even after fixing the config, since the dedup marker doesn't expire quickly. Now the send functions report success/failure, and the marker is only set on confirmed delivery.
- **Raw internal errors leaking to users** — uploading a corrupted or fake `.docx`/`.pptx` threw a raw JSZip error ("Can't find end of central directory... see https://stuk.github.io/...") straight into the API response. Now caught and replaced with a plain "we couldn't read this file" message in both `/api/estimate` and `/api/checkout`.
- **Dropzone usable mid-request** — nothing stopped a user from picking a new file while a previous one was still being estimated, or while checkout was redirecting, which could overlap requests and produce a confusing UI state. The dropzone is now disabled (dimmed, non-interactive) while busy.
- **Dead code in the PPTX RTL formatter** — an unused, never-called helper function sat alongside the actual (correct, tested) RTL logic, which could have misled a future edit into thinking it was load-bearing. Removed.
- **React lint findings** — a component reference computed during render (flagged by React's static-components rule), a synchronous `setState` call inside an effect, an unescaped apostrophe, and a plain `<a>` tag where `<Link>` belongs. All fixed; `npx eslint app lib` and `npx tsc --noEmit` are both clean except for intentional `any` usage in the XML-tree-walking code, where dynamic shapes make that the pragmatic choice.

What's confirmed correct, not just assumed: the docx/pptx round-trip (text extraction, translation splicing, and RTL injection) was re-tested against real files with `python-docx`/`python-pptx` after every change in this pass. The translation-dedup logic (in-flight collapsing, cached-result reuse) was stress-tested with concurrent calls in the same tick. Pricing was exhaustively checked for floating-point/rounding mismatches across 100,000 word-count values with zero failures.

What's a known, accepted limitation rather than a bug: the in-memory `TtlMap`-backed stores (`lib/pending-uploads.ts`, `lib/translation-cache.ts`, `lib/sent-email-markers.ts`) only coordinate correctly within a single server instance (see "Known limitation" below) — this was true before this audit and remains the one structural change needed before scaling beyond one instance.

## Format support status

- ✅ `.docx` — full structure preservation, tested against headings, bold runs split across multiple XML nodes, and tables
- ✅ `.pptx` — slides, notes, layouts, and masters; tested against multi-slide decks
- ✅ `.txt` — line-by-line translation
- ⏳ `.pdf` — intentionally deferred; PDF layout reconstruction is a fundamentally harder problem (no semantic structure to preserve, just absolute-positioned text) and deserves its own design pass rather than being bolted onto this engine

## Possible next steps for the individuals/SME audience

- **SEO landing pages** — programmatic pages targeting long-tail searches like "translate Word document to Arabic," "convert PowerPoint to Arabic," "translate contract to Arabic online" (these have strong commercial intent and low competition)
- **Free first translation** — waiving payment on a user's first (small) document is a strong SME conversion lever; would need light fraud protection (e.g. IP-based rate limiting) since there's no account system
- **A real reviewer queue** — right now expert-review orders land in your inbox as an email with the file attached; once volume picks up, this would benefit from an actual queue/dashboard rather than relying on email as the work-tracking system
