export type AuditEntryInput = {
  event_type: string;
  actor: string;
  created_at: string | Date;
  safe_summary?: Record<string, unknown> | string | null;
};

export type PassengerConstraintInsight = {
  latestArrival: string | null;
  avoidModes: string[];
  provider: string;
};

export type CaseEffectivenessSummary = {
  outcome: "recovered" | "escalated" | "hold_expired" | "in_progress";
  outcomeLabel: string;
  timeToHoldSeconds: number | null;
  timeToRecommendSeconds: number | null;
  holdSucceeded: boolean;
  rebookSucceeded: boolean;
  escalated: boolean;
  escalationReason: string | null;
  manualDecisions: number;
  aiInterpretations: number;
  aiBriefs: number;
  lastPassengerConstraint: PassengerConstraintInsight | null;
  sourceEventCount: number;
};

const outcomeLabel: Record<CaseEffectivenessSummary["outcome"], string> = {
  recovered: "Поїздку відновлено",
  escalated: "Потрібна ручна перевірка",
  hold_expired: "Hold сплив",
  in_progress: "У процесі"
};

function toTime(value: string | Date) {
  return new Date(value).getTime();
}

function first(entries: AuditEntryInput[], type: string) {
  return entries.find((entry) => entry.event_type === type);
}

function last(entries: AuditEntryInput[], type: string) {
  return [...entries].reverse().find((entry) => entry.event_type === type);
}

function parseSummary(value: AuditEntryInput["safe_summary"]): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; }
  }
  return value;
}

function secondsBetween(start?: AuditEntryInput, end?: AuditEntryInput) {
  if (!start || !end) return null;
  const delta = Math.round((toTime(end.created_at) - toTime(start.created_at)) / 1000);
  return Number.isFinite(delta) && delta >= 0 ? delta : null;
}

export function formatDuration(seconds: number | null) {
  if (seconds === null) return "ще немає";
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} хв ${rest} с` : `${minutes} хв`;
}

export function buildCaseEffectivenessSummary(input: {
  state: string;
  escalationReason?: string | null;
  audit: AuditEntryInput[];
}): CaseEffectivenessSummary {
  const audit = [...input.audit].sort((a, b) => toTime(a.created_at) - toTime(b.created_at));
  const disruption = first(audit, "DISRUPTION_ACCEPTED");
  const hold = first(audit, "HOLD_CREATED");
  const recommend = first(audit, "RECOVERY_RECOMMENDED");
  const rebook = first(audit, "TICKET_REBOOKED");
  const expired = last(audit, "HOLD_EXPIRED");
  const recoveryEscalation = last(audit, "RECOVERY_ESCALATED");
  const manualEscalation = last(audit, "MANUAL_ESCALATION");
  const interpretation = last(audit, "PASSENGER_NEED_INTERPRETED");
  const summary = parseSummary(interpretation?.safe_summary);
  const escalationSummary = parseSummary((recoveryEscalation ?? manualEscalation)?.safe_summary);
  const escalated = input.state === "ESCALATED" || Boolean(recoveryEscalation || manualEscalation);
  const outcome: CaseEffectivenessSummary["outcome"] =
    input.state === "REBOOKED" || Boolean(rebook) ? "recovered" :
    input.state === "HOLD_EXPIRED" || (Boolean(expired) && !rebook) ? "hold_expired" :
    escalated ? "escalated" : "in_progress";

  return {
    outcome,
    outcomeLabel: outcomeLabel[outcome],
    timeToHoldSeconds: secondsBetween(disruption, hold),
    timeToRecommendSeconds: secondsBetween(disruption, recommend),
    holdSucceeded: Boolean(hold),
    rebookSucceeded: Boolean(rebook),
    escalated,
    escalationReason: input.escalationReason ?? (typeof escalationSummary.reason === "string" ? escalationSummary.reason : null),
    manualDecisions: audit.filter((entry) => entry.event_type === "MANUAL_ESCALATION" || entry.actor === "agent").length,
    aiInterpretations: audit.filter((entry) => entry.event_type === "PASSENGER_NEED_INTERPRETED").length,
    aiBriefs: audit.filter((entry) => entry.event_type === "OPERATOR_BRIEF_GENERATED").length,
    lastPassengerConstraint: interpretation ? {
      latestArrival: typeof summary.latestArrival === "string" ? summary.latestArrival : null,
      avoidModes: Array.isArray(summary.avoidModes) ? summary.avoidModes.filter((mode): mode is string => typeof mode === "string") : [],
      provider: typeof summary.provider === "string" ? summary.provider : "policy"
    } : null,
    sourceEventCount: audit.length
  };
}
