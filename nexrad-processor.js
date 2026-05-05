// nexrad-processor.js
import nexrad from "nexrad-level-3-data";

const NEXRAD_BUCKET_URL = "https://unidata-nexrad-level3.s3.amazonaws.com";
const EARTH_RADIUS_METERS = 6371008.8;
const DEFAULT_MAX_RANGE_METERS = 124 * 1852;
const LATEST_URL_TTL_MS = 10 * 1000;
const PARSED_DATA_TTL_MS = 10 * 1000;

const latestUrlCache = new Map();
const parsedRadarCache = new Map();

function toDbz(bin) {
  return (bin - 2) * 5;
}

function dayPrefix(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}_${month}_${day}`;
}

function pickNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function inferMaxRangeMeters(level3Data, radialData) {
  const productDescription = level3Data?.productDescription || {};
  const kilometers = pickNumber(
    productDescription.maxRangeKm,
    productDescription.rangeKm,
    productDescription.maximumRangeKm,
    productDescription.rangeToLastBinKm,
    productDescription.unambiguousRangeKm,
  );

  if (kilometers) return kilometers * 1000;

  const nauticalMiles = pickNumber(
    productDescription.maxRangeNm,
    productDescription.rangeNm,
    productDescription.maximumRangeNm,
    productDescription.unambiguousRangeNm,
  );

  if (nauticalMiles) return nauticalMiles * 1852;

  const firstBins = radialData?.[0]?.bins;
  if (firstBins && firstBins.length > 0) {
    const gateSize = inferGateSizeMeters(level3Data, radialData);
    return firstBins.length * gateSize;
  }

  return DEFAULT_MAX_RANGE_METERS;
}

function inferGateSizeMeters(level3Data, radialData) {
  const productDescription = level3Data?.productDescription || {};
  const gateMeters = pickNumber(
    productDescription.gateSizeMeters,
    productDescription.gateSizeM,
    productDescription.rangeBinSizeMeters,
    productDescription.rangeBinSizeM,
    productDescription.sampleIntervalMeters,
    productDescription.binSizeMeters,
  );

  if (gateMeters) return gateMeters;

  const gateKilometers = pickNumber(
    productDescription.gateSizeKm,
    productDescription.rangeBinSizeKm,
    productDescription.sampleIntervalKm,
    productDescription.binSizeKm,
  );

  if (gateKilometers) return gateKilometers * 1000;

  const firstBins = radialData?.[0]?.bins;
  if (firstBins && firstBins.length > 0) {
    return inferMaxRangeMeters(level3Data, radialData) / firstBins.length;
  }

  return 250;
}

function destinationPoint(latDeg, lonDeg, bearingDeg, distanceMeters) {
  const lat1 = (latDeg * Math.PI) / 180;
  const lon1 = (lonDeg * Math.PI) / 180;
  const theta = (bearingDeg * Math.PI) / 180;
  const delta = distanceMeters / EARTH_RADIUS_METERS;

  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinDelta = Math.sin(delta);
  const cosDelta = Math.cos(delta);
  const sinTheta = Math.sin(theta);
  const cosTheta = Math.cos(theta);

  const sinLat2 = sinLat1 * cosDelta + cosLat1 * sinDelta * cosTheta;
  const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));

  const y = sinTheta * sinDelta * cosLat1;
  const x = cosDelta - sinLat1 * sinLat2;
  const lon2 = lon1 + Math.atan2(y, x);

  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (((((lon2 * 180) / Math.PI + 540) % 360) + 360) % 360) - 180,
  };
}

function parseKeysFromS3ListXml(xmlText) {
  const keys = [];
  let start = 0;
  const openTag = "<Key>";
  const closeTag = "</Key>";

  while (start < xmlText.length) {
    const keyOpen = xmlText.indexOf(openTag, start);
    if (keyOpen === -1) break;

    const valueStart = keyOpen + openTag.length;
    const keyClose = xmlText.indexOf(closeTag, valueStart);
    if (keyClose === -1) break;

    keys.push(xmlText.slice(valueStart, keyClose));
    start = keyClose + closeTag.length;
  }

  return keys;
}

/**
 * Fetches the latest available NEXRAD Level 3 radar data URL for a given site.
 * Uses one S3 list request instead of sequential HEAD probes.
 */
export async function getLatestRadarUrl(
  siteId,
  product = "N0B",
  date = new Date(),
) {
  const prefix = `${siteId}_${product}_${dayPrefix(date)}`;
  const cacheKey = `${siteId}|${product}|${dayPrefix(date)}`;
  const cached = latestUrlCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.createdAt < LATEST_URL_TTL_MS) {
    return cached.url;
  }

  const listUrl = `${NEXRAD_BUCKET_URL}/?prefix=${encodeURIComponent(prefix)}`;
  const response = await fetch(listUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to list radar files: ${response.status} ${response.statusText}`,
    );
  }

  const xmlText = await response.text();
  const keys = parseKeysFromS3ListXml(xmlText)
    .filter((key) => key.startsWith(prefix))
    .sort();

  if (keys.length === 0) {
    throw new Error(
      `No radar files found for ${siteId} ${product} on ${dayPrefix(date)}`,
    );
  }

  const latestKey = keys[keys.length - 1];
  const url = `${NEXRAD_BUCKET_URL}/${latestKey}`;
  latestUrlCache.set(cacheKey, { url, createdAt: now });
  return url;
}

