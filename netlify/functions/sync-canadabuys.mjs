import { getStore } from "@netlify/blobs";
import { fetchCanadaBuysMatches } from "./canadabuys-rfqs.mjs";

export default async function handler() {
  const result = await fetchCanadaBuysMatches();
  await getStore({ name: "aichamiyaa-command-centre", consistency: "strong" }).setJSON("feeds/canadabuys", result);
  return Response.json({ ok: true, checkedAt: result.checkedAt, matched: result.matched });
}

export const config = { schedule: "@hourly" };
