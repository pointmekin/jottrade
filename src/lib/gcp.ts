// GCP Storage v4 signed URL using Web Crypto (Cloudflare Workers compatible).
// Do NOT use @google-cloud/storage — incompatible with Workers runtime.
// Uses PATH-STYLE URLs (https://storage.googleapis.com/{bucket}/{object}).
// Ensure your GCP bucket does NOT enforce virtual-hosted-style only.

const STORAGE_HOST = 'storage.googleapis.com';

type ServiceAccount = {
  client_email: string;
  private_key: string;
};

function parseServiceAccount(): ServiceAccount {
  const raw = atob(process.env.GCP_SERVICE_ACCOUNT_KEY!);
  return JSON.parse(raw);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // PEM private_key field has literal \n — replace with actual newlines first
  const normalized = pem.replace(/\\n/g, '\n');
  const body = normalized
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
    .trim();
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

function hexEncode(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256Hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return hexEncode(buf);
}

/**
 * Creates a GCP Storage v4 signed PUT URL for direct browser upload.
 * @param objectName  e.g. "trades/{userId}/{tradeId}/{fileName}"
 * @param contentType e.g. "image/jpeg"
 * @param expiresInSeconds max 604800 (7 days); default 900 (15 min)
 */
export async function createSignedUploadUrl(
  objectName: string,
  contentType: string,
  expiresInSeconds = 900
): Promise<string> {
  const bucketName = process.env.GCP_BUCKET_NAME!;
  const sa = parseServiceAccount();
  const cryptoKey = await importPrivateKey(sa.private_key);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  const timeStr = now.toISOString().slice(11, 19).replace(/:/g, ''); // HHMMSS
  const datetimeStr = `${dateStr}T${timeStr}Z`;
  const credentialScope = `${dateStr}/auto/storage/goog4_request`;
  const credential = `${sa.client_email}/${credentialScope}`;

  // Canonical query string — params sorted alphabetically by key
  const qp: [string, string][] = [
    ['X-Goog-Algorithm', 'GOOG4-RSA-SHA256'],
    ['X-Goog-Credential', credential],
    ['X-Goog-Date', datetimeStr],
    ['X-Goog-Expires', String(expiresInSeconds)],
    ['X-Goog-SignedHeaders', 'content-type;host'],
  ].sort(([a], [b]) => a.localeCompare(b));

  const canonicalQuery = qp
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const canonicalRequest = [
    'PUT',
    `/${bucketName}/${objectName}`,
    canonicalQuery,
    `content-type:${contentType}\nhost:${STORAGE_HOST}\n`,
    'content-type;host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');

  const canonicalRequestHash = await sha256Hex(canonicalRequest);

  const stringToSign = [
    'GOOG4-RSA-SHA256',
    datetimeStr,
    credentialScope,
    canonicalRequestHash,
  ].join('\n');

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(stringToSign)
  );

  return (
    `https://${STORAGE_HOST}/${bucketName}/${objectName}` +
    `?${canonicalQuery}&X-Goog-Signature=${hexEncode(signatureBuffer)}`
  );
}

/** Deletes an object from GCP using the JSON API with a service account Bearer token. */
export async function deleteGcpObject(objectName: string): Promise<void> {
  const bucketName = process.env.GCP_BUCKET_NAME!;
  // Get an access token via the service account credentials
  const token = await getAccessToken();
  const encodedName = encodeURIComponent(objectName);
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucketName}/o/${encodedName}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`GCP delete failed: ${res.status}`);
  }
}

async function getAccessToken(): Promise<string> {
  const sa = parseServiceAccount();
  const cryptoKey = await importPrivateKey(sa.private_key);

  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }));
  const sigInput = `${header}.${payload}`;
  const sigBuf = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput)
  );
  // Use loop-based encoding — spread operator on large Uint8Array exceeds call stack in Workers
  const sigBytes = new Uint8Array(sigBuf);
  let sigB64 = '';
  for (let i = 0; i < sigBytes.length; i++) sigB64 += String.fromCharCode(sigBytes[i]);
  const jwt = `${sigInput}.${btoa(sigB64)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const json = await res.json() as { access_token: string };
  return json.access_token;
}