/**
 * Fetches and parses NEXRAD Level 3 radar data.
 * Result is cache-aware for repeated calls to the same URL.
 */
export async function fetchRadarData(siteId, site, options = {}) {
  const {
    product = "N0B",
    date = new Date(),
    url: explicitUrl = null,
  } = options;

  try {
    const url = explicitUrl || (await getLatestRadarUrl(siteId, product, date));
    const now = Date.now();
    const cached = parsedRadarCache.get(url);

    if (cached && now - cached.createdAt < PARSED_DATA_TTL_MS) {
      return cached.payload;
    }

    const response = await fetch(url, {
      cache: "force-cache",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch radar data: ${response.status} ${response.statusText}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const level3Data = new nexrad.Level3Data(arrayBuffer);
    const payload = {
      radarData: level3Data,
      geoJSON: processRadarDataToGeoJSON(level3Data, site),
      metadata: extractMetadata(level3Data),
      sourceUrl: url,
    };

    parsedRadarCache.set(url, { payload, createdAt: now });
    return payload;
  } catch (error) {
    console.error("Error fetching radar data:", error);
    throw error;
  }
}

/**
 * Extracts metadata from Level 3 radar data.
 */
function extractMetadata(level3Data) {
  return {
    timestamp: level3Data?.header?.timestamp || null,
    radarId: level3Data?.header?.icao || null,
    productCode: level3Data?.header?.productCode || null,
    elevationAngle: level3Data?.productDescription?.elevationAngle || 0,
    productName: level3Data?.header?.productName || null,
    maxReflectivity: getMaxReflectivity(level3Data),
  };
}

/**
 * Gets the maximum reflectivity value from the radar data.
 */
function getMaxReflectivity(level3Data) {
  const radialData = level3Data?.symbologyBlock?.data;
  if (!Array.isArray(radialData) || radialData.length === 0) return 0;

  let maxValue = 0;
  for (let i = 0; i < radialData.length; i += 1) {
    const bins = radialData[i]?.bins;
    if (!bins) continue;

    for (let j = 0; j < bins.length; j += 1) {
      const bin = bins[j];
      if (bin > maxValue) maxValue = bin;
    }
  }

  return toDbz(maxValue);
}

/**
 * Processes radar data into GeoJSON format.
 * Uses great-circle projection for accurate gate placement at all ranges.
 */
function processRadarDataToGeoJSON(level3Data, site) {
  const radialData = level3Data?.symbologyBlock?.data;
  if (!Array.isArray(radialData) || radialData.length === 0 || !site) {
    return {
      type: "FeatureCollection",
      features: [],
      metadata: {
        siteId: site?.id || null,
        siteName: site?.name || null,
        latitude: site?.latitude || null,
        longitude: site?.longitude || null,
        timestamp: level3Data?.header?.timestamp || null,
      },
    };
  }

  const siteLat = Number(site.latitude);
  const siteLon = Number(site.longitude);
  if (!Number.isFinite(siteLat) || !Number.isFinite(siteLon)) {
    throw new Error("Site latitude/longitude must be finite numbers");
  }

  const gateSizeMeters = inferGateSizeMeters(level3Data, radialData);
  const maxRangeMeters = inferMaxRangeMeters(level3Data, radialData);

  const features = [];

  for (let radialIndex = 0; radialIndex < radialData.length; radialIndex += 1) {
    const radial = radialData[radialIndex];
    if (!radial || !radial.bins || radial.bins.length === 0) continue;

    const azimuth = Number(radial?.header?.azimuth);
    if (!Number.isFinite(azimuth)) continue;

    const bins = radial.bins;
    const radialGateSize =
      gateSizeMeters > 0 ? gateSizeMeters : maxRangeMeters / bins.length;

    for (let binIndex = 0; binIndex < bins.length; binIndex += 1) {
      const bin = bins[binIndex];
      if (bin === 0 || bin == null) continue;

      const distanceMeters = (binIndex + 0.5) * radialGateSize;
      const point = destinationPoint(siteLat, siteLon, azimuth, distanceMeters);

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [point.lon, point.lat],
        },
        properties: {
          reflectivity: bin,
          dbz: toDbz(bin),
          azimuth,
          distance: distanceMeters / 1000,
          rangeIndex: binIndex,
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      siteId: site.id,
      siteName: site.name,
      latitude: siteLat,
      longitude: siteLon,
      timestamp: level3Data?.header?.timestamp || null,
      gateSizeMeters,
      maxRangeMeters,
    },
  };
}

/**
 * Extracts reflectivity data as a simplified JSON structure for direct use.
 */
export function extractReflectivityData(level3Data) {
  const radialData = level3Data?.symbologyBlock?.data;
  if (!Array.isArray(radialData) || radialData.length === 0) {
    return {
      timestamp: level3Data?.header?.timestamp || null,
      radarId: level3Data?.header?.icao || null,
      productCode: level3Data?.header?.productCode || null,
      reflectivity: [],
    };
  }

  const gateSizeMeters = inferGateSizeMeters(level3Data, radialData);
  const reflectivityData = [];

  for (let i = 0; i < radialData.length; i += 1) {
    const radial = radialData[i];
    const bins = radial?.bins;
    if (!bins || bins.length === 0) continue;

    const azimuth = radial?.header?.azimuth;
    const outputBins = [];

    for (let j = 0; j < bins.length; j += 1) {
      const bin = bins[j];
      if (bin === 0 || bin == null) continue;

      outputBins.push({
        value: toDbz(bin),
        rangeIndex: j,
        range: (j + 0.5) * gateSizeMeters,
      });
    }

    if (outputBins.length > 0) {
      reflectivityData.push({
        azimuth,
        bins: outputBins,
      });
    }
  }

  return {
    timestamp: level3Data?.header?.timestamp || null,
    radarId: level3Data?.header?.icao || null,
    productCode: level3Data?.header?.productCode || null,
    reflectivity: reflectivityData,
  };
}

/**
 * Gets reflectivity color for a dBZ value.
 */
export function getReflectivityColor(dbz) {
  if (dbz < 5) return "#00000000";
  if (dbz < 10) return "#c0e8fe";
  if (dbz < 20) return "#008ae6";
  if (dbz < 30) return "#00ef00";
  if (dbz < 40) return "#ffff00";
  if (dbz < 50) return "#ff9600";
  if (dbz < 60) return "#fe0000";
  if (dbz < 70) return "#c800fe";
  return "#ffc0cb";
}
