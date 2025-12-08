/**
 * HTTP Client - Handles communication with Remix app ingestion endpoint
 */

import crypto from "crypto";
import type { AIInsightPayload } from "../../shared/types";

/**
 * Generate HMAC signature for payload
 */
function signPayload(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Post insight to Remix app ingestion endpoint
 */
export async function postInsightToApp(
  payload: AIInsightPayload
): Promise<{ success: boolean; id?: string; error?: string }> {
  const appUrl = process.env.REMIX_APP_URL;
  if (!appUrl) {
    throw new Error("REMIX_APP_URL environment variable is not set");
  }

  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    throw new Error("HMAC_SECRET environment variable is not set");
  }

  const endpoint = `${appUrl}/api/ai-insights/ingest`;
  const body = JSON.stringify(payload);
  const signature = signPayload(body, hmacSecret);

  console.log(`[HTTP] Posting insight to ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Hmac-SHA256": signature,
      },
      body,
    });

    const responseData = (await response.json()) as {
      success?: boolean;
      id?: string;
      error?: string;
    };

    if (!response.ok) {
      console.error(
        `[HTTP] Error response from app: ${response.status}`,
        responseData
      );
      return {
        success: false,
        error: responseData.error || `HTTP ${response.status}`,
      };
    }

    console.log(`[HTTP] Successfully posted insight, id: ${responseData.id}`);
    return {
      success: true,
      id: responseData.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[HTTP] Failed to post insight:`, message);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Post error status to Remix app when AI processing fails
 */
export async function postErrorToApp(
  shop: string,
  orderId: string,
  orderName: string,
  errorMessage: string
): Promise<void> {
  const payload: AIInsightPayload = {
    shop,
    orderId,
    orderName,
    insightText: "Error generating insight",
    status: "error",
    errorMessage,
  };

  await postInsightToApp(payload);
}
