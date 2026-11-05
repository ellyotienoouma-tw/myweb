import { createPlaybackToken } from "@/lib/mux";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = z.uuid();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Movie not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to play this movie." }, { status: 401 });
  }

  const { data: access, error: accessError } = await supabase
    .from("movie_access")
    .select("movie_id")
    .eq("movie_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (accessError) {
    console.error("Could not check movie playback access.", accessError);
    return NextResponse.json({ error: "Could not authorize playback." }, { status: 500 });
  }
  if (!access) {
    return NextResponse.json({ error: "Movie not found or unavailable." }, { status: 404 });
  }

  try {
    const admin = createAdminClient();
    const { data: movie, error: movieError } = await admin
      .from("movies")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    if (movieError) throw movieError;
    if (movie?.status !== "ready") {
      return NextResponse.json({ error: "Movie is still processing." }, { status: 409 });
    }

    const { data: media, error } = await admin
      .from("movie_media")
      .select("mux_playback_id")
      .eq("movie_id", id)
      .maybeSingle();
    if (error) throw error;
    if (!media?.mux_playback_id) {
      return NextResponse.json({ error: "Movie playback is not available." }, { status: 404 });
    }

    const token = await createPlaybackToken(media.mux_playback_id);
    const playbackUrl = `https://stream.mux.com/${encodeURIComponent(media.mux_playback_id)}.m3u8?token=${encodeURIComponent(token)}`;
    return NextResponse.json({ playbackUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (tokenError) {
    console.error("Could not authorize movie playback.", tokenError);
    return NextResponse.json({ error: "Playback is not configured." }, { status: 503 });
  }
}
