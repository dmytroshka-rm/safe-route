import { NextRequest, NextResponse } from "next/server";
import { recommendRecovery } from "@/recovery-decision/recommend-recovery";

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const body = await request.json().catch(() => null) as { desiredArrival?: string; avoidModes?: unknown } | null;
  const avoidModes = Array.isArray(body?.avoidModes) && body.avoidModes.every((mode) => mode === "bus" || mode === "overnight") ? body.avoidModes as Array<"bus" | "overnight"> : null;
  if (!body?.desiredArrival || avoidModes === null) return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  const result = await recommendRecovery({ caseId, sessionId: request.cookies.get("saferoute_session")?.value, desiredArrival: body.desiredArrival, avoidModes });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "FORBIDDEN" ? 403 : result.code === "NO_ELIGIBLE_OPTION" ? 422 : 409 });
}
