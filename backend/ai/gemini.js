import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

// --- Text Prompt ---
export async function generateText(prompt) {
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (err) {
    console.error("Gemini text generation error:", err);
    throw new Error("AI text generation failed");
  }
}

// --- Image + Text Prompt ---
export async function analyzeImage(base64Image) {
  try {
    const result = await model.generateContent([
      "Extract the vehicle number from this image (e.g., MH12AB1234):",
      { inlineData: { data: base64Image, mimeType: "image/jpeg" } },
    ]);
    return result.response.text();
  } catch (err) {
    console.error("Gemini image analysis error:", err);
    throw new Error("AI image processing failed");
  }
}
