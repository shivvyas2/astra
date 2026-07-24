export type Tradition = "vedic" | "western";

export type BirthInput = {
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:mm
  lat: number;
  lng: number;
  timezone: string; // IANA
};

export type Planet = {
  name: string;
  sign: string;
  degree: number;
  house: number;
  retrograde: boolean;
  nakshatra?: string;
};

export type DashaInfo = {
  mahadasha: string;
  mahadashaStart: string; // ISO date
  mahadashaEnd: string;
  antardasha: string;
  antardashaStart: string;
  antardashaEnd: string;
};

export type Chart = {
  tradition: Tradition;
  ascendant: { sign: string; degree: number };
  houses: number[]; // 12 cusp longitudes
  planets: Planet[];
  moonSign: string;
  sunSign: string;
  ayanamsa?: number;
  dasha?: DashaInfo; // Vedic only — current Vimshottari mahadasha/antardasha
};
