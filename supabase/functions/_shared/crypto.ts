// AES-256-GCM encryption for tokens at rest (platform_connections.access_token_encrypted /
// refresh_token_encrypted). Key comes from the ENCRYPTION_KEY Supabase Function secret — a
// separate secret from the DB password / service-role key, per ADR-0002. Generate one with:
//   openssl rand -base64 32
// then: supabase secrets set ENCRYPTION_KEY=<value>

async function getKey(): Promise<CryptoKey> {
  const raw = Deno.env.get("ENCRYPTION_KEY");
  if (!raw) {
    throw new Error("ENCRYPTION_KEY secret is not set — run: supabase secrets set ENCRYPTION_KEY=$(openssl rand -base64 32)");
  }
  const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (keyBytes.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must decode to exactly 32 bytes, got ${keyBytes.length}`);
  }
  return crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Returns "<base64 iv>.<base64 ciphertext+tag>" — self-describing, no separate IV column needed. */
export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(stored: string): Promise<string> {
  const [ivB64, ctB64] = stored.split(".");
  if (!ivB64 || !ctB64) throw new Error("Malformed encrypted token");
  const key = await getKey();
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(ivB64) },
    key,
    fromBase64(ctB64)
  );
  return new TextDecoder().decode(plaintext);
}
