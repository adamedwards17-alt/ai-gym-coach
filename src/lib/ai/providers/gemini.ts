import { GoogleGenAI } from "@google/genai";
import {
  buildCoachUserPrompt,
  COACH_SYSTEM_PROMPT,
} from "@/lib/ai/coach-prompt";
import type { AiProvider, CoachGenerationContext } from "@/lib/ai/types";

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
}
