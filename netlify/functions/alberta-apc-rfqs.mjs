import { requireOwner, unauthorized } from "../lib/auth.mjs";

const APC_SEARCH_URL =
  "https://purchasing.alberta.ca/api/opportunity/search";

const APC_POSTING_URL =
  "https://purchasing.alberta.ca/posting/";

function makePayload(limit, offset) {
  return {
    query: "",
    queryMode: "standard",
    includeEnhancedMatchIds: true,

    filter: {
      solicitationNumber: "",
      categories: [],
      statuses: [],
      agreementTypes: [],
      solicitationTypes: [],
      opportunityTypes: [],
      deliveryRegions: [],
      deliveryRegion: "",
      organizations: [],
      unspsc: [],
      postDateRange: "$$custom",
      closeDateRange: "$$custom",
      onlyBookmarked: false,
      onlyInterestExpressed: false
    },

    limit,
    offset,

    sortOptions: [
      {
        field: "PostDateTime",
        direction: "desc"
      }
    ]
  };
}

function normalize(item) {
  return {
    source: "Alberta Purchasing Connection",

    id: item.id || "",
    referenceNumber: item.referenceNumber || "",
    solicitationNumber: item.solicitationNumber || "",

    title:
      item.shortTitle ||
      item.title ||
      "Untitled APC opportunity",

    fullTitle: item.title || item.shortTitle || "",

    buyer: item.contractingOrganization || "",

    description: item.projectDescription || "",

    category: item.categoryCode || "",

    solicitationType: item.solicitationTypeCode || "",

    opportunityType: item.opportunityTypeCode || "",

    status: item.statusCode || "",

    postingDate: item.postDateTime || null,

    closingDate: item.closeDateTime || null,

    deliveryRegions: Array.isArray(item.regionOfDelivery)
      ? item.regionOfDelivery
      : [],

    commodityCodes: Array.isArray(item.commodityCodes)
      ? item.commodityCodes
      : [],

    commodityTitles: Array.isArray(item.commodityCodeTitles)
      ? item.commodityCodeTitles
      : [],

    url: item.referenceNumber
      ? `${APC_POSTING_URL}${encodeURIComponent(item.referenceNumber)}`
      : "https://purchasing.alberta.ca/search"
  };
}

async function fetchApcPage(limit, offset) {
  const response = await fetch(APC_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(makePayload(limit, offset))
  });

  if (!response.ok) {
    throw new Error(
      `APC request failed: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();

  return {
    totalCount: Number(data.totalCount) || 0,
    limit: Number(data.limit) || limit,
    offset: Number(data.offset) || offset,
    opportunities: Array.isArray(data.values)
      ? data.values.map(normalize)
      : []
  };
}

export default async function handler(request, context) {
  if (!(await requireOwner(context))) {
    return unauthorized();
  }

  if (request.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: { Allow: "GET" }
    });
  }

  try {
    const url = new URL(request.url);

    let limit = Number(url.searchParams.get("limit") || 100);
    let offset = Number(url.searchParams.get("offset") || 0);

    if (!Number.isFinite(limit) || limit < 1) {
      limit = 100;
    }

    if (!Number.isFinite(offset) || offset < 0) {
      offset = 0;
    }

    // Prevent one request from becoming too large.
    limit = Math.min(limit, 250);

    const result = await fetchApcPage(limit, offset);

    return Response.json(
      {
        source: "Alberta Purchasing Connection",
        totalCount: result.totalCount,
        limit: result.limit,
        offset: result.offset,
        nextOffset:
          result.offset + result.opportunities.length <
          result.totalCount
            ? result.offset + result.opportunities.length
            : null,
        opportunities: result.opportunities
      },
      {
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  } catch (error) {
    console.error("APC connector failed:", error);

    return Response.json(
      {
        error: "Unable to load Alberta Purchasing Connection opportunities.",
        details: error.message
      },
      { status: 500 }
    );
  }
}
