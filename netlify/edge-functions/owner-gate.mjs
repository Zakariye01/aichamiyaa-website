const encoder = new TextEncoder();

function decode(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(normalized), char => char.charCodeAt(0));
}

function safeEqual(a, b) {
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) difference |= (a[i % a.length] || 0) ^ (b[i % b.length] || 0);
  return difference === 0;
}

async function valid(token = "") {
  const secret = Netlify.env.get("COMMAND_CENTER_SESSION_SECRET");
  const [payload, signature] = token.split(".");
  if (!secret || !payload || !signature) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
  if (!safeEqual(decode(signature), expected)) return false;
  try { return Number(JSON.parse(new TextDecoder().decode(decode(payload))).exp) > Date.now(); } catch { return false; }
}

export default async function handler(request, context) {
  if (await valid(context.cookies.get("aichamiyaa_owner"))) return context.next();
  return Response.redirect(new URL("/login.html", request.url), 302);
}

export const config = { path: ["/command-center", "/command-center.html"], onError: "fail" };
