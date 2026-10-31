import { NextRequest, NextResponse } from "next/server";
import { interpretPassengerNeed } from "@/ai/gemma-explainer";
import { db } from "@/platform/database";

export async function POST(request: NextRequest, context: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await context.params;
  const body = await request.json().catch(() => null) as { message?: string } | null;
  const message = body?.message?.trim();
  if (!message || message.length > 500) return NextResponse.json({ code: "VALIDATION_ERROR" }, { status: 400 });
  const sessionId = request.cookies.get("saferoute_session")?.value;
  const session = await db.query("SELECT 1 FROM passenger_sessions WHERE session_id=$1 AND case_id=$2 AND active=true", [sessionId, caseId]);
  if (!session.rowCount) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
  const response = await interpretPassengerNeed({ message });
  const text = response.provider === "gemma" ? `Врахував обмеження: ${response.proposal.latestArrival ? `прибути до ${response.proposal.latestArrival}` : "дедлайн не вказано"}${response.proposal.avoidModes.length ? `; без ${response.proposal.avoidModes.map((mode) => mode === "bus" ? "автобуса" : "нічлігу").join(" і ")}` : ""}. Зараз перевірю лише дозволені варіанти.` : "Не вдалося надійно розпізнати обмеження. Вкажіть дедлайн у полі праворуч — маршрут не змінено.";
  await db.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) SELECT case_id,correlation_id,'PASSENGER_NEED_INTERPRETED','system',$2 FROM recovery_cases WHERE case_id=$1", [caseId, JSON.stringify({ provider: response.provider, latestArrival: response.proposal.latestArrival, avoidModes: response.proposal.avoidModes })]);
  return NextResponse.json({ text, provider: response.provider, proposal: response.proposal });
}
