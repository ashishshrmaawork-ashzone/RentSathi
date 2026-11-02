import { compare } from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/db";
import { errorResponse } from "@/lib/api-response";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session";
import { AppSettings, User } from "@/lib/models";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Username and password are required.");

  try {
    await connectToDatabase();
    const user = await User.findOne({
      username: parsed.data.username.toLowerCase(),
      isActive: true,
    }).select("+passwordHash");

    if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
      return errorResponse("The username or password is incorrect.", 401);
    }

    user.lastLogin = new Date();
    await user.save();

    const settings = await AppSettings.findOne({ key: "global" }).select(
      "sessionIdleMinutes sessionMaxHours",
    );
    const idleMinutes = settings?.sessionIdleMinutes ?? 30;
    const maxHours = settings?.sessionMaxHours ?? 8;
    const token = await createSession({
      id: user.id,
      name: user.fullName,
      username: user.username,
    }, { idleMinutes, maxHours });
    const response = NextResponse.json({
      user: { name: user.fullName, username: user.username },
    });
    response.cookies.set(
      SESSION_COOKIE,
      token,
      sessionCookieOptions(maxHours * 60 * 60),
    );
    return response;
  } catch (error) {
    console.error("Login failed:", error);
    return errorResponse("Unable to sign in right now.", 500);
  }
}
