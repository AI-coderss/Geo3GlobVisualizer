import React, { useState, useEffect, Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Globe } from './components/Globe';
import { CountryCard } from './components/CountryCard';
import { Coordinates, CountryData, Theme } from './types';
import { getCountryDetailsByName } from './services/openAIService';
import { Moon, Sun, Compass, Loader2, Search, X } from 'lucide-react';
import * as d3 from 'd3-geo';
import { GEOJSON_URL } from './constants';

export default function App() {
  const [theme, setTheme] = useState<Theme>(Theme.LIGHT);
  const [selectedLocation, setSelectedLocation] = useState<Coordinates | null>(null);
  const [selectedCountryName, setSelectedCountryName] = useState<string | null>(null);
  const [countryData, setCountryData] = useState<CountryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Data State
  const [geoJson, setGeoJson] = useState<any>(null);
  const [allCountries, setAllCountries] = useState<{name: string, centroid: Coordinates, code: string}[]>([]);
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Load GeoJSON once at top level
  useEffect(() => {
    fetch(GEOJSON_URL)
      .then(res => res.json())
      .then(data => {
        setGeoJson(data);
        // Pre-calculate centroids for search
        const countriesList = data.features.map((feature: any) => {
            // Use NAME_LONG if available for full names (e.g. "Dominican Republic"), fall back to NAME
            const name = feature.properties.NAME_LONG || feature.properties.NAME || feature.properties.name;
            const isoCode = feature.properties.ISO_A2 || "";
            const centroid = d3.geoCentroid(feature); // [lng, lat]
            return {
                name,
                code: isoCode,
                centroid: { lat: centroid[1], lng: centroid[0] }
            };
        }).filter((c: any) => c.name !== 'Antarctica'); // Filter out Antarctica if desired
        
        // Sort alphabetically
        countriesList.sort((a: any, b: any) => a.name.localeCompare(b.name));
        setAllCountries(countriesList);
      })
      .catch(err => console.error("Failed to load GeoJSON", err));
  }, []);

  const toggleTheme = () => {
    setTheme(prev => prev === Theme.LIGHT ? Theme.DARK : Theme.LIGHT);
  };

  const handleCountrySelect = async (name: string, coords: Coordinates, isoCode?: string) => {
    // If clicking the same country, do nothing, but ensure state is consistent
    if (name === selectedCountryName && countryData) return;

    // Reset search
    setSearchQuery('');
    setIsSearchOpen(false);

    setSelectedLocation(coords);
    setSelectedCountryName(name);
    setIsLoading(true);
    setCountryData(null);

    // Call API with the known name
    const data = await getCountryDetailsByName(name, coords);
    
    if (data) {
      // Merge ISO code if available
      setCountryData({ ...data, code: isoCode || data.code });
    }
    setIsLoading(false);
  };

  const handleCloseCard = () => {
    setSelectedLocation(null);
    setSelectedCountryName(null);
    setCountryData(null);
  };

  const filteredCountries = useMemo(() => {
    if (!searchQuery) return [];
    return allCountries.filter(c => 
        c.name.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 5); // Limit results
  }, [searchQuery, allCountries]);

  const isLight = theme === Theme.LIGHT;

  return (
    <div className={`w-full h-full relative transition-colors duration-500 overflow-hidden ${isLight ? 'bg-blue-50' : 'bg-slate-950'}`}>
      
      {/* 3D Scene */}
      <div className="absolute inset-0 z-0">
        <Canvas camera={{ position: [0, 0, 2.5], fov: 45 }}>
          <Suspense fallback={null}>
             {/* Only render Globe if data is loaded */}
             {geoJson && (
               <Globe 
                  theme={theme} 
                  geoJson={geoJson}
                  onCountrySelect={handleCountrySelect} 
                  selectedLocation={selectedLocation}
                  selectedCountryName={selectedCountryName}
               />
             )}
          </Suspense>
        </Canvas>
      </div>

      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-4 sm:p-6 z-10 pointer-events-none flex flex-col sm:flex-row justify-between items-start gap-4">
        
        {/* Title Card - Hide on mobile if a country is selected to save space */}
        <div className={`pointer-events-auto bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 shadow-lg transition-opacity duration-300
            ${selectedCountryName ? 'opacity-0 h-0 overflow-hidden sm:opacity-100 sm:h-auto' : 'opacity-100'}`}>
           <h1 className={`text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2 
              ${isLight ? 'text-slate-800' : 'text-white'}`}>
              <Compass className="animate-spin-slow text-blue-500" />
              EcoGlobe 3D
           </h1>
           <p className={`mt-2 text-xs sm:text-sm font-medium max-w-[200px] sm:max-w-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
             Interactive Tourism Visualizer.
           </p>
        </div>

        {/* Top Right Controls: Search + Theme */}
        <div className="flex items-start gap-3 w-full sm:w-auto justify-end pointer-events-auto">
             
             {/* Search Bar */}
             <div className="relative group w-full sm:w-64">
                <div className={`flex items-center gap-2 px-3 py-2.5 rounded-full border shadow-sm transition-all
                    ${isLight ? 'bg-white border-slate-200 focus-within:ring-2 ring-blue-500/20' : 'bg-slate-800 border-slate-700 text-white'}`}>
                    <Search size={16} className="opacity-50" />
                    <input 
                        type="text" 
                        placeholder="Search country..." 
                        className="bg-transparent outline-none w-full text-sm font-medium"
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setIsSearchOpen(true);
                        }}
                        onFocus={() => setIsSearchOpen(true)}
                    />
                    {searchQuery && (
                        <button onClick={() => setSearchQuery('')}>
                            <X size={14} className="opacity-50 hover:opacity-100" />
                        </button>
                    )}
                </div>

                {/* Search Results Dropdown */}
                {isSearchOpen && searchQuery && filteredCountries.length > 0 && (
                    <div className={`absolute top-full mt-2 left-0 w-full rounded-xl shadow-xl overflow-hidden border
                        ${isLight ? 'bg-white border-slate-100' : 'bg-slate-800 border-slate-700'}`}>
                        {filteredCountries.map(country => (
                            <button
                                key={country.name}
                                onClick={() => handleCountrySelect(country.name, country.centroid, country.code)}
                                className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between
                                    ${isLight ? 'hover:bg-blue-50 text-slate-700' : 'hover:bg-white/5 text-slate-200'}`}
                            >
                                <span>{country.name}</span>
                                <span className="text-xs opacity-50">Jump to ↗</span>
                            </button>
                        ))}
                    </div>
                )}
             </div>

            <button 
              onClick={toggleTheme}
              className={`p-3 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95 border
                ${isLight ? 'bg-white text-slate-800 border-slate-200' : 'bg-slate-800 text-yellow-400 border-slate-700'}`}
            >
              {isLight ? <Moon size={20} /> : <Sun size={20} />}
            </button>
        </div>
      </div>

      {/* Loading Overlay (Initial Load) */}
      {!geoJson && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900 text-white">
          <div className="flex flex-col items-center gap-4">
             <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
             <p className="font-mono text-sm tracking-widest uppercase">Initializing Geodata...</p>
          </div>
        </div>
      )}

      {/* Country Details Card */}
      <CountryCard 
        country={countryData} 
        isLoading={isLoading}
        onClose={handleCloseCard}
        theme={theme}
      />
    </div>
  );
}
