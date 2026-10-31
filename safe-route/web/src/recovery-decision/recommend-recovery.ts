import { db } from "@/platform/database";

type RecommendationResult = { ok: true; recommendedOptionId: string; reason: string } | { ok: false; code: "FORBIDDEN" | "INVALID_STATE" | "NO_ELIGIBLE_OPTION" | "VALIDATION_ERROR" };

function minutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export async function recommendRecovery(input: { caseId: string; sessionId?: string; desiredArrival: string; avoidModes?: Array<"bus" | "overnight"> }): Promise<RecommendationResult> {
  const deadline = minutes(input.desiredArrival);
  if (deadline === null) return { ok: false, code: "VALIDATION_ERROR" };
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const session = await client.query("SELECT 1 FROM passenger_sessions WHERE session_id=$1 AND case_id=$2 AND active=true", [input.sessionId, input.caseId]);
    if (!session.rowCount) { await client.query("ROLLBACK"); return { ok: false, code: "FORBIDDEN" }; }
    const caseResult = await client.query("SELECT state,correlation_id FROM recovery_cases WHERE case_id=$1 FOR UPDATE", [input.caseId]);
    if (!caseResult.rowCount || !["AT_RISK", "OPTIONS_READY", "PROPOSAL_READY"].includes(caseResult.rows[0].state)) { await client.query("ROLLBACK"); return { ok: false, code: "INVALID_STATE" }; }
    const options = await client.query("SELECT option_id,itinerary,mode FROM recovery_options WHERE case_id=$1 AND capacity > 0", [input.caseId]);
    const forbidden = new Set(input.avoidModes ?? []);
    const ranked = options.rows.map((option) => ({ optionId: option.option_id as string, mode: option.mode as string, arrival: minutes((option.itinerary as { arrival: string }).arrival) })).filter((option): option is { optionId: string; mode: string; arrival: number } => option.arrival !== null).filter((option) => !forbidden.has(option.mode as "bus" | "overnight") && option.arrival <= deadline).sort((a, b) => a.arrival - b.arrival);
    if (!ranked.length) {
      await client.query("INSERT INTO recovery_constraints (case_id,desired_arrival) VALUES ($1,$2) ON CONFLICT (case_id) DO UPDATE SET desired_arrival=EXCLUDED.desired_arrival,updated_at=NOW()", [input.caseId, input.desiredArrival]);
      await client.query("UPDATE recovery_cases SET state='ESCALATED', escalation_reason='No recovery option meets the passenger arrival constraint', updated_at=NOW() WHERE case_id=$1", [input.caseId]);
      await client.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,'RECOVERY_ESCALATED','system',$3)", [input.caseId, caseResult.rows[0].correlation_id, JSON.stringify({ desiredArrival: input.desiredArrival, avoidModes: [...forbidden], reason: "NO_ELIGIBLE_OPTION" })]);
      await client.query("COMMIT");
      return { ok: false, code: "NO_ELIGIBLE_OPTION" };
    }
    const recommendation = ranked[0];
    await client.query("INSERT INTO recovery_constraints (case_id,desired_arrival) VALUES ($1,$2) ON CONFLICT (case_id) DO UPDATE SET desired_arrival=EXCLUDED.desired_arrival,updated_at=NOW()", [input.caseId, input.desiredArrival]);
    await client.query("UPDATE recovery_cases SET state='PROPOSAL_READY',updated_at=NOW() WHERE case_id=$1", [input.caseId]);
    await client.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,'RECOVERY_RECOMMENDED','system',$3)", [input.caseId, caseResult.rows[0].correlation_id, JSON.stringify({ desiredArrival: input.desiredArrival, avoidModes: [...forbidden], recommendedOptionId: recommendation.optionId, rankedEligibleOptions: ranked.map((option) => option.optionId) })]);
    await client.query("COMMIT");
    return { ok: true, recommendedOptionId: recommendation.optionId, reason: `Arrives before ${input.desiredArrival}` };
  } catch { await client.query("ROLLBACK"); throw new Error("recovery recommendation failed"); } finally { client.release(); }
}
