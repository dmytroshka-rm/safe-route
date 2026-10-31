import { NextRequest, NextResponse } from "next/server";
import { db } from "@/platform/database";
import { hasActiveOperatorSession } from "@/operations/operator-session";
import { buildCaseEffectivenessSummary } from "@/support-insights/build-case-effectiveness-summary";

export async function GET(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  if (!await hasActiveOperatorSession(request.cookies.get("saferoute_operator_session")?.value)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { caseId } = await context.params;
  const [caseResult, events, options, audit] = await Promise.all([
    db.query("SELECT c.case_id,c.state,c.country_code,c.escalation_reason,c.created_at,b.booking_id FROM recovery_cases c JOIN bookings b ON b.booking_id=c.booking_id WHERE c.case_id=$1", [caseId]),
    db.query("SELECT event_id,category,predicted_arrival,source_revision,observed_at FROM disruption_events WHERE case_id=$1 ORDER BY observed_at DESC", [caseId]),
    db.query("SELECT option_id,mode,conditions,capacity FROM recovery_options WHERE case_id=$1 ORDER BY option_id", [caseId]),
    db.query("SELECT event_type,actor,safe_summary,created_at FROM audit_entries WHERE case_id=$1 ORDER BY created_at", [caseId])
  ]);
  if (!caseResult.rowCount) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const currentCase = caseResult.rows[0];
  return NextResponse.json({
    case: currentCase,
    events: events.rows,
    options: options.rows,
    audit: audit.rows,
    insights: buildCaseEffectivenessSummary({
      state: currentCase.state,
      escalationReason: currentCase.escalation_reason,
      audit: audit.rows
    })
  });
}
