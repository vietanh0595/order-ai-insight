import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import prisma from "../db.server";
import type {
  AIInsightPayload,
  AIInsightIngestResponse,
  AIInsightIngestError,
  InsightStatus,
  CustomerType,
} from "../../shared/types";

/**
 * Ingestion endpoint for AI-generated order insights.
 * Called by AWS Lambda after processing order events.
 *
 * POST /api/ai-insights/ingest
 *
 * @see AIInsightPayload for the request body schema
 */

// Only allow POST requests
export const loader = () => {
  return json({ error: "Method not allowed" }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Only allow POST
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // Get the raw body for HMAC verification
  const body = await request.text();

  // Verify HMAC signature
  const hmacHeader = request.headers.get("X-Shopify-Hmac-SHA256");
  if (!hmacHeader) {
    console.error("[Ingest] Missing HMAC signature header");
    return json({ error: "Missing signature" }, { status: 401 });
  }

  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    console.error("[Ingest] HMAC_SECRET environment variable not set");
    return json({ error: "Server configuration error" }, { status: 500 });
  }

  const expectedHmac = crypto
    .createHmac("sha256", hmacSecret)
    .update(body)
    .digest("hex");

  if (hmacHeader !== expectedHmac) {
    console.error("[Ingest] Invalid HMAC signature");
    return json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse and validate the request body
  let data: Partial<AIInsightPayload>;

  try {
    data = JSON.parse(body);
  } catch (e) {
    console.error("[Ingest] Invalid JSON body:", e);
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Validate required fields
  const { shop, orderId, orderName, insightText } = data;

  if (!shop || typeof shop !== "string") {
    return json({ error: "Missing or invalid 'shop' field" }, { status: 400 });
  }

  if (!orderId || typeof orderId !== "string") {
    return json(
      { error: "Missing or invalid 'orderId' field" },
      { status: 400 }
    );
  }

  if (!orderName || typeof orderName !== "string") {
    return json(
      { error: "Missing or invalid 'orderName' field" },
      { status: 400 }
    );
  }

  if (!insightText || typeof insightText !== "string") {
    return json(
      { error: "Missing or invalid 'insightText' field" },
      { status: 400 }
    );
  }

  // Validate optional fields
  const validStatuses: InsightStatus[] = ["pending", "completed", "error"];
  const status: InsightStatus = data.status || "completed";
  if (!validStatuses.includes(status)) {
    return json<AIInsightIngestError>(
      { error: `Invalid 'status' field. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  const validCustomerTypes: CustomerType[] = ["first-time", "repeat", "vip"];
  if (data.customerType && !validCustomerTypes.includes(data.customerType)) {
    return json<AIInsightIngestError>(
      { error: "Invalid 'customerType' field. Must be one of: first-time, repeat, vip" },
      { status: 400 }
    );
  }

  // Upsert the insight (update if exists, create if not)
  try {
    const insight = await prisma.aIOrderInsight.upsert({
      where: {
        shop_orderId: {
          shop,
          orderId,
        },
      },
      update: {
        orderName,
        insightText,
        followupSubject: data.followupSubject || null,
        followupBody: data.followupBody || null,
        customerType: data.customerType || null,
        orderValue: data.orderValue || null,
        status,
        errorMessage: data.errorMessage || null,
        updatedAt: new Date(),
      },
      create: {
        shop,
        orderId,
        orderName,
        insightText,
        followupSubject: data.followupSubject || null,
        followupBody: data.followupBody || null,
        customerType: data.customerType || null,
        orderValue: data.orderValue || null,
        status,
        errorMessage: data.errorMessage || null,
      },
    });

    console.log(`[Ingest] Upserted insight for order ${orderName} (${orderId}) in shop ${shop}`);

    return json<AIInsightIngestResponse>({
      success: true,
      id: insight.id,
      message: "Insight saved successfully",
    });
  } catch (e) {
    console.error("[Ingest] Database error:", e);
    return json<AIInsightIngestError>({ error: "Failed to save insight" }, { status: 500 });
  }
};
