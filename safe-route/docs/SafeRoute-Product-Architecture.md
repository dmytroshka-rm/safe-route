# SafeRoute: продуктова та модульна логіка MVP

**Статус:** ACCEPTED PRODUCT SCOPE — B2B2C framing, country profiles і demo scope затверджено.  
**Версія:** 0.4  
**Джерело задачі:** бриф PolyTech Code Fest «AI Customer Support Automation».  
**Технологічна умова:** Gemma є фактичним reasoning-модулем через Google GenAI API; server-side runtime зафіксований у розділі 10.  

## 1. Рішення, яке будуємо

SafeRoute — B2B2C AI-платформа для команд підтримки пасажирських перевізників і ticket marketplace. Вона допомагає пасажиру зберегти важливий план прибуття, а команді підтримки — безпечно масово відновлювати зірвані подорожі. Назва `SafeRoute` зафіксована для MVP; вона не заявляє зв'язку з будь-яким реальним перевізником.

### Люди, для яких будуємо

| Роль | Потреба | Що отримує |
|---|---|---|
| **Пасажирка Анна** | Вона має квиток, disruption і важливий дедлайн: концерт, співбесіду, лікаря чи родину. | Чат у контексті квитка, зрозумілі міжвидові альтернативи й контроль над підтвердженням. |
| **Support-оператор Олег** | Він не може вручну досліджувати кожну затримку, місце й варіант. | Operations dashboard: готовий контекст, proposal, policy, receipts, escalation й insights. |
| **Компанія-перевізник / marketplace** | Їй потрібно скоротити ручні кейси і повернути пасажиру контроль. | Вимірюваний workflow recovery, а не просто FAQ-чат. |

Пасажирський чат — не окремий універсальний бот. Він є частиною екрана квитка. Dashboard — внутрішній інструмент компанії.

### Єдиний MVP-сценарій

Пасажир їде маршрутом `Київ → Львів → Ужгород`. Перший сегмент затримано, тому пересадка стає недосяжною. SafeRoute:

1. приймає операційний статус затримки та country profile; для України головний demo-cause — операційний safety alert;
2. знаходить ризик пропуску пересадки;
3. зв'язує активну demo-сесію пасажира з його бронюванням і отримує доступні train, bus та overnight альтернативи;
4. веде короткий case-bound chat: пасажир уточнює свій важливий дедлайн прибуття й обирає варіант;
5. просить Gemma пояснити обмеження пасажира й обрати план серед наданих варіантів;
6. перевіряє план серверними правилами;
7. автоматично резервує альтернативне місце на 15 хвилин;
8. переброньовує квиток лише після явного підтвердження пасажира у чаті; якщо даних бракує, передає готове рішення агенту;
9. показує пасажиру новий маршрут і повний audit trail агенту.

Це **симульований операторський backend**. SafeRoute не інтегрується з Укрзалізницею чи автобусними перевізниками, не обробляє справжні платежі й не визначає безпеку руху.

### Country disruption profiles

Продукт не моделює «війну в країні» як висновок AI. Він приймає лише авторитетні операційні статуси, які відрізняються за country profile:

| Profile | Допустимі категорії disruption | MVP-статус |
|---|---|---|
| `UA` | `SAFETY_ALERT`, `BORDER_DELAY`, `OPERATIONAL_DELAY` | Повністю реалізований seeded demo profile. |
| `INTL` | `WEATHER`, `TECHNICAL_ISSUE`, `STRIKE`, `BORDER_DELAY` | UI/profile preview з mock taxonomy; без окремого end-to-end case. |

Пасажир може обрати країну в UI лише для вибору profile. Це не є live feed, прогнозом безпеки чи реальним міжнародним booking engine.

## 2. Продуктові межі

| У межах MVP | Поза межами MVP |
|---|---|
| Один український disruption: safety alert/операційна затримка і пропущена пересадка; border delay як тестовий fixture | Реальні дані перевізника, GPS, оплата або справжні квитки |
| Один пасажир, один маршрут, три заготовлені міжвидові альтернативи | Пошук усіх маршрутів країною або оптимізація мережі |
| 3–5 turn case-bound support chat із п'ятьма зафіксованими intent'ами | Голосовий бот, багатомовний contact center, масова обробка |
| Резервування, перебронювання, ескалація у mock backend | Універсальний FAQ про всі теми залізничного сервісу |
| Gemma пропонує структурований план з поясненням | Gemma як джерело істини про рейси, місця чи політики |
| Passenger ticket chat, operations dashboard і Support Insights для одного кейсу; selector `UA`/`INTL` | Власна CRM, billing, повна auth-система, live multi-country routing |

