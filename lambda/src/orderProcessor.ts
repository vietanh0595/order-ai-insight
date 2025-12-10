/**
 * Extract and process order data from Shopify webhook payload
 */

import type {
  ShopifyOrder,
  ShopifyCustomer,
  ProcessedOrderData,
  ProcessedCustomerData,
  CustomerType,
} from "../../shared/types";
import type { CustomerDataResponse } from "./httpClient";

/**
 * Process raw Shopify order into a clean format for AI prompts
 */
export function processOrderData(order: ShopifyOrder): ProcessedOrderData {
  return {
    orderId: String(order.id),
    orderName: order.name,
    totalPrice: parseFloat(order.total_price),
    currency: order.currency,
    lineItems: order.line_items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: parseFloat(item.price),
    })),
    discountCodes: order.discount_codes.map((dc) => dc.code),
    hasDiscount: order.discount_codes.length > 0,
    itemCount: order.line_items.reduce((sum, item) => sum + item.quantity, 0),
  };
}

/**
 * Determine customer type based on order count and total spent
 */
function determineCustomerType(
  ordersCount: number,
  totalSpent: number
): CustomerType {
  if (ordersCount <= 1) {
    return "first-time";
  } else if (ordersCount >= 5 || totalSpent >= 500) {
    return "vip";
  } else {
    return "repeat";
  }
}

/**
 * Process customer data using Shopify API data (accurate)
 */
export function processCustomerDataFromAPI(
  apiData: CustomerDataResponse["customer"]
): ProcessedCustomerData {
  if (!apiData) {
    return {
      firstName: null,
      lastName: null,
      ordersCount: 1,
      totalSpent: 0,
      isFirstOrder: true,
      customerType: "first-time",
      daysSinceFirstOrder: null,
    };
  }

  const ordersCount = apiData.numberOfOrders;
  const totalSpent = apiData.amountSpent;
  const isFirstOrder = ordersCount <= 1;
  const customerType = determineCustomerType(ordersCount, totalSpent);

  // Calculate days since first order
  let daysSinceFirstOrder: number | null = null;
  if (apiData.createdAt) {
    const createdDate = new Date(apiData.createdAt);
    const now = new Date();
    daysSinceFirstOrder = Math.floor(
      (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    firstName: apiData.firstName,
    lastName: apiData.lastName,
    ordersCount,
    totalSpent,
    isFirstOrder,
    customerType,
    daysSinceFirstOrder,
  };
}

/**
 * Process customer data from webhook (fallback when API call fails)
 * Uses heuristic based on customer creation time
 */
export function processCustomerDataFallback(
  customer: ShopifyCustomer | null,
  orderCreatedAt?: string
): ProcessedCustomerData {
  if (!customer) {
    return {
      firstName: null,
      lastName: null,
      ordersCount: 1,
      totalSpent: 0,
      isFirstOrder: true,
      customerType: "first-time",
      daysSinceFirstOrder: null,
    };
  }

  // Webhook payloads don't include orders_count, so we use a heuristic:
  // If customer.created_at is very close to the order time, it's likely their first order
  const customerCreatedAt = customer.created_at ? new Date(customer.created_at) : null;
  const orderTime = orderCreatedAt ? new Date(orderCreatedAt) : new Date();
  
  // If customer was created within 60 seconds of the order, assume first-time
  const timeDiffMs = customerCreatedAt 
    ? Math.abs(orderTime.getTime() - customerCreatedAt.getTime())
    : 0;
  const isFirstOrder = timeDiffMs < 60000; // 60 seconds threshold

  const ordersCount = isFirstOrder ? 1 : 2;
  const totalSpent = 0; // Not available in webhook payload
  const customerType: CustomerType = isFirstOrder ? "first-time" : "repeat";

  // Calculate days since first order (customer account creation)
  let daysSinceFirstOrder: number | null = null;
  if (customerCreatedAt) {
    const now = new Date();
    daysSinceFirstOrder = Math.floor(
      (now.getTime() - customerCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  return {
    firstName: customer.first_name || null,
    lastName: customer.last_name || null,
    ordersCount,
    totalSpent,
    isFirstOrder,
    customerType,
    daysSinceFirstOrder,
  };
}

/**
 * Extract shop domain from EventBridge event metadata
 * Falls back to environment variable if not found
 */
export function extractShopDomain(
  metadata?: Record<string, string>
): string {
  if (metadata?.["X-Shopify-Shop-Domain"]) {
    return metadata["X-Shopify-Shop-Domain"];
  }
  
  // Fallback to environment variable
  const envShop = process.env.SHOPIFY_SHOP_DOMAIN;
  if (envShop) {
    return envShop;
  }

  throw new Error(
    "Shop domain not found in event metadata or environment variables"
  );
}
