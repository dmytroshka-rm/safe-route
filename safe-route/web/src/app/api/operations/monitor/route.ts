import { NextRequest, NextResponse } from "next/server";
import { db } from "@/platform/database";
import { hasActiveOperatorSession } from "@/operations/operator-session";

export async function GET(request: NextRequest) {
  if (!await hasActiveOperatorSession(request.cookies.get("saferoute_operator_session")?.value)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const result = await db.query(`
    SELECT c.case_id, c.state, c.country_code, b.booking_id,
      e.event_id, e.category, e.predicted_arrival, e.source_revision, e.observed_at
    FROM recovery_cases c
    JOIN bookings b ON b.booking_id = c.booking_id
    JOIN LATERAL (
      SELECT * FROM disruption_events WHERE case_id = c.case_id
      ORDER BY observed_at DESC LIMIT 1
    ) e ON TRUE
    ORDER BY e.observed_at DESC`);
  return NextResponse.json({ cases: result.rows });
}
