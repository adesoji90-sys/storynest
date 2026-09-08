// Wraps fetch() to OpenAI's API with automatic retry-with-backoff on 429
// rate-limit responses. This is a real, observed failure mode, not a
// theoretical one: gpt-image-1.5 has a low default rate limit on new/
// lower-tier OpenAI accounts, and this app's own usage pattern — several
// image generations fired close together while illustrating one book —
// is exactly the kind of burst that trips it, even when the account is
// nowhere near its overall usage/spend limit. Retrying with backoff is
// the standard, correct response to a 429; it is not a workaround for a
// bug in this app's own code.
//
// Deliberately modest (not aggressive) backoff: every retry adds real
// wall-clock time inside a Vercel serverless function that already has a
// tight duration budget (see the TIMEOUT WARNING comments in the routes
// that use this). A few short retries that usually succeed is a better
// tradeoff here than many long ones that guarantee a function timeout
// instead.
//
// Only retries on 429 — an auth error, a bad request, or a model-access
// error is a real problem retrying won't fix, so those are returned
// immediately for the caller to handle and report.

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchOpenAIWithRetry(url, options) {
  let lastRes = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    lastRes = res;
    if (attempt === MAX_RETRIES) break;

    // Respect OpenAI's own Retry-After header when it sends one,
    // otherwise fall back to exponential backoff.
    const retryAfterHeader = res.headers.get("retry-after");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : null;
    const delay = retryAfterMs || BASE_DELAY_MS * Math.pow(2, attempt);
    console.warn(`OpenAI rate limit hit — retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await sleep(delay);
  }
  return lastRes;
}
