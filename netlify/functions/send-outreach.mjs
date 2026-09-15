import { requireOwner, unauthorized } from "../lib/auth.mjs";

export default async function handler(request, context) {
  if (!(await requireOwner(context))) {
    return unauthorized();
  }

  if (request.method !== "POST") {
    return Response.json(
      { success: false, error: "Method not allowed" },
      { status: 405 }
    );
  }

  try {
    const {
      email,
      subject,
      message,
      pdfBase64,
      pdfFileName
    } = await request.json();

    if (!email || !subject || !message || !pdfBase64) {
      return Response.json(
        {
          success: false,
          error: "Email, subject, message and proposal PDF are required"
        },
        { status: 400 }
      );
    }

    const autoReplyUrl = process.env.GOOGLE_AUTOREPLY_URL;
    const automationSecret = process.env.AUTOMATION_SECRET;

    if (!autoReplyUrl || !automationSecret) {
      return Response.json(
        {
          success: false,
          error: "Email automation is not configured"
        },
        { status: 500 }
      );
    }

    const response = await fetch(autoReplyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        secret: automationSecret,
        type: "approved_outreach",
        email,
        subject,
        message,
        pdfBase64,
        pdfFileName: pdfFileName || "Aichamiyaa-Proposal.pdf"
      })
    });

    const text = await response.text();

    let result;

    try {
      result = JSON.parse(text);
    } catch {
      result = {
        success: false,
        error: "Invalid response from email service"
      };
    }

    if (!response.ok || !result.success) {
      return Response.json(
        {
          success: false,
          error: result.error || "Email could not be sent"
        },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      message: "Outreach email and proposal PDF sent"
    });

  } catch (error) {
    console.error("Outreach send failed:", error);

    return Response.json(
      {
        success: false,
        error: "Outreach send failed"
      },
      { status: 500 }
    );
  }
}
