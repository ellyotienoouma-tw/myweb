"use client";

import { FormEvent, useState } from "react";

type CreatedUpload = { movieId: string; uploadUrl: string };

export function AdminUploadForm() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("video");
    const yearText = String(data.get("year")).trim();
    const posterText = String(data.get("posterUrl")).trim();

    try {
      if (!(file instanceof File) || file.size === 0) {
        throw new Error("Choose a video file.");
      }

      const response = await fetch("/api/admin/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: String(data.get("title")).trim(),
          year: yearText ? Number(yearText) : null,
          genre: String(data.get("genre")).trim() || null,
          description: String(data.get("description")).trim() || null,
          posterUrl: posterText || null,
          rightsConfirmed: data.get("rightsConfirmed") === "on"
        })
      });
      const body = await response.json() as { error?: string } & Partial<CreatedUpload>;
      if (!response.ok || !body.uploadUrl || !body.movieId) {
        throw new Error(body.error || "Could not create upload.");
      }

      await uploadFile(body.uploadUrl, file, (percent) => {
        setMessage(`Uploading video… ${percent}%`);
      });
      form.reset();
      setMessage("Upload received. Video processing will take a few minutes; refresh the admin page to check status.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="admin-upload-form" onSubmit={submit}>
      <label className="field">
        <span>Movie title <b>*</b></span>
        <input name="title" required maxLength={200} />
      </label>
      <div className="field-pair">
        <label className="field">
          <span>Release year</span>
          <input name="year" type="number" min={1888} max={2100} />
        </label>
        <label className="field">
          <span>Genre</span>
          <input name="genre" maxLength={80} />
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <textarea name="description" rows={3} maxLength={2000} />
      </label>
      <label className="field">
        <span>Poster image URL</span>
        <input name="posterUrl" type="url" placeholder="https://…" />
      </label>
      <label className="field">
        <span>Video file <b>*</b></span>
        <input name="video" type="file" accept="video/*,.mkv,.mov" required />
        <small>Uploads go directly from your browser to Mux; the app server does not store the video.</small>
      </label>
      <label className="license-confirmation">
        <input name="rightsConfirmed" type="checkbox" required />
        <span>I confirm I have the rights to distribute this movie. I will only enable downloads where its license allows them.</span>
      </label>
      <p className="admin-upload-status" role="status">{message}</p>
      <button className="button button-primary" type="submit" disabled={busy}>
        {busy ? "Uploading…" : "Create movie and upload"}
      </button>
    </form>
  );
}

function uploadFile(url: string, file: File, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Video host rejected the upload (${request.status}).`));
    };
    request.onerror = () => reject(new Error("Network error while uploading the video."));
    request.onabort = () => reject(new Error("Video upload was cancelled."));
    request.send(file);
  });
}
