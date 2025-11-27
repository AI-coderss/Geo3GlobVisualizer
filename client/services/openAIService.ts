import { ChatMessage, CountryData, Coordinates } from "../types";

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
      max_tokens: 600,
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
// TRUE streaming (token-by-token) using GPT-4o via SSE (Chat Completions)
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
        max_tokens: 350,
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

// ---------------------------------------------------------------------
// Bar-race data generator (AI returns frames: year -> top countries + value)
// ---------------------------------------------------------------------

export type BarRaceRow = { country: string; value: number };
export type BarRaceFrame = { year: number; rows: BarRaceRow[] };
export type BarRacePayload = {
  title: string;
  metric: string;              // e.g. "Life expectancy"
  unit: string;                // e.g. "years"
  scope: "world" | "continent";
  continent?: string;
  topN: number;                // e.g. 10
  updateFrequencyMs: number;   // e.g. 1800
  frames: BarRaceFrame[];      // sorted by year ascending
  note?: string;               // optional note
};

export const generateBarRacePayload = async (
  userQuery: string,
  countryContext: CountryData
): Promise<BarRacePayload> => {
  const systemMessage = {
    role: "system" as const,
    content: `
You are a data analyst + visualization engineer.
You must output STRICT JSON only (no markdown).
You generate a bar-race dataset over YEARS for countries, based on the user's request.

Rules:
- If the user asks for "continent", limit to that continent; otherwise default to world.
- If the user asks for a year range, use it; otherwise choose a reasonable range (at least 8 years).
- topN must be between 5 and 15 (default 10).
- Values must be numeric (floats allowed).
- Frames must be sorted by year ascending.
- Each frame.rows must have exactly topN rows and be sorted DESC by value.
- Include a short "note" if data is approximate or synthesized.
`.trim(),
  };

  const userMessage = {
    role: "user" as const,
    content: `
Selected country context: ${countryContext.name}

User request:
"${userQuery}"

Return ONLY a JSON object with EXACTLY these fields:
{
  "title": string,
  "metric": string,
  "unit": string,
  "scope": "world" | "continent",
  "continent": string | undefined,
  "topN": number,
  "updateFrequencyMs": number,
  "frames": [
     { "year": number, "rows": [ { "country": string, "value": number } ] }
  ],
  "note": string | undefined
}

No extra keys.
`.trim(),
  };

  const data = await callOpenAI({
    messages: [systemMessage, userMessage],
    temperature: 0.35,
    max_tokens: 1200,
    response_format: { type: "json_object" },
  });

  const content = data?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("No JSON returned for bar-race payload.");
  }

  const parsed = JSON.parse(content);

  // light normalization/guardrails
  const topN = Math.min(15, Math.max(5, Number(parsed.topN ?? 10)));
  const updateFrequencyMs = Math.min(4000, Math.max(500, Number(parsed.updateFrequencyMs ?? 1800)));

  const frames: BarRaceFrame[] = Array.isArray(parsed.frames)
    ? parsed.frames
        .map((f: any) => ({
          year: Number(f.year),
          rows: Array.isArray(f.rows)
            ? f.rows
                .map((r: any) => ({
                  country: String(r.country ?? "").trim(),
                  value: Number(r.value),
                }))
                .filter((r: any) => r.country && Number.isFinite(r.value))
                .slice(0, topN)
            : [],
        }))
        .filter((f: any) => Number.isFinite(f.year) && f.rows.length)
        .sort((a: any, b: any) => a.year - b.year)
    : [];

  // ensure each frame has exactly topN rows (best-effort)
  const fixedFrames = frames.map((f) => {
    const rows = [...f.rows].sort((a, b) => b.value - a.value).slice(0, topN);
    return { ...f, rows };
  });

  return {
    title: String(parsed.title ?? "Country Bar Race"),
    metric: String(parsed.metric ?? "Metric"),
    unit: String(parsed.unit ?? ""),
    scope: parsed.scope === "continent" ? "continent" : "world",
    continent: parsed.scope === "continent" ? String(parsed.continent ?? "").trim() : undefined,
    topN,
    updateFrequencyMs,
    frames: fixedFrames,
    note: parsed.note ? String(parsed.note) : undefined,
  };
};
