import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  movieId: z.uuid(),
  email: z.email().max(320).transform((email) => email.trim().toLowerCase()),
  action: z.enum(["grant", "revoke"]),
  canDownload: z.boolean()
});

export async function POST(request: Request) {
  const { user, error: authError } = await getAdminUser();
  if (authError) {
    return NextResponse.json({ error: "Could not verify your account." }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
  }

  const origin = process.env.APP_ORIGIN;
  if (!origin || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Admin access management is not configured." }, { status: 503 });
  }
  let allowedOrigin: string;
  try {
    allowedOrigin = new URL(origin).origin;
  } catch {
    return NextResponse.json({ error: "APP_ORIGIN must be a valid URL." }, { status: 500 });
  }
  if (request.headers.get("origin") !== allowedOrigin) {
    return NextResponse.json({ error: "Request must originate from the configured app domain." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the movie, email, and access settings." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: movie, error: movieError } = await admin
    .from("movies")
    .select("id")
    .eq("id", parsed.data.movieId)
    .maybeSingle();
  if (movieError) {
    console.error("Could not verify movie for access assignment.", movieError);
    return NextResponse.json({ error: "Could not verify the movie." }, { status: 500 });
  }
  if (!movie) {
    return NextResponse.json({ error: "Movie not found." }, { status: 404 });
  }

  const { data: userId, error: lookupError } = await admin.rpc("admin_user_id_by_email", {
    lookup_email: parsed.data.email
  });
  if (lookupError) {
    console.error("Could not find account for admin access assignment.", lookupError);
    return NextResponse.json({ error: "Could not look up the account." }, { status: 500 });
  }
  if (!userId) {
    return NextResponse.json({ error: "No signed-up account was found for that email." }, { status: 404 });
  }

  if (parsed.data.action === "grant" && parsed.data.canDownload) {
    const { data: media, error: mediaError } = await admin
      .from("movie_media")
      .select("download_object_key")
      .eq("movie_id", movie.id)
      .maybeSingle();
    if (mediaError) {
      console.error("Could not verify licensed movie download.", mediaError);
      return NextResponse.json({ error: "Could not verify the download file." }, { status: 500 });
    }
    if (!media?.download_object_key) {
      return NextResponse.json(
        { error: "Upload the licensed download to private storage and register its object key before enabling downloads." },
        { status: 409 }
      );
    }

    const { error: fileError } = await admin.storage
      .from("movie-downloads")
      .createSignedUrl(media.download_object_key, 60);
    if (fileError) {
      console.error("Could not verify the licensed movie file in private storage.", fileError);
      return NextResponse.json(
        { error: "The registered download file is not available in private storage." },
        { status: 409 }
      );
    }
  }

  if (parsed.data.action === "revoke") {
    const { error } = await admin
      .from("movie_access")
      .delete()
      .eq("movie_id", movie.id)
      .eq("user_id", userId);
    if (error) {
      console.error("Could not revoke movie access.", error);
      return NextResponse.json({ error: "Could not revoke movie access." }, { status: 500 });
    }
    return NextResponse.json({ message: "Movie access revoked." }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const { error: grantError } = await admin
    .from("movie_access")
    .upsert(
      { movie_id: movie.id, user_id: userId, can_download: parsed.data.canDownload },
      { onConflict: "movie_id,user_id" }
    );
  if (grantError) {
    console.error("Could not grant movie access.", grantError);
    return NextResponse.json({ error: "Could not grant movie access." }, { status: 500 });
  }

  return NextResponse.json(
    { message: parsed.data.canDownload ? "Movie access granted with downloads enabled." : "Movie access granted for streaming only." },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
