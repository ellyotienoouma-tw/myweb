"use strict";

const STORAGE_KEY = "frame-movie-library-v1";
const movieGrid = document.querySelector("#movie-grid");
const emptyState = document.querySelector("#empty-state");
const movieCount = document.querySelector("#movie-count");
const dialog = document.querySelector("#movie-dialog");
const form = document.querySelector("#movie-form");
const playerDialog = document.querySelector("#player-dialog");
const videoPlayer = document.querySelector("#video-player");
const searchInput = document.querySelector("#search");
const sortSelect = document.querySelector("#sort");
const filters = document.querySelector("#filters");
const formError = document.querySelector("#form-error");
const playerError = document.querySelector("#player-error");

let storageLoadError = false;
let movies = loadMovies();
let activeGenre = "All";

function loadMovies() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter((movie) =>
      movie &&
      typeof movie.id === "string" &&
      typeof movie.title === "string" &&
      isAllowedUrl(movie.streamUrl) &&
      (!movie.downloadUrl || isAllowedUrl(movie.downloadUrl)) &&
      (!movie.posterUrl || isAllowedUrl(movie.posterUrl))
    );
  } catch (error) {
    console.error("Could not load the movie library.", error);
    storageLoadError = true;
    return [];
  }
}

function saveMovies() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(movies));
    return true;
  } catch (error) {
    console.error("Could not save the movie library.", error);
    formError.textContent = "Your browser could not save this movie. Check available storage and try again.";
    return false;
  }
}

function isAllowedUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function renderFilters() {
  const genres = ["All", ...new Set(movies.map((movie) => movie.genre).filter(Boolean).sort((a, b) => a.localeCompare(b)))];
  if (!genres.includes(activeGenre)) activeGenre = "All";
  filters.replaceChildren();

  genres.forEach((genre) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `filter-chip${activeGenre === genre ? " selected" : ""}`;
    button.textContent = genre;
    button.setAttribute("aria-pressed", String(activeGenre === genre));
    button.addEventListener("click", () => {
      activeGenre = genre;
      render();
    });
    filters.append(button);
  });
}

function createMovieCard(movie) {
  const article = document.createElement("article");
  article.className = "movie-card";

  const poster = document.createElement("div");
  poster.className = `poster${movie.posterUrl ? " has-image" : ""}`;
  if (movie.posterUrl) {
    poster.style.backgroundImage = `url("${movie.posterUrl.replaceAll('"', "%22")}")`;
  }

  const mark = document.createElement("span");
  mark.className = "poster-mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = movie.title.slice(0, 1).toUpperCase();
  poster.append(mark);

  const posterTitle = document.createElement("span");
  posterTitle.className = "poster-title";
  posterTitle.textContent = movie.title;
  poster.append(posterTitle);

  const actions = document.createElement("div");
  actions.className = "poster-actions";
  const watchButton = document.createElement("button");
  watchButton.className = "card-action";
  watchButton.type = "button";
  watchButton.setAttribute("aria-label", `Play ${movie.title}`);
  watchButton.title = "Play movie";
  watchButton.textContent = "▶";
  watchButton.addEventListener("click", () => playMovie(movie));
  actions.append(watchButton);

  if (movie.downloadUrl) {
    const downloadLink = document.createElement("a");
    downloadLink.className = "card-action";
    downloadLink.href = movie.downloadUrl;
    downloadLink.setAttribute("aria-label", `Download ${movie.title}`);
    downloadLink.title = "Download movie";
    downloadLink.textContent = "↓";
    downloadLink.setAttribute("download", "");
    actions.append(downloadLink);
  }
  poster.append(actions);
  article.append(poster);

  const meta = document.createElement("div");
  meta.className = "movie-meta";
  const title = document.createElement("h3");
  title.textContent = movie.title;
  meta.append(title);
  if (movie.year) {
    const year = document.createElement("span");
    year.className = "movie-year";
    year.textContent = movie.year;
    meta.append(year);
  }
  article.append(meta);

  const subtitle = document.createElement("p");
  subtitle.className = "movie-subtitle";
  subtitle.textContent = movie.genre || movie.description || "Ready to watch";
  article.append(subtitle);
  return article;
}

