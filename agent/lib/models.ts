// Display-only. eve resolves the real model from static source in
// agent/agent.ts, so this must be kept in sync with it by hand: whenever the
// model literal in agent/agent.ts changes, update DEFAULT_MODEL_ID and
// MODEL_LABEL here in the same commit, or the UI will show a stale model.
export const DEFAULT_MODEL_ID = "gpt-5.6-terra";
export const MODEL_LABEL = "GPT-5.6 Terra";
