import { db } from "@/platform/database";

export type RebookResult = { ok: true; bookingRevision: number; reservationId: string } | { ok: false; code: "FORBIDDEN" | "STALE" | "HOLD_EXPIRED" | "INVALID_STATE" };

export async function rebookTicket(input: { caseId: string; sessionId?: string; reservationId: string; idempotencyKey: string }): Promise<RebookResult> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const session = await client.query("SELECT 1 FROM passenger_sessions WHERE session_id=$1 AND case_id=$2 AND active=true", [input.sessionId, input.caseId]);
    if (!session.rowCount) { await client.query("ROLLBACK"); return { ok: false, code: "FORBIDDEN" }; }
    const reservation = await client.query("SELECT r.*,c.correlation_id,b.booking_id,b.booking_revision FROM reservations r JOIN recovery_cases c ON c.case_id=r.case_id JOIN bookings b ON b.booking_id=c.booking_id WHERE r.reservation_id=$1 AND r.case_id=$2 FOR UPDATE", [input.reservationId, input.caseId]);
    if (!reservation.rowCount) { await client.query("ROLLBACK"); return { ok: false, code: "INVALID_STATE" }; }
    const row = reservation.rows[0];
    if (row.state === "REBOOKED") {
      if (row.rebook_idempotency_key !== input.idempotencyKey) { await client.query("ROLLBACK"); return { ok: false, code: "INVALID_STATE" }; }
      await client.query("COMMIT");
      return { ok: true, bookingRevision: row.booking_revision, reservationId: input.reservationId };
    }
    if (row.state !== "HOLD_ACTIVE") { await client.query("ROLLBACK"); return { ok: false, code: "INVALID_STATE" }; }
    if (new Date(row.expires_at) <= new Date()) {
      await client.query("UPDATE recovery_options SET capacity=capacity+1, option_revision=option_revision+1 WHERE option_id=$1", [row.option_id]);
      await client.query("UPDATE reservations SET state='HOLD_EXPIRED' WHERE reservation_id=$1", [input.reservationId]);
      await client.query("UPDATE recovery_cases SET state='PROPOSAL_READY', updated_at=NOW() WHERE case_id=$1", [input.caseId]);
      await client.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,'HOLD_EXPIRED','system',$3)", [input.caseId, row.correlation_id, JSON.stringify({ reservationId: input.reservationId, optionId: row.option_id })]);
      await client.query("COMMIT");
      return { ok: false, code: "HOLD_EXPIRED" };
    }
    if (row.booking_revision !== row.expected_booking_revision) { await client.query("ROLLBACK"); return { ok: false, code: "STALE" }; }
    const option = await client.query("SELECT itinerary,option_revision FROM recovery_options WHERE option_id=$1 FOR UPDATE", [row.option_id]);
    if (!option.rowCount || option.rows[0].option_revision !== row.expected_option_revision) { await client.query("ROLLBACK"); return { ok: false, code: "STALE" }; }
    const itinerary = await client.query("SELECT itinerary FROM bookings WHERE booking_id=$1 FOR UPDATE", [row.booking_id]);
    const updatedItinerary = { ...(itinerary.rows[0].itinerary as object), recovery: option.rows[0].itinerary, selectedOptionId: row.option_id };
    const booking = await client.query("UPDATE bookings SET itinerary=$1,booking_revision=booking_revision+1 WHERE booking_id=$2 RETURNING booking_revision", [JSON.stringify(updatedItinerary), row.booking_id]);
    await client.query("UPDATE reservations SET state='REBOOKED',rebook_idempotency_key=$2 WHERE reservation_id=$1", [input.reservationId, input.idempotencyKey]);
    await client.query("UPDATE recovery_cases SET state='REBOOKED',updated_at=NOW() WHERE case_id=$1", [input.caseId]);
    await client.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,'TICKET_REBOOKED','passenger',$3)", [input.caseId, row.correlation_id, JSON.stringify({ reservationId: input.reservationId, idempotencyKey: input.idempotencyKey })]);
    await client.query("COMMIT");
    return { ok: true, bookingRevision: booking.rows[0].booking_revision, reservationId: input.reservationId };
  } catch { await client.query("ROLLBACK"); throw new Error("rebook transaction failed"); } finally { client.release(); }
}
