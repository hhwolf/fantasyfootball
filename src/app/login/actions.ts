"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { checkPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_MS } from "@/lib/auth/session";
import { env } from "@/lib/env";

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");
  if (!checkPassword(password, env().APP_PASSWORD)) return { error: "Wrong password." };
  const token = await createSessionToken(env().SESSION_SECRET);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  redirect(next.startsWith("/") ? next : "/");
}

export async function logoutAction() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
