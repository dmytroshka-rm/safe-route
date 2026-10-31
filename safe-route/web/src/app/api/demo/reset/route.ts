import { NextResponse } from "next/server";
import { DEMO_CASE_ID, DEMO_OPERATOR_SESSION_ID, seedDemo } from "@/demo-bootstrap/seed-demo";

export async function POST() {
  await seedDemo();
  const response = NextResponse.json({ caseId: DEMO_CASE_ID });
  response.cookies.set("saferoute_session", "sess-demo-001", { httpOnly: true, sameSite: "lax", path: "/" });
  response.cookies.set("saferoute_operator_session", DEMO_OPERATOR_SESSION_ID, { httpOnly: true, sameSite: "lax", path: "/" });
  return response;
}
