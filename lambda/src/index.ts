/**
 * AWS Lambda Handler for Shopify Order Events
 *
 * This function is triggered by EventBridge when a new order is created.
 * It processes the order, generates AI insights, and posts them to the Remix app.
 */

import { EventBridgeEvent, Context } from "aws-lambda";
import type {
  ShopifyOrder,
  ShopifyEventBridgeEvent,
  AIInsightPayload,
} from "../../shared/types";
import {
  processOrderData,
  processCustomerDataFromAPI,
  processCustomerDataFallback,
  extractShopDomain,
} from "./orderProcessor";
import { buildPrompt } from "./promptBuilder";
import { generateInsight } from "./aiService";
import { postInsightToApp, postErrorToApp, fetchCustomerData } from "./httpClient";

/**
 * Main Lambda handler
 */
export async function handler(
  event: EventBridgeEvent<string, ShopifyOrder>,
  context: Context
): Promise<{ statusCode: number; body: string }> {
  console.log(
    `[Lambda] Invoked with request ID: ${context.awsRequestId}`
  );
  console.log(`[Lambda] Event detail-type: ${event["detail-type"]}`);
  console.log(`[Lambda] Event source: ${event.source}`);

  // Shopify EventBridge events have detail-type "shopifyWebhook"
  // The actual topic (orders/create) is in the metadata
  // We filter by EventBridge rule, so just validate it's from Shopify
  if (!event.source?.includes("shopify.com")) {
    console.log(`[Lambda] Ignoring non-Shopify event: ${event.source}`);
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Event ignored - not from Shopify" }),
    };
  }

  // Cast to Shopify EventBridge event structure
  const shopifyEvent = event as unknown as ShopifyEventBridgeEvent;
  const metadata = shopifyEvent.detail?.metadata;
  const order = shopifyEvent.detail?.payload;

  // Validate we have the order payload
  if (!order || !order.id) {
    console.error("[Lambda] Missing order payload in event");
    console.log("[Lambda] Event detail:", JSON.stringify(event.detail, null, 2));
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing order payload" }),
    };
  }

  //log order data
  //todo: remove sensitive data before logging
  console.log(`[Lambda] Processing order`, order);

  // Extract shop domain
  let shop: string;
  try {
    shop = extractShopDomain(metadata);
  } catch (error) {
    console.error("[Lambda] Failed to extract shop domain:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing shop domain" }),
    };
  }

  const orderId = String(order.id);
  const orderName = order.name;

  console.log(
    `[Lambda] Processing order ${orderName} (${orderId}) for shop ${shop}`
  );

  try {
    // Process order data
    const orderData = processOrderData(order);

    // Fetch accurate customer data from Shopify API via Remix
    let customerData;
    const customerId = order.customer?.id;
    
    if (customerId) {
      console.log(`[Lambda] Fetching customer data for ${customerId}...`);
      const customerResponse = await fetchCustomerData(shop, String(customerId));
      
      if (customerResponse.success && customerResponse.customer) {
        customerData = processCustomerDataFromAPI(customerResponse.customer);
        console.log(
          `[Lambda] Customer API data: ${customerData.ordersCount} orders, $${customerData.totalSpent} spent, type: ${customerData.customerType}`
        );
      } else {
        // Fallback to heuristic if API call fails
        console.log(`[Lambda] Customer API failed, using fallback: ${customerResponse.error}`);
        customerData = processCustomerDataFallback(order.customer, order.created_at);
      }
    } else {
      // No customer (guest checkout)
      customerData = processCustomerDataFallback(null);
    }

    console.log(
      `[Lambda] Order: $${orderData.totalPrice}, ${orderData.itemCount} items, customer type: ${customerData.customerType}`
    );

    // Build AI prompt
    const prompt = buildPrompt(orderData, customerData, {
      includeCustomerName: process.env.INCLUDE_CUSTOMER_NAME === "true",
    });

    // Generate AI insight
    console.log(`[Lambda] Generating AI insight...`);
    const aiResponse = await generateInsight(prompt);

    // Build payload for ingestion endpoint
    const payload: AIInsightPayload = {
      shop,
      orderId,
      orderName,
      insightText: aiResponse.insight,
      followupSubject: aiResponse.followupSubject,
      followupBody: aiResponse.followupBody,
      customerType: customerData.customerType,
      orderValue: orderData.totalPrice,
      status: "completed",
    };

    // Post to Remix app
    console.log(`[Lambda] Posting insight to Remix app...`);
    const result = await postInsightToApp(payload);

    if (!result.success) {
      console.error(`[Lambda] Failed to post insight:`, result.error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: result.error }),
      };
    }

    console.log(
      `[Lambda] Successfully processed order ${orderName}, insight ID: ${result.id}`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        orderId,
        orderName,
        insightId: result.id,
      }),
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Lambda] Error processing order:`, errorMessage);

    // Try to post error status to app
    try {
      await postErrorToApp(shop, orderId, orderName, errorMessage);
    } catch (postError) {
      console.error(`[Lambda] Failed to post error status:`, postError);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({ error: errorMessage }),
    };
  }
}
