import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rent-sathi-session";
const defaultIdleSeconds = 30 * 60;
const defaultMaxSeconds = 8 * 60 * 60;

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must contain at least 32 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: {
  id: string;
  name: string;
  username: string;
}, settings?: {
  idleMinutes: number;
  maxHours: number;
  startedAt?: number;
}) {
  const now = Math.floor(Date.now() / 1000);
  const idleSeconds = (settings?.idleMinutes ?? 30) * 60;
  const maxSeconds = (settings?.maxHours ?? 8) * 60 * 60;
  const startedAt = settings?.startedAt ?? now;
  return new SignJWT({
    name: user.name,
    username: user.username,
    startedAt,
    lastActivityAt: now,
    idleSeconds,
    maxSeconds,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt(now)
    .setExpirationTime(startedAt + maxSeconds)
    .sign(getSecret());
}

export async function getSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const secret = getSecret();

  try {
    const { payload } = await jwtVerify(token, secret);
    if (
      typeof payload.sub !== "string" ||
      typeof payload.name !== "string" ||
      typeof payload.username !== "string" ||
      typeof payload.startedAt !== "number" ||
      typeof payload.lastActivityAt !== "number" ||
      typeof payload.idleSeconds !== "number" ||
      typeof payload.maxSeconds !== "number"
    ) {
      return null;
    }
    if (Date.now() / 1000 - payload.lastActivityAt >= payload.idleSeconds) {
      return null;
    }

    return {
      id: payload.sub,
      name: payload.name,
      username: payload.username,
      startedAt: payload.startedAt,
      lastActivityAt: payload.lastActivityAt,
      idleSeconds: payload.idleSeconds,
      maxSeconds: payload.maxSeconds,
    };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = defaultMaxSeconds) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(0, maxAge),
  };
}