### Успішний результат

Пасажир бачить найкращий доступний план для свого дедлайну до того, як план поїздки зірветься. Оператор може відтворити: які факти були використані, що запропонувала Gemma, яке правило дозволило дію і що саме було змінено.

## 3. Архітектурний принцип

Використовуємо **модульний моноліт**: один застосунок, одна база даних, прямі внутрішні виклики між модулями через їхні публічні контракти. Внутрішніх HTTP-викликів, брокера повідомлень і мікросервісів у MVP немає.

```text
Country Profile ─────> Disruption Intake ───────┐
Операційний статус ──> RecoverDisruptedJourney ─┼─> Recovery Assessment ─> Recovery Catalog
Квиток + demo-сесія ─> Journey Context ──────────┤
Пасажирський чат ───> Case Conversation + Gemma ─┘                              │
                                                                          Action Policy
                                                                               │
                                           ┌───────────────────────────────────┼──────────────────────┐
                                           v                                   v                      v
                               Atomic Reservation Actions              Agent Escalation        Passenger Notice
                                           │                                   │
                                           └──────────────> Immutable Audit Trail ──> Support Insights
```

## 4. Модулі та відповідальність

### 4.0 Country Disruption Profile

**Місія:** обмежити допустимі operational categories, доступні transport modes і copy для вибраної країни, не дозволяючи моделі вигадувати локальні факти.

- Вхід: `countryCode` з ticket context або selector.
- Власний стан: profile code, дозволені `disruptionCategories`, дозволені `transportModes`, UI labels.
- Вихід: `CountryProfileSnapshot` для Disruption Intake, Recovery Catalog і Gemma Decision.
- Інваріант: profile не є live data source. Він не підтверджує факт тривоги, страйку чи затримки; це робить лише mock operator event.
- MVP: `UA` є повністю покритим demo; `INTL` — тільки preview taxonomy.

### 4.1 Workflow owner: `RecoverDisruptedJourney`

Це один прикладний use case всередині `Support Case`, а не окремий «універсальний координатор» і не набір внутрішніх HTTP-викликів. Він веде один зірваний маршрут так:

`event received → context validated → risk assessed → options generated → conversation → policy decision → hold/rebook or escalation → notification → audit`.

Workflow не приймає рішення замість policy і не змінює місця напряму: до `Reservation Actions` він звертається тільки після детермінованої перевірки policy. Кожен крок має спільний `correlationId` в audit trail.

### 4.2 Disruption Intake

**Місія:** прийняти та зберегти авторитетний операційний статус сегмента поїздки.

- Вхід: `DisruptionEvent` із mock operator feed та `CountryProfileSnapshot`.
- Власний стан: disruption ID, segment ID, прогноз прибуття, причина-категорія, час оновлення, статус джерела, `sourceRevision`.
- Вихід: `DelayUpdated` для Recovery Assessment.
- Інваріант: лише операторське джерело може змінювати прогноз затримки; текст пасажира не може цього зробити; category має бути дозволена активним country profile.
- MVP-реалізація: підготовлена UA-подія «затримка 4 години через операційний safety alert». `BORDER_DELAY` використовується у fixture для тестів.

Подія обробляється лише якщо її revision новіший за останній, а `updatedAt` не старший за `maxEventAgeSeconds` із demo-конфігурації. Застаріла чи повторна подія не може запустити hold/rebook: case отримує `STALE_DATA`, дані оновлюються або case ескалується.

### 4.3 Journey Context

**Місія:** надати мінімально потрібний контекст про маршрут і безпечно прив'язати пасажира до case.

- Вхід: booking ID із support-кейсу.
- Власний стан: itinerary, класи квитка, час пересадки, accessibility needs, `sessionId -> passengerId -> caseId`, booking revision.
- Вихід: `JourneySnapshot` без непотрібних персональних полів.
- Інваріант: модулі не читають таблиці бронювань напряму; вони отримують snapshot через контракт.
- Відмова: якщо booking не знайдено або належність booking цій demo-сесії не підтверджена, подальша автоматизація заборонена.

