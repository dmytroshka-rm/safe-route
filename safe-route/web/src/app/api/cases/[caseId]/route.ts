import { NextRequest, NextResponse } from "next/server";
import { db } from "@/platform/database";

export async function GET(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const sessionId = request.cookies.get("saferoute_session")?.value;
  const session = await db.query("SELECT 1 FROM passenger_sessions WHERE session_id=$1 AND case_id=$2 AND active=true", [sessionId, caseId]);
  if (!session.rowCount) return NextResponse.json({ code: "FORBIDDEN", message: "Session is not allowed for this case" }, { status: 403 });
  const [caseResult, options, audit] = await Promise.all([
    db.query("SELECT c.case_id,c.state,c.country_code,b.booking_id,b.itinerary,b.booking_revision FROM recovery_cases c JOIN bookings b ON b.booking_id=c.booking_id WHERE c.case_id=$1", [caseId]),
    db.query("SELECT option_id,mode,itinerary,conditions,capacity,option_revision FROM recovery_options WHERE case_id=$1 ORDER BY itinerary->>'arrival'", [caseId]),
    db.query("SELECT event_type,actor,safe_summary,created_at FROM audit_entries WHERE case_id=$1 ORDER BY created_at", [caseId])
  ]);
  return NextResponse.json({ case: caseResult.rows[0], options: options.rows, audit: audit.rows });
}
