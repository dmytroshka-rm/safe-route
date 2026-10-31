export type DemoQueueCase = {
  id: string;
  route: string;
  disruption: string;
  impact: string;
  status: string;
  urgency: "critical" | "warning" | "normal";
  live?: boolean;
};

// UI-only scenarios. They make the demo queue legible; only BK-1001 is backed by the live API workflow.
export const demoQueue: DemoQueueCase[] = [
  { id: "BK-1001", route: "Київ → Львів → Ужгород", disruption: "Повітряна тривога · +4 год", impact: "Пропущена пересадка", status: "Варіанти знайдено", urgency: "critical", live: true },
  { id: "BK-2048", route: "Перемишль → Львів", disruption: "Черга на кордоні · +90 хв", impact: "Ризик запізнення на подію", status: "Очікує оцінки", urgency: "warning" },
  { id: "BK-1876", route: "Одеса → Київ", disruption: "Зміна платформи", impact: "Пасажира повідомлено", status: "Без дії", urgency: "normal" },
  { id: "BK-3152", route: "Варшава → Київ", disruption: "Затримка рейсу · +2 год", impact: "Потрібен готель", status: "Оператор перевіряє", urgency: "warning" }
];
