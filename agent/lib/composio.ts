// The only module that talks to Composio. It constructs the client lazily from
// the environment, executes a single Twitter action against the connected
// account, and discovers which Twitter actions exist. When Composio is not
// configured (no API key), every call returns a clean "not configured" result
// instead of throwing, so tests and evals never need the network and never post.

import { Composio } from "@composio/core";
import {
  TWITTER_TOOLKIT,
  describeComposioError,
  isAllowedSlug,
  type ExecResult,
} from "./x_twitter.ts";

let client: Composio | null = null;

/** The Composio client, or null when COMPOSIO_API_KEY is unset (not configured). */
function getClient(): Composio | null {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Composio({ apiKey });
  return client;
}

/** The Composio user whose X account is connected. Falls back to "default". */
export function getXUserId(): string {
  return process.env.COMPOSIO_USER_ID ?? "default";
}

// Composio requires a toolkit version on execution; omitting it returns
// "Toolkit version not specified". Pin to the TWITTER toolkit's current version
// (overridable via env) rather than "latest", which Composio warns can shift
// under you when a new toolkit version ships.
const DEFAULT_TWITTER_VERSION = "20260501_00";

/** The TWITTER toolkit version to execute against. */
export function getTwitterVersion(): string {
  return process.env.COMPOSIO_TWITTER_VERSION || DEFAULT_TWITTER_VERSION;
}

/** Whether X posting is wired up (API key present). */
export function isXConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY);
}

const NOT_CONFIGURED: ExecResult = {
  successful: false,
  data: {},
  error: "X is not configured. Set COMPOSIO_API_KEY and COMPOSIO_USER_ID in the environment.",
};

/** A discovered Twitter action the model can call via `x_run_tool`. */
export interface DiscoveredTool {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
}

/**
 * Execute one Twitter action against the connected account. Returns Composio's
 * `{ successful, data, error }` verbatim (never throws): a thrown SDK/network
 * error is mapped to `{ successful: false }` so callers always get a result they
 * can report honestly.
 */
export async function executeTwitter(
  slug: string,
  args: Record<string, unknown>,
): Promise<ExecResult> {
  const composio = getClient();
  if (!composio) return NOT_CONFIGURED;
  try {
    const res = await composio.tools.execute(slug, {
      userId: getXUserId(),
      version: getTwitterVersion(),
      arguments: args,
    });
    return { successful: res.successful, data: res.data ?? {}, error: res.error ?? null };
  } catch (err) {
    // Composio throws on execution errors; surface the nested, actionable reason.
    return { successful: false, data: {}, error: describeComposioError(err) };
  }
}

/**
 * Find Twitter actions matching a free-text query (e.g. "like a post",
 * "search recent tweets"). Returns only allowed (non-blocked) actions. Returns
 * an empty list when not configured or on error, so discovery degrades quietly.
 */
export async function findTwitterTools(query: string): Promise<DiscoveredTool[]> {
  const composio = getClient();
  if (!composio) return [];
  try {
    let list = await composio.tools.getRawComposioTools({
      toolkits: [TWITTER_TOOLKIT],
      search: query,
      limit: 10,
    });
    // Composio's search returns nothing for long natural-language queries; fall
    // back to the general toolkit listing so the model always sees real actions.
    if (!list || list.length === 0) {
      list = await composio.tools.getRawComposioTools({
        toolkits: [TWITTER_TOOLKIT],
        limit: 20,
      });
    }
    return (list ?? [])
      .filter((tool) => isAllowedSlug(tool.slug))
      .map((tool) => ({
        slug: tool.slug,
        name: tool.name,
        description: tool.description ?? "",
      }));
  } catch {
    return [];
  }
}
