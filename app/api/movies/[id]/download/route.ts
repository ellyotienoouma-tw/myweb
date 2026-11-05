import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = z.uuid();
const DOWNLOAD_URL_LIFETIME_SECONDS = 5 * 60;

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Movie not found." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to download this movie." }, { status: 401 });
  }

  const { data: access, error: accessError } = await supabase
    .from("movie_access")
    .select("can_download")
    .eq("movie_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (accessError) {
    console.error("Could not check movie download rights.", accessError);
    return NextResponse.json({ error: "Could not authorize download." }, { status: 500 });
  }
  if (!access?.can_download) {
    return NextResponse.json({ error: "A download isn't licensed for this account." }, { status: 403 });
  }

  try {
    const admin = createAdminClient();
    const { data: media, error: mediaError } = await admin
      .from("movie_media")
      .select("download_object_key")
      .eq("movie_id", id)
      .maybeSingle();
    if (mediaError) throw mediaError;
    if (!media?.download_object_key) {
      return NextResponse.json({ error: "No downloadable file is available." }, { status: 404 });
    }

    const { data, error } = await admin.storage
      .from("movie-downloads")
      .createSignedUrl(media.download_object_key, DOWNLOAD_URL_LIFETIME_SECONDS, { download: true });
    if (error || !data?.signedUrl) throw error ?? new Error("Storage returned no download link.");

    return NextResponse.json({ downloadUrl: data.signedUrl }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (downloadError) {
    console.error("Could not create an authorized movie download URL.", downloadError);
    return NextResponse.json({ error: "Download is temporarily unavailable." }, { status: 503 });
  }
}