### 4.4 Recovery Assessment

**Місія:** детерміновано встановити, чи виник ризик зриву маршруту.

- Входи: `DisruptionEvent`, `JourneySnapshot`.
- Правило MVP: ризик є, якщо прогноз прибуття першого сегмента пізніший за відправлення пересадки мінус мінімальний transfer buffer.
- Вихід: `RecoveryCase` зі статусом `AT_RISK`, `NOT_AT_RISK` або `INSUFFICIENT_DATA`.
- Інваріант: цей модуль не обирає альтернативу, не викликає Gemma і не змінює квиток.

### 4.5 Recovery Catalog

**Місія:** повернути перелік реально доступних для demo альтернатив.

- Входи: destination, latest acceptable arrival, ticket class, accessibility constraint.
- Власний стан: заздалегідь задані варіанти, місткість, ціна/політика, умови ваучера, `optionRevision`, `availableAt`.
- Вихід: `RecoveryOption[]`.
- Інваріант: лише цей модуль є джерелом істини щодо доступності місця у demo.
- Зафіксовані типи варіантів: інший потяг, партнерський автобус, нічліг + ранковий маршрут. Вони можуть відповідати цілям «найшвидший», «найменше disruption» або «єдиний можливий»; Gemma порівнює лише актуальний catalog.

### 4.6 Case Conversation

**Місія:** вести короткий діалог, прив'язаний лише до одного RecoveryCase, і передавати Gemma поточне побажання пасажира.

- Входи: повідомлення пасажира, `RecoveryCase`, безпечний `JourneySnapshot`, поточний статус recovery action.
- Власний стан: максимум 6 повідомлень активного кейсу, actor, timestamp, зв'язаний `caseId` і `sessionId`.
- Підтримувані наміри: `ASK_STATUS`, `ASK_REASON`, `COMPARE_OPTIONS`, `DECLARE_CONSTRAINT`, `CONFIRM_OR_REJECT_PLAN`.
- Вихід: `ConversationTurn` і context slice для Gemma Decision.
- Інваріанти: історія чату не є джерелом істини про розклад; повідомлення «перебронюй зараз» саме по собі не викликає інструмент дії; дія завжди проходить через Action Policy; `CONFIRM` дійсний лише від session, прив'язаної до цього case, і лише для явно показаного option.
- Межа MVP: це реальний багатокроковий UI та пам'ять одного кейсу, але не універсальна knowledge base і не support для інших тем.

### 4.7 Gemma Decision

**Місія:** інтерпретувати звернення та оцінити надані варіанти з урахуванням контексту пасажира.

**Це один вузький агент, не multi-agent система.** Він не має права запису і не викликає side-effect інструментів.

- Авторитетні входи: `RecoveryCase`, `JourneySnapshot`, `RecoveryOption[]`, обмежений context slice з Case Conversation.
- Неавторитетний вхід: текст кожного повідомлення пасажира; він може містити помилкові твердження або prompt injection.
- Вихід — лише типізована пропозиція:

```json
{
  "schema_version": "safe-route/gemma-proposal@1",
  "intent": "recover_missed_connection",
  "passenger_reply": "short, helpful reply limited to this active case",
  "passenger_constraints": {
    "latest_arrival": "time-or-null",
    "accessibility_needs": ["declared-or-empty"],
    "preference": "earliest-arrival|lowest-disruption|unknown"
  },
  "recommended_option_id": "option-id-or-null",
  "confidence": 0.0,
  "reason": "short explanation grounded only in supplied facts",
  "needs_agent": false,
  "uncertainties": ["..."]
}
```

- Done condition: валідний структурований proposal з короткою відповіддю пасажиру або явний `needs_agent=true`.
- Заборони: не вигадувати статуси рейсів, не змінювати бронювання, не підміняти правила політики, не вважати текст пасажира доказом.
- Ліміти: максимум три model calls на case — після нових обмежень, запиту порівняння або суттєвого refresh варіантів. Після hold/rebook відповідь формується детерміновано з action receipt, без нового виклику. Кожне поле перевіряється за versioned schema; один repair-виклик для невалідного JSON дозволений, далі — Agent Escalation. Timeout, недоступність моделі, суперечливий proposal або низька confidence не виконують action.
- `confidence` — тільки сигнал triage/ескалації. Вона ніколи не авторизує hold чи rebook: це роблять лише факти, session binding і Action Policy.

