create table public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  year integer check (year between 1888 and 2100),
  genre text check (genre is null or char_length(genre) <= 80),
  description text check (description is null or char_length(description) <= 2000),
  poster_url text check (poster_url is null or poster_url ~ '^https?://'),
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'errored')),
  created_at timestamptz not null default now()
);

create table public.movie_media (
  movie_id uuid primary key references public.movies(id) on delete cascade,
  mux_upload_id text unique,
  mux_asset_id text unique,
  mux_playback_id text unique,
  download_object_key text unique
);

create table public.movie_access (
  movie_id uuid not null references public.movies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  can_download boolean not null default false,
  granted_at timestamptz not null default now(),
  primary key (movie_id, user_id)
);

create index movie_access_user_id_idx on public.movie_access(user_id);

create or replace function public.admin_user_id_by_email(lookup_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from auth.users
  where lower(email) = lower(trim(lookup_email))
  limit 1
$$;

revoke all on function public.admin_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_user_id_by_email(text) to service_role;

alter table public.movies enable row level security;
alter table public.movie_media enable row level security;
alter table public.movie_access enable row level security;

create policy "Users can view movies assigned to them"
  on public.movies for select to authenticated
  using (
    exists (
      select 1
      from public.movie_access
      where movie_access.movie_id = movies.id
        and movie_access.user_id = (select auth.uid())
    )
  );

create policy "Users can view their own movie access"
  on public.movie_access for select to authenticated
  using (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('movie-downloads', 'movie-downloads', false, null)
on conflict (id) do update set public = false;

revoke insert, update, delete on public.movies from anon, authenticated;
revoke insert, update, delete on public.movie_access from anon, authenticated;
revoke all on public.movie_media from anon, authenticated;
grant all on public.movie_media to service_role;
