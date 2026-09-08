import { getStore } from "@netlify/blobs";
import { requireOwner, unauthorized } from "../lib/auth.mjs";

const PLACES_URL =
  "https://places.googleapis.com/v1/places:searchText";

const store = () =>
  getStore({
    name: "aichamiyaa-command-centre",
    consistency: "strong"
  });

function normalizeText(value = "") {
  return String(value).trim().toLowerCase();
}

function calculateMatchScore(place, query) {
  let score = 50;

  const name = normalizeText(place.displayName?.text);
  const types = (place.types || []).map(normalizeText);
  const queryWords = normalizeText(query)
    .split(/\s+/)
    .filter(word => word.length > 3);

  for (const word of queryWords) {
    if (name.includes(word)) score += 5;
    if (types.some(type => type.includes(word))) score += 5;
  }

  if (place.websiteUri) score += 10;
  if (place.nationalPhoneNumber) score += 5;
  if (place.formattedAddress) score += 5;

  return Math.min(score, 100);
}

function normalizeBusiness(place, query, matchedOpportunity = "") {
  return {
    id: crypto.randomUUID(),

    googlePlaceId: place.id || "",

    name: place.displayName?.text || "",

    industry:
      place.primaryTypeDisplayName?.text ||
      place.primaryType ||
      "",

    address: place.formattedAddress || "",

    location: place.formattedAddress || "",

    website: place.websiteUri || "",

    phone: place.nationalPhoneNumber || "",

    email: "",

    companySize: "Unknown",

    status: "Research",

    discoverySource: "Google Places",

    matchedOpportunity,

    matchScore: calculateMatchScore(place, query),

    outreachStatus: "Not contacted",

    lastContacted: "",

    capabilities: (place.types || []).join(", "),

    fitReason:
      `Automatically discovered for search: ${query}`,

    discoveredAt: new Date().toISOString()
  };
}

async function searchGooglePlaces(query, maxResults = 5) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY is missing.");
  }

  const safeLimit = Math.min(
    Math.max(Number(maxResults) || 5, 1),
    10
  );

  const response = await fetch(PLACES_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",

      "X-Goog-Api-Key": apiKey,

      "X-Goog-FieldMask":
        [
          "places.id",
          "places.displayName",
          "places.formattedAddress",
          "places.types",
          "places.primaryType",
          "places.primaryTypeDisplayName",
          "places.websiteUri",
          "places.nationalPhoneNumber"
        ].join(",")
    },

    body: JSON.stringify({
      textQuery: query,

      pageSize: safeLimit,

      includePureServiceAreaBusinesses: true,

      regionCode: "CA",

      languageCode: "en"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Google Places error ${response.status}: ${errorText}`
    );
  }

  return response.json();
}

function isDuplicate(existingBusinesses, candidate) {
  const candidateName = normalizeText(candidate.name);
  const candidateWebsite = normalizeText(candidate.website);
  const candidatePlaceId = candidate.googlePlaceId;

  return existingBusinesses.some(existing => {
    if (
      candidatePlaceId &&
      existing.googlePlaceId === candidatePlaceId
    ) {
      return true;
    }

    if (
      candidateWebsite &&
      normalizeText(existing.website) === candidateWebsite
    ) {
      return true;
    }

    return (
      candidateName &&
      normalizeText(existing.name) === candidateName
    );
  });
}

export default async (request, context) => {
  const owner = await requireOwner(context);

  if (!owner) {
    return unauthorized();
  }

  if (request.method !== "POST") {
    return Response.json(
      {
        error: "Method not allowed"
      },
      {
        status: 405
      }
    );
  }

  try {
    const body = await request.json();

    const query = String(body.query || "").trim();

    const matchedOpportunity =
      String(body.matchedOpportunity || "").trim();

    const maxResults = Math.min(
      Math.max(Number(body.maxResults) || 5, 1),
      10
    );

    if (!query) {
      return Response.json(
        {
          error: "A business search query is required."
        },
        {
          status: 400
        }
      );
    }

    const googleData =
      await searchGooglePlaces(query, maxResults);

    const places = googleData.places || [];

    const existingBusinesses =
      (await store().get(
        "businesses",
        {
          type: "json"
        }
      )) || [];

    const discovered = places.map(place =>
      normalizeBusiness(
        place,
        query,
        matchedOpportunity
      )
    );

    const newBusinesses = discovered.filter(
      business =>
        !isDuplicate(
          existingBusinesses,
          business
        )
    );

    const updatedBusinesses = [
      ...newBusinesses,
      ...existingBusinesses
    ].slice(0, 2000);

    if (newBusinesses.length > 0) {
      await store().setJSON(
        "businesses",
        updatedBusinesses
      );
    }

    return Response.json({
      success: true,

      query,

      searched: places.length,

      added: newBusinesses.length,

      duplicatesSkipped:
        discovered.length -
        newBusinesses.length,

      businesses: newBusinesses
    });

  } catch (error) {
    console.error(
      "Business discovery failed:",
      error
    );

    return Response.json(
      {
        error:
          "Business discovery failed.",

        details:
          error.message
      },
      {
        status: 500
      }
    );
  }
};
