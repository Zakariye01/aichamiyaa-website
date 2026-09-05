import { getStore } from "@netlify/blobs";

const store = () =>
  getStore({
    name: "aichamiyaa-command-centre",
    consistency: "strong"
  });

function getField(submission, fieldName) {
  if (submission?.data?.[fieldName]) {
    return submission.data[fieldName];
  }

  const field = submission?.ordered_human_fields?.find(
    (item) => item.name === fieldName
  );

  return field?.value || "";
}

export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const submission = await request.json();

  const customer = {
    id: submission.id || crypto.randomUUID(),
    name: getField(submission, "name"),
    email: getField(submission, "email"),
    message: getField(submission, "message"),
    status: "new",
    source: "website-contact",
    receivedAt: new Date().toISOString()
  };

  const existing =
    (await store().get("customer-requests", { type: "json" })) || [];

  const customerRequests = [customer, ...existing].slice(0, 1000);

  await store().setJSON("customer-requests", customerRequests);

  console.log("Customer request saved:", customer);

  return Response.json({
    received: true,
    saved: true
  });
};
