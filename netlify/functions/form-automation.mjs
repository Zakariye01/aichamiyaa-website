export default async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const submission = await request.json();

  console.log("New customer form submission:", submission);

  return new Response(
    JSON.stringify({ received: true }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
};
