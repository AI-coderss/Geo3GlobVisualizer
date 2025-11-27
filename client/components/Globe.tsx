import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Mesh, Vector3, DoubleSide, Color, TextureLoader, BackSide } from 'three';
import { CameraControls, Stars, Line } from '@react-three/drei';
import * as d3 from 'd3-geo';
import { Theme, Coordinates } from '../types';
import { TEXTURES } from '../constants';

interface GlobeProps {
  theme: Theme;
  geoJson: any; // Passed from App
  onCountrySelect: (name: string, coords: Coordinates, isoCode?: string) => void;
  selectedLocation: Coordinates | null;
  selectedCountryName: string | null;
}

// Convert Lat/Lon to 3D Position on Sphere Surface
const getPositionFromLatLon = (lat: number, lng: number, radius: number): Vector3 => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + 180) * (Math.PI / 180);
  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));
  return new Vector3(x, y, z);
};

// Convert 3D local point to Lat/Lon
const getLatLonFromPoint = (point: Vector3): Coordinates => {
  const p = point.clone().normalize();
  const lat = (Math.asin(p.y) * 180) / Math.PI;
  const theta = Math.atan2(p.z, -p.x);
  const lng = (theta * 180 / Math.PI) - 180;
  // Normalize longitude to -180 to 180
  const normalizedLng = ((lng + 540) % 360) - 180;
  return { lat, lng: normalizedLng };
};

