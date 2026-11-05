import { importPKCS8, SignJWT } from "jose";

const TOKEN_LIFETIME_SECONDS = 13 * 60 * 60;

export async function createPlaybackToken(playbackId: string): Promise<string> {
  const keyId = process.env.MUX_SIGNING_KEY_ID;
  const encodedPrivateKey = process.env.MUX_SIGNING_PRIVATE_KEY_BASE64;
  if (!keyId || !encodedPrivateKey) {
    throw new Error("Mux playback signing is not configured.");
  }

  const privateKey = Buffer.from(encodedPrivateKey, "base64").toString("utf8");
  const signingKey = await importPKCS8(privateKey, "RS256");

  return new SignJWT({ aud: "v" })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setSubject(playbackId)
    .setExpirationTime(`${TOKEN_LIFETIME_SECONDS}s`)
    .sign(signingKey);
}
