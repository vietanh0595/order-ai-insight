/**
 * Shared types for AI Order Insights
 * Used by both Lambda and Remix ingestion endpoint
 */

/**
 * Valid statuses for an AI insight
 */
export type InsightStatus = "pending" | "completed" | "error";

/**
 * Valid customer types
 */
export type CustomerType = "first-time" | "repeat" | "vip";

/**
 * Payload sent from Lambda to the ingestion endpoint
 */
export interface AIInsightPayload {
  /** Shopify store domain (e.g., "store1va.myshopify.com") */
  shop: string;

  /** Shopify order GID (e.g., "gid://shopify/Order/123456") */
  orderId: string;

  /** Human-readable order name (e.g., "#1001") */
  orderName: string;

  /** AI-generated insight text */
  insightText: string;

  /** Suggested follow-up email subject line */
  followupSubject?: string;

  /** Suggested follow-up email body */
  followupBody?: string;

  /** Customer classification */
  customerType?: CustomerType;

  /** Total order value in shop currency */
  orderValue?: number;

  /** Processing status */
  status?: InsightStatus;

  /** Error message if status is "error" */
  errorMessage?: string;
}

/**
 * Required fields from the payload
 */
export type AIInsightRequiredFields = Pick<
  AIInsightPayload,
  "shop" | "orderId" | "orderName" | "insightText"
>;

/**
 * Response from the ingestion endpoint on success
 */
export interface AIInsightIngestResponse {
  success: boolean;
  id: string;
  message: string;
}

/**
 * Response from the ingestion endpoint on error
 */
export interface AIInsightIngestError {
  error: string;
}
