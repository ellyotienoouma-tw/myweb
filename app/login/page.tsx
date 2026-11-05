"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: String(data.get("email")),
        password: String(data.get("password"))
      });
      if (authError) throw authError;
      window.location.assign("/");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signUp({
        email: String(data.get("email")),
        password: String(data.get("password"))
      });
      if (authError) throw authError;
      setMessage("Check your email to confirm your account, then sign in.");
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Account creation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="setup-screen">
      <Link className="brand" href="/">
        <span className="brand-mark" aria-hidden="true">F</span><span>FRAME</span>
      </Link>
      <section className="setup-card">
        <p className="eyebrow section-eyebrow">YOUR PERSONAL CINEMA</p>
        <h1>Welcome back.</h1>
        <form className="auth-form" onSubmit={signIn}>
          <label className="field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field">
            <span>Password</span>
            <input name="password" type="password" autoComplete="current-password" minLength={8} required />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <p className="auth-success" role="status">{message}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={busy}>
            {busy ? "Please wait…" : "Sign in"}
          </button>
        </form>
        <form className="signup-form" onSubmit={signUp}>
          <input name="email" type="email" autoComplete="email" aria-label="Email for new account" placeholder="Email for a new account" required />
          <input name="password" type="password" autoComplete="new-password" aria-label="Password for new account" placeholder="Create a password (8+ characters)" minLength={8} required />
          <button className="button button-secondary auth-submit" type="submit" disabled={busy}>Create account</button>
        </form>
        <p className="setup-note">New accounts have no movie access until an administrator assigns licensed titles.</p>
      </section>
    </main>
  );
}
