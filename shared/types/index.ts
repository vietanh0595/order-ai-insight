/**
 * Shared types barrel export
 */

// AI Insight types (used by both Lambda and Remix)
export type {
  InsightStatus,
  CustomerType,
  AIInsightPayload,
  AIInsightRequiredFields,
  AIInsightIngestResponse,
  AIInsightIngestError,
} from "./ai-insight";

// Shopify types (primarily used by Lambda)
export type {
  ShopifyCustomer,
  ShopifyLineItem,
  ShopifyDiscountCode,
  ShopifyAddress,
  ShopifyOrder,
  ShopifyEventBridgeEvent,
} from "./shopify";

// Lambda-specific types
export type {
  AIInsightResponse,
  ProcessedOrderData,
  ProcessedCustomerData,
} from "./lambda";
