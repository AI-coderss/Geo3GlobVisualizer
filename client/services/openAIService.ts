import { CountryData, Coordinates, ChatMessage } from "../types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.API_KEY;
const OPENAI_MODEL = "gpt-4o";

const OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions";

const callOpenAI = async (body: Record<string, any>): Promise<any> => {
  if (!OPENAI_API_KEY) {
    throw new Error(
      "OpenAI API key not found. Please set OPENAI_API_KEY (or API_KEY) in your environment."
    );
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
    throw new Error(
      `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response.json();
};

// ---------------------------------------------------------------------
// Country details (structured JSON) using GPT-4o
// NOW includes famousPeople with links
// ---------------------------------------------------------------------

export const getCountryDetailsByName = async (
  countryName: string,
  coords: Coordinates
): Promise<CountryData | null> => {
  try {
    const systemMessage = {
      role: "system" as const,
      content:
        "You are a world-class travel expert. Provide accurate, engaging tourist data in strict JSON format. Do not output any text outside JSON.",
    };

    const userMessage = {
      role: "user" as const,
      content: `
The user has selected "${countryName}" on a 3D globe.

Return ONLY a single JSON object with EXACTLY these fields:
- flagEmoji: string (the emoji flag for the country)
- capital: string (capital city)
- population: string (approximate population, human-readable, e.g., "67 million")
- description: string (a catchy, engaging 2-sentence intro for a tourist)
- touristSites: array of exactly 4 strings (top tourist attractions)
- famousPeople: array of exactly 5 objects, each object:
  - name: string
  - knownFor: string (short: why they're famous)
  - link: string (a working HTTPS link; prefer Wikipedia page for reliability)

Rules:
- Do NOT include markdown, backticks, comments, or extra keys.
- Links must be valid-looking HTTPS URLs (prefer https://en.wikipedia.org/wiki/...).
- Keep names globally recognizable and relevant to ${countryName}.
`,
    };

    const data = await callOpenAI({
      messages: [systemMessage, userMessage],
      temperature: 0.7,
      max_tokens: 700,
      response_format: { type: "json_object" },
    });

    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== "string") return null;

    const parsed = JSON.parse(content);

    // Defensive normalization (keeps app resilient)
    const touristSites: string[] = Array.isArray(parsed.touristSites)
      ? parsed.touristSites.filter(Boolean).slice(0, 4)
      : [];

    const famousPeople = Array.isArray(parsed.famousPeople)
      ? parsed.famousPeople
          .filter((p: any) => p && typeof p === "object")
          .slice(0, 5)
          .map((p: any) => ({
            name: String(p.name ?? "").trim(),
            knownFor: String(p.knownFor ?? "").trim(),
            link: String(p.link ?? "").trim(),
          }))
          .filter((p: any) => p.name && p.link)
      : [];

    // NOTE:
    // If your CountryData type does NOT yet include `famousPeople`,
    // this cast keeps the build working until you extend types.ts and the UI.
    return ({
      name: countryName,
      flagEmoji: parsed.flagEmoji,
      capital: parsed.capital,
      description: parsed.description,
      population: parsed.population,
      touristSites,
      famousPeople,
      coordinates: coords,
    } as unknown) as CountryData;
  } catch (error) {
    console.error("Error fetching country details:", error);
    return ({
      name: countryName,
      flagEmoji: "🏳️",
      capital: "Unknown",
      description: "Could not load details at this time.",
      population: "Unknown",
      touristSites: [],
      famousPeople: [],
      coordinates: coords,
    } as unknown) as CountryData;
  }
};

// ---------------------------------------------------------------------
// TRUE streaming (token-by-token) using GPT-4o via SSE
// ---------------------------------------------------------------------

export const createChatStream = async (
  history: ChatMessage[],
  newMessage: string,
  countryContext: CountryData,
  onChunk: (text: string) => void
) => {
  try {
    if (!OPENAI_API_KEY) {
      throw new Error(
        "OpenAI API key not found. Please set OPENAI_API_KEY (or API_KEY) in your environment."
      );
    }

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

    const response = await fetch(OPENAI_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [systemMessage, ...historyMessages, userMessage],
        temperature: 0.8,
        max_tokens: 300,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error("Streaming not supported (no response body).");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const evt of events) {
        const lines = evt
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;

          const dataStr = line.replace(/^data:\s*/, "");
          if (dataStr === "[DONE]") return;

          try {
            const json = JSON.parse(dataStr);
            const delta = json?.choices?.[0]?.delta?.content;
            if (delta) onChunk(delta);
          } catch {
            // ignore partial frames
          }
        }
      }
    }
  } catch (error) {
    console.error("Chat stream error:", error);
    onChunk("I'm having trouble connecting to the travel network. Please try again.");
  }
};