### 4.8 Action Policy

**Місія:** прийняти або відхилити модельну пропозицію до будь-якої зміни стану.

- Входи: `GemmaProposal`, авторитетні `JourneySnapshot`, `RecoveryOption`, `RecoveryCase`.
- Виходи: `AUTO_HOLD_ALLOWED`, `REBOOK_ALLOWED`, `AGENT_REVIEW_REQUIRED` або `REJECTED`.
- Політика MVP:
  - `holdSeat` дозволений, якщо кейс `AT_RISK`, booking/session валідні, option актуальний і доступний, а обмеження не конфліктують; confidence моделі не є дозволом;
  - `rebookTicket` дозволений лише після активного не простроченого hold, повторної перевірки revisions та явного `CONFIRM_OR_REJECT_PLAN=CONFIRM` від прив'язаної сесії;
  - за низької confidence, суперечливих обмежень, відсутності варіантів або невалідної відповіді Gemma — лише ескалація;
  - політика перевіряється на сервері, а не через UI.
- Інваріант: модельна рекомендація ніколи не є дозволом на дію.

### 4.9 Reservation Actions

**Місія:** виконати дозволені зміни маршруту у mock backend.

- Команди: `holdSeat(caseId, optionId, expectedOptionRevision, expiresAt)`, `rebookTicket(caseId, holdId, expectedBookingRevision, expectedOptionRevision, sessionId)`, `expireHold(holdId)`.
- Власний стан: holds, ticket revision, action idempotency key, виконана дія.
- Інваріанти:
  - одна активна резервація на один `RecoveryCase`;
  - повторна команда з тим самим idempotency key не змінює стан двічі;
  - перебронювання неможливе без активного hold;
  - завершена дія повертає нову revision квитка.
- Атомарність: `holdSeat` одним переходом перевіряє revision/capacity, claim-ить місце й створює hold. `rebookTicket` одним переходом перевіряє hold, revisions, session binding і непростроченість. За mismatch повертається `STALE` без часткової зміни стану.
- Expiry: `expireHold` звільняє capacity, ставить `HOLD_EXPIRED`, додає audit event, повідомляє пасажира та переводить workflow на refresh alternatives або escalation. Прострочений hold не можна підтвердити заднім числом.
- Відмова: якщо місце стало недоступним, hold позначається `FAILED`, дані оновлюються, а case ескалується.

### 4.10 Support Case & Agent Escalation

**Місія:** дати агенту достатньо контексту для рішення без повторного ручного пошуку.

- Власний стан: текст звернення, кейс, пропозиція Gemma, policy decision, причина ескалації, агентське рішення.
- Дії агента: відхилити некоректний plan, запросити refresh, підготувати інший варіант для пасажира, надіслати пояснення.
- Межа прав: агент не має окремого `approve rebook` і не обходить явне підтвердження пасажира; це усуває два конкуруючі джерела авторизації.
- Інваріант: агент не бачить секретів моделі або непотрібних персональних даних.
- Відмова: якщо всі варіанти недоступні, кейс не закривається автоматично.

### 4.11 Passenger Notification

**Місія:** показати пасажиру зрозумілий результат, а не «внутрішній reasoning». 

- Входи: завершена дія або escalation status.
- Вихід: коротке повідомлення, новий itinerary, строк чинності hold, наступна дія пасажира.
- Інваріант: не повідомляє про перебронювання до підтвердженої server-side дії.

### 4.12 Support Insights

**Місія:** обчислити результати support-кейсу з подій системи та пояснити їх команді підтримки.

- Входи: `DisruptionEvent`, `RecoveryCase`, `PolicyDecision`, `Reservation` і `AuditEntry`.
- Обчислювані метрики: час від виявлення disruption до hold, фінальний recovery state, успішність hold/rebook, факт ескалації та її причина, кількість ручних рішень агента.
- Вихід: `CaseEffectivenessSummary` для Agent Console і demo.
- Інваріант: метрики виводяться з immutable audit entries та timestamp/receipt, а не є заздалегідь написаними маркетинговими цифрами. Кожна має source events; наприклад time-to-hold = `HOLD_CREATED.at - DISRUPTION_ACCEPTED.at`.
- Межа MVP: аналізує один case; не є повним BI-дашбордом і не робить непідтверджених заяв про заощаджені гроші чи хвилини.

