import { ChatMessage, CountryData, Coordinates } from "../../types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY;
const OPENAI_MODEL = "gpt-4o";

const OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions";

const callOpenAI = async (
  body: Record<string, any>
): Promise<any> => {
  if (!OPENAI_API_KEY) {
    throw new Error("OpenAI API key not found. Please set OPENAI_API_KEY (or API_KEY) in your environment.");
  }

  const response = await fetch(OPENAI_BASE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      ...body,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return response.json();
};

// ---------------------------------------------------------------------
// Country details (structured JSON) using GPT-4o
// ---------------------------------------------------------------------

export const getCountryDetailsByName = async (
  countryName: string,
  coords: Coordinates
): Promise<CountryData | null> => {
  try {
    const systemMessage = {
      role: "system" as const,
      content:
        "You are a world-class travel expert. Provide accurate, engaging tourist data in strict JSON format.",
    };

    const userMessage = {
      role: "user" as const,
      content: `
The user has selected "${countryName}" on a 3D globe.

Return ONLY a single JSON object with exactly the following fields:
- flagEmoji: string (the emoji flag for the country)
- capital: string (capital city)
- population: string (approximate population, human-readable, e.g., "67 million")
- description: string (a catchy, engaging 2-sentence intro for a tourist)
- touristSites: array of exactly 4 strings (top tourist attractions)

Do NOT include any markdown, backticks, or extra text. Just a raw JSON object.
`,
    };

    const data = await callOpenAI({
      messages: [systemMessage, userMessage],
      temperature: 0.7,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const parsed = JSON.parse(content);

    return {
      name: countryName,
      flagEmoji: parsed.flagEmoji,
      capital: parsed.capital,
      description: parsed.description,
      population: parsed.population,
      touristSites: parsed.touristSites,
      coordinates: coords,
    };
  } catch (error) {
    console.error("Error fetching country details:", error);
    return {
      name: countryName,
      flagEmoji: "🏳️",
      capital: "Unknown",
      description: "Could not load details at this time.",
      population: "Unknown",
      touristSites: [],
      coordinates: coords,
    };
  }
};

// ---------------------------------------------------------------------
// Chat stream using GPT-4o (interface unchanged)
// ---------------------------------------------------------------------

export const createChatStream = async (
  history: ChatMessage[],
  newMessage: string,
  countryContext: CountryData,
  onChunk: (text: string) => void
) => {
  try {
    const systemMessage = {
      role: "system" as const,
      content: `
You are an expert local travel guide for ${countryContext.name}.
Your tone is enthusiastic, knowledgeable, and helpful.
You know the best restaurants, hidden spots, and cultural tips.
Keep responses concise (under 100 words) unless asked for a detailed itinerary.
Use clear markdown when helpful (bullet points, short paragraphs).
      `.trim(),
    };

    const historyMessages = history.map((msg) => ({
      role: msg.role === "user" ? ("user" as const) : ("assistant" as const),
      content: msg.text,
    }));

    const userMessage = {
      role: "user" as const,
      content: newMessage,
    };

    const data = await callOpenAI({
      messages: [systemMessage, ...historyMessages, userMessage],
      temperature: 0.8,
      max_tokens: 300,
      // We keep stream: false and push the full response through onChunk
      // to preserve the same interface without changing the rest of the app.
      stream: false,
    });

    const content = data?.choices?.[0]?.message?.content ?? "";
    if (content) {
      onChunk(content);
    } else {
      onChunk("I'm having trouble responding right now. Please try again.");
    }
  } catch (error) {
    console.error("Chat stream error:", error);
    onChunk("I'm having trouble connecting to the travel network. Please try again.");
  }
};
