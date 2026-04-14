import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

let ai;
if (config.geminiApiKey) {
  ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

export const generateBriefing = async (shipmentsContext) => {
  if (!ai) return "AI Advisor is not configured (Missing GEMINI_API_KEY).";

  const prompt = `
You are the AI Logistics Advisor for a Smart Supply Chain System.
Analyze the following active shipment data and generate an executive "Morning Briefing" summary.
Context: ${JSON.stringify(shipmentsContext)}

Rules (must follow):
- Times are in MINUTES unless explicitly labeled otherwise.
- estimatedBaselineTravelMinutes + expectedExtraDelayMinutes approximate total time-to-arrive for the remaining distance; never interpret expectedExtraDelayMinutes alone as multi-day delay.
- For remaining distances under ~20 km, total delay impact should normally stay within a few hours unless there is a clear disaster / strike / border closure signal in the data.
- If cargoType is "essential" or "pharma", mention prioritization and civil contingency briefly.

Please output a concise, professional markdown response with:
1. High-level network summary.
2. Top active risks & their potential cascading impact.
3. 3 Strategic Recommendations (be proactive, practical, and cost-aware regarding Indian geography if applicable).
  `;

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: prompt,
    });
    return res.text || 'No AI response text returned.';
  } catch (error) {
    console.warn(`[Gemini] Advisory unavailable (Rate limit or API error). Falling back to generic text.`);
    return "Failed to generate briefing. Please ensure your Gemini API limits and key are valid.";
  }
};

export const evaluateScenario = async (question, shipmentsContext) => {
  if (!ai) return "AI Advisor is not configured (Missing GEMINI_API_KEY).";

  const prompt = `
You are a strategic AI Logistics Advisor. 
The user asks a "What-If" scenario or question regarding active supply chain operations.
Active Network Context: ${JSON.stringify(shipmentsContext)}

User Question: "${question}"

Use MINUTES for time in your reasoning unless converting explicitly to hours. Ground recommendations in estimatedBaselineTravelMinutes and expectedExtraDelayMinutes when present.

Please provide a highly analytical, cost-aware, and scalable answer. Focus on the root cause and preventive insights if applicable. Provide practical recommendations.
  `;

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: prompt,
    });
    return res.text || 'No AI response text returned.';
  } catch (error) {
    console.error("Gemini Scenario Error:", error);
    return "Failed to evaluate scenario. Please ensure your Gemini API limits and key are valid.";
  }
};
