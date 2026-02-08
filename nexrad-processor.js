// nexrad-processor.js
import nexrad from "nexrad-level-3-data";

/**
 * Fetches the latest available NEXRAD Level 3 radar data for a given site
 * @param {string} siteId - The NEXRAD site ID (e.g., 'GRR', 'DTX')
 * @param {string} product - The product code (default: 'N0B' for Base Reflectivity)
 * @returns {Promise<string>} - The URL of the latest radar data
 */
export async function getLatestRadarUrl(siteId, product = "N0B") {
  const now = new Date();
  const NEXRAD_BUCKET_URL = "https://unidata-nexrad-level3.s3.amazonaws.com";

  // Try up to the last hour in 5-minute intervals
  for (let i = 0; i < 12; i++) {
    const testTime = new Date(now.getTime() - i * 5 * 60000);

    const year = testTime.getFullYear();
    const month = String(testTime.getMonth() + 1).padStart(2, "0");
    const day = String(testTime.getDate()).padStart(2, "0");
    const hours = String(testTime.getHours()).padStart(2, "0");
    const minutes = String(Math.floor(testTime.getMinutes() / 5) * 5).padStart(
      2,
      "0"
    );
    const seconds = "00";

    const url = `${NEXRAD_BUCKET_URL}/${siteId}_${product}_${year}_${month}_${day}_${hours}_${minutes}_${seconds}`;

    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok) {
        console.log(`Found valid radar data at: ${url}`);
        return url;
      }
    } catch (error) {
      // Continue to next timestamp
    }
  }

  throw new Error(`No recent radar data found for ${siteId} in the last hour`);
}

/**
 * Fetches and parses NEXRAD Level 3 radar data
 * @param {string} siteId - The NEXRAD site ID
 * @param {Object} site - The site object with latitude and longitude
 * @returns {Promise<Object>} - Processed radar data in GeoJSON format
 */
export async function fetchRadarData(siteId, site) {
  try {
    const url = await getLatestRadarUrl(siteId);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch radar data: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const level3Data = new nexrad.Level3Data(arrayBuffer);

    return {
      radarData: level3Data,
      geoJSON: processRadarDataToGeoJSON(level3Data, site),
      metadata: extractMetadata(level3Data),
    };
  } catch (error) {
    console.error("Error fetching radar data:", error);
    throw error;
  }
}

/**
 * Extracts metadata from Level 3 radar data
 * @param {Object} level3Data - The parsed Level 3 radar data
 * @returns {Object} - Extracted metadata
 */
function extractMetadata(level3Data) {
  return {
    timestamp: level3Data.header.timestamp,
    radarId: level3Data.header.icao,
    productCode: level3Data.header.productCode,
    elevationAngle: level3Data.productDescription?.elevationAngle || 0,
    productName: level3Data.header.productName,
    maxReflectivity: getMaxReflectivity(level3Data),
  };
}

/**
 * Gets the maximum reflectivity value from the radar data
 * @param {Object} level3Data - The parsed Level 3 radar data
 * @returns {number} - Maximum reflectivity value
 */
function getMaxReflectivity(level3Data) {
  let maxValue = 0;

  if (level3Data.symbologyBlock && level3Data.symbologyBlock.data) {
    level3Data.symbologyBlock.data.forEach((radial) => {
      radial.bins.forEach((bin) => {
        if (bin > maxValue) maxValue = bin;
      });
    });
  }

  // Convert bin value to dBZ (approximation)
  return (maxValue - 2) * 5;
}

/**
 * Processes radar data into GeoJSON format
 * @param {Object} level3Data - The parsed Level 3 radar data
 * @param {Object} site - The site object with latitude and longitude
 * @returns {Object} - GeoJSON representation of radar data
 */
function processRadarDataToGeoJSON(level3Data, site) {
  const features = [];
  const radialData = level3Data.symbologyBlock.data;

  // Calculate the radar range (max range in nautical miles)
  const radarRangeNM = 124; // Typical NEXRAD range
  const radarRangeMeters = radarRangeNM * 1852; // Convert NM to meters

  // For each radial in the radar data
  radialData.forEach((radial) => {
    // For each bin (range gate) in the radial
    radial.bins.forEach((bin, binIndex) => {
      // Skip empty bins (no reflectivity)
      if (bin === 0) return;

      // Calculate distance from radar (in proportion of max range)
      const distance = (binIndex / radial.bins.length) * radarRangeMeters;

      // Calculate angle in radians (adjusting for meteorological angle convention)
      const angleRad = (90 - radial.header.azimuth) * (Math.PI / 180);

      // Calculate the x and y offsets from the radar site
      const x = Math.cos(angleRad) * distance;
      const y = Math.sin(angleRad) * distance;

      // Convert to longitude/latitude
      const metersPerDegreeLatitude = 111111;
      const metersPerDegreeLongitude =
        Math.cos(site.latitude * (Math.PI / 180)) * 111111;

      const lon = site.longitude + x / metersPerDegreeLongitude;
      const lat = site.latitude + y / metersPerDegreeLatitude;

      // Create a GeoJSON feature for this radar bin
      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [lon, lat],
        },
        properties: {
          reflectivity: bin,
          dbz: (bin - 2) * 5, // Convert bin value to dBZ (approximation)
          azimuth: radial.header.azimuth,
          distance: distance / 1000, // Convert to km
        },
      });
    });
  });

  return {
    type: "FeatureCollection",
    features: features,
    metadata: {
      siteId: site.id,
      siteName: site.name,
      latitude: site.latitude,
      longitude: site.longitude,
      timestamp: level3Data.header.timestamp,
    },
  };
}

/**
 * Extracts reflectivity data as a simplified JSON structure for direct use
 * @param {Object} level3Data - The parsed Level 3 radar data
 * @returns {Object} - Simplified reflectivity data
 */
export function extractReflectivityData(level3Data) {
  const reflectivityData = [];

  if (level3Data.symbologyBlock && level3Data.symbologyBlock.data) {
    level3Data.symbologyBlock.data.forEach((radial) => {
      const azimuth = radial.header.azimuth;

      // Convert bin values to dBZ and include position data
      const bins = radial.bins
        .map((bin, index) => {
          return {
            value: bin === 0 ? null : (bin - 2) * 5, // Convert to dBZ or null if no data
            rangeIndex: index,
            // Range is approximate in meters, assuming equal distribution across bins
            range: (index / radial.bins.length) * 124 * 1852, // 124 NM max range converted to meters
          };
        })
        .filter((bin) => bin.value !== null); // Remove empty bins

      if (bins.length > 0) {
        reflectivityData.push({
          azimuth,
          bins,
        });
      }
    });
  }

  return {
    timestamp: level3Data.header.timestamp,
    radarId: level3Data.header.icao,
    productCode: level3Data.header.productCode,
    reflectivity: reflectivityData,
  };
}

/**
 * Gets reflectivity color for a dBZ value
 * @param {number} dbz - Reflectivity value in dBZ
 * @returns {string} - Hex color code
 */
export function getReflectivityColor(dbz) {
  if (dbz < 5) return "#00000000"; // Transparent for no/minimal reflectivity
  if (dbz < 10) return "#c0e8fe"; // Light blue
  if (dbz < 20) return "#008ae6"; // Medium blue
  if (dbz < 30) return "#00ef00"; // Light green
  if (dbz < 40) return "#ffff00"; // Yellow
  if (dbz < 50) return "#ff9600"; // Orange
  if (dbz < 60) return "#fe0000"; // Red
  if (dbz < 70) return "#c800fe"; // Purple
  return "#ffc0cb"; // Pink for values above 70
}
