import { GoogleGenAI } from "@google/genai";
import {
  buildCoachChatContextPrompt,
  COACH_CHAT_SYSTEM_PROMPT,
} from "@/lib/ai/coach-chat-prompt";
import {
  buildCoachUserPrompt,
  COACH_SYSTEM_PROMPT,
} from "@/lib/ai/coach-prompt";
import {
  buildFoodEstimateUserPrompt,
  FOOD_ESTIMATE_SYSTEM_PROMPT,
} from "@/lib/ai/food-estimate-prompt";
import type {
  AiProvider,
  CoachChatContext,
  CoachChatGenerationResult,
  CoachGenerationContext,
  FoodEstimateGenerationResult,
} from "@/lib/ai/types";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";

function getGeminiApiKey(): string | null {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key || key.includes("PASTE_")) {
    return null;
  }
  return key;
}

function getGeminiModel(): string {
  const model = process.env.GEMINI_MODEL?.trim();
  return model && model.length > 0 ? model : DEFAULT_MODEL;
}

export function isGeminiConfigured(): boolean {
  return getGeminiApiKey() !== null;
}

export class GeminiProvider implements AiProvider {
  async generateCoachTake(context: CoachGenerationContext): Promise<string> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: buildCoachUserPrompt(context),
      config: {
        systemInstruction: COACH_SYSTEM_PROMPT,
        temperature: 0.7,
        maxOutputTokens: 500,
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Gemini returned an empty coach take");
    }

    return text;
  }

  async generateCoachChat(
    context: CoachChatContext,
  ): Promise<CoachChatGenerationResult> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const contextBlock = buildCoachChatContextPrompt(context);
    const systemInstruction = `${COACH_CHAT_SYSTEM_PROMPT}\n\n${contextBlock}`;

    const contents = context.conversation.messages.map((message) => ({
      role: (message.role === "assistant" ? "model" : "user") as
        | "user"
        | "model",
      parts: [{ text: message.content }],
    }));

    if (contents.length === 0) {
      throw new Error("Coach chat has no messages to reply to");
    }

    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Gemini returned an empty coach reply");
    }

    return { rawText: text };
  }

  async estimateFoodNutrition(
    description: string,
  ): Promise<FoodEstimateGenerationResult> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: buildFoodEstimateUserPrompt(description),
      config: {
        systemInstruction: FOOD_ESTIMATE_SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 800,
        responseMimeType: "application/json",
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Gemini returned an empty food estimate");
    }

    return { rawText: text };
  }
}
