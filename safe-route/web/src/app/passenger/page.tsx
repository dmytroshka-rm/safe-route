"use client";

import { useEffect, useState } from "react";

type RecoveryOption = { option_id: string; mode: string; itinerary: { departure?: string; arrival?: string }; conditions: string; capacity: number };
const modeMeta: Record<string, { label: string; note: string }> = {
  bus: { label: "Партнерський автобус", note: "Найшвидше прибуття сьогодні" },
  train: { label: "Швидкісний поїзд", note: "Той самий клас" },
  overnight: { label: "Нічліг + ранковий поїзд", note: "Нічліг включено" }
};

type WorkflowState = "idle" | "ready" | "holding" | "held" | "confirming" | "rebooked" | "error";
type ChatMessage = { role: "system" | "user"; text: string; provider?: "gemma" | "policy" };
type AiConstraints = { latestArrival: string | null; avoidModes: Array<"bus" | "overnight"> };
const idempotencyKey = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export default function PassengerPortalPage() {
  const [selected, setSelected] = useState("OPT-BUS-01");
  const [message, setMessage] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [workflow, setWorkflow] = useState<WorkflowState>("idle");
  const [desiredArrival, setDesiredArrival] = useState("23:00");
  const [recommendationReady, setRecommendationReady] = useState(false);
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [aiConstraints, setAiConstraints] = useState<AiConstraints | null>(null);
  const [options, setOptions] = useState<RecoveryOption[]>([]);
  const [notice, setNotice] = useState("Запустіть демо з Контрольного центру, щоб відкрити захищену сесію для квитка.");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "system", text: "Я бачу затримку вашого маршруту. До якого часу вам важливо прибути?" },
    { role: "user", text: "Мені потрібно бути в Ужгороді сьогодні до 23:00." },
    { role: "system", text: "Я підготую варіанти. Перед будь-якою зміною ми покажемо умови та попросимо підтвердження." }
  ]);

  const fail = (text: string) => { setWorkflow("error"); setNotice(text); };
  async function loadCaseOptions() {
    const response = await fetch("/api/cases/case-1001");
    if (!response.ok) return null;
    const payload = await response.json() as { case?: { state?: string }; options?: RecoveryOption[] };
    if (payload.options?.length) setOptions(payload.options);
    return payload;
  }
  useEffect(() => {
    void loadCaseOptions().then((payload) => {
      if (!payload) return;
      const state = payload.case?.state;
      if (state === "REBOOKED") { setWorkflow("rebooked"); setNotice("Квиток уже оновлено в цьому recovery-case."); }
      else if (state === "ESCALATED") { setWorkflow("error"); setNotice("Case передано оператору: автоматично придатного маршруту не знайдено."); }
      else if (state === "PROPOSAL_READY") { setWorkflow("ready"); setRecommendationReady(true); setNotice("Персональний план готовий. Ви можете утримати рекомендоване місце."); }
      else if (state === "OPTIONS_READY" || state === "AT_RISK") { setWorkflow("ready"); setNotice("Recovery-case створено. Вкажіть дедлайн — і ми підберемо план."); }
    }).catch(() => undefined);
  }, []);

  async function startDemo() {
    setWorkflow("idle"); setReservationId(null); setRecommendationReady(false); setNotice("Створюємо захищений demo-case…");
    const response = await fetch("/api/demo/reset", { method: "POST" });
    if (!response.ok) return fail("Не вдалося створити демо-сценарій.");
    await loadCaseOptions();
    setWorkflow("ready"); setNotice("Інцидент підтверджено. Вкажіть дедлайн, щоб отримати персональний план.");
  }
  async function buildRecommendation() {
    if (workflow === "idle") return startDemo();
    setWorkflow("holding"); setNotice("Зіставляємо ваш дедлайн з доступними маршрутами…");
    const response = await fetch("/api/cases/case-1001/recommend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ desiredArrival, avoidModes: aiConstraints?.avoidModes ?? [] }) });
    const body = await response.json();
    if (!response.ok || !body.ok) return fail("Немає доступного маршруту до цього часу. Case передано оператору.");
    await loadCaseOptions();
    setSelected(body.recommendedOptionId); setRecommendationReady(true); setWorkflow("ready"); setNotice("Персональний план готовий. Тепер можна утримати місце на 15 хвилин.");
  }
  async function holdSelectedOption() {
    setWorkflow("holding"); setNotice("Перевіряємо наявність та утримуємо місце…");
    const response = await fetch("/api/cases/case-1001/hold", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ optionId: selected, idempotencyKey: idempotencyKey("passenger-hold") }) });
    const body = await response.json();
    if (!response.ok || !body.ok) return fail("Цей варіант уже недоступний. Оберіть інший маршрут.");
    setReservationId(body.reservationId); setWorkflow("held"); setNotice("Місце утримано. Перевірте маршрут і підтвердьте перебронювання.");
  }
  async function confirmRebook() {
    if (!reservationId) return;
    setWorkflow("confirming"); setNotice("Підтверджуємо перебронювання…");
    const response = await fetch("/api/cases/case-1001/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reservationId, idempotencyKey: `passenger-confirm-${reservationId}` }) });
    const body = await response.json();
    if (!response.ok || !body.ok) return fail("Не вдалося підтвердити зміни. Зверніться до оператора.");
    setWorkflow("rebooked"); setNotice(`Готово. Квиток оновлено (версія ${body.bookingRevision}); дія є в журналі case.`);
  }
  async function sendChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const text = message.trim(); if (!text) return;
    if (workflow === "idle") { setNotice("Спершу запустіть демо з Контрольного центру."); return; }
    setMessage(""); setChatLoading(true); setChatMessages((items) => [...items, { role: "user", text }]);
    try {
      const response = await fetch("/api/cases/case-1001/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
      const body = await response.json();
      if (response.ok && body.proposal) {
        const proposal = body.proposal as AiConstraints;
        setAiConstraints(proposal);
        if (proposal.latestArrival) setDesiredArrival(proposal.latestArrival);
        setRecommendationReady(false);
        setNotice("Обмеження оновлено. Побудуйте персональний план, щоб policy перевірила лише сумісні маршрути.");
      }
      setChatMessages((items) => [...items, { role: "system", text: response.ok ? body.text : "Я не можу перевірити цей квиток у поточній сесії.", provider: response.ok ? body.provider : undefined }]);
    } finally { setChatLoading(false); }
  }
  const locked = ["holding", "confirming", "rebooked"].includes(workflow);
  const status = workflow === "rebooked" ? "ПЕРЕБРОНЬОВАНО" : workflow === "error" ? "ОПЕРАТОР" : workflow === "idle" ? "ОЧІКУЄ ЗАПУСКУ" : "ВІДНОВЛЕННЯ";
  const actionLabel = workflow === "idle" ? "Запустити демо-сценарій" : workflow === "held" ? "Підтвердити перебронювання" : workflow === "rebooked" ? "Квиток уже оновлено" : workflow === "holding" || workflow === "confirming" ? "Обробляємо…" : !recommendationReady ? "Побудувати персональний план" : "Утримати місце на 15 хв";
  const action = workflow === "held" ? confirmRebook : !recommendationReady ? buildRecommendation : holdSelectedOption;

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">Safe<span>Route</span></a><nav><a href="/">Контрольний центр</a><a href="/agent">Робоче місце оператора</a></nav></header>
    <section className="hero"><div><p className="eyebrow">ПАСАЖИРСЬКИЙ ПОРТАЛ · BK-1001</p><h1>Збережемо ваші плани,<br />а не лише квиток.</h1><p className="lead">Це один захищений крок у процесі SafeRoute: пасажир обирає та підтверджує варіант, а система й оператори контролюють дію.</p></div></section>
    <section className="alert-card"><div className="alert-icon">!</div><div><p className="eyebrow">ПІДТВЕРДЖЕНИЙ СТАТУС ПЕРЕВІЗНИКА</p><h2>Ваша пересадка під загрозою</h2><p>SR-101 прибуває до Львова о <strong>17:00</strong> замість 13:00. Пересадка о 14:00 недосяжна.</p></div><span className="status">{status}</span></section>
    <section className="grid">
      <article className="panel chat-panel"><p className="panel-label">ПОТРЕБИ ПАСАЖИРА</p><div className="messages">{chatMessages.map((item, index) => <div key={`${item.role}-${index}`} className={`message ${item.role}`}>{item.text}{item.provider && <small className="provider-label">{item.provider === "gemma" ? "Проаналізовано Gemma" : "Системна відповідь"}</small>}</div>)}</div><form onSubmit={sendChat}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Наприклад: до 23:00, але без автобуса" maxLength={500} disabled={chatLoading} /><button type="submit" disabled={chatLoading}>{chatLoading ? "Аналізуємо…" : "Надіслати"}</button></form><p className="implementation-note">Gemma перетворює текст на обмеження маршруту. Вона не має доступу до квитка й не виконує дій.</p></article>
      <article className="panel options-panel"><p className="panel-label">ВАРІАНТИ ВІДНОВЛЕННЯ</p><h2>Встигнути сьогодні</h2><label className="country"><span>Мій дедлайн прибуття</span><input type="time" value={desiredArrival} onChange={(event) => { setDesiredArrival(event.target.value); setRecommendationReady(false); }} disabled={locked} /></label>{aiConstraints && <div className="ai-constraints"><strong>Враховано з повідомлення</strong><span>{aiConstraints.latestArrival ? `Прибути до ${aiConstraints.latestArrival}` : "Дедлайн не вказано"}</span>{aiConstraints.avoidModes.map((mode) => <span key={mode}>Без {mode === "bus" ? "автобуса" : "нічлігу"}</span>)}</div>}<div className="option-list" style={{ marginTop: 14 }}>{options.map((option) => { const meta = modeMeta[option.mode] ?? { label: option.mode, note: option.conditions }; const recommended = recommendationReady && selected === option.option_id; return <button key={option.option_id} disabled={locked || option.capacity < 1} className={`option ${selected === option.option_id ? "selected" : ""}`} onClick={() => { setSelected(option.option_id); setRecommendationReady(false); }}><span><strong>{meta.label}</strong><small>{option.conditions} · {option.capacity} місць</small></span><span className="time">{option.itinerary.departure} → {option.itinerary.arrival}{recommended && <em>Рекомендовано</em>}</span></button>; })}</div><button className="primary" type="button" onClick={action} disabled={locked}>{actionLabel}</button><p className={`workflow-note ${workflow}`}>{notice}</p></article>
    </section>
    <section className="trust-row"><span>✓ Ваше підтвердження потрібне перед перебронюванням</span><span>✓ AI не має прямого доступу до квитка</span><span>✓ Кожна дія зберігається в журналі case</span></section>
  </main>;
}
