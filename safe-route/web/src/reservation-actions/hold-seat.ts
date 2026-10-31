import { randomUUID } from "crypto";
import { db } from "@/platform/database";

export type HoldResult = { ok: true; reservationId: string; expiresAt: string } | { ok: false; code: "FORBIDDEN" | "STALE" | "UNAVAILABLE" | "INVALID_STATE" };

export async function holdSeat(input: { caseId: string; sessionId?: string; optionId: string; idempotencyKey: string }): Promise<HoldResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT reservation_id,expires_at,state FROM reservations WHERE idempotency_key=$1", [input.idempotencyKey]);
    if (existing.rowCount) {
      if (existing.rows[0].state !== "HOLD_ACTIVE") { await client.query("ROLLBACK"); return { ok: false, code: "INVALID_STATE" }; }
      await client.query("COMMIT");
      return { ok: true, reservationId: existing.rows[0].reservation_id, expiresAt: existing.rows[0].expires_at.toISOString() };
    }
    const session = await client.query("SELECT 1 FROM passenger_sessions WHERE session_id=$1 AND case_id=$2 AND active=true", [input.sessionId, input.caseId]);
    if (!session.rowCount) { await client.query("ROLLBACK"); return { ok: false, code: "FORBIDDEN" }; }
    const expiredHolds = await client.query("SELECT r.reservation_id,r.case_id,r.option_id,c.correlation_id FROM reservations r JOIN recovery_cases c ON c.case_id=r.case_id WHERE r.state='HOLD_ACTIVE' AND r.expires_at <= NOW() FOR UPDATE");
    for (const expired of expiredHolds.rows) {
      await client.query("UPDATE recovery_options SET capacity=capacity+1,option_revision=option_revision+1 WHERE option_id=$1", [expired.option_id]);
      await client.query("UPDATE reservations SET state='HOLD_EXPIRED' WHERE reservation_id=$1", [expired.reservation_id]);
      await client.query("UPDATE recovery_cases SET state='PROPOSAL_READY',updated_at=NOW() WHERE case_id=$1 AND state='HOLD_ACTIVE'", [expired.case_id]);
      await client.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,'HOLD_EXPIRED','system',$3)", [expired.case_id, expired.correlation_id, JSON.stringify({ reservationId: expired.reservation_id, optionId: expired.option_id, cleanup: "hold-attempt-sweep" })]);
    }
    const caseRow = await client.query("SELECT c.state,b.booking_revision,c.correlation_id FROM recovery_cases c JOIN bookings b ON b.booking_id=c.booking_id WHERE c.case_id=$1 FOR UPDATE", [input.caseId]);
    if (!caseRow.rowCount || !["AT_RISK", "OPTIONS_READY", "PROPOSAL_READY"].includes(caseRow.rows[0].state)) { await client.query("ROLLBACK"); return { ok: false, code: "INVALID_STATE" }; }
    const option = await client.query("SELECT option_revision,capacity FROM recovery_options WHERE option_id=$1 AND case_id=$2 FOR UPDATE", [input.optionId, input.caseId]);
    if (!option.rowCount || option.rows[0].capacity < 1) { await client.query("ROLLBACK"); return { ok: false, code: "UNAVAILABLE" }; }
    const expiresAt = new Date(Date.now() + 15 * 60_000);
    const reservationId = randomUUID();
    await client.query("UPDATE recovery_options SET capacity=capacity-1,option_revision=option_revision+1 WHERE option_id=$1", [input.optionId]);
    await client.query("INSERT INTO reservations (reservation_id,case_id,option_id,state,expected_booking_revision,expected_option_revision,expires_at,idempotency_key) VALUES ($1,$2,$3,'HOLD_ACTIVE',$4,$5,$6,$7)", [reservationId, input.caseId, input.optionId, caseRow.rows[0].booking_revision, option.rows[0].option_revision + 1, expiresAt, input.idempotencyKey]);
    await client.query("UPDATE recovery_cases SET state='HOLD_ACTIVE',updated_at=NOW() WHERE case_id=$1", [input.caseId]);
    await client.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,'HOLD_CREATED','system',$3)", [input.caseId, caseRow.rows[0].correlation_id, JSON.stringify({ optionId: input.optionId, reservationId, expiresAt })]);
    await client.query("COMMIT");
    return { ok: true, reservationId, expiresAt: expiresAt.toISOString() };
  } catch { await client.query("ROLLBACK"); throw new Error("hold transaction failed"); } finally { client.release(); }
}
