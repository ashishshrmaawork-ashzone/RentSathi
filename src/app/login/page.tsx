"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to sign in.");
      router.replace("/dashboard");
      router.refresh();
    } catch (loginError) {
      setError(
        loginError instanceof Error ? loginError.message : "Unable to sign in.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="login-shell">
        <section className="login-copy">
          <div className="login-brand">
            <span className="brand-mark">R</span> RentSathi
          </div>
          <h1>Property records,<br />beautifully organised.</h1>
          <p>Manage rent, documents, tenant verification and electricity in one secure workspace.</p>
          <div className="login-points">
            <span>✓ Secure tenant records</span>
            <span>✓ Rent &amp; electricity tracking</span>
            <span>✓ Property expense overview</span>
          </div>
        </section>
        <section className="login-card">
          <span className="badge">Secure owner access</span>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to manage your properties</p>
          {error && <div className="alert error" role="alert">{error}</div>}
          <form onSubmit={submit}>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input id="username" name="username" autoComplete="username" required autoFocus />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <button className="button" disabled={busy} type="submit">
              {busy ? "Signing in..." : "Login to dashboard"}
            </button>
          </form>
          <p className="login-help">Use the administrator credentials configured for this deployment.</p>
        </section>
      </div>
    </main>
  );
}
