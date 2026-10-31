import { db } from "@/platform/database";

export type AssessmentResult = { ok: true; state: "OPTIONS_READY" | "ESCALATED"; missedConnection: boolean; availableOptions: number } | { ok: false; code: "NOT_FOUND" | "INVALID_STATE" };

function toMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})/.exec(value);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export async function assessDisruption(caseId: string): Promise<AssessmentResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT c.state,c.correlation_id,b.itinerary,e.predicted_arrival,e.source_revision
      FROM recovery_cases c
      JOIN bookings b ON b.booking_id=c.booking_id
      JOIN LATERAL (SELECT * FROM disruption_events WHERE case_id=c.case_id ORDER BY observed_at DESC LIMIT 1) e ON TRUE
      WHERE c.case_id=$1 FOR UPDATE`, [caseId]);
    if (!result.rowCount) { await client.query("ROLLBACK"); return { ok: false, code: "NOT_FOUND" }; }
    const row = result.rows[0];
    if (row.state !== "AT_RISK") { await client.query("ROLLBACK"); return { ok: false, code: "INVALID_STATE" }; }
    const legs = row.itinerary.legs as Array<{ departure?: string }>;
    const connectionDeparture = legs[1]?.departure ? toMinutes(legs[1].departure) : null;
    const predicted = new Date(row.predicted_arrival);
    const predictedMinutes = predicted.getUTCHours() * 60 + predicted.getUTCMinutes();
    const missedConnection = connectionDeparture !== null && predictedMinutes > connectionDeparture;
    const available = await client.query("SELECT count(*)::int AS count FROM recovery_options WHERE case_id=$1 AND capacity > 0", [caseId]);
    const availableOptions = available.rows[0].count as number;
    const nextState = missedConnection && availableOptions > 0 ? "OPTIONS_READY" : missedConnection ? "ESCALATED" : "RESOLVED";
    await client.query("UPDATE recovery_cases SET state=$2, escalation_reason=$3, updated_at=NOW() WHERE case_id=$1", [caseId, nextState, nextState === "ESCALATED" ? "No available recovery options" : null]);
    await client.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,'JOURNEY_ASSESSED','system',$3)", [caseId, row.correlation_id, JSON.stringify({ sourceRevision: row.source_revision, missedConnection, availableOptions, decision: nextState })]);
    await client.query("COMMIT");
    return { ok: true, state: nextState as "OPTIONS_READY" | "ESCALATED", missedConnection, availableOptions };
  } catch {
    await client.query("ROLLBACK");
    throw new Error("disruption assessment failed");
  } finally { client.release(); }
}
