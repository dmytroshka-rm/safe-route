"use client";

import { useEffect, useState } from "react";
import { demoQueue } from "@/demo-bootstrap/demo-ui-data";
import { formatDuration, type CaseEffectivenessSummary } from "@/support-insights/build-case-effectiveness-summary";

type CaseData = {
  case?: { case_id?: string; state?: string };
  events?: Array<{ event_type?: string; source_revision?: number }>;
  options?: Array<{ option_id?: string }>;
  audit?: Array<{ event_type?: string; actor?: string; created_at?: string; safe_summary?: Record<string, unknown> | string }>;
  insights?: CaseEffectivenessSummary;
};

const stateTitle: Record<string, string> = { AT_RISK: "Потребує оцінки", OPTIONS_READY: "Варіанти готові", PROPOSAL_READY: "План надіслано", REBOOKED: "Поїздку відновлено", ESCALATED: "Потрібен оператор" };

export default function ControlCenterPage() {
  const [data, setData] = useState<CaseData | null>(null);
  const [selectedId, setSelectedId] = useState("BK-1001");
  const [busy, setBusy] = useState(false);

  async function loadLiveCase() {
    const response = await fetch("/api/operations/cases/case-1001");
    if (response.ok) setData(await response.json() as CaseData);
  }

  useEffect(() => { void loadLiveCase(); }, []);

  async function refreshIncidents() {
    setBusy(true);
    try {
      const reset = await fetch("/api/demo/reset", { method: "POST" });
      const assessed = await fetch("/api/operations/cases/case-1001/assess", { method: "POST" });
      const response = await fetch("/api/operations/cases/case-1001");
      if (!reset.ok || !assessed.ok || !response.ok) throw new Error("incident-load");
      setData(await response.json() as CaseData);
      setSelectedId("BK-1001");
    } finally { setBusy(false); }
  }

  const selected = demoQueue.find((item) => item.id === selectedId) ?? demoQueue[0];
  const isLive = selected.live;
  const state = data?.case?.state ?? (isLive ? "AT_RISK" : selected.status);
  const event = data?.events?.[0];
  const audit = data?.audit?.slice(-3).reverse() ?? [];
  const insights = data?.insights;
  const caseTitle = isLive && data ? stateTitle[state] ?? state : selected.status;
  const auditLabel: Record<string, string> = { DISRUPTION_ACCEPTED: "Подію прийнято", JOURNEY_ASSESSED: "Маршрут оцінено", RECOVERY_RECOMMENDED: "Підібрано план", HOLD_CREATED: "Місце утримано", TICKET_REBOOKED: "Квиток переброньовано", RECOVERY_ESCALATED: "Ескалація", MANUAL_ESCALATION: "Ручна перевірка", PASSENGER_NEED_INTERPRETED: "Потребу розпізнано" };

  return <main className="shell app-shell">
    <header className="topbar"><a className="brand" href="/">Safe<span>Route</span></a><nav><a className="active-nav" href="/">Інциденти</a><a href="/monitor">Події</a><a href="/agent">Команда</a></nav></header>
    <section className="dashboard-header"><div><p className="eyebrow">ОПЕРАЦІЙНИЙ ЦЕНТР</p><h1>Інциденти та відновлення поїздок</h1><p>Субота, 31 жовтня · Україна</p></div><button className="primary refresh-button" onClick={refreshIncidents} disabled={busy}>{busy ? "Оновлюємо…" : "Оновити інциденти"}</button></section>
    <section className="metrics"><article><span>Результат case</span><strong>{insights?.outcomeLabel ?? "Очікує сигналу"}</strong><small>BK-1001 · з audit trail</small></article><article><span>Час до hold</span><strong>{formatDuration(insights?.timeToHoldSeconds ?? null)}</strong><small>від прийнятої події</small></article><article><span>AI-інтерпретацій</span><strong>{insights?.aiInterpretations ?? 0}</strong><small>потреба пасажира з чату</small></article><article><span>Ручні рішення</span><strong>{insights?.manualDecisions ?? 0}</strong><small>{insights?.escalated ? "є ескалація" : "автоматичний шлях"}</small></article></section>
    <section className="dashboard-grid"><article className="panel queue-panel"><div className="panel-heading"><div><p className="panel-label">ЧЕРГА ІНЦИДЕНТІВ</p><h2>Активні case</h2></div><span className="count-chip">4</span></div><div className="case-queue">{demoQueue.map((item) => <button className={`queue-case ${item.urgency} ${selectedId === item.id ? "selected" : ""}`} key={item.id} onClick={() => setSelectedId(item.id)}><div><p className="queue-id">{item.id}</p><strong>{item.route}</strong><small>{item.disruption}</small></div><div><span className="queue-impact">{item.impact}</span><em>{item.status}</em></div></button>)}</div></article>
      <article className="panel case-detail"><div className="panel-heading"><div><p className="panel-label">CASE · {selected.id}</p><h2>{selected.route}</h2></div><span className={`state-chip ${selected.urgency}`}>{caseTitle}</span></div><div className="detail-summary"><div><span>Подія</span><strong>{isLive && data ? `Затримка · ревізія ${event?.source_revision ?? "—"}` : selected.disruption}</strong></div><div><span>Вплив</span><strong>{selected.impact}</strong></div><div><span>Наступна дія</span><strong>{isLive ? (data ? "Надіслати варіанти пасажиру" : "Оцінити пересадку") : selected.status}</strong></div></div>{isLive ? <><div className="case-actions"><a className="primary link-button" href="/passenger">Відкрити пасажирський портал</a><a className="secondary-button" href="/agent">Перевірити оператором</a></div><div className="timeline compact">{audit.length ? audit.map((item, index) => <div key={`${item.event_type}-${item.created_at}-${index}`}><i>{index + 1}</i><span><strong>{auditLabel[item.event_type ?? ""] ?? item.event_type}</strong><br /><small>{typeof item.safe_summary === "string" ? item.safe_summary : "Запис з журналу case"}</small></span></div>) : <div><i>1</i><span><strong>Case очікує оцінки</strong><br /><small>Оновіть інциденти, щоб отримати актуальний статус.</small></span></div>}</div></> : <div className="case-placeholder"><strong>Case у черзі</strong><p>Пасажир отримає пропозицію після автоматичної оцінки або ручної перевірки оператора.</p></div>}</article>
    </section>
  </main>;
}
