/**
 * Exa search client. Request shaping and response normalization are pure
 * functions so they are testable without a network call; `searchExa` is the thin
 * fetch wrapper the `exa_search` tool runs.
 *
 * Depth is chosen by register: `sensible` and `ragebait` both get a deep,
 * grounded synthesis; `shitpost` gets a fast highlights-only pass, because a
 * shitpost still has to verify its premise is real but does not need to
 * deep-read the page. `ragebait` needs the deep path even more than `sensible`
 * does: a provocation gets fact-checked in the replies, and an unverified
 * premise is how a rage-bait post turns into a ratio and a Community Note
 * instead of an argument worth having. The branch below only tests
 * `register === "shitpost"` for the fast path, so `ragebait` falls through to
 * the deep path for free; do not add a separate branch for it.
 *
 * API contract per https://docs.exa.ai/reference/search-api-guide-for-coding-agents.
 * Notes that are easy to get wrong and are deliberate here:
 * - `text` / `highlights` / `summary` nest INSIDE `contents` on `/search`.
 * - `useAutoprompt`, `includeUrls`/`excludeUrls`, `numSentences`, `tokensNum`, and
 *   `livecrawl: "always"` do not exist or are deprecated. Use `includeDomains` /
 *   `excludeDomains` and `contents.maxAgeHours: 0`.
 * - `outputSchema` allows max nesting depth 2 and max 10 total properties. No
 *   citation or confidence fields; `/search` already returns `output.grounding`.
 */
import { z } from "zod";
import { DEFAULT_REGISTER, type Register, REGISTERS } from "./registers.ts";

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_EVIDENCE_CHARS = 1200;

export interface ExaRequest {
  readonly query: string;
  readonly type: "deep" | "fast";
  readonly numResults: number;
  readonly contents: Record<string, unknown>;
  readonly includeDomains?: readonly string[];
  readonly excludeDomains?: readonly string[];
  readonly systemPrompt?: string;
  readonly outputSchema?: Record<string, unknown>;
}

export interface NormalizedExaResult {
  readonly title: string;
  readonly url: string;
  readonly published?: string;
  /** Best available evidence: highlights, else the summary, else trimmed text. */
  readonly evidence: string;
}

export type ExaOutcome =
  | { readonly kind: "ok"; readonly results: NormalizedExaResult[]; readonly synthesis?: unknown }
  | {
      readonly kind: "unauthorized" | "rate-limited" | "unavailable";
      readonly message: string;
    };

/** Depth 2, 5 properties: inside Exa's outputSchema limits. */
const DEEP_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    headline: { type: "string" },
    what_happened: { type: "string" },
    key_numbers: { type: "array", items: { type: "string" } },
    named_entities: { type: "array", items: { type: "string" } },
    why_it_matters: { type: "string" },
  },
  required: ["headline", "what_happened"],
};

const DEEP_SYSTEM_PROMPT =
  "Report only what the sources state. Every number, name, date, and quote must appear " +
  "verbatim in a source. If sources disagree, say so instead of picking one. Never infer, " +
  "estimate, or fill a gap.";

export interface ExaRequestOptions {
  readonly includeDomains?: readonly string[];
  readonly excludeDomains?: readonly string[];
}

/**
 * Input contract for the `exa_search` tool. Declared here rather than in the tool
 * module so tests can `.parse()` a real Zod schema; `defineTool` types its
 * `inputSchema` as StandardJSONSchemaV1, which has no `.parse`.
 */
export const exaSearchInputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe("One search query. Run several distinct ones, not one broad query."),
  register: z
    .enum(REGISTERS)
    .default(DEFAULT_REGISTER)
    .describe(
      "This turn's register.id. Picks deep search (sensible, ragebait) or fast search " +
        "(shitpost).",
    ),
  includeDomains: z.array(z.string()).optional().describe("Restrict to these domains."),
  excludeDomains: z.array(z.string()).optional().describe("Exclude these domains."),
});

