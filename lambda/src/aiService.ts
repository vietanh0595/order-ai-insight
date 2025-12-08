/**
 * AI Service - Handles communication with OpenAI API
 */

import OpenAI from "openai";
import type { AIInsightResponse } from "../../shared/types";
import { SYSTEM_MESSAGE } from "./promptBuilder";

let openaiClient: OpenAI | null = null;

/**
 * Get or create OpenAI client
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Generate AI insight from the given prompt
 */
export async function generateInsight(
  prompt: string
): Promise<AIInsightResponse> {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo";

  console.log(`[AI] Calling OpenAI API with model: ${model}`);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: SYSTEM_MESSAGE },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    console.log(`[AI] Received response, parsing JSON...`);

    // Parse the JSON response
    const parsed = JSON.parse(content) as AIInsightResponse;

    // Validate required fields
    if (!parsed.insight || typeof parsed.insight !== "string") {
      throw new Error("Invalid AI response: missing or invalid 'insight' field");
    }
    if (!parsed.followupSubject || typeof parsed.followupSubject !== "string") {
      throw new Error(
        "Invalid AI response: missing or invalid 'followupSubject' field"
      );
    }
    if (!parsed.followupBody || typeof parsed.followupBody !== "string") {
      throw new Error(
        "Invalid AI response: missing or invalid 'followupBody' field"
      );
    }

    console.log(`[AI] Successfully generated insight`);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      console.error("[AI] Failed to parse AI response as JSON:", error);
      throw new Error("AI response was not valid JSON");
    }
    throw error;
  }
}

/**
 * Get token usage estimate for a prompt (rough estimate)
 * Useful for cost tracking
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}
