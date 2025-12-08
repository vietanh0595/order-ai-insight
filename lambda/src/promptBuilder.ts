/**
 * AI prompt builder for generating order insights
 */

import type { ProcessedOrderData, ProcessedCustomerData } from "../../shared/types";

export interface PromptSettings {
  includeCustomerName: boolean;
}

const DEFAULT_SETTINGS: PromptSettings = {
  includeCustomerName: false,
};

/**
 * Build AI prompt based on order and customer data
 */
export function buildPrompt(
  orderData: ProcessedOrderData,
  customerData: ProcessedCustomerData,
  settings: PromptSettings = DEFAULT_SETTINGS
): string {
  const customerName = settings.includeCustomerName
    ? customerData.firstName || "the customer"
    : "the customer";

  const itemsList = orderData.lineItems
    .map((item) => `${item.title} (x${item.quantity})`)
    .join(", ");

  let prompt = `
You are an expert e-commerce analyst helping a Shopify merchant understand their orders and customers.

Analyze the following order and generate:
1. A 2-3 sentence insight for the merchant (what this order reveals about customer behavior, potential actions)
2. A suggested follow-up email with subject line and body (keep it friendly, personalized, and actionable)

ORDER DETAILS:
- Order Total: ${orderData.currency} ${orderData.totalPrice.toFixed(2)}
- Items: ${itemsList}
- Quantity: ${orderData.itemCount} items
- Discount Used: ${orderData.hasDiscount ? "Yes (" + orderData.discountCodes.join(", ") + ")" : "No"}

CUSTOMER CONTEXT:
- Customer: ${customerName}
- Total Orders: ${customerData.ordersCount}
- Lifetime Spend: $${customerData.totalSpent.toFixed(2)}
- Customer Type: ${customerData.customerType}
${customerData.daysSinceFirstOrder !== null ? `- Days Since First Order: ${customerData.daysSinceFirstOrder}` : ""}
`.trim();

  // Add customer-type specific instructions
  prompt += "\n\n" + getCustomerTypeInstructions(customerData);

  prompt += `

INSTRUCTIONS:
- Keep insights actionable (suggest tags, segments, or next steps)
- Email should be 3-5 sentences, conversational tone
- Use {{customer_first_name}}, {{product_name}}, {{order_name}} as placeholders
- Don't make up specific discount codes or links - use {{discount_code}} or {{link}} as placeholders

Return ONLY valid JSON (no markdown, no code blocks):
{
  "insight": "string",
  "followupSubject": "string",
  "followupBody": "string"
}`;

  return prompt;
}

/**
 * Get customer-type specific instructions for the AI prompt
 */
function getCustomerTypeInstructions(
  customerData: ProcessedCustomerData
): string {
  switch (customerData.customerType) {
    case "first-time":
      return `FOCUS AREA (First-Time Customer):
- Welcome messaging and brand introduction
- Building initial trust and loyalty
- Encouraging a second purchase with small incentive`;

    case "vip":
      return `FOCUS AREA (VIP Customer - ${customerData.ordersCount} orders, $${customerData.totalSpent.toFixed(2)} LTV):
- Appreciation and recognition for loyalty
- Exclusive benefits or early access offers
- Personalized recommendations based on history`;

    case "repeat":
      return `FOCUS AREA (Repeat Customer - ${customerData.ordersCount} orders):
- Thank them for continued support
- Consider subscription or bundle offers
- Look for patterns (replenishment, category preferences)`;

    default:
      return "";
  }
}

/**
 * System message for the AI to set context
 */
export const SYSTEM_MESSAGE = `You are an AI assistant specialized in e-commerce analytics and customer relationship management. You help Shopify merchants understand their customers better and craft personalized follow-up communications.

Your responses should be:
- Actionable and specific to the order data provided
- Professional yet friendly in tone
- Focused on improving customer retention and lifetime value
- Realistic about what merchants can do (no complex automation suggestions)

Always respond with valid JSON only, no markdown formatting or code blocks.`;