export function buildExaRequest(
  query: string,
  register: Register = DEFAULT_REGISTER,
  opts: ExaRequestOptions = {},
): ExaRequest {
  const base = {
    query,
    includeDomains: opts.includeDomains,
    excludeDomains: opts.excludeDomains,
  };

  if (register === "shitpost") {
    // Fast lane (~450ms): enough to confirm the premise is real, no deep read.
    return {
      ...base,
      type: "fast",
      numResults: 5,
      contents: { highlights: true, maxAgeHours: 0 },
    };
  }

  return {
    ...base,
    type: "deep",
    numResults: 8,
    contents: { text: { maxCharacters: 4000 }, highlights: true, maxAgeHours: 0 },
    systemPrompt: DEEP_SYSTEM_PROMPT,
    outputSchema: DEEP_OUTPUT_SCHEMA,
  };
}

function evidenceFor(raw: Record<string, unknown>): string {
  const highlights = raw.highlights;
  if (Array.isArray(highlights) && highlights.length > 0) {
    return highlights
      .filter((h): h is string => typeof h === "string")
      .join(" … ")
      .slice(0, MAX_EVIDENCE_CHARS);
  }
  if (typeof raw.summary === "string" && raw.summary.trim()) {
    return raw.summary.slice(0, MAX_EVIDENCE_CHARS);
  }
  if (typeof raw.text === "string") {
    return raw.text.slice(0, MAX_EVIDENCE_CHARS);
  }
  return "";
}

/** Defensive: Exa's payload shape is validated here, never assumed. */
export function normalizeExaResults(payload: unknown): NormalizedExaResult[] {
  const results = (payload as { results?: unknown })?.results;
  if (!Array.isArray(results)) return [];
  const out: NormalizedExaResult[] = [];
  for (const entry of results) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw = entry as Record<string, unknown>;
    if (typeof raw.url !== "string" || !raw.url) continue;
    out.push({
      url: raw.url,
      title: typeof raw.title === "string" ? raw.title : raw.url,
      published: typeof raw.publishedDate === "string" ? raw.publishedDate : undefined,
      evidence: evidenceFor(raw),
    });
  }
  return out;
}

export interface SearchExaOptions extends ExaRequestOptions {
  readonly apiKey?: string;
  readonly fetchImpl?: typeof fetch;
}

/**
 * One Exa search. 401 surfaces immediately and is never retried (a bad key does
 * not get better). 429 and network/timeout errors get exactly one retry, then
 * report a failure the tool turns into a `web_search` fallback instruction.
 * Never returns a "no results" success that could be mistaken for a clean read.
 */
export async function searchExa(
  query: string,
  register: Register = DEFAULT_REGISTER,
  opts: SearchExaOptions = {},
): Promise<ExaOutcome> {
  const apiKey = opts.apiKey ?? process.env.EXA_API_KEY ?? "";
  if (!apiKey) {
    return {
      kind: "unauthorized",
      message: "EXA_API_KEY is not set. Fall back to web_search and say so.",
    };
  }

  const doFetch = opts.fetchImpl ?? fetch;
  const body = JSON.stringify(buildExaRequest(query, register, opts));
  let lastMessage = "Exa is unreachable.";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await doFetch(EXA_SEARCH_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          kind: "unauthorized",
          message: "Exa key invalid or rotated. Do not retry; fall back to web_search and say so.",
        };
      }
      if (response.status === 429) {
        lastMessage = "Exa rate limited the request.";
        continue; // one retry, then fall through to the failure below
      }
      if (!response.ok) {
        return { kind: "unavailable", message: `Exa returned ${response.status}.` };
      }

      const payload = (await response.json()) as { output?: unknown };
      return {
        kind: "ok",
        results: normalizeExaResults(payload),
        synthesis: payload?.output,
      };
    } catch (error) {
      lastMessage = error instanceof Error ? error.message : "Exa request failed.";
    }
  }

  return {
    kind: lastMessage.includes("rate limited") ? "rate-limited" : "unavailable",
    message: `${lastMessage} Fall back to web_search and note the fallback.`,
  };
}