### 4.13 Audit Trail

**Місія:** зробити кожне рішення пояснюваним для демо та агента.

- Зберігає: timestamp, source type, case ID, `correlationId`, policy decision, action ID, ticket/option/source revisions, тип події, безпечний payload summary, коротке пояснення Gemma, actor (`system`, `agent`, `passenger`).
- Не зберігає: повний prompt, секрети, зайвий PII або прихований model reasoning.
- Інваріант: кожна state-changing дія має перед нею policy decision та після неї action receipt.

## 5. Станова машина кейсу

```text
NEW
  -> AT_RISK
  -> OPTIONS_READY
  -> PROPOSAL_READY
  -> HOLD_ACTIVE
      -> AWAITING_PASSENGER_CONFIRMATION
          -> REBOOKED
      -> AWAITING_AGENT
      -> HOLD_EXPIRED
          -> OPTIONS_READY | ESCALATED
  -> ESCALATED
  -> RESOLVED
```

Перехід у `REBOOKED` можливий лише після активного hold, confirmation від прив'язаної сесії й позитивного server-side policy decision. `expireHold` є власником переходу до `HOLD_EXPIRED`. `ESCALATED` є нормальним безпечним результатом, а не помилкою.

## 6. Дані та контракти

| Об’єкт | Власник | Мінімальні поля | Хто може змінювати |
|---|---|---|---|
| `CountryProfile` | Country Disruption Profile | country code, allowed categories/modes, UI labels | seed/config module |
| `DisruptionEvent` | Disruption Intake | segment, predicted arrival, source status, updated at, source revision | mock operator feed |
| `JourneySnapshot` | Journey Context | booking, legs, transfer buffer, accessibility, session/case binding, booking revision | booking module |
| `RecoveryCase` | Recovery Assessment | case ID, risk state, linked booking/event | assessment module |
| `RecoveryOption` | Recovery Catalog | option ID, mode (`train|bus|overnight`), itinerary, seats, arrival, conditions, option revision | catalog module |
| `ConversationThread` | Case Conversation | case ID, session ID, bounded turns, actor, timestamp | conversation module |
| `GemmaProposal` | Gemma Decision | typed output, passenger reply, uncertainty, model label | model adapter; read-only after creation |
| `PolicyDecision` | Action Policy | decision, rule IDs, reason | policy module |
| `Reservation` | Reservation Actions | hold, expiry, ticket/option revisions, receipt | reservation module |
| `SupportCase` | Support Case | escalation reason, agent decision | agent module |
| `CaseEffectivenessSummary` | Support Insights | time-to-hold, outcome, escalation reason, manual decisions | insights module |
| `AuditEntry` | Audit Trail | event, actor, correlation ID, revisions, refs, timestamp | append-only audit module |

## 7. Trust і безпека

### Довірені межі

| Джерело | Рівень довіри | Як використовується |
|---|---|---|
| Country Profile | Авторитетне лише для дозволених категорій і UI taxonomy | Не є джерелом факту про disruption |
| Mock operator feed | Авторитетне для статусу затримки | Визначає disruption факт |
| Booking backend + seeded session | Авторитетне для маршруту, належності booking і права на дію | Дозволяє або блокує дію |
| Recovery Catalog | Авторитетне для наявності місця | Єдиний список кандидатів |
| Пасажирський чат | Недовірений | Gemma витягує побажання, не факти про операції |
| Gemma output | Недовірена пропозиція | Валідується schema + Action Policy |

### Обов’язкові контролі

