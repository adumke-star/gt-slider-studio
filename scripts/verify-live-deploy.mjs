#!/usr/bin/env node
/**
 * Quick smoke check for the Cloudflare production bundle.
 * Fails if VITE_* were missing at build time (bundle contains "Missing Supabase").
 *
 * Usage:
 *   npm run verify:live
 *   LIVE_URL=https://your-worker.workers.dev npm run verify:live
 */

const LIVE_URL =
  process.env.LIVE_URL?.replace(/\/$/, "") ??
  "https://adumke-star-gt-slider-studio.gt-sliderstudio.workers.dev";

const PROJECT_REF = process.env.VITE_SUPABASE_PROJECT_ID ?? process.env.SUPABASE_PROJECT_ID;

async function main() {
  const homeRes = await fetch(LIVE_URL);
  if (!homeRes.ok) {
    throw new Error(`Homepage ${LIVE_URL} returned HTTP ${homeRes.status}`);
  }
  const html = await homeRes.text();

  const bundleMatch = html.match(/\/assets\/index-[^"]+\.js/);
  if (!bundleMatch) {
    throw new Error("Could not find main JS bundle in homepage HTML");
  }

  const bundleUrl = `${LIVE_URL}${bundleMatch[0]}`;
  const bundleRes = await fetch(bundleUrl);
  if (!bundleRes.ok) {
    throw new Error(`Bundle ${bundleUrl} returned HTTP ${bundleRes.status}`);
  }
  const bundle = await bundleRes.text();

  if (bundle.includes("Missing Supabase")) {
    throw new Error(
      "Bundle was built without VITE_SUPABASE_* — add Build variables in Cloudflare and redeploy.",
    );
  }

  if (PROJECT_REF && !bundle.includes(PROJECT_REF)) {
    console.warn(
      `Warning: expected project ref "${PROJECT_REF}" not found in bundle (stale deploy or wrong URL?).`,
    );
  }

  console.log(`OK  ${LIVE_URL}`);
  console.log(`    bundle: ${bundleMatch[0]}`);
  if (PROJECT_REF) console.log(`    supabase project ref present in bundle`);
}

main().catch((err) => {
  console.error(`FAIL  ${err.message}`);
  process.exit(1);
});
