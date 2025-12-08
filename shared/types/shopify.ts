/**
 * Type definitions for Shopify order data from EventBridge
 * Used by Lambda for processing webhook events
 */

export interface ShopifyCustomer {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  orders_count: number;
  total_spent: string;
  created_at: string;
  tags?: string;
}

export interface ShopifyLineItem {
  id: number;
  title: string;
  quantity: number;
  price: string;
  sku?: string;
  variant_title?: string;
  product_id: number;
}

export interface ShopifyDiscountCode {
  code: string;
  amount: string;
  type: string;
}

export interface ShopifyAddress {
  city?: string;
  province?: string;
  country?: string;
}

export interface ShopifyOrder {
  id: number;
  order_number: number;
  name: string; // e.g., "#1234"
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  currency: string;
  financial_status: string;
  created_at: string;
  line_items: ShopifyLineItem[];
  customer: ShopifyCustomer | null;
  discount_codes: ShopifyDiscountCode[];
  shipping_address?: ShopifyAddress;
  note?: string;
}

/**
 * EventBridge event structure for Shopify webhooks
 * Shopify wraps the actual webhook payload inside detail.payload
 */
export interface ShopifyEventBridgeEvent {
  version: string;
  id: string;
  "detail-type": string; // Always "shopifyWebhook" for Shopify events
  source: string; // e.g., "aws.partner/shopify.com/..."
  account: string;
  time: string;
  region: string;
  resources: string[];
  detail: {
    metadata: {
      "Content-Type": string;
      "X-Shopify-Topic": string; // e.g., "orders/create"
      "X-Shopify-Shop-Domain": string;
      "X-Shopify-API-Version": string;
      "X-Shopify-Webhook-Id": string;
      "X-Shopify-Triggered-At": string;
      "X-Shopify-Event-Id": string;
    };
    payload: ShopifyOrder;
  };
}
