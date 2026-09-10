import { env } from "../env";

const subtle = globalThis.crypto.subtle;

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}
function bytesToB64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

async function getKey(): Promise<CryptoKey> {
  const raw = env().ENCRYPTION_KEY;
  let bytes: Uint8Array;
  if (raw) {
    bytes = b64ToBytes(raw);
    if (bytes.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  } else {
    // Dev fallback: derive from SESSION_SECRET so local runs work without extra setup.
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(env().SESSION_SECRET));
    bytes = new Uint8Array(digest);
  }
  return subtle.importKey("raw", bytes as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Returns base64(iv || ciphertext+tag). */
export async function encrypt(plain: string): Promise<string> {
  const key = await getKey();
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

export async function decrypt(payload: string): Promise<string> {
  const key = await getKey();
  const bytes = b64ToBytes(payload);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const plain = await subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(plain);
}
