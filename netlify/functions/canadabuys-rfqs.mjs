import { getStore } from "@netlify/blobs";
import { requireOwner, unauthorized } from "../lib/auth.mjs";

const SOURCE_URL = "https://canadabuys.canada.ca/opendata/pub/openTenderNotice-ouvertAvisAppelOffres.csv";

const SMALL_GOODS = [
  "supply", "supplies", "office", "paper", "printing", "print", "label", "labels",
  "flag", "flags", "tool", "tools", "hardware", "padlock", "lock", "cleaning",
  "janitorial", "safety", "ppe", "glove", "gloves", "uniform", "textile", "bag",
  "bags", "packaging", "furniture", "food", "water", "kitchen", "parts", "accessories"
];

const SUITABLE_SERVICES = [
  "cleaning", "janitorial", "custodial", "printing", "print services", "document services",
  "courier", "delivery service", "mail service", "messenger service"
];

const EXCLUDED = [
  "automobile", "vehicle", "vehicles", "passenger car", "truck", "trucks", "bus", "buses",
  "heavy equipment", "excavator", "bulldozer", "wheel loader", "backhoe", "road grader",
  "construction engineering equipment", "heavy machinery", "crane", "aircraft", "helicopter",
  "locomotive", "rail car", "vessel", "shipbuilding"
];

const LARGE_COMPLEX_SERVICES = ["facility management", "facilities management", "maintenance management"];

const CANADIAN_DELIVERY = /canada|alberta|british columbia|manitoba|new brunswick|newfoundland|labrador|northwest territories|nova scotia|nunavut|ontario|prince edward island|qu[eé]bec|saskatchewan|yukon|national capital region/i;

function firstHttpUrl(value = "") {
  return value.match(/https?:\/\/[^\s,;"<>]+/i)?.[0] || "";
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ""; }
    else if (char === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += char;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function recordsFromCsv(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = rows.shift() || [];
  return rows.filter(row => row.length > 1).map(row => Object.fromEntries(headers.map((header, i) => [header, row[i] || ""])));
}

const includesAny = (text, terms) => terms.some(term => text.includes(term));

function normalize(record) {
  const title = record["title-titre-eng"];
  const description = record["tenderDescription-descriptionAppelOffres-eng"];
  const category = record["procurementCategory-categorieApprovisionnement"];
  const noticeType = record["noticeType-avisType-eng"];
  const combined = `${title} ${description} ${record["gsinDescription-nibsDescription-eng"]} ${record["unspscDescription-eng"]}`.toLowerCase();
  const serviceText = `${title} ${record["gsinDescription-nibsDescription-eng"]} ${record["unspscDescription-eng"]}`.toLowerCase();
  const isGoods = category.includes("GD") || category.toLowerCase().includes("goods");
  const isSuitableService = (category.includes("SRV") || category.includes("SRVTGD")) && includesAny(serviceText, SUITABLE_SERVICES) && !includesAny(title.toLowerCase(), LARGE_COMPLEX_SERVICES);
  const excluded = category.includes("CNST") || includesAny(combined, EXCLUDED);
  const informational = /request for information|\brfi\b|letter of interest|qualification|prequalification/i.test(`${title} ${noticeType}`);
  const deliveryRegions = record["regionsOfDelivery-regionsLivraison-eng"];
  const outsideCanada = Boolean(deliveryRegions) && !CANADIAN_DELIVERY.test(deliveryRegions);
  if ((!isGoods && !isSuitableService) || excluded || informational || outsideCanada) return null;

  const closingRaw = record["tenderClosingDate-appelOffresDateCloture"];
  const closing = closingRaw ? new Date(closingRaw) : null;
  if (!closing || Number.isNaN(closing.valueOf()) || closing <= new Date()) return null;

  let score = isGoods ? 62 : 68;
  const reasons = [isGoods ? "Government purchase of goods" : "Small-business service match"];
  if (includesAny(combined, SMALL_GOODS)) { score += 20; reasons.push("Small or practical item priority"); }
  const days = Math.ceil((closing - new Date()) / 86400000);
  if (days >= 10 && days <= 45) { score += 10; reasons.push("Workable bidding window"); }
  if (/alberta|edmonton/i.test(record["regionsOfDelivery-regionsLivraison-eng"])) { score += 8; reasons.push("Alberta delivery relevance"); }
  score = Math.min(score, 98);

  const address = [
    record["contractingEntityAddressLine-ligneAdresseEntiteContractante-eng"],
    record["contractingEntityAddressCity-entiteContractanteAdresseVille-eng"],
    record["contractingEntityAddressProvince-entiteContractanteAdresseProvince-eng"],
    record["contractingEntityAddressPostalCode-entiteContractanteAdresseCodePostal"]
  ].filter(Boolean).join(", ");

  return {
    id: record["referenceNumber-numeroReference"] || record["solicitationNumber-numeroSollicitation"],
    source: "CanadaBuys",
    title,
    referenceNumber: record["referenceNumber-numeroReference"],
    solicitationNumber: record["solicitationNumber-numeroSollicitation"],
    publicationDate: record["publicationDate-datePublication"],
    closingDate: closingRaw,
    category,
    noticeType,
    buyer: record["contractingEntityName-nomEntitContractante-eng"],
    buyerAddress: address,
    deliveryRegions,
    contactName: record["contactInfoName-informationsContactNom"],
    contactEmail: record["contactInfoEmail-informationsContactCourriel"],
    contactPhone: record["contactInfoPhone-contactInfoTelephone"],
    url: record["noticeURL-URLavis-eng"] || firstHttpUrl(record["attachment-piecesJointes-eng"]) || "https://canadabuys.canada.ca/en/tender-opportunities",
    description: description.slice(0, 900),
    fitScore: score,
    fitReason: reasons.join(" · "),
    daysRemaining: days
  };
}

export async function fetchCanadaBuysMatches() {
  const response = await fetch(SOURCE_URL, { headers: { "User-Agent": "Aichamiyaa-Supplier-RFQ-Monitor/1.0" } });
  if (!response.ok) throw new Error(`CanadaBuys returned ${response.status}`);
  const records = recordsFromCsv(await response.text());
  const unique = new Map();
  for (const opportunity of records.map(normalize).filter(Boolean)) unique.set(opportunity.id, opportunity);
  const opportunities = [...unique.values()].sort((a, b) => b.fitScore - a.fitScore || a.daysRemaining - b.daysRemaining).slice(0, 300);
  return { source: "CanadaBuys Open Tender Notices", checkedAt: new Date().toISOString(), totalReviewed: records.length, matched: opportunities.length, opportunities };
}

export default async function handler(request, context) {
  if (!(await requireOwner(context))) return unauthorized();
  try {
    const store = getStore({ name: "aichamiyaa-command-centre", consistency: "strong" });
    let result = await store.get("feeds/canadabuys", { type: "json" });
    const stale = !result?.checkedAt || Date.now() - new Date(result.checkedAt).valueOf() > 30 * 60 * 1000;
    if (stale) {
      result = await fetchCanadaBuysMatches();
      await store.setJSON("feeds/canadabuys", result);
    }
    return Response.json(result, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: "The CanadaBuys feed could not be checked right now.", detail: error.message }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" }
    });
  }
}
