import { db } from "@/platform/database";

export async function hasActiveOperatorSession(sessionId: string | undefined) {
  if (!sessionId) return false;
  const result = await db.query("SELECT 1 FROM operator_sessions WHERE session_id=$1 AND active=true", [sessionId]);
  return Boolean(result.rowCount);
}
