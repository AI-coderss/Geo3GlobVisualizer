import { GoogleGenAI, Type, Schema } from "@google/genai";
import { ChatMessage, CountryData, Coordinates } from "../../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const modelName = 'gemini-2.5-flash';

// Schema for structured country data
const countrySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    flagEmoji: { type: Type.STRING, description: "The emoji flag for the country." },
    capital: { type: Type.STRING, description: "Capital city." },
    population: { type: Type.STRING, description: "Approximate population." },
    description: { type: Type.STRING, description: "A catchy, 2-sentence intro for a tourist." },
    touristSites: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "List of 4 top tourist attractions."
    }
  },
  required: ["flagEmoji", "capital", "description"],
};

export const getCountryDetailsByName = async (countryName: string, coords: Coordinates): Promise<CountryData | null> => {
  try {
    const prompt = `You are an elite travel guide. The user has selected "${countryName}" on the 3D globe. 
    Provide exciting tourist information for this country.`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: countrySchema,
        systemInstruction: "You are a world-class travel expert. Provide accurate, engaging data.",
      },
    });

    const text = response.text;
    if (!text) return null;

    const data = JSON.parse(text);

    return {
      name: countryName,
      flagEmoji: data.flagEmoji,
      capital: data.capital,
      description: data.description,
      population: data.population,
      touristSites: data.touristSites,
      coordinates: coords
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
        coordinates: coords
    };
  }
};

export const createChatStream = async (
  history: ChatMessage[], 
  newMessage: string, 
  countryContext: CountryData,
  onChunk: (text: string) => void
) => {
  try {
    const historyParts = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    const chat = ai.chats.create({
      model: modelName,
      history: historyParts,
      config: {
        systemInstruction: `You are an expert local travel guide for ${countryContext.name}. 
        Your tone is enthusiastic, knowledgeable, and helpful. 
        You know the best restaurants, hidden spots, and cultural tips.
        Keep responses concise (under 100 words) unless asked for a detailed itinerary.`,
      }
    });

    const result = await chat.sendMessageStream({ message: newMessage });
    
    for await (const chunk of result) {
      if (chunk.text) {
        onChunk(chunk.text);
      }
    }
  } catch (error) {
    console.error("Chat stream error:", error);
    onChunk("I'm having trouble connecting to the travel network. Please try again.");
  }
};
