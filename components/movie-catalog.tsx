"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export type Movie = {
  id: string;
  title: string;
  year: number | null;
  genre: string | null;
  description: string | null;
  poster_url: string | null;
  status: "processing" | "ready" | "errored";
  can_download: boolean;
  created_at?: string;
};

export function MovieCatalog({ movies }: { movies: Movie[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [activeMovie, setActiveMovie] = useState<Movie | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [sort, setSort] = useState("recent");

  const genres = ["All", ...new Set(movies.map((movie) => movie.genre).filter((value): value is string => Boolean(value)).sort((a, b) => a.localeCompare(b)))];
  const visibleMovies = movies
    .filter((movie) => genre === "All" || movie.genre === genre)
    .filter((movie) => [movie.title, movie.genre, movie.description].filter(Boolean).join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "year") return (b.year ?? 0) - (a.year ?? 0);
      return (b.created_at ?? "").localeCompare(a.created_at ?? "");
    });

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeMovie) return;

    dialogRef.current?.showModal();
    let cancelled = false;
    hlsRef.current?.destroy();
    hlsRef.current = null;

    async function loadStream() {
      try {
        const response = await fetch(`/api/movies/${encodeURIComponent(activeMovie!.id)}/playback`);
        if (!response.ok) throw new Error("Playback is not available for this account.");
        const { playbackUrl } = await response.json() as { playbackUrl: string };
        if (cancelled) return;

        if (video!.canPlayType("application/vnd.apple.mpegurl")) {
          video!.src = playbackUrl;
          await video!.play();
        } else if (Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(playbackUrl);
          hls.attachMedia(video!);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            void video!.play().catch((error: unknown) => {
              if (!cancelled) {
                setMessage(error instanceof Error && error.name === "NotAllowedError"
                  ? "Press play to start the movie."
                  : "Video playback could not start.");
              }
            });
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setMessage("Video playback failed. Check your connection and try again.");
          });
        } else {
          throw new Error("This browser does not support HLS playback.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error && error.name === "NotAllowedError"
            ? "Press play to start the movie."
            : error instanceof Error ? error.message : "Could not start playback.");
        }
      }
    }

    void loadStream();
    return () => {
      cancelled = true;
      if (dialogRef.current?.open) dialogRef.current.close();
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [activeMovie]);

  async function downloadMovie(movie: Movie) {
    setMessage("");
    try {
      const response = await fetch(`/api/movies/${encodeURIComponent(movie.id)}/download`);
      if (!response.ok) throw new Error("A download isn't available for this movie or account.");
      const { downloadUrl } = await response.json() as { downloadUrl: string };
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = "";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start the download.");
    }
  }

  return (
    <>
      <div className="toolbar production-toolbar">
        <label className="search-box">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <span className="visually-hidden">Search your library</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles, genres..."
            autoComplete="off"
          />
        </label>
        <div className="filter-row" aria-label="Filter by genre">
          {genres.map((value) => (
            <button
              className={`filter-chip${genre === value ? " selected" : ""}`}
              type="button"
              key={value}
              aria-pressed={genre === value}
              onClick={() => setGenre(value)}
            >{value}</button>
          ))}
        </div>
        <label className="sort-control">
          <span className="visually-hidden">Sort movies</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="recent">Recently added</option>
            <option value="title">Title A–Z</option>
            <option value="year">Release year</option>
          </select>
        </label>
      </div>
      <div className="movie-grid production-grid">
        {visibleMovies.map((movie) => (
          <article className="movie-card production-card" key={movie.id}>
            <div
              className={`poster${movie.poster_url ? " has-image" : ""}`}
              style={movie.poster_url ? { backgroundImage: `url("${movie.poster_url}")` } : undefined}
            >
              {!movie.poster_url && <span className="poster-mark" aria-hidden="true">{movie.title.slice(0, 1).toUpperCase()}</span>}
              <span className="poster-title">{movie.title}</span>
            </div>
            <div className="movie-meta">
              <h2>{movie.title}</h2>
              {movie.year && <span className="movie-year">{movie.year}</span>}
            </div>
            <p className="movie-subtitle">{movie.genre || "Movie"}</p>
            {movie.description && <p className="movie-description">{movie.description}</p>}
            <div className="movie-card-actions">
              {movie.status === "ready" ? (
                <button className="button button-primary" type="button" onClick={() => {
                  setMessage("");
                  setActiveMovie(movie);
                }}>▶ Watch</button>
              ) : (
                <span className={`upload-status status-${movie.status}`}>
                  {movie.status === "errored" ? "Unavailable" : "Processing"}
                </span>
              )}
              {movie.can_download && (
                <button className="button button-secondary" type="button" onClick={() => void downloadMovie(movie)}>
                  ↓ Download
                </button>
              )}
            </div>
          </article>
        ))}
        {visibleMovies.length === 0 && (
          <p className="catalog-empty">
            {movies.length ? "No movies match your search. Try another title or genre." : "No movies are assigned to your account yet."}
          </p>
        )}
      </div>
      <p className="catalog-message" role="status">{message}</p>
      {activeMovie && (
        <dialog className="dialog player-dialog" ref={dialogRef} aria-labelledby="player-title" onClose={() => setActiveMovie(null)}>
          <div className="player-panel">
            <div className="player-heading">
              <h2 id="player-title">{activeMovie.title}</h2>
              <button className="icon-button" type="button" aria-label="Close player" onClick={() => setActiveMovie(null)}>×</button>
            </div>
            <video ref={videoRef} controls playsInline />
            <p className="player-error" role="status">{message}</p>
          </div>
        </dialog>
      )}
    </>
  );
}
