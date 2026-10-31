import { db } from "@/platform/database";

export const DEMO_CASE_ID = "case-1001";
export const DEMO_SESSION_ID = "sess-demo-001";
export const DEMO_OPERATOR_SESSION_ID = "ops-demo-001";

export async function seedDemo() {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE audit_entries, reservations, disruption_events, passenger_sessions, operator_sessions, recovery_constraints, recovery_options, recovery_cases, bookings, country_profiles CASCADE");
    await client.query("INSERT INTO country_profiles VALUES ($1,$2,$3,$4)", ["UA", JSON.stringify(["SAFETY_ALERT","BORDER_DELAY","OPERATIONAL_DELAY"]), JSON.stringify(["train","bus","overnight"]), JSON.stringify({ name: "Ukraine" })]);
    await client.query("INSERT INTO bookings (booking_id, passenger_id, itinerary) VALUES ($1,$2,$3)", ["BK-1001", "P-001", JSON.stringify({ legs: [{ id:"SR-101", from:"Kyiv", to:"Lviv", departure:"08:00", scheduledArrival:"13:00" }, { id:"SR-205", from:"Lviv", to:"Uzhhorod", departure:"14:00", scheduledArrival:"19:30" }] })]);
    await client.query("INSERT INTO recovery_cases (case_id,booking_id,country_code,state,correlation_id) VALUES ($1,$2,$3,'AT_RISK',$4)", [DEMO_CASE_ID, "BK-1001", "UA", "corr-1001"]);
    await client.query("INSERT INTO passenger_sessions VALUES ($1,$2,$3,true)", [DEMO_SESSION_ID, "P-001", DEMO_CASE_ID]);
    await client.query("INSERT INTO operator_sessions VALUES ($1,$2,$3,true)", [DEMO_OPERATOR_SESSION_ID, "OP-007", "support_agent"]);
    await client.query("INSERT INTO disruption_events VALUES ($1,$2,$3,$4,$5,NOW())", ["evt-9001", DEMO_CASE_ID, "SAFETY_ALERT", "2026-10-31T17:00:00Z", 17]);
    const options = [
      ["OPT-BUS-01", "bus", { from:"Lviv", to:"Uzhhorod", departure:"17:20", arrival:"21:50" }, "Partner bus · arrives before 23:00", 2],
      ["OPT-FAST-01", "train", { from:"Lviv", to:"Uzhhorod", departure:"17:30", arrival:"22:15" }, "Same class · 1 seat", 1],
      ["OPT-REST-01", "overnight", { from:"Lviv", to:"Uzhhorod", departure:"06:30", arrival:"11:30 next day" }, "Overnight stay included", 3]
    ];
    for (const [id, mode, itinerary, conditions, capacity] of options) await client.query("INSERT INTO recovery_options (option_id,case_id,mode,itinerary,conditions,capacity) VALUES ($1,$2,$3,$4,$5,$6)", [id, DEMO_CASE_ID, mode, JSON.stringify(itinerary), conditions, capacity]);
    await client.query("INSERT INTO audit_entries (case_id,correlation_id,event_type,actor,safe_summary) VALUES ($1,$2,$3,$4,$5)", [DEMO_CASE_ID, "corr-1001", "DISRUPTION_ACCEPTED", "system", JSON.stringify({ category:"SAFETY_ALERT", revision:17 })]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
