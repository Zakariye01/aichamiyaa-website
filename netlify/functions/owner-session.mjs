import { clearOwnerCookie, createSessionToken, passwordMatches, setOwnerCookie, verifySameOrigin } from "../lib/auth.mjs";

export default async function handler(request, context) {
  if (!verifySameOrigin(request)) return Response.json({ error: "Origin rejected." }, { status: 403 });
  if (request.method === "DELETE") {
    clearOwnerCookie(context);
    return Response.json({ ok: true });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { allow: "POST, DELETE" } });
  try {
    const { password = "" } = await request.json();
    if (!passwordMatches(password)) return Response.json({ error: "Incorrect password." }, { status: 401, headers: { "cache-control": "no-store" } });
    setOwnerCookie(context, await createSessionToken());
    return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: "Login is not configured yet.", detail: error.message }, { status: 503 });
  }
}
