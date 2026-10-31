"use client";

import { useEffect, useState } from "react";

type MonitoredCase = { case_id: string; state: string; country_code: string; booking_id: string; event_id: string; category: string; predicted_arrival: string; source_revision: number };

const secondaryEvents = [
  { id: "EV-4012", source: "BorderFlow", route: "Перемишль → Львів", event: "Затримка на кордоні", time: "10:42", status: "Новий" },
  { id: "EV-4011", source: "RailOps", route: "Одеса → Київ", event: "Зміна платформи", time: "10:31", status: "Пасажира повідомлено" },
  { id: "EV-4008", source: "PartnerBus", route: "Варшава → Київ", event: "Затримка рейсу", time: "09:54", status: "В обробці" }
];

const stateLabel: Record<string, string> = { AT_RISK: "Потребує оцінки", OPTIONS_READY: "Варіанти готові", ESCALATED: "Потрібен оператор" };

export default function MonitorPage() {
  const [cases, setCases] = useState<MonitoredCase[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadEvents() {
    setLoading(true);
    let response = await fetch("/api/operations/monitor");
    if (!response.ok) {
      await fetch("/api/demo/reset", { method: "POST" });
      response = await fetch("/api/operations/monitor");
    }
    if (response.ok) setCases((await response.json()).cases);
    setLoading(false);
  }

  useEffect(() => { void loadEvents(); }, []);

  async function assessCase() {
    const activeCase = cases[0];
    if (!activeCase) return;
    setLoading(true);
    const response = await fetch(`/api/operations/cases/${activeCase.case_id}/assess`, { method: "POST" });
    const payload = await response.json();
    if (response.ok) setCases((items) => items.map((item) => item.case_id === activeCase.case_id ? { ...item, state: payload.state } : item));
    setLoading(false);
  }

  const active = cases[0];
  return <main className="shell app-shell">
    <header className="topbar"><a className="brand" href="/">Safe<span>Route</span></a><nav><a href="/">Інциденти</a><a className="active-nav" href="/monitor">Події</a><a href="/agent">Команда</a></nav></header>
    <section className="workspace-header"><div><p className="eyebrow">ПОДІЇ</p><h1>Операційні сигнали</h1><p>Живий recovery-case створюється лише з верифікованого сигналу. Інші рядки — черга без окремого workflow.</p></div><button className="secondary-button" onClick={loadEvents} disabled={loading}>{loading ? "Оновлюємо…" : "Оновити"}</button></section>
    <section className="source-grid"><article><span className="source-dot online" /> <strong>RailOps</strong><small>Рейси та зміни розкладу</small><em>Підключено</em></article><article><span className="source-dot online" /> <strong>Safety Hub</strong><small>Операційні обмеження</small><em>Підключено</em></article><article><span className="source-dot online" /> <strong>BorderFlow</strong><small>Черги на кордоні</small><em>Підключено</em></article></section>
    <section className="panel event-panel"><div className="panel-heading"><div><p className="panel-label">СТРІЧКА ПОДІЙ</p><h2>Сьогодні</h2></div><span className="count-chip">{active ? "4 нові" : "Завантаження"}</span></div><div className="event-table"><div className="event-row event-header"><span>Час</span><span>Джерело</span><span>Маршрут</span><span>Подія</span><span>Стан</span></div>{active && <div className="event-row event-live"><span>{new Date(active.predicted_arrival).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}</span><span>Safety Hub</span><span>Київ → Львів</span><span><strong>Повітряна тривога</strong><small>Ревізія {active.source_revision} · {active.event_id}</small></span><span>{active.state === "AT_RISK" ? <button className="inline-action" onClick={assessCase} disabled={loading}>Оцінити вплив</button> : <a className="status-link" href="/agent">{stateLabel[active.state] ?? active.state}</a>}</span></div>}{secondaryEvents.map((item) => <div className="event-row" key={item.id}><span>{item.time}</span><span>{item.source}</span><span>{item.route}</span><span><strong>{item.event}</strong><small>{item.id}</small></span><span><em>{item.status}</em></span></div>)}</div>{!active && !loading && <p className="empty-state">Нових операційних подій немає.</p>}</section>
  </main>;
}
