export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CountryData {
  name: string;
  flagEmoji: string;
  code?: string; // ISO 2-letter country code
  capital: string;
  description: string;
  population: string;
  touristSites: string[];
  coordinates: Coordinates;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export enum Theme {
  LIGHT = 'light',
  DARK = 'dark',
}