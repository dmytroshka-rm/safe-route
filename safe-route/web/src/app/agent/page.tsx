"use client";

import { useEffect, useState } from "react";
import { formatDuration, type CaseEffectivenessSummary } from "@/support-insights/build-case-effectiveness-summary";

type CaseData = {
  case: { case_id: string; state: string; country_code: string; booking_id: string; escalation_reason?: string };
  events: Array<{ event_id: string; category: string; predicted_arrival: string; source_revision: number }>;
  options: Array<{ option_id: string; mode: string; conditions: string; capacity: number }>;
  audit: Array<{ event_type: string; actor: string; created_at: string; safe_summary: Record<string, unknown> }>;
  insights: CaseEffectivenessSummary;
};

const stateLabel: Record<string, string> = { AT_RISK: "Потребує оцінки", OPTIONS_READY: "Варіанти готові", PROPOSAL_READY: "План надіслано", REBOOKED: "Поїздку відновлено", ESCALATED: "Ручна перевірка" };
const eventLabel: Record<string, string> = { DISRUPTION_ACCEPTED: "Подію прийнято", JOURNEY_ASSESSED: "Маршрут оцінено", MANUAL_ESCALATION: "Призначено ручну перевірку", RECOVERY_RECOMMENDED: "Підібрано рекомендацію", RECOVERY_ESCALATED: "Немає придатного маршруту", HOLD_CREATED: "Місце утримано", HOLD_EXPIRED: "Hold сплив", TICKET_REBOOKED: "Квиток переброньовано", PASSENGER_NEED_INTERPRETED: "Потребу пасажира розпізнано", OPERATOR_BRIEF_GENERATED: "Сформовано AI-brief" };
const modeLabel: Record<string, string> = { bus: "Автобус партнера", train: "Поїзд", overnight: "Нічліг і ранковий поїзд" };

function auditDetail(summary: Record<string, unknown>) {
  if (summary.decision === "OPTIONS_READY") return "Знайдено альтернативи для продовження поїздки.";
  if (summary.category === "SAFETY_ALERT") return "Отримано верифікований операційний сигнал.";
  if (summary.reservationId && summary.idempotencyKey) return "Пасажир підтвердив перебронювання.";
  if (summary.reservationId && summary.optionId) return "Місце утримано на час підтвердження пасажиром.";
  if (typeof summary.reason === "string" && summary.reason.includes("manual")) return "Оператор запросив перевірку запропонованих альтернатив.";
  return "Дію збережено в журналі case.";
}

