import Link from "next/link";
import { MovieCatalog, type Movie } from "@/components/movie-catalog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );

  if (!configured) {
    return (
      <main className="setup-screen">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">F</span><span>FRAME</span>
        </a>
        <section className="setup-card">
          <p className="eyebrow section-eyebrow">PRODUCTION FOUNDATION</p>
          <h1>Bring your cinema online.</h1>
          <p>Connect Supabase and Mux to enable secure accounts, your catalog, and signed video playback.</p>
          <ol>
            <li>Create a Supabase project and run <code>supabase/migrations/202611050001_initial_schema.sql</code>.</li>
            <li>Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase settings.</li>
            <li>Configure Mux signed playback keys for protected video.</li>
          </ol>
          <p className="setup-note">Keep signing keys on the server. Never add private keys or service-role credentials to <code>NEXT_PUBLIC_</code> variables.</p>
        </section>
      </main>
    );
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) {
    console.error("Could not verify the current user.", authError);
    return (
      <main className="setup-screen">
        <section className="setup-card">
          <p className="eyebrow section-eyebrow">SIGN-IN CHECK</p>
          <h1>We couldn't verify your session.</h1>
          <p>Check your connection and Supabase Auth configuration, then reload the page.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="setup-screen">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">F</span><span>FRAME</span>
        </a>
        <section className="setup-card">
          <p className="eyebrow section-eyebrow">YOUR PERSONAL CINEMA</p>
          <h1>Great stories.<br /><span>Your screen.</span></h1>
          <p>Sign in to browse the movies available to your account.</p>
          <Link className="button button-primary" href="/login">Sign in <span aria-hidden="true">→</span></Link>
        </section>
      </main>
    );
  }

  const { data, error } = await supabase
    .from("movies")
    .select("id,title,year,genre,description,poster_url,status,created_at")
    .order("created_at", { ascending: false });

  const { data: access, error: accessError } = await supabase
    .from("movie_access")
    .select("movie_id,can_download")
    .eq("user_id", user.id);
  if (accessError) {
    console.error("Could not load movie access rights.", accessError);
  }
  const downloadRights = new Map<string, boolean>();
  (access ?? []).forEach((item) => downloadRights.set(item.movie_id, item.can_download));
  const movies = ((data ?? []) as Omit<Movie, "can_download">[]).map((movie) => ({
    ...movie,
    can_download: downloadRights.get(movie.id) ?? false
  }));

  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">F</span><span>FRAME</span>
        </a>
        {user.app_metadata.role === "admin" && <Link className="nav-link" href="/admin">Admin</Link>}
        <span className="signed-in-email">{user.email}</span>
        <form action="/auth/signout" method="post">
          <button className="button button-secondary" type="submit">Sign out</button>
        </form>
      </header>
      <main className="library-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow section-eyebrow">YOUR COLLECTION</p>
            <h1 className="catalog-title">Movies <span id="movie-count">{String(movies.length).padStart(2, "0")}</span></h1>
          </div>
        </div>
        {error || accessError ? (
          <p className="api-error" role="alert">Couldn’t load your catalog or access rights. Check the database migration and try again.</p>
        ) : (
          <MovieCatalog movies={movies} />
        )}
      </main>
      <footer className="footer">
        <span>For movies you own or are licensed to distribute.</span>
        <span>YOUR STORIES, YOUR SCREENS.</span>
      </footer>
    </>
  );
}
