import { NextRequest, NextResponse } from "next/server";
import { buildOperatorBrief } from "@/ai/operator-case-brief";
import { hasActiveOperatorSession } from "@/operations/operator-session";
import { db } from "@/platform/database";

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  if (!await hasActiveOperatorSession(request.cookies.get("saferoute_operator_session")?.value)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const { caseId } = await context.params;
  const [caseResult, eventResult, optionsResult, constraintsResult] = await Promise.all([
    db.query("SELECT state,correlation_id FROM recovery_cases WHERE case_id=$1", [caseId]),
    db.query("SELECT category,predicted_arrival FROM disruption_events WHERE case_id=$1 ORDER BY source_revision DESC LIMIT 1", [caseId]),
    db.query("SELECT mode,conditions,capacity FROM recovery_options WHERE case_id=$1", [caseId]),
    db.query("SELECT desired_arrival FROM recovery_constraints WHERE case_id=$1", [caseId])
  ]);
  if (!caseResult.rowCount) return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
  const recommendation = await db.query("SELECT safe_summary FROM audit_entries WHERE case_id=$1 AND event_type='RECOVERY_RECOMMENDED' ORDER BY created_at DESC LIMIT 1", [caseId]);
  const summary = recommendation.rows[0]?.safe_summary as { avoidModes?: string[] } | undefined;
  const brief = await buildOperatorBrief({
    state: caseResult.rows[0].state,
    event: eventResult.rowCount ? { category: eventResult.rows[0].category, predictedArrival: eventResult.rows[0].predicted_arrival.toISOString() } : null,
    options: optionsResult.rows.map((option) => ({ mode: option.mode, conditions: option.conditions, capacity: option.capacity })),
    constraints: constraintsResult.rowCount ? { desiredArrival: constraintsResult.rows[0].desired_arrival, avoidModes: summary?.avoidModes } : null
  });
  await db.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,'OPERATOR_BRIEF_GENERATED','system',$3)", [caseId, caseResult.rows[0].correlation_id, JSON.stringify({ provider: brief.provider })]);
  return NextResponse.json(brief);
}