export default function AgentPage() {
  const [data, setData] = useState<CaseData | null>(null);
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("");
  const [brief, setBrief] = useState<{ text: string; provider: "gemma" | "policy" } | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  async function refreshCase(seedIfMissing = true) {
    setBusy(true);
    let response = await fetch("/api/operations/cases/case-1001");
    if (!response.ok && seedIfMissing) {
      await fetch("/api/demo/reset", { method: "POST" });
      response = await fetch("/api/operations/cases/case-1001");
    }
    if (response.ok) setData(await response.json());
    else setNotice("Не вдалося завантажити case.");
    setBusy(false);
  }

  useEffect(() => { void refreshCase(); }, []);

  async function escalate() {
    if (!data) return;
    setBusy(true);
    const response = await fetch("/api/operations/cases/case-1001/escalate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Operator requested manual review of recovery options" }) });
    if (!response.ok) setNotice("Case уже змінився. Оновіть дані перед повторною дією.");
    await refreshCase();
  }
  async function generateBrief() {
    setBriefLoading(true);
    const response = await fetch("/api/operations/cases/case-1001/brief", { method: "POST" });
    const body = await response.json().catch(() => null);
    if (response.ok && body) {
      setBrief(body);
      await refreshCase(false);
    } else setNotice("Не вдалося сформувати AI-brief для цього case.");
    setBriefLoading(false);
  }

  if (!data) return <main className="shell app-shell"><header className="topbar"><a className="brand" href="/">Safe<span>Route</span></a></header><section className="panel loading-panel">{busy ? "Завантажуємо case…" : notice}</section></main>;
  const event = data.events[0];
  const isEscalated = data.case.state === "ESCALATED";
  const isRebooked = data.case.state === "REBOOKED";
  return <main className="shell app-shell">
    <header className="topbar"><a className="brand" href="/">Safe<span>Route</span></a><nav><a href="/">Інциденти</a><a href="/monitor">Події</a><a className="active-nav" href="/agent">Команда</a></nav></header>
    <section className="case-header"><div><a className="back-link" href="/">← Усі інциденти</a><p className="eyebrow">CASE · {data.case.booking_id}</p><h1>Київ → Львів → Ужгород</h1><p>Затримка першого сегмента робить пересадку у Львові недосяжною.</p></div><div className="case-header-actions"><span className={`state-chip ${isEscalated ? "warning" : "critical"}`}>{stateLabel[data.case.state] ?? data.case.state}</span><button className="secondary-button" onClick={() => refreshCase()} disabled={busy}>{busy ? "Оновлюємо…" : "Оновити"}</button></div></section>
    <section className="case-workspace"><div className="case-main"><article className="panel journey-panel"><div className="panel-heading"><div><p className="panel-label">МАРШРУТ</p><h2>Поїздка пасажира</h2></div><span className="alert-inline">Пропущена пересадка</span></div><div className="journey-legs"><div><span className="leg-marker risk" /><p><strong>08:00 · Київ</strong><small>SR-101 → Львів</small></p><em>Очікуване прибуття: {new Date(event?.predicted_arrival ?? "2026-10-31T17:00:00Z").toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</em></div><div><span className="leg-marker blocked" /><p><strong>14:00 · Львів</strong><small>SR-205 → Ужгород</small></p><em>Пересадка недосяжна</em></div><div><span className="leg-marker" /><p><strong>19:30 · Ужгород</strong><small>Початковий план</small></p><em>Потрібен новий маршрут</em></div></div></article>
      <article className="panel alternatives-panel"><div className="panel-heading"><div><p className="panel-label">ВАРІАНТИ ВІДНОВЛЕННЯ</p><h2>Доступні альтернативи</h2></div><span className="count-chip">{data.options.length}</span></div><div className="alternative-list">{data.options.map((option) => <div className="alternative" key={option.option_id}><div><strong>{modeLabel[option.mode] ?? option.mode}</strong><small>{option.conditions}</small></div><span><b>{option.capacity}</b> місць</span></div>)}</div><div className="case-actions"><a className="primary link-button" href="/passenger">Переглянути пропозицію для пасажира</a></div></article>
      <article className="panel insights-panel"><div className="panel-heading"><div><p className="panel-label">ЕФЕКТИВНІСТЬ SUPPORT</p><h2>Що вже виміряно по цьому case</h2></div><span className="count-chip">{data.insights.outcomeLabel}</span></div><div className="insight-grid"><div><span>Час до hold</span><strong>{formatDuration(data.insights.timeToHoldSeconds)}</strong></div><div><span>Час до плану</span><strong>{formatDuration(data.insights.timeToRecommendSeconds)}</strong></div><div><span>Перебронювання</span><strong>{data.insights.rebookSucceeded ? "Так" : "Ще ні"}</strong></div><div><span>Ручні рішення</span><strong>{data.insights.manualDecisions}</strong></div></div><p className="insight-copy">{data.insights.lastPassengerConstraint ? `Gemma/policy зняла потребу пасажира: ${data.insights.lastPassengerConstraint.latestArrival ? `прибути до ${data.insights.lastPassengerConstraint.latestArrival}` : "дедлайн не вказано"}${data.insights.lastPassengerConstraint.avoidModes.length ? `; без ${data.insights.lastPassengerConstraint.avoidModes.join(", ")}` : ""}. Інтерпретацій: ${data.insights.aiInterpretations}.` : "Пасажир ще не уточнював обмеження в чаті."}{data.insights.escalated ? ` Ескалація: ${data.insights.escalationReason ?? "потрібна перевірка оператора"}.` : ""} Метрики рахуються лише з audit trail, без маркетингових цифр.</p></article>
    </div><aside className="case-sidebar"><article className="panel"><p className="panel-label">AI CASE BRIEF</p>{brief ? <><div className="brief-text">{brief.text}</div><small className="provider-label">{brief.provider === "gemma" ? "Сформовано Gemma за фактами case" : "Системний brief"}</small></> : <><h2>Швидко зрозуміти case</h2><p className="agent-copy">Зведення події, потреб пасажира та безпечної наступної дії — без доступу AI до квитка.</p><button className="secondary-button wide-button" onClick={generateBrief} disabled={briefLoading}>{briefLoading ? "Gemma аналізує…" : "Сформувати AI-brief"}</button></>}</article><article className="panel"><p className="panel-label">КЕРУВАННЯ CASE</p><h2>{isRebooked ? "Поїздку відновлено" : isEscalated ? "Ручна перевірка призначена" : "Автоматичне рішення готове"}</h2><p className="agent-copy">{isRebooked ? "Пасажир підтвердив альтернативний маршрут. Квиток оновлено, а всі дії збережено в журналі case." : isEscalated ? "Оператор перевіряє умови альтернатив перед тим, як пасажир отримає пропозицію." : "Пасажир ще не отримав перебронювання. Він підтвердить будь-яку зміну самостійно."}</p>{isRebooked ? <div className="completion-box">Перебронювання завершено<br /><small>Місце підтверджено, версію квитка оновлено.</small></div> : isEscalated ? <div className="assigned-box">Призначено: команда підтримки<br /><small>{data.case.escalation_reason ? "Потрібна перевірка варіантів." : "Очікується дія оператора."}</small></div> : <button className="secondary-button wide-button" onClick={escalate} disabled={busy}>Передати на ручну перевірку</button>}</article><article className="panel audit-panel"><p className="panel-label">ЖУРНАЛ CASE</p><div className="timeline">{data.audit.slice().reverse().map((item, index) => <div key={`${item.event_type}-${item.created_at}`}><i>{index + 1}</i><span><strong>{eventLabel[item.event_type] ?? item.event_type}</strong><br /><small>{item.actor === "agent" ? "Оператор" : item.actor === "passenger" ? "Пасажир" : "Система"} · {new Date(item.created_at).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</small><br /><small>{auditDetail(item.safe_summary)}</small></span></div>)}</div></article></aside></section>
  </main>;
}
