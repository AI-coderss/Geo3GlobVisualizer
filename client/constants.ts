
// Textures for the Globe
// Using high-res textures from Three.js examples repository which are reliable
export const TEXTURES = {
  earthDay: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg',
  earthNight: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_lights_2048.png',
  earthNormal: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg',
  clouds: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_clouds_1024.png',
};

// Natural Earth 50m Cultural Vectors (Countries)
// This resolution includes many smaller islands and countries missing in the 110m dataset
export const GEOJSON_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';

// Default camera position
export const INITIAL_CAMERA_POSITION = [0, 0, 2.5] as const;
