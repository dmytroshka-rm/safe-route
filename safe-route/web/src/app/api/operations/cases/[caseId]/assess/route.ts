import { NextRequest, NextResponse } from "next/server";
import { hasActiveOperatorSession } from "@/operations/operator-session";
import { assessDisruption } from "@/recovery-decision/assess-disruption";

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  if (!await hasActiveOperatorSession(request.cookies.get("saferoute_operator_session")?.value)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { caseId } = await context.params;
  const result = await assessDisruption(caseId);
  return NextResponse.json(result, { status: result.ok ? 200 : result.code === "NOT_FOUND" ? 404 : 409 });
}
