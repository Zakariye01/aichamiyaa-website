const COOKIE_NAME = "aichamiyaa_owner";
const encoder = new TextEncoder();

function base64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function safeEqual(left, right) {
  const a = encoder.encode(String(left));
  const b = encoder.encode(String(right));
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i % a.length] || 0) ^ (b[i % b.length] || 0);
  return difference === 0;
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export async function createSessionToken() {
  const secret = process.env.COMMAND_CENTER_SESSION_SECRET;
  if (!secret) throw new Error("COMMAND_CENTER_SESSION_SECRET is not configured");
  const payload = base64url(encoder.encode(JSON.stringify({ exp: Date.now() + 12 * 60 * 60 * 1000 })));
  return `${payload}.${await sign(payload, secret)}`;
}

export async function verifySessionToken(token = "") {
  const secret = process.env.COMMAND_CENTER_SESSION_SECRET;
  const [payload, signature] = token.split(".");
  if (!secret || !payload || !signature || !safeEqual(signature, await sign(payload, secret))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return Number(data.exp) > Date.now();
  } catch { return false; }
}

export async function requireOwner(context) {
  return verifySessionToken(context.cookies.get(COOKIE_NAME));
}

export function verifySameOrigin(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export function passwordMatches(candidate) {
  const configured = process.env.COMMAND_CENTER_PASSWORD;
  return Boolean(configured) && safeEqual(candidate, configured);
}

export function setOwnerCookie(context, token) {
  context.cookies.set({ name: COOKIE_NAME, value: token, path: "/", httpOnly: true, secure: true, sameSite: "Strict", maxAge: 43200 });
}

export function clearOwnerCookie(context) {
  context.cookies.delete({ name: COOKIE_NAME, path: "/" });
}

export const unauthorized = () => Response.json({ error: "Owner login required." }, { status: 401, headers: { "cache-control": "no-store" } });
