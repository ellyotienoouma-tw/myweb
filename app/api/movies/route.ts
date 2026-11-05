import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to view your catalog." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("movies")
    .select("id,title,year,genre,description,poster_url,status,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load the movie catalog.", error);
    return NextResponse.json({ error: "Could not load the catalog." }, { status: 500 });
  }

  const { data: access, error: accessError } = await supabase
    .from("movie_access")
    .select("movie_id,can_download")
    .eq("user_id", user.id);
  if (accessError) {
    console.error("Could not load movie access rights.", accessError);
    return NextResponse.json({ error: "Could not load movie access rights." }, { status: 500 });
  }

  const downloadRights = new Map<string, boolean>();
  access.forEach((item) => downloadRights.set(item.movie_id, item.can_download));
  const movies = data.map((movie) => ({
    ...movie,
    can_download: downloadRights.get(movie.id) ?? false
  }));
  return NextResponse.json({ movies }, { headers: { "Cache-Control": "private, no-store" } });
}
