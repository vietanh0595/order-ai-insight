import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import crypto from "crypto";
import prisma from "../db.server";

/**
 * Customer data endpoint for Lambda to fetch customer info from Shopify.
 * Called by AWS Lambda to get accurate orders_count and total_spent.
 *
 * POST /api/customer-data
 *
 * Headers:
 *   X-Shopify-Hmac-SHA256: HMAC signature of the request body
 *
 * Body (JSON):
 *   - shop: string (required) - Shopify domain
 *   - customerId: string (required) - Shopify customer GID or numeric ID
 */

export interface CustomerDataResponse {
  success: boolean;
  customer?: {
    id: string;
    numberOfOrders: number;
    amountSpent: number;
    currency: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    createdAt: string | null;
  };
  error?: string;
}

// Only allow POST requests
export const loader = () => {
  return json({ error: "Method not allowed" }, { status: 405 });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Only allow POST
  if (request.method !== "POST") {
    return json<CustomerDataResponse>(
      { success: false, error: "Method not allowed" },
      { status: 405 }
    );
  }

  // Get the raw body for HMAC verification
  const body = await request.text();

  // Verify HMAC signature
  const hmacHeader = request.headers.get("X-Shopify-Hmac-SHA256");
  if (!hmacHeader) {
    console.error("[CustomerData] Missing HMAC signature header");
    return json<CustomerDataResponse>(
      { success: false, error: "Missing signature" },
      { status: 401 }
    );
  }

  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    console.error("[CustomerData] HMAC_SECRET environment variable not set");
    return json<CustomerDataResponse>(
      { success: false, error: "Server configuration error" },
      { status: 500 }
    );
  }

  const expectedHmac = crypto
    .createHmac("sha256", hmacSecret)
    .update(body)
    .digest("hex");

  if (hmacHeader !== expectedHmac) {
    console.error("[CustomerData] Invalid HMAC signature");
    return json<CustomerDataResponse>(
      { success: false, error: "Invalid signature" },
      { status: 401 }
    );
  }

  // Parse request body
  let data: { shop?: string; customerId?: string };
  try {
    data = JSON.parse(body);
  } catch (e) {
    console.error("[CustomerData] Invalid JSON body:", e);
    return json<CustomerDataResponse>(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { shop, customerId } = data;

  if (!shop || typeof shop !== "string") {
    return json<CustomerDataResponse>(
      { success: false, error: "Missing or invalid 'shop' field" },
      { status: 400 }
    );
  }

  if (!customerId || typeof customerId !== "string") {
    return json<CustomerDataResponse>(
      { success: false, error: "Missing or invalid 'customerId' field" },
      { status: 400 }
    );
  }

  // Get access token from session - try offline session first
  console.log(`[CustomerData] Looking for session with shop: ${shop}`);
  
  const sessions = await prisma.session.findMany({
    where: { shop },
    select: { id: true, accessToken: true, isOnline: true },
  });
  
  console.log(`[CustomerData] Found ${sessions.length} sessions:`, sessions.map(s => ({ id: s.id, isOnline: s.isOnline, tokenPrefix: s.accessToken?.substring(0, 10) })));
  
  // Prefer offline session (starts with shpat_), fall back to online
  const session = sessions.find(s => s.accessToken?.startsWith('shpat_')) || sessions[0];

  if (!session?.accessToken) {
    console.error(`[CustomerData] No session found for shop: ${shop}`);
    return json<CustomerDataResponse>(
      { success: false, error: "Shop not found or not authenticated" },
      { status: 404 }
    );
  }

  console.log(`[CustomerData] Using session ${session.id} with token: ${session.accessToken.substring(0, 10)}...`);

  console.log(`[CustomerData] Using token for shop ${shop}: ${session.accessToken.substring(0, 10)}...`);

  // Format customer ID as GID if it's numeric
  const customerGid = customerId.startsWith("gid://")
    ? customerId
    : `gid://shopify/Customer/${customerId}`;

  // Call Shopify Admin API
  try {
    const response = await fetch(
      `https://${shop}/admin/api/2024-10/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({
          query: `
            query GetCustomerData($id: ID!) {
              customer(id: $id) {
                id
                numberOfOrders
                amountSpent {
                  amount
                  currencyCode
                }
                createdAt
              }
            }
          `,
          variables: { id: customerGid },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(
        `[CustomerData] Shopify API error: ${response.status} ${response.statusText}`,
        errorBody
      );
      return json<CustomerDataResponse>(
        { success: false, error: `Shopify API error: ${response.status}` },
        { status: 502 }
      );
    }

    const result = (await response.json()) as {
      data?: {
        customer?: {
          id: string;
          numberOfOrders: string;
          amountSpent: { amount: string; currencyCode: string };
          createdAt: string | null;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (result.errors) {
      console.error("[CustomerData] GraphQL errors:", result.errors);
      return json<CustomerDataResponse>(
        { success: false, error: result.errors[0]?.message || "GraphQL error" },
        { status: 400 }
      );
    }

    const customer = result.data?.customer;
    if (!customer) {
      console.log(`[CustomerData] Customer not found: ${customerGid}`);
      return json<CustomerDataResponse>(
        { success: false, error: "Customer not found" },
        { status: 404 }
      );
    }

    console.log(
      `[CustomerData] Found customer ${customer.id}: ${customer.numberOfOrders} orders, ${customer.amountSpent.amount} ${customer.amountSpent.currencyCode}`
    );

    return json<CustomerDataResponse>({
      success: true,
      customer: {
        id: customer.id,
        numberOfOrders: parseInt(customer.numberOfOrders, 10),
        amountSpent: parseFloat(customer.amountSpent.amount),
        currency: customer.amountSpent.currencyCode,
        firstName: null,
        lastName: null,
        email: null,
        createdAt: customer.createdAt,
      },
    });
  } catch (e) {
    console.error("[CustomerData] Error calling Shopify API:", e);
    return json<CustomerDataResponse>(
      { success: false, error: "Failed to fetch customer data" },
      { status: 500 }
    );
  }
};
