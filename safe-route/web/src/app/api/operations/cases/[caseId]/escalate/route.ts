import { NextRequest, NextResponse } from "next/server";
import { db } from "@/platform/database";
import { hasActiveOperatorSession } from "@/operations/operator-session";

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  if (!await hasActiveOperatorSession(request.cookies.get("saferoute_operator_session")?.value)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { caseId } = await context.params;
  const body = await request.json().catch(() => null) as { reason?: string } | null;
  const reason = body?.reason?.trim();
  if (!reason || reason.length > 250) return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const caseResult = await client.query("SELECT state,correlation_id FROM recovery_cases WHERE case_id=$1 FOR UPDATE", [caseId]);
    if (!caseResult.rowCount || ["REBOOKED", "RESOLVED"].includes(caseResult.rows[0].state)) { await client.query("ROLLBACK"); return NextResponse.json({ code: "INVALID_STATE" }, { status: 409 }); }
    await client.query("UPDATE recovery_cases SET state='ESCALATED', escalation_reason=$2, updated_at=NOW() WHERE case_id=$1", [caseId, reason]);
    await client.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,'MANUAL_ESCALATION','agent',$3)", [caseId, caseResult.rows[0].correlation_id, JSON.stringify({ reason })]);
    await client.query("COMMIT");
    return NextResponse.json({ ok: true, state: "ESCALATED" });
  } catch { await client.query("ROLLBACK"); return NextResponse.json({ code: "INTERNAL_ERROR" }, { status: 500 }); } finally { client.release(); }
}
