import { getStore } from "@netlify/blobs";
import { requireOwner, unauthorized, verifySameOrigin } from "../lib/auth.mjs";

const store = () => getStore({ name: "aichamiyaa-command-centre", consistency: "strong" });
const defaults = { manualOpportunities: [], businesses: [], proposalCount: 0, updatedAt: null };

async function readState() {
  return { ...defaults, ...((await store().get("owner-state", { type: "json" })) || {}) };
}

export default async function handler(request, context) {
  if (!(await requireOwner(context))) return unauthorized();
  if (request.method === "GET") return Response.json(await readState(), { headers: { "cache-control": "no-store" } });
  if (request.method !== "PUT" || !verifySameOrigin(request)) return new Response("Method not allowed", { status: 405, headers: { allow: "GET, PUT" } });
  const incoming = await request.json();
  const state = {
    manualOpportunities: Array.isArray(incoming.manualOpportunities) ? incoming.manualOpportunities.slice(0, 1000) : [],
    businesses: Array.isArray(incoming.businesses) ? incoming.businesses.slice(0, 1000) : [],
    proposalCount: Math.max(0, Number(incoming.proposalCount) || 0),
    updatedAt: new Date().toISOString()
  };
  await store().setJSON("owner-state", state);
  return Response.json(state, { headers: { "cache-control": "no-store" } });
}
