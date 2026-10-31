import { NextRequest, NextResponse } from "next/server";
import { holdSeat } from "@/reservation-actions/hold-seat";

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const body = await request.json().catch(() => null) as { optionId?: string; idempotencyKey?: string } | null;
  if (!body?.optionId || !body.idempotencyKey) return NextResponse.json({ code: "VALIDATION_ERROR", message: "optionId and idempotencyKey are required" }, { status: 400 });
  const result = await holdSeat({ caseId, sessionId: request.cookies.get("saferoute_session")?.value, optionId: body.optionId, idempotencyKey: body.idempotencyKey });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "FORBIDDEN" ? 403 : 409 });
}
