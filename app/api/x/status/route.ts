import { getXConnection } from "@/agent/lib/composio";

// Runs in the Node runtime (Composio SDK) and must not be cached: connection
// state changes when the user authorizes.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getXConnection();
  return Response.json(status);
}
