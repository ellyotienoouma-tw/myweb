# Frame

Frame is a responsive movie app foundation for content you own or are licensed to distribute. The Next.js app uses Supabase Auth and Postgres for accounts and entitlements, Mux signed HLS playback, and private Supabase Storage objects for authorized downloads. The original `index.html` remains a local-only UI prototype; use the Next.js app for development.

## Local setup

### Downloads and accounts

- **Node.js (includes npm):** download the current LTS installer from [nodejs.org/en/download](https://nodejs.org/en/download/). Use Node.js 20.9 or newer. After installation, reopen your terminal and check `node --version` and `npm --version`.
- **Supabase:** create a cloud project at [supabase.com/dashboard](https://supabase.com/dashboard/). Supabase is an online service; you do not need to download it. Its project settings provide the URL and publishable key used by the app.
- **Mux:** create an account at [dashboard.mux.com](https://dashboard.mux.com/). Mux is also an online service, not an app to install. Its dashboard provides API credentials, signing keys, and webhook settings.
- **Next.js and the other app packages:** these are installed into the project by `npm install`; you don't need to download them separately.

### Start the app

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Configure the Supabase project URL, publishable key, and service-role key. The service-role key is server-only and must never use a `NEXT_PUBLIC_` prefix.
4. Configure Mux API token ID/secret, a signing key ID, the base64-encoded PEM private key, and a webhook signing secret. Set `APP_ORIGIN` to the exact browser origin that will perform uploads (`http://localhost:3000` for local development).
5. Apply `supabase/migrations/202611050001_initial_schema.sql` to the Supabase project.
6. Create a Mux webhook pointing at `/api/webhooks/mux` for `video.upload.asset_created`, `video.upload.errored`, `video.asset.created`, `video.asset.ready`, and `video.asset.errored`.
7. Assign the `admin` value in an administrator account's Supabase Auth **app metadata** (`{"role":"admin"}`). The UI and server endpoints check this server-verified metadata; never assign admin roles from user-editable metadata.
8. Start the development server with `npm run dev`.

The app's home page explains setup when public Supabase configuration is missing. Mux credentials and the Supabase service-role key are required for playback/download/admin APIs.

## Data and access model

- `movies` stores catalog metadata. Row-level security lets signed-in users read only assigned movies.
- `movie_access` records per-user entitlement and whether downloads are licensed.
- `movie_media` stores Mux IDs and private download object keys. It is inaccessible to browser clients; server routes use the service-role client only after verifying the signed-in user's entitlement.
- Playback URLs are short-lived Mux JWTs. Download URLs are private-storage signed URLs valid for five minutes.
- New accounts have no movie access by default. An administrator must populate catalog/media records and grant access. Do this only through a trusted server/admin workflow, never by exposing the service-role key in the browser.
- The admin page creates a Mux direct-upload URL and sends the selected file from the browser directly to Mux. Mux's signed `video.asset.ready` event enables playback only after processing has completed.
- Admins can grant or revoke streaming access for signed-up viewers by email. Download permission is a separate per-viewer setting; enabling it requires licensed download rights and an uploaded object in the private storage bucket.
- The upload form confirms distribution rights. For a licensed download, separately upload the downloadable file into the private `movie-downloads` bucket, add its object key to `movie_media`, then grant that user `can_download = true`.

For an initial admin-managed catalog, upload the licensed video to Mux with a signed playback ID and (if downloads are licensed) upload the source file to the private `movie-downloads` bucket. Then, in Supabase's trusted SQL editor, create the movie and its private media mapping:

```sql
with new_movie as (
  insert into public.movies (title, year, genre, description, status)
  values ('Licensed film title', 2025, 'Drama', 'Short synopsis', 'ready')
  returning id
)
insert into public.movie_media (movie_id, mux_asset_id, mux_playback_id, download_object_key)
select id, 'MUX_ASSET_ID', 'MUX_SIGNED_PLAYBACK_ID', 'licensed/film.mp4'
from new_movie
returning movie_id;
```

Grant a signed-up user access separately, using the movie UUID returned by the insert above and their Supabase Auth user UUID:

```sql
insert into public.movie_access (movie_id, user_id, can_download)
values ('MOVIE_UUID', 'AUTH_USER_UUID', true);
```

Use `false` for `can_download` unless the license permits it. Leave `download_object_key` null when downloads are not available.

## Current boundaries

- Billing, DRM, automated download-file ingestion, and production deployment are not implemented yet.
- The download route provides an authorized file download; reliable protected offline playback requires native apps and platform-specific DRM/download handling.
- Supabase Storage project limits still apply. The private download bucket is intended for content whose licenses allow downloading.
- Browser/device support varies. The app uses HLS.js where the browser lacks native HLS; test the target desktop, mobile, and TV browsers before release.
- Use only movie files and artwork you own or are authorized to distribute.