function render() {
  renderFilters();
  const query = searchInput.value.trim().toLocaleLowerCase();
  const visibleMovies = movies
    .filter((movie) => activeGenre === "All" || movie.genre === activeGenre)
    .filter((movie) => [movie.title, movie.genre, movie.description].filter(Boolean).join(" ").toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      if (sortSelect.value === "title") return a.title.localeCompare(b.title);
      if (sortSelect.value === "year") return (Number(b.year) || 0) - (Number(a.year) || 0);
      return b.createdAt - a.createdAt;
    });

  movieCount.textContent = String(movies.length).padStart(2, "0");
  movieGrid.replaceChildren(...visibleMovies.map(createMovieCard));
  emptyState.classList.toggle("visible", visibleMovies.length === 0);
  emptyState.querySelector("h3").textContent = storageLoadError
    ? "Your library couldn't be loaded."
    : movies.length ? "No movies match your search." : "Your next movie night starts here.";
  emptyState.querySelector("p").textContent = storageLoadError
    ? "Check this browser's storage permissions and reload. Your saved library was left untouched."
    : movies.length
      ? "Try another title or genre, or clear your search."
      : "Add a movie with a stream URL you own or are licensed to use. You can add a separate download link too.";
  emptyState.querySelector("button").hidden = movies.length > 0 || storageLoadError;
  document.querySelectorAll("#hero-add, #add-movie, #empty-add").forEach((button) => {
    button.disabled = storageLoadError;
  });
}

function openAddDialog() {
  formError.textContent = "";
  dialog.showModal();
  form.elements.title.focus();
}

function playMovie(movie) {
  playerError.textContent = "";
  videoPlayer.pause();
  videoPlayer.src = movie.streamUrl;
  document.querySelector("#player-title").textContent = movie.title;
  playerDialog.showModal();
  videoPlayer.play().catch((error) => {
    if (error.name !== "NotAllowedError") {
      playerError.textContent = "Playback could not start. Check the media URL, file format, and host permissions.";
    }
  });
}

document.querySelector("#hero-add").addEventListener("click", openAddDialog);
document.querySelector("#add-movie").addEventListener("click", openAddDialog);
document.querySelector("#empty-add").addEventListener("click", openAddDialog);
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#close-player").addEventListener("click", () => playerDialog.close());
searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);

document.querySelector(".search-box kbd").addEventListener("click", () => searchInput.focus());
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault();
    searchInput.focus();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  formError.textContent = "";
  const data = new FormData(form);
  const movie = {
    id: crypto.randomUUID(),
    title: String(data.get("title")).trim(),
    year: String(data.get("year")).trim(),
    genre: String(data.get("genre")).trim(),
    streamUrl: String(data.get("streamUrl")).trim(),
    downloadUrl: String(data.get("downloadUrl")).trim(),
    posterUrl: String(data.get("posterUrl")).trim(),
    description: String(data.get("description")).trim(),
    createdAt: Date.now()
  };

  if (!movie.title || !isAllowedUrl(movie.streamUrl)) {
    formError.textContent = "Enter a title and a valid HTTP or HTTPS stream URL.";
    return;
  }
  if ((movie.downloadUrl && !isAllowedUrl(movie.downloadUrl)) || (movie.posterUrl && !isAllowedUrl(movie.posterUrl))) {
    formError.textContent = "Optional URLs must also be valid HTTP or HTTPS links.";
    return;
  }

  movies = [movie, ...movies];
  if (!saveMovies()) {
    movies = movies.filter((item) => item.id !== movie.id);
    return;
  }
  form.reset();
  activeGenre = "All";
  dialog.close();
  render();
});

videoPlayer.addEventListener("error", () => {
  if (videoPlayer.error) {
    playerError.textContent = "The video could not be loaded. Check that the URL is reachable and the format is supported on this device.";
  }
});

playerDialog.addEventListener("close", () => {
  videoPlayer.pause();
  videoPlayer.removeAttribute("src");
  videoPlayer.load();
});

render();
