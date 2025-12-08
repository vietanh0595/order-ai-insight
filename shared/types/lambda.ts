/**
 * Lambda-specific types for AI order processing
 */

import type { CustomerType } from "./ai-insight";

/**
 * AI-generated insight response from OpenAI
 */
export interface AIInsightResponse {
  insight: string;
  followupSubject: string;
  followupBody: string;
}

/**
 * Processed order data for AI prompt
 */
export interface ProcessedOrderData {
  orderId: string;
  orderName: string;
  totalPrice: number;
  currency: string;
  lineItems: Array<{
    title: string;
    quantity: number;
    price: number;
  }>;
  discountCodes: string[];
  hasDiscount: boolean;
  itemCount: number;
}

/**
 * Processed customer data for AI prompt
 */
export interface ProcessedCustomerData {
  firstName: string | null;
  lastName: string | null;
  ordersCount: number;
  totalSpent: number;
  isFirstOrder: boolean;
  customerType: CustomerType;
  daysSinceFirstOrder: number | null;
}
