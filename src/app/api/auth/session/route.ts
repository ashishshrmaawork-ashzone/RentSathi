import { NextResponse } from "next/server";
import {
  createSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/session";
import { errorResponse } from "@/lib/api-response";

export async function POST() {
  const session = await getSession();
  if (!session) {
    const response = errorResponse("Your session expired. Please sign in again.", 401);
    response.cookies.set(SESSION_COOKIE, "", sessionCookieOptions(0));
    return response;
  }

  const now = Math.floor(Date.now() / 1000);
  const remaining = session.maxSeconds - (now - session.startedAt);
  const token = await createSession(
    { id: session.id, name: session.name, username: session.username },
    {
      idleMinutes: session.idleSeconds / 60,
      maxHours: session.maxSeconds / 3600,
      startedAt: session.startedAt,
    },
  );
  const response = NextResponse.json({ authenticated: true });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(remaining));
  return response;
}
