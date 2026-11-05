import { getAdminUser } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const requestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  year: z.number().int().min(1888).max(2100).nullable(),
  genre: z.string().trim().max(80).nullable(),
  description: z.string().trim().max(2000).nullable(),
  posterUrl: z.url({ protocol: /^https?$/ }).nullable(),
  rightsConfirmed: z.literal(true)
});

const muxUploadSchema = z.object({
  data: z.object({
    id: z.string().min(1),
    url: z.url({ protocol: /^https?$/ })
  })
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
  const muxTokenId = process.env.MUX_TOKEN_ID;
  const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
  if (
    !origin ||
    !muxTokenId ||
    !muxTokenSecret ||
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    return NextResponse.json({ error: "Admin upload is not configured." }, { status: 503 });
  }

  let allowedOrigin: string;
  try {
    allowedOrigin = new URL(origin).origin;
  } catch {
    return NextResponse.json({ error: "APP_ORIGIN must be a valid URL." }, { status: 500 });
  }
  if (request.headers.get("origin") !== allowedOrigin) {
    return NextResponse.json({ error: "Uploads must originate from the configured app domain." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Check the movie details and confirm distribution rights." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: movie, error: movieError } = await admin
    .from("movies")
    .insert({
      title: parsed.data.title,
      year: parsed.data.year,
      genre: parsed.data.genre || null,
      description: parsed.data.description || null,
      poster_url: parsed.data.posterUrl,
      status: "processing"
    })
    .select("id")
    .single();

  if (movieError || !movie) {
    console.error("Could not create an admin movie record.", movieError);
    return NextResponse.json({ error: "Could not create the movie record." }, { status: 500 });
  }

  let muxResponse: Response;
  try {
    muxResponse = await fetch("https://api.mux.com/video/v1/uploads", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString("base64")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        cors_origin: allowedOrigin,
        timeout: 3600,
        new_asset_settings: {
          playback_policies: ["signed"],
          video_quality: "basic",
          passthrough: movie.id
        }
      }),
      cache: "no-store"
    });
  } catch (error) {
    console.error("Could not request a Mux direct-upload URL.", error);
    const { error: cleanupError } = await admin.from("movies").delete().eq("id", movie.id);
    if (cleanupError) console.error("Could not remove the movie record after Mux request failure.", cleanupError);
    return NextResponse.json({ error: "Could not connect to video hosting." }, { status: 502 });
  }

  if (!muxResponse.ok) {
    const details = await muxResponse.text();
    console.error("Mux rejected a direct-upload request.", muxResponse.status, details);
    const { error: cleanupError } = await admin.from("movies").delete().eq("id", movie.id);
    if (cleanupError) console.error("Could not remove the movie record after invalid Mux response.", cleanupError);
    return NextResponse.json({ error: "Video hosting could not create an upload." }, { status: 502 });
  }

  let muxUpload: z.infer<typeof muxUploadSchema>;
  try {
    muxUpload = muxUploadSchema.parse(await muxResponse.json());
  } catch (error) {
    console.error("Mux returned an invalid direct-upload response.", error);
    const { error: cleanupError } = await admin.from("movies").delete().eq("id", movie.id);
    if (cleanupError) console.error("Could not remove the movie record after metadata save failure.", cleanupError);
    return NextResponse.json({ error: "Video hosting returned an invalid upload response." }, { status: 502 });
  }

  const { error: mediaError } = await admin
    .from("movie_media")
    .insert({ movie_id: movie.id, mux_upload_id: muxUpload.data.id });

  if (mediaError) {
    console.error("Could not save Mux upload metadata.", mediaError);
    try {
      await fetch(`https://api.mux.com/video/v1/uploads/${encodeURIComponent(muxUpload.data.id)}`, {
        method: "DELETE",
        headers: {
          Authorization: `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString("base64")}`
        },
        cache: "no-store"
      });
    } catch (cleanupError) {
      console.error("Could not cancel an untracked Mux upload.", cleanupError);
    }
    const { error: cleanupError } = await admin.from("movies").delete().eq("id", movie.id);
    if (cleanupError) console.error("Could not remove the movie record after upload metadata save failure.", cleanupError);
    return NextResponse.json({ error: "Could not save upload state." }, { status: 500 });
  }

  return NextResponse.json(
    { movieId: movie.id, uploadUrl: muxUpload.data.url },
    { status: 201, headers: { "Cache-Control": "private, no-store" } }
  );
}