1. **Least privilege:** Gemma має тільки read-only context і повертає JSON; access до `rebookTicket` їй не надається.
2. **Prompt-injection resistance:** текст клієнта позначений як дані; інструкції з нього не змінюють правила чи tool permissions.
3. **Session-bound confirmation:** UI не може підробити confirmation, session binding, booking revision або option availability; `sessionId -> passengerId -> caseId` перевіряється сервером.
4. **Idempotency:** повторний клік чи повторна доставка події не створюють двох бронювань.
5. **Data minimization:** у Gemma context передаються лише маршрут, допустимий час прибуття та accessibility needs; без реальних контактів, платіжних даних або raw identifiers. У demo — тільки synthetic data.
6. **Auditability:** кожен hold і rebook має correlation ID, decision receipt і ticket revision.
7. **Graceful failure:** model error, незрозумілий текст або відсутність альтернатив завжди ведуть в agent review, а не до довільної дії.
8. **Bounded conversation:** модель отримує лише до шести turns поточного кейсу, а не історію інших пасажирів або довільну knowledge base.
9. **Model-provider boundary:** API key зберігається лише server-side; telemetry не містить повного prompt/model response, лише safe summary, schema version і технічний статус. Retention у demo короткочасна й не заявляється як production policy.
10. **Freshness and atomicity:** action виконується лише за свіжими revisions; `STALE` або expiry не робить часткових змін і запускає refresh/escalation.

## 8. Екрани для демо

1. **Passenger Ticket Chat:** country selector, 3–5 turns про активну затримку, важливий дедлайн прибуття, train/bus/overnight альтернативи та підтвердження плану; підтримує лише п'ять зафіксованих intent'ів.
2. **Disruption Monitor:** country profile, причина затримки і пасажир, чия подорож під загрозою.
3. **Operations Dashboard:** booking snapshot, 2–3 альтернативи, структурована пропозиція Gemma, застосовані правила й escalation queue.
4. **Action Receipt:** «Seat held» або «Rebooked», оновлений itinerary, дедлайн hold, умови та ваучер за потреби.
5. **Support Insights:** time-to-hold, recovery outcome, escalation reason і manual decisions для поточного кейсу.
6. **Escalation state:** другий, заздалегідь змодельований приклад низької confidence для показу guardrail.

## 9. Demo-сценарій на 90 секунд

1. Пасажир обирає Україну та пише, що через safety-alert delay ризикує не встигнути на пересадку і має прибути до 23:00; SafeRoute відповідає статусом із наданих даних.
2. Показати UA country profile, затримку першого сегмента і червоне попередження про пересадку.
3. Пасажир уточнює, що має прибути сьогодні до 23:00; Gemma аналізує контекст і формує typed proposal.
4. Показати policy check: умови виконано, тому seat hold виконано автоматично.
5. Пасажир підтверджує варіант у чаті; система виконує перебронювання.
6. Показати updated itinerary, audit trail і Support Insights: факти → proposal → policy → receipt → outcome.
7. Коротко показати інший кейс, де AI не діє, а безпечно ескалює агенту.

## 10. Критерії готовності до реалізації

### 10.1 Остаточні рішення

| Питання | Затверджене рішення | Причина / правило |
|---|---|---|
| Runtime Gemma | Hosted Google GenAI API, SDK `@google/genai`, модель `gemma-4-26b-a4b-it` | Реальна Gemma без залежності від GPU ноутбука. Ключ існує тільки як server-side `GEMINI_API_KEY`; клієнт його не бачить. |
| Модельний контракт | `safe-route/gemma-proposal@1`, JSON only, schema validation на сервері | Поля: `intent`, `passenger_reply`, `passenger_constraints`, `recommended_option_id`, `confidence`, `reason`, `needs_agent`, `uncertainties`. `recommended_option_id` має належати поточному catalog. |
| Відмова моделі | 8 s timeout; один repair при невалідному JSON; не більше 3 normal calls/case | Після цього — `AGENT_REVIEW_REQUIRED`. Ніколи не підставляємо іншу LLM непомітно. |
| Confidence | `< 0.70` = ескалація; `>= 0.70` = лише можна продовжити policy evaluation | Confidence не авторизує hold/rebook. |
| Ризик пересадки | `AT_RISK`, коли `predictedArrival > connectionDeparture - 20 min` | Transfer buffer = 20 min. |
| Свіжість disruption | `maxEventAgeSeconds = 300`; більша revision перемагає | Повторна/застаріла подія не змінює reservation. |
| Hold | 15 min | Увесь таймер демонструється пасажиру; після expiry місце звільняється. |
| Кодова ліцензія | MIT для репозиторію; окремий `NOTICE` посилається на Gemma Terms | Відкритий код не означає, що ваги Gemma ліцензовані MIT. |

