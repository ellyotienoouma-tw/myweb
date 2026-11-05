"use client";

import { FormEvent, useState } from "react";

type AdminMovie = { id: string; title: string; status: string };

export function AdminAccessForm({ movies }: { movies: AdminMovie[] }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          movieId: data.get("movieId"),
          email: data.get("email"),
          action: data.get("action"),
          canDownload: data.get("canDownload") === "on"
        })
      });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error || "Could not update movie access.");
      setMessage(result.message || "Access updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update movie access.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-upload-form" onSubmit={submit}>
      <label className="field">
        <span>Movie</span>
        <select name="movieId" required defaultValue="">
          <option value="" disabled>Choose a movie</option>
          {movies.map((movie) => (
            <option value={movie.id} key={movie.id}>
              {movie.title}{movie.status === "ready" ? "" : ` (${movie.status})`}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Account email</span>
        <input name="email" type="email" maxLength={320} required placeholder="viewer@example.com" />
        <small>The viewer must have already created an account.</small>
      </label>
      <label className="license-confirmation">
        <input name="canDownload" type="checkbox" />
        <span>Allow downloads only if the movie's distribution license permits them.</span>
      </label>
      <label className="field access-action">
        <span>Action</span>
        <select name="action" defaultValue="grant">
          <option value="grant">Grant or update access</option>
          <option value="revoke">Revoke movie access</option>
        </select>
      </label>
      <p className="admin-upload-status" role="status">{message}</p>
      <button className="button button-primary" type="submit" disabled={busy || movies.length === 0}>
        {busy ? "Updating…" : "Update access"}
      </button>
    </form>
  );
}
