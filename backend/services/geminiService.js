/**
 * Gemini Service - Handles interaction with Google's Gemini API for multimodal tasks.
 * Includes exponential backoff for reliable API calls.
 */
// FIX: Changed static require to dynamic import for node-fetch ESM compatibility
// We will store the imported fetch function in a variable outside of the functions
let fetch;
import("node-fetch")
  .then((mod) => {
    fetch = mod.default;
  })
  .catch((err) => {
    console.error(
      "Failed to load node-fetch. The Gemini service will not work.",
      err
    );
  });

require("dotenv").config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${GEMINI_API_KEY}`;
const MAX_RETRIES = 5;

// Define a JSON schema for structured output (number plate)
const licensePlateSchema = {
  type: "OBJECT",
  properties: {
    licensePlate: {
      type: "STRING",
      description:
        "The most prominent license plate number detected in the image, strictly alphanumeric and capitalized.",
    },
  },
  required: ["licensePlate"],
};

// NEW: Define JSON schema for multimodal route output
const routeSchema = {
  type: "OBJECT",
  properties: {
    routeDescription: {
      type: "STRING",
      description:
        "A summary of the suggested route, e.g., 'Walk to Borivali Station, take the Western Line train to Andheri, then take a share auto to your destination.'",
    },
    totalTravelTimeMinutes: {
      type: "NUMBER",
      description: "The estimated total travel time in minutes.",
    },
    estimatedCostRupees: {
      type: "NUMBER",
      description: "The estimated total cost in Indian Rupees (₹).",
    },
    steps: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          mode: {
            type: "STRING",
            enum: ["WALK", "TRAIN", "SHARED_AUTO", "AUTO"],
            description: "The mode of transport for this step.",
          },
          instruction: {
            type: "STRING",
            description: "A detailed instruction for this step.",
          },
          durationMinutes: {
            type: "NUMBER",
            description: "Duration of this step in minutes.",
          },
          costRupees: {
            type: "NUMBER",
            description: "Cost of this step in Rupees.",
          },
        },
        required: ["mode", "instruction", "durationMinutes", "costRupees"],
      },
    },
  },
  required: [
    "routeDescription",
    "totalTravelTimeMinutes",
    "estimatedCostRupees",
    "steps",
  ],
};

/**
 * Executes a POST request to the Gemini API with exponential backoff.
 * @param {string} userPrompt - Text prompt for the model.
 * @param {string} base64Image - Base64 encoded image data (optional).
 * @param {Object} schema - JSON schema for structured output (optional).
 * @returns {Promise<Object>} The parsed JSON response from the model.
 */
async function callGeminiApiWithBackoff(
  userPrompt,
  base64Image = null,
  schema = licensePlateSchema
) {
  if (!fetch) {
    throw new Error(
      "node-fetch dependency not loaded. Cannot connect to Gemini API."
    );
  }
  if (!GEMINI_API_KEY) {
    throw new Error(
      "Gemini API Key is not configured in environment variables."
    );
  }

  const parts = [{ text: userPrompt }];
  if (base64Image) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg", // Assuming JPEG for common camera output
        data: base64Image,
      },
    });
  }

  const payload = {
    contents: [{ role: "user", parts: parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };

  let lastError = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status !== 429) {
          const errorBody = await response.text();
          throw new Error(
            `API returned status ${response.status}: ${errorBody}`
          );
        }
        lastError = `Rate limit error on attempt ${attempt + 1}`;
      } else {
        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!jsonText) {
          throw new Error("Gemini response was empty or malformed.");
        }
        return JSON.parse(jsonText);
      }
    } catch (error) {
      lastError = error.message;
      console.warn(
        `Gemini API Call Attempt ${attempt + 1} failed. Retrying in ${
          Math.pow(2, attempt) * 1000
        }ms. Error: ${error.message}`
      );
    }

    if (attempt < MAX_RETRIES - 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }

  throw new Error(
    `Failed to call Gemini API after ${MAX_RETRIES} attempts. Last error: ${lastError}`
  );
}

/**
 * Public function to extract the license plate from an image.
 * @param {string} base64Image - Base64 encoded image data.
 * @returns {Promise<string>} Extracted license plate number.
 */
async function extractLicensePlate(base64Image) {
  const prompt =
    "Identify the license plate number visible in this image. This is an Indian auto rickshaw plate from Maharashtra, starting with MH. The plate format is MH-XX-YY-ZZZZ. Output the plate string without any spaces or dashes (e.g., MH02DK6801). Strictly output the result as a JSON object matching the provided schema, containing only the capitalized alphanumeric license plate text. Do not include any other text or explanation in the response.";

  const jsonResponse = await callGeminiApiWithBackoff(
    prompt,
    base64Image,
    licensePlateSchema
  );

  if (jsonResponse && jsonResponse.licensePlate) {
    return String(jsonResponse.licensePlate)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  throw new Error("Could not extract a valid license plate from the image.");
}

/**
 * NEW: Public function to find a multimodal route (Shared Auto + Train/Walk)
 * @param {number} startLat - Start Latitude
 * @param {number} startLng - Start Longitude
 * @param {number} endLat - End Latitude
 * @param {number} endLng - End Longitude
 * @param {Array<Object>} standsData - Internal list of auto stands/routes.
 * @returns {Promise<Object>} Multimodal route object from Gemini.
 */
async function findMultimodalRoute(
  startLat,
  startLng,
  endLat,
  endLng,
  standsData
) {
  // Format the internal stands data into a concise string for the model
  const standMap = standsData
    .map((s) => {
      const routes = s.routes
        .map(
          (r) => `${r.destination} (Fare: ₹${r.fare}, Time: ${r.travel_time})`
        )
        .join("; ");
      return `Stand: ${s.name} (Lat: ${s.latitude}, Lng: ${s.longitude}, Routes: [${routes}])`;
    })
    .join("\n");

  // Detailed instruction for the model
  const systemPrompt = `
    You are an expert route planner for Mumbai, India. Your task is to generate the most optimal multimodal travel plan between a specific start and end coordinate in Mumbai.
    The primary mode of travel is either a combination of walking and using the Mumbai Western Line local train network, OR a combination of walking and using the provided Shared Auto Stands network.
    You must only use modes: WALK, TRAIN (Western Line), SHARED_AUTO (using the stands data), or AUTO (direct private auto, only if other options are poor).

    Use the following information:
    1.  **Coordinates:** Start(${startLat}, ${startLng}) to End(${endLat}, ${endLng}).
    2.  **External Knowledge:** You must rely on your knowledge of Mumbai's geography, the Western Line train route/stations (e.g., Borivali, Andheri, Bandra, Dadar, Churchgate), typical fares (Train: ₹5-₹20; Walk: 15 min/km), and estimated travel times.
    3.  **Shared Auto Stand Data:** Use the provided list of auto stands and their fixed routes for any SHARED_AUTO steps. Use walking steps to connect to the nearest suitable train station OR shared auto stand.

    Plan the route in detail and output the result strictly in the specified JSON format. Ensure all costs and times are realistic for Mumbai public transport.
  `;

  const userQuery = `
    Find the best multimodal route from Start Latitude: ${startLat}, Longitude: ${startLng} to End Latitude: ${endLat}, Longitude: ${endLng}.
    Prioritize routes using the Western Line train or multiple Shared Auto stands.
    Here is the list of available Share Auto Stands and their routes:
    ---
    ${standMap}
    ---
    Calculate the total time and cost by summing the details from the individual steps.
  `;

  const prompt = `${systemPrompt}

${userQuery}`;

  // Call Gemini with the specific schema for route planning
  const jsonResponse = await callGeminiApiWithBackoff(
    prompt,
    null,
    routeSchema
  );

  if (jsonResponse) {
    // Sanitize output (e.g., round costs/time)
    jsonResponse.totalTravelTimeMinutes = Math.round(
      jsonResponse.totalTravelTimeMinutes
    );
    jsonResponse.estimatedCostRupees = Math.round(
      jsonResponse.estimatedCostRupees
    );
    return jsonResponse;
  }

  throw new Error("Gemini failed to generate a multimodal route plan.");
}

module.exports = {
  extractLicensePlate,
  findMultimodalRoute,
};