export const Globe: React.FC<GlobeProps> = ({ theme, geoJson, onCountrySelect, selectedLocation, selectedCountryName }) => {
  const meshRef = useRef<Mesh>(null);
  const cloudsRef = useRef<Mesh>(null);
  const controlsRef = useRef<CameraControls>(null);

  // Load Textures
  const [colorMap, nightMap, normalMap, cloudsMap] = useLoader(TextureLoader, [
    TEXTURES.earthDay,
    TEXTURES.earthNight,
    TEXTURES.earthNormal,
    TEXTURES.clouds
  ]);

  const isLight = theme === Theme.LIGHT;

  // Process Countries: Calculate centroids and 3D positions
  const countries = useMemo(() => {
    if (!geoJson) return [];
    return geoJson.features.map((feature: any) => {
        // Use NAME_LONG if available, matching App.tsx logic
        const name = feature.properties.NAME_LONG || feature.properties.NAME || feature.properties.name;
        const isoCode = feature.properties.ISO_A2;
        const centroid = d3.geoCentroid(feature); // [lng, lat]
        const position = getPositionFromLatLon(centroid[1], centroid[0], 1.0);
        return {
            name,
            isoCode,
            centroid: { lat: centroid[1], lng: centroid[0] },
            position,
            feature
        };
    });
  }, [geoJson]);

  // Handle External Selection (e.g. from Search Bar)
  useEffect(() => {
    if (selectedCountryName && countries.length > 0 && meshRef.current && controlsRef.current) {
        const country = countries.find((c: any) => c.name === selectedCountryName);
        if (country) {
             // Animate to this country
             const targetV = country.position.clone();
             
             // We must account for the mesh rotation if we want to be exact, 
             // but handleSelectCountry logic uses localToWorld which handles it.
             
             meshRef.current.localToWorld(targetV);
             const camPos = targetV.clone().normalize().multiplyScalar(2.0);
             controlsRef.current.setLookAt(
                camPos.x, camPos.y, camPos.z,
                0, 0, 0,
                true
             );
        }
    }
  }, [selectedCountryName, countries]);

  // Process Selected Country Border Geometry
  const selectedBorders = useMemo(() => {
      if (!selectedCountryName || !countries) return [];
      const country = countries.find((c: any) => c.name === selectedCountryName);
      if (!country) return [];

      const lines: Vector3[][] = [];
      
      const projectRing = (ring: number[][]) => {
          // Raise lines slightly (1.005) to avoid z-fighting with the globe surface
          return ring.map(coord => getPositionFromLatLon(coord[1], coord[0], 1.005));
      }

      if (country.feature.geometry.type === 'Polygon') {
          lines.push(projectRing(country.feature.geometry.coordinates[0]));
      } else if (country.feature.geometry.type === 'MultiPolygon') {
          country.feature.geometry.coordinates.forEach((polygon: any) => {
              lines.push(projectRing(polygon[0]));
          });
      }
      return lines;
  }, [selectedCountryName, countries]);

  // Rotation Animation
  useFrame((state, delta) => {
    // Only rotate if no country is selected
    if (!selectedLocation && meshRef.current && cloudsRef.current) {
      meshRef.current.rotation.y += delta * 0.05;
      cloudsRef.current.rotation.y += delta * 0.055;
    }
  });

  const handleGlobeClick = (e: any) => {
    e.stopPropagation();
    if (!geoJson || !meshRef.current) return;

    // 1. Get the clicked point in the object's local space (accounting for rotation)
    const localPoint = meshRef.current.worldToLocal(e.point.clone());
    
    // 2. Convert to Lat/Lon
    const coords = getLatLonFromPoint(localPoint);
    
    // 3. Find which country contains this point
    let foundCountry = null;
    for (const country of countries) {
        if (d3.geoContains(country.feature, [coords.lng, coords.lat])) {
            foundCountry = country;
            break;
        }
    }

    if (foundCountry) {
        handleSelectCountry(foundCountry);
    }
  };

  const handleSelectCountry = (country: any) => {
      onCountrySelect(country.name, country.centroid, country.isoCode);
      
      if (meshRef.current && controlsRef.current) {
          const targetV = country.position.clone();
          meshRef.current.localToWorld(targetV);
          
          const camPos = targetV.clone().normalize().multiplyScalar(2.0); 

          controlsRef.current.setLookAt(
              camPos.x, camPos.y, camPos.z, 
              0, 0, 0, 
              true 
          );
      }
  };

  // Reset view if selection cleared
  useEffect(() => {
    if (!selectedLocation && controlsRef.current) {
        // Reset to a nice default view
        controlsRef.current.setLookAt(0, 0, 3.5, 0, 0, 0, true);
    }
  }, [selectedLocation]);

  return (
    <>
      <CameraControls 
        ref={controlsRef} 
        minDistance={1.2} 
        maxDistance={10} 
        zoomSpeed={1.5}
        rotateSpeed={0.8}
        dampingFactor={0.1}
        enabled={true} // Ensure controls are always enabled
      />
      
      <ambientLight intensity={isLight ? 1.5 : 0.3} />
      <directionalLight position={[5, 3, 5]} intensity={isLight ? 2 : 1} />
      {!isLight && <pointLight position={[-5, 2, -5]} intensity={1} color="#4444ff" />}

      <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />

      <group>
        <mesh 
            ref={meshRef} 
            onClick={handleGlobeClick} 
            onPointerOver={() => document.body.style.cursor = 'crosshair'}
            onPointerOut={() => document.body.style.cursor = 'auto'}
        >
          <sphereGeometry args={[1, 64, 64]} />
          <meshStandardMaterial
            map={isLight ? colorMap : nightMap}
            normalMap={normalMap}
            roughness={0.7}
            metalness={0.1}
            emissive={isLight ? new Color(0x000000) : new Color(0x111122)}
            emissiveMap={isLight ? null : nightMap}
            emissiveIntensity={isLight ? 0 : 3}
          />

          {/* Render Highlighted Country Border */}
          {selectedBorders.map((line, i) => (
              <Line
                key={i}
                points={line}
                color={isLight ? "#0066ff" : "#00ffcc"} // Bright Neon Blue/Cyan
                lineWidth={4}
                transparent
                opacity={1.0}
                depthTest={true}
                depthWrite={false}
              />
          ))}

        </mesh>

        <mesh ref={cloudsRef} scale={[1.01, 1.01, 1.01]}>
            <sphereGeometry args={[1, 64, 64]} />
            <meshStandardMaterial
                map={cloudsMap}
                transparent={true}
                opacity={0.3}
                side={DoubleSide}
                blending={2}
                depthWrite={false}
            />
        </mesh>
        
        {/* Atmosphere Glow */}
        {isLight && <mesh scale={[1.15, 1.15, 1.15]}>
             <sphereGeometry args={[1, 32, 32]} />
             <meshPhongMaterial 
                color="#88ccff" 
                transparent 
                opacity={0.1} 
                side={BackSide} 
             />
        </mesh>}
      </group>
    </>
  );
};