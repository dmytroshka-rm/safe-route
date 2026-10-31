type BriefInput = {
  state: string;
  event: { category: string; predictedArrival: string } | null;
  options: Array<{ mode: string; conditions: string; capacity: number }>;
  constraints: { desiredArrival?: string; avoidModes?: string[] } | null;
};

function policyBrief(input: BriefInput) {
  const deadline = input.constraints?.desiredArrival ? ` Дедлайн пасажира: ${input.constraints.desiredArrival}.` : "";
  const avoids = input.constraints?.avoidModes?.length ? ` Виключено: ${input.constraints.avoidModes.join(", ")}.` : "";
  return `Подія: ${input.event?.category ?? "операційна затримка"}; пересадка потребує відновлення.${deadline}${avoids} Перевірте доступність альтернатив перед передачею пропозиції пасажиру.`;
}

export async function buildOperatorBrief(input: BriefInput): Promise<{ text: string; provider: "gemma" | "policy" }> {
  const apiKey = process.env["GEMINI_API_KEY"];
  const model = process.env["GEMMA_MODEL"] ?? "gemma-4-26b-a4b-it";
  if (!apiKey) return { text: policyBrief(input), provider: "policy" };
  const prompt = `Use only CASE_FACTS. Write one concise Ukrainian operator note, maximum 40 words: event, passenger constraint if present, and next safe action. Do not claim a booking changed and do not invent facts. CASE_FACTS=${JSON.stringify(input)}`;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(30000), body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 2048 } }) });
    if (!response.ok) return { text: policyBrief(input), provider: "policy" };
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.find((part) => !part.thought && part.text)?.text?.trim();
    if (!text || text.length > 380) return { text: policyBrief(input), provider: "policy" };
    return { text, provider: "gemma" };
  } catch { return { text: policyBrief(input), provider: "policy" }; }
}
