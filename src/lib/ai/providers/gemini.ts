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
  FOOD_PHOTO_ESTIMATE_SYSTEM_PROMPT,
} from "@/lib/ai/food-estimate-prompt";
import type {
  AiProvider,
  CoachAudioTranscriptionRequest,
  CoachAudioTranscriptionResult,
  CoachChatContext,
  CoachChatGenerationResult,
  CoachGenerationContext,
  FoodEstimateGenerationResult,
  FoodEstimateRequest,
  FoodPhotoEstimateRequest,
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
        maxOutputTokens: 160,
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

    const contents = context.conversation.messages.map((message) => {
      const parts: Array<
        { text: string } | { inlineData: { mimeType: string; data: string } }
      > = [];
      const text =
        message.content.trim() ||
        (message.imageInline ? "Please look at this photo." : "");
      if (text) {
        parts.push({ text });
      }
      if (message.imageInline?.data && message.imageInline.mimeType) {
        parts.push({
          inlineData: {
            mimeType: message.imageInline.mimeType,
            data: message.imageInline.data,
          },
        });
      }
      if (parts.length === 0) {
        parts.push({ text: message.content || "(empty message)" });
      }
      return {
        role: (message.role === "assistant" ? "model" : "user") as
          | "user"
          | "model",
        parts,
      };
    });

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

  async transcribeCoachAudio(
    input: CoachAudioTranscriptionRequest,
  ): Promise<CoachAudioTranscriptionResult> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: "Transcribe the spoken words in this audio into plain text for a fitness coaching chat. Return only the transcript — no quotes, labels, or commentary. If there is no clear speech, return an empty string.",
            },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.audioBase64,
              },
            },
          ],
        },
      ],
      config: {
        temperature: 0,
        maxOutputTokens: 800,
      },
    });

    const transcript = response.text?.trim() ?? "";
    return { transcript };
  }

  async estimateFoodNutrition(
    input: FoodEstimateRequest,
  ): Promise<FoodEstimateGenerationResult> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: buildFoodEstimateUserPrompt(input),
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

  async estimateFoodNutritionFromPhoto(
    input: FoodPhotoEstimateRequest,
  ): Promise<FoodEstimateGenerationResult> {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const note = input.note?.trim()
      ? `\nUser note: ${input.note.trim()}`
      : "";
    const response = await ai.models.generateContent({
      model: getGeminiModel(),
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Estimate the nutrition in this meal photo. Prefer itemising components. Label uncertainty honestly.${note}`,
            },
            {
              inlineData: {
                mimeType: input.mimeType,
                data: input.imageBase64,
              },
            },
          ],
        },
      ],
      config: {
        systemInstruction: FOOD_PHOTO_ESTIMATE_SYSTEM_PROMPT,
        temperature: 0.2,
        maxOutputTokens: 1000,
        responseMimeType: "application/json",
      },
    });

    const text = response.text?.trim();
    if (!text) {
      throw new Error("Gemini returned an empty photo food estimate");
    }

    return { rawText: text };
  }
}
