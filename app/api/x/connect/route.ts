import { initiateXConnection } from "@/agent/lib/composio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await initiateXConnection();
  const status = result.error ? 400 : 200;
  return Response.json(result, { status });
}
