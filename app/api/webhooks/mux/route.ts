import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";
import { z } from "zod";

const webhookSchema = z.object({
  type: z.string(),
  data: z.object({
    id: z.string().min(1),
    asset_id: z.string().optional(),
    status: z.string().optional(),
    upload_id: z.string().optional(),
    passthrough: z.string().optional(),
    playback_ids: z.array(z.object({
      id: z.string(),
      policy: z.string()
    })).optional()
  })
});

const MAX_WEBHOOK_AGE_SECONDS = 5 * 60;

function isValidMuxSignature(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const timestamp = header.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1];
  const signatures = [...header.matchAll(/(?:^|,)v1=([a-f0-9]{64})(?:,|$)/g)].map((match) => match[1]);
  if (!timestamp || signatures.length === 0) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_WEBHOOK_AGE_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest();
  return signatures.some((signature) => {
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export async function POST(request: Request) {
  const secret = process.env.MUX_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    console.error("Mux webhook signing secret is not configured.");
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Supabase server-side credentials are not configured for the Mux webhook.");
    return NextResponse.json({ error: "Webhook storage is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!isValidMuxSignature(rawBody, request.headers.get("mux-signature"), secret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: z.infer<typeof webhookSchema>;
  try {
    event = webhookSchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  if (![
    "video.asset.created",
    "video.asset.ready",
    "video.asset.errored",
    "video.upload.asset_created",
    "video.upload.errored"
  ].includes(event.type)) {
    return NextResponse.json({ received: true });
  }

  const admin = createAdminClient();
  if (event.type === "video.upload.asset_created") {
    if (!event.data.asset_id) {
      return NextResponse.json({ error: "Upload event has no asset ID." }, { status: 400 });
    }

    const { data: linkedUpload, error } = await admin
      .from("movie_media")
      .update({ mux_asset_id: event.data.asset_id })
      .eq("mux_upload_id", event.data.id)
      .select("movie_id");
    if (error) {
      console.error("Could not link created Mux asset to its upload.", error);
      return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
    }
    if (!linkedUpload?.length) {
      return NextResponse.json({ error: "Upload not found." }, { status: 404 });
    }
    return NextResponse.json({ received: true });
  }

  if (event.type === "video.upload.errored") {
    const { data: failedUpload, error: uploadError } = await admin
      .from("movie_media")
      .select("movie_id")
      .eq("mux_upload_id", event.data.id)
      .maybeSingle();
    if (uploadError) {
      console.error("Could not resolve failed Mux upload.", uploadError);
      return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
    }
    if (!failedUpload) return NextResponse.json({ error: "Upload not found." }, { status: 404 });

    const { error } = await admin
      .from("movies")
      .update({ status: "errored" })
      .eq("id", failedUpload.movie_id);
    if (error) {
      console.error("Could not update failed movie upload status.", error);
      return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
    }
    return NextResponse.json({ received: true });
  }

  const assetReady = event.type === "video.asset.ready" || event.data.status === "ready";
  const assetErrored = event.type === "video.asset.errored" || event.data.status === "errored";
  const signedPlaybackId = event.data.playback_ids?.find((item) => item.policy === "signed")?.id;

  const mediaQuery = admin
    .from("movie_media")
    .update({
      mux_asset_id: event.data.id,
      ...(signedPlaybackId ? { mux_playback_id: signedPlaybackId } : {})
    })
    .eq("mux_asset_id", event.data.id);

  const { data: existingMedia, error: existingError } = await admin
    .from("movie_media")
    .select("movie_id")
    .eq("mux_asset_id", event.data.id)
    .maybeSingle();

  if (existingError) {
    console.error("Could not check Mux webhook idempotency.", existingError);
    return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
  }

  const uploadId = event.data.upload_id;
  const lookup = existingMedia
    ? { data: existingMedia, error: null }
    : uploadId
      ? await admin.from("movie_media").select("movie_id").eq("mux_upload_id", uploadId).maybeSingle()
      : event.data.passthrough
        ? await admin.from("movie_media").select("movie_id").eq("movie_id", event.data.passthrough).maybeSingle()
        : { data: null, error: null };

  if (lookup.error) {
    console.error("Could not resolve Mux upload metadata.", lookup.error);
    return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
  }
  if (!lookup.data) {
    console.error("Received a Mux asset event without a matching app upload.", event.data.id, uploadId, event.data.passthrough);
    return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  }

  const mediaUpdate = existingMedia
    ? await mediaQuery
    : await admin
      .from("movie_media")
      .update({
        mux_asset_id: event.data.id,
        ...(signedPlaybackId ? { mux_playback_id: signedPlaybackId } : {})
      })
      .eq("movie_id", lookup.data.movie_id);

  if (mediaUpdate.error) {
    console.error("Could not save Mux asset metadata.", mediaUpdate.error);
    return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
  }

  if (assetReady || assetErrored) {
    let hasSignedPlaybackId = Boolean(signedPlaybackId);
    if (assetReady && !hasSignedPlaybackId) {
      const { data: media, error } = await admin
        .from("movie_media")
        .select("mux_playback_id")
        .eq("movie_id", lookup.data.movie_id)
        .maybeSingle();
      if (error) {
        console.error("Could not verify the movie's signed playback ID.", error);
        return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
      }
      hasSignedPlaybackId = Boolean(media?.mux_playback_id);
    }
    const { error } = await admin
      .from("movies")
      .update({ status: assetReady && hasSignedPlaybackId ? "ready" : "errored" })
      .eq("id", lookup.data.movie_id);
    if (error) {
      console.error("Could not update movie processing status.", error);
      return NextResponse.json({ error: "Could not process webhook." }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
