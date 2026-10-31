import { NextRequest, NextResponse } from "next/server";
import { rebookTicket } from "@/reservation-actions/rebook-ticket";

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const body = await request.json().catch(() => null) as { reservationId?: string; idempotencyKey?: string } | null;
  if (!body?.reservationId || !body.idempotencyKey) return NextResponse.json({ code: "VALIDATION_ERROR", message: "reservationId and idempotencyKey are required" }, { status: 400 });
  const result = await rebookTicket({ caseId, sessionId: request.cookies.get("saferoute_session")?.value, reservationId: body.reservationId, idempotencyKey: body.idempotencyKey });
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "FORBIDDEN" ? 403 : 409 });
}
