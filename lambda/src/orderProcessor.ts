/**
 * Extract and process order data from Shopify webhook payload
 */

import type {
  ShopifyOrder,
  ShopifyCustomer,
  ProcessedOrderData,
  ProcessedCustomerData,
} from "../../shared/types";

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
 * Process customer data and determine customer type
 */
export function processCustomerData(
  customer: ShopifyCustomer | null
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

  const ordersCount = customer.orders_count;
  const totalSpent = parseFloat(customer.total_spent);
  const isFirstOrder = ordersCount <= 1;

  // Determine customer type based on order history and spend
  let customerType: "first-time" | "repeat" | "vip";
  if (isFirstOrder) {
    customerType = "first-time";
  } else if (ordersCount >= 4 || totalSpent >= 500) {
    customerType = "vip";
  } else {
    customerType = "repeat";
  }

  // Calculate days since first order
  let daysSinceFirstOrder: number | null = null;
  if (customer.created_at) {
    const createdDate = new Date(customer.created_at);
    const now = new Date();
    daysSinceFirstOrder = Math.floor(
      (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
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
