// One-time helper: connect your X (Twitter) account to Composio so the agent can
// post on your behalf. Run it once (it creates the OAuth connection that the
// "No connected account found" error is asking for):
//
//   node --env-file=.env.local scripts/connect-x.mjs
//   # or: npm run connect:x
//
// It finds your Twitter auth config, starts the OAuth flow, prints a URL for you
// to open and authorize, then waits until the connection goes active. The account
// is connected under COMPOSIO_USER_ID (default "default") — that MUST match the
// value the running agent uses, or it still won't find the connection.

import { Composio } from "@composio/core";

const apiKey = process.env.COMPOSIO_API_KEY;
const userId = process.env.COMPOSIO_USER_ID ?? "default";

if (!apiKey) {
  console.error("COMPOSIO_API_KEY is not set. Add it to .env.local and re-run.");
  process.exit(1);
}

const composio = new Composio({ apiKey });

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

// Pick the Twitter auth config: an explicit override, else the single ENABLED one.
async function resolveAuthConfigId() {
  const override = process.env.COMPOSIO_AUTH_CONFIG_ID ?? process.argv[2];
  if (override) return override;

  const res = await composio.authConfigs.list({ toolkit: "TWITTER" });
  const items = res?.items ?? [];
  if (items.length === 0) {
    fail(
      "No Twitter auth config exists. Create one in the Composio dashboard with your " +
        "own X developer app credentials (managed Twitter creds were removed in Feb 2026), " +
        "then re-run this script.",
    );
  }
  const enabled = items.filter((a) => a.status === "ENABLED");
  const chosen = (enabled[0] ?? items[0]).id;
  if (items.length > 1) {
    console.log(
      `Found ${items.length} Twitter auth configs; using ${chosen}. ` +
        "Set COMPOSIO_AUTH_CONFIG_ID to pick a specific one.",
    );
  }
  return chosen;
}

async function main() {
  console.log(`Connecting an X account for Composio user "${userId}"...`);

  // If something is already connected for this user, say so and stop.
  const existing = await composio.connectedAccounts.list({ userIds: [userId] });
  const existingItems = existing?.items ?? [];
  const liveTwitter = existingItems.find(
    (a) => (a.toolkit?.slug ?? a.toolkit) === "twitter" && a.status === "ACTIVE",
  );
  if (liveTwitter) {
    console.log(`\n✓ Already connected: ${liveTwitter.id} (status ${liveTwitter.status}). Nothing to do.`);
    return;
  }

  const authConfigId = await resolveAuthConfigId();
  console.log(`Using auth config ${authConfigId}.`);

  const request = await composio.connectedAccounts.initiate(userId, authConfigId);
  const url = request?.redirectUrl;
  if (!url) {
    fail(
      "Composio did not return an OAuth URL. The auth config may be misconfigured " +
        `(check ${authConfigId} in the dashboard). Connection request id: ${request?.id ?? "unknown"}.`,
    );
  }

  console.log("\n──────────────────────────────────────────────────────────");
  console.log("Open this URL in your browser and authorize your X account:\n");
  console.log(`  ${url}\n`);
  console.log("Waiting up to 3 minutes for you to finish...");
  console.log("──────────────────────────────────────────────────────────");

  try {
    const account = await request.waitForConnection(180_000);
    console.log(`\n✓ Connected. Account id: ${account?.id ?? "(unknown)"}, status: ${account?.status ?? "ACTIVE"}.`);
    console.log(
      `\nMake sure the agent runs with COMPOSIO_USER_ID="${userId}" (it's in .env.local), ` +
        "then restart `npm run dev` and try posting again.",
    );
  } catch (err) {
    fail(`Connection did not complete: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
