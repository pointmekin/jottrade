// Web Crypto instead of @google-cloud/storage, which does not run on Workers.
// URLs are path-style, so the bucket must not enforce virtual-hosted-style only.

const STORAGE_HOST = "storage.googleapis.com";

function requireEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set.`);
	return value;
}

const bucketName = () => requireEnv("GCP_BUCKET_NAME");

export const publicObjectUrl = (objectName: string) =>
	`https://${STORAGE_HOST}/${bucketName()}/${objectName}`;

type ServiceAccount = {
	client_email: string;
	private_key: string;
};

function parseServiceAccount(): ServiceAccount {
	const raw = atob(requireEnv("GCP_SERVICE_ACCOUNT_KEY"));
	return JSON.parse(raw);
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
	// The service account JSON stores the PEM with escaped newlines.
	const normalized = pem.replace(/\\n/g, "\n");
	const body = normalized
		.replace(/-----BEGIN PRIVATE KEY-----/, "")
		.replace(/-----END PRIVATE KEY-----/, "")
		.replace(/\n/g, "")
		.trim();
	const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
	return crypto.subtle.importKey(
		"pkcs8",
		der,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"],
	);
}

function hexEncode(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

async function sha256Hex(data: string): Promise<string> {
	const buf = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(data),
	);
	return hexEncode(buf);
}

/** A v4 signed PUT URL for a direct browser upload. GCP caps `expiresInSeconds` at 7 days. */
export async function createSignedUploadUrl(
	objectName: string,
	contentType: string,
	expiresInSeconds = 900,
): Promise<string> {
	const bucket = bucketName();
	const sa = parseServiceAccount();
	const cryptoKey = await importPrivateKey(sa.private_key);

	const now = new Date();
	const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
	const timeStr = now.toISOString().slice(11, 19).replace(/:/g, "");
	const datetimeStr = `${dateStr}T${timeStr}Z`;
	const credentialScope = `${dateStr}/auto/storage/goog4_request`;
	const credential = `${sa.client_email}/${credentialScope}`;

	// GCP signs the query string with its parameters sorted by key.
	const qp = (
		[
			["X-Goog-Algorithm", "GOOG4-RSA-SHA256"],
			["X-Goog-Credential", credential],
			["X-Goog-Date", datetimeStr],
			["X-Goog-Expires", String(expiresInSeconds)],
			["X-Goog-SignedHeaders", "content-type;host"],
		] satisfies [string, string][]
	).sort(([a], [b]) => a.localeCompare(b));

	const canonicalQuery = qp
		.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
		.join("&");

	const canonicalRequest = [
		"PUT",
		`/${bucket}/${objectName}`,
		canonicalQuery,
		`content-type:${contentType}\nhost:${STORAGE_HOST}\n`,
		"content-type;host",
		"UNSIGNED-PAYLOAD",
	].join("\n");

	const canonicalRequestHash = await sha256Hex(canonicalRequest);

	const stringToSign = [
		"GOOG4-RSA-SHA256",
		datetimeStr,
		credentialScope,
		canonicalRequestHash,
	].join("\n");

	const signatureBuffer = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		cryptoKey,
		new TextEncoder().encode(stringToSign),
	);

	return (
		`https://${STORAGE_HOST}/${bucket}/${objectName}` +
		`?${canonicalQuery}&X-Goog-Signature=${hexEncode(signatureBuffer)}`
	);
}

export async function deleteGcpObject(objectName: string): Promise<void> {
	const bucket = bucketName();
	const token = await getAccessToken();
	const encodedName = encodeURIComponent(objectName);
	const res = await fetch(
		`https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodedName}`,
		{ method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
	);
	if (!res.ok && res.status !== 404) {
		throw new Error(`GCP delete failed: ${res.status}`);
	}
}

async function getAccessToken(): Promise<string> {
	const sa = parseServiceAccount();
	const cryptoKey = await importPrivateKey(sa.private_key);

	const now = Math.floor(Date.now() / 1000);
	const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = btoa(
		JSON.stringify({
			iss: sa.client_email,
			scope: "https://www.googleapis.com/auth/devstorage.read_write",
			aud: "https://oauth2.googleapis.com/token",
			exp: now + 3600,
			iat: now,
		}),
	);
	const sigInput = `${header}.${payload}`;
	const sigBuf = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		cryptoKey,
		new TextEncoder().encode(sigInput),
	);
	// A spread of a large Uint8Array overflows the call stack on Workers.
	const sigBytes = new Uint8Array(sigBuf);
	let sigB64 = "";
	for (let i = 0; i < sigBytes.length; i++)
		sigB64 += String.fromCharCode(sigBytes[i]);
	const jwt = `${sigInput}.${btoa(sigB64)}`;

	const res = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
	});
	if (!res.ok) throw new Error(`GCP token request failed: ${res.status}`);
	const json = (await res.json()) as { access_token: string };
	return json.access_token;
}
