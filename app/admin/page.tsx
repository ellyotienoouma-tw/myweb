import Link from "next/link";
import { AdminAccessForm } from "@/components/admin-access-form";
import { AdminUploadForm } from "@/components/admin-upload-form";
import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { user, error } = await getAdminUser();
  if (error) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <h1>Could not verify your session.</h1>
          <p>Check Supabase Auth configuration and reload.</p>
        </section>
      </main>
    );
  }
  if (!user) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <p className="eyebrow section-eyebrow">ADMIN ACCESS</p>
          <h1>This area is restricted.</h1>
          <p>Sign in with an account that has the admin role assigned in Supabase Auth app metadata.</p>
          <Link className="button button-primary" href="/login">Sign in</Link>
        </section>
      </main>
    );
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <p className="eyebrow section-eyebrow">ADMIN SETUP</p>
          <h1>Catalog tools aren't configured.</h1>
          <p>Set the server-side Supabase service-role key and project URL, then reload.</p>
        </section>
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: movies, error: movieError } = await admin
    .from("movies")
    .select("id,title,status,created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/"><span className="brand-mark" aria-hidden="true">F</span><span>FRAME</span></a>
        <Link className="nav-link" href="/">Back to library</Link>
      </header>
      <main className="admin-layout">
        <section>
          <p className="eyebrow section-eyebrow">CATALOG MANAGEMENT</p>
          <h1 className="admin-title">Add a licensed movie</h1>
          <p className="admin-intro">Uploads are sent directly to Mux and processed for adaptive streaming. Downloads remain disabled until you grant an entitled user an explicit download right.</p>
          <AdminUploadForm />
        </section>
        <section className="admin-movies">
          <p className="eyebrow section-eyebrow">LATEST</p>
          <h2>Recent uploads</h2>
          {movieError ? (
            <p className="api-error" role="alert">Couldn’t load upload status.</p>
          ) : !movies?.length ? (
            <p className="admin-intro">No movies have been added.</p>
          ) : (
            <ul>
              {movies.map((movie) => (
                <li key={movie.id}>
                  <span>{movie.title}</span>
                  <span className={`upload-status status-${movie.status}`}>{movie.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="admin-access">
          <p className="eyebrow section-eyebrow">VIEWER ACCESS</p>
          <h2>Manage access</h2>
          <p className="admin-intro">Grant streaming access to a signed-up viewer, set download permission per license, or revoke access.</p>
          {movieError ? (
            <p className="api-error" role="alert">Couldn’t load movies for access management.</p>
          ) : (
            <AdminAccessForm movies={movies ?? []} />
          )}
        </section>
      </main>
    </>
  );
}