### 10.2 Зафіксовані seed data для головного demo

Усі ID, рейси, ціни й оператори нижче **вигадані**, не є даними Укрзалізниці.

| Об'єкт | Значення |
|---|---|
| Country profile | `UA`; дозволені категорії `SAFETY_ALERT`, `BORDER_DELAY`, `OPERATIONAL_DELAY`; дозволені modes `train`, `bus`, `overnight` |
| Бронювання | `BK-1001`, пасажир `P-001`, demo session `sess-demo-001` |
| Початковий маршрут | `SR-101`: Київ 08:00 → Львів 13:00; `SR-205`: Львів 14:00 → Ужгород 19:30 |
| Disruption | `evt-9001`, `SR-101`, `SAFETY_ALERT`, predicted arrival 17:00, revision 17, новіша за попередню; це створює `AT_RISK` |
| Option A — Fast train | `OPT-FAST-01`: Львів 17:30 → Ужгород 22:15, 1 місце, same-class, доплата 0 у demo |
| Option B — Partner bus | `OPT-BUS-01`: Львів 17:20 → Ужгород 21:50, 2 місця, partner bus, доплата 0 у demo |
| Option C — Rest | `OPT-REST-01`: ваучер на нічліг + Львів 06:30 → Ужгород 11:30 наступного дня, 3 місця |
| Побажання пасажира | «Мені потрібно прибути сьогодні до 23:00»; очікувана допустима Gemma recommendation — Option A |
| Очікувана дія | Policy дозволяє hold Option A; пасажир з `sess-demo-001` підтверджує; backend переброньовує `BK-1001` і повертає нову revision |

У seed data фіксуємо `optionRevision = 1` та кількість місць. Тест stale-case штучно змінює revision або вичерпує єдине місце Option A до confirmation.

### 10.3 Умови переходу до коду

- [x] Вибрано Gemma runtime, модель, модельний контракт і fallback-поведінку.
- [x] Versioned strict JSON/schema для `GemmaProposal` і правило: один repair, потім escalation.
- [x] Визначено три міжвидові `RecoveryOption` із часами, місткістю, умовами та очікуваним рішенням.
- [x] Визначено B2B2C ролі, passenger ticket chat, operations dashboard і country profiles; повний E2E scope — `UA`.
- [x] Визначено transfer buffer, freshness, hold duration, timeout і triage threshold.
- [x] П'ять підтримуваних chat intents і максимум шість збережених turns у MVP.
- [x] Резервування автоматичне; перебронювання в основному demo-кейсі потребує підтвердження пасажира.
- [x] Session-bound confirmation, один workflow owner, atomic reservation/revision checks і deterministic hold expiry входять у scope.
- [x] Бюджет Gemma: максимум три normal calls на case; після action — deterministic receipt response.
- [x] Вибрано MIT-ліцензію репозиторію та окреме посилання на Gemma Terms.

Перед першим запуском потрібні не нові продуктові рішення, а три практичні передумови: створити Google AI Studio key, покласти його в локальний `.env` як `GEMINI_API_KEY` (не комітити), мати доступ до інтернету для hosted Gemma. Якщо ключ недоступний, команда не маскує це іншою моделлю: UI показує model-unavailable → agent escalation; це все ще чесний guardrail-flow, але не замінює основне demo з реальною Gemma.

## 11. Закриті питання та чесні обмеження

- Повний механізм auth, багатокористувацька ізоляція та production retention не входять у demo; однак seeded session-binding для підтвердження є обов'язковою частиною MVP.
- Hosted API — зовнішня залежність: Gemma може бути тимчасово недоступною; у такому разі система не виконує action і ескалує case.
- Дані оператора, бронювання, місця й нічліг є local mock data. Не можна в презентації називати це інтеграцією з реальним перевізником або реальною системою квитків.
- DigitalOcean може бути доданий тільки після робочого MVP, якщо це не створить ризик для демо.

## 12. Наступний крок після погодження

Технічний пакет підготовлено: `SafeRoute-Implementation-Blueprint.md`, `SafeRoute-Model-Prompt.md` і `SafeRoute-Quality-Plan.md`. Після короткого preflight `GEMINI_API_KEY` команда починає реалізацію за Blueprint, section 10; product scope не розширюється без окремого рішення.
