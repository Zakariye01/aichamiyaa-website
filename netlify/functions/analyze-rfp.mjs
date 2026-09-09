import { getStore } from "@netlify/blobs";
import { requireOwner, unauthorized } from "../lib/auth.mjs";

const store = () =>
  getStore({
    name: "aichamiyaa-command-centre",
    consistency: "strong"
  });

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function extractRequirements(opportunity) {
  const text = clean(
    [
      opportunity.title,
      opportunity.description,
      opportunity.category,
      opportunity.noticeType,
      opportunity.deliveryRegions
    ].join(" ")
  );

  const lower = text.toLowerCase();

  const money =
    text.match(/\$\s?[\d,]+(?:\.\d{2})?/g) || [];

  const insurance =
    text.match(
      /(?:insurance|liability)[^.$]{0,80}\$\s?[\d,]+(?:\.\d{2})?/gi
    ) || [];

  const experience =
    text.match(
      /\b\d+\s*(?:year|years)\s+(?:of\s+)?experience\b/gi
    ) || [];

  const securityClearance =
    /security clearance|reliability status|secret clearance|criminal record|background check/i.test(
      text
    );

  const bonding =
    /bid bond|performance bond|labour and material payment bond|surety/i.test(
      text
    );

  const certifications = [];

  if (/whmis/i.test(text)) certifications.push("WHMIS");
  if (/iso\s?\d+/i.test(text)) certifications.push("ISO");
  if (/wcb|workers.? compensation/i.test(text))
    certifications.push("Workers compensation / WCB");
  if (/food safe|food handling/i.test(text))
    certifications.push("Food safety");
  if (/first aid/i.test(text)) certifications.push("First aid");

  const mandatorySignals = [];

  if (/\bmandatory\b/i.test(text)) mandatorySignals.push("Mandatory requirements");
  if (/\bmust\b/i.test(text)) mandatorySignals.push("Must requirements");
  if (/\brequired\b/i.test(text)) mandatorySignals.push("Required conditions");

  return {
    serviceType: opportunity.category || "",
    deliveryLocation: opportunity.deliveryRegions || "",
    contractValuesMentioned: money,
    insuranceRequirements: insurance,
    experienceRequirements: experience,
    certifications,
    securityClearanceRequired: securityClearance,
    bondingRequired: bonding,
    mandatorySignals,

    staffingRequirements: "",
    equipmentRequirements: "",
    licenceRequirements: "",
    upfrontCashEstimate: null,

    sourceNoticeUrl: opportunity.noticeUrl || opportunity.url || "",
    sourceAttachmentUrl: opportunity.attachmentUrl || "",

    analyzedFrom: "CanadaBuys notice information",
    documentAnalysisComplete: false
  };
}

export default async function handler(request, context) {
  if (!(await requireOwner(context))) return unauthorized();

  if (request.method !== "POST") {
    return Response.json(
      { error: "POST required." },
      { status: 405 }
    );
  }

  try {
    const body = await request.json();
    const opportunityId = clean(body.opportunityId);

    if (!opportunityId) {
      return Response.json(
        { error: "opportunityId is required." },
        { status: 400 }
      );
    }

    const feed =
      (await store().get("feeds/canadabuys", { type: "json" })) || {};

    const opportunities = Array.isArray(feed.opportunities)
      ? feed.opportunities
      : [];

    const opportunity = opportunities.find(
      item =>
        item.id === opportunityId ||
        item.referenceNumber === opportunityId ||
        item.solicitationNumber === opportunityId
    );

    if (!opportunity) {
      return Response.json(
        { error: "Opportunity not found." },
        { status: 404 }
      );
    }

    const requirements = extractRequirements(opportunity);

    const analysis = {
      opportunityId: opportunity.id,
      title: opportunity.title,
      source: opportunity.source,
      requirementsStatus: requirements.sourceAttachmentUrl
        ? "Attachment ready for analysis"
        : "Notice analyzed - no attachment found",
      fitScore: null,
      requirements,
      analyzedAt: new Date().toISOString()
    };

    await store().setJSON(
      `rfp-analysis/${opportunity.id}`,
      analysis
    );

    return Response.json({
      ok: true,
      analysis
    });
  } catch (error) {
    console.error("RFP analysis failed:", error);

    return Response.json(
      {
        error: "RFP analysis failed.",
        details: error.message
      },
      { status: 500 }
    );
  }
}
