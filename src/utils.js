let uiScaleResizeRaf = null;
let mapInstance = null;
let dataMode = "radar";
let selectedRadarSite = null;
const THEME_STORAGE_KEY = "radar-ui-theme";
const UI_SCALE_MOBILE_BREAKPOINT = 900;

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function isMobileDevice() {
  const narrowScreen = window.innerWidth <= UI_SCALE_MOBILE_BREAKPOINT;
  const touchUA = /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
  const touchPoints =
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 1;
  return narrowScreen || touchUA || touchPoints;
}

function computeUiScale() {
  const w = window.innerWidth || UI_DESIGN_WIDTH;
  const h = window.innerHeight || UI_DESIGN_HEIGHT;

  if (w <= UI_SCALE_MOBILE_BREAKPOINT) {
    return 1.0;
  }

  const scale = Math.min(w / UI_DESIGN_WIDTH, h / UI_DESIGN_HEIGHT);
  return clampNumber(scale, UI_SCALE_MIN, UI_SCALE_MAX);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function normalizeLonLat(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const a = Number(coord[0]);
  const b = Number(coord[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  return { lon: b, lat: a };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  lat1 = (lat1 * Math.PI) / 180;
  lat2 = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

function destinationPoint(lat, lon, bearing, distanceMiles) {
  const R = 3959;
  const brng = (bearing * Math.PI) / 180;
  lat = (lat * Math.PI) / 180;
  lon = (lon * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat) * Math.cos(distanceMiles / R) +
      Math.cos(lat) * Math.sin(distanceMiles / R) * Math.cos(brng),
  );

  const lon2 =
    lon +
    Math.atan2(
      Math.sin(brng) * Math.sin(distanceMiles / R) * Math.cos(lat),
      Math.cos(distanceMiles / R) - Math.sin(lat) * Math.sin(lat2),
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lon: (lon2 * 180) / Math.PI,
  };
}

function isPointInPolygon(point, polygon) {
  const x = point[0];
  const y = point[1];
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

function getPolygonCentroid(coords, assumeLonLat = false) {
  if (!Array.isArray(coords) || coords.length < 3) return null;

  const points = coords.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    points.push(first);
  }

  let area = 0;
  let cx = 0;
  let cy = 0;

  for (let i = 0, len = points.length - 1; i < len; i++) {
    const c1 = assumeLonLat
      ? { lon: points[i][0], lat: points[i][1] }
      : normalizeLonLat(points[i]);
    const c2 = assumeLonLat
      ? { lon: points[i + 1][0], lat: points[i + 1][1] }
      : normalizeLonLat(points[i + 1]);
    if (!c1 || !c2) continue;
    const cross = c1.lon * c2.lat - c2.lon * c1.lat;
    area += cross;
    cx += (c1.lon + c2.lon) * cross;
    cy += (c1.lat + c2.lat) * cross;
  }

  if (area === 0) {
    let lonSum = 0;
    let latSum = 0;
    let count = 0;
    points.forEach((coord) => {
      const c = assumeLonLat
        ? { lon: coord[0], lat: coord[1] }
        : normalizeLonLat(coord);
      if (!c) return;
      lonSum += c.lon;
      latSum += c.lat;
      count++;
    });
    if (!count) return null;
    return { lon: lonSum / count, lat: latSum / count };
  }

  area *= 0.5;
  cx /= 6 * area;
  cy /= 6 * area;
  return { lon: cx, lat: cy };
}

function parsePalFile(palText) {
  const lines = palText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  let product = null;
  let units = null;
  let scale = 1.0;
  const colors = [];
  let rfColor = null;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    if (lowerLine.startsWith("product:")) {
      product = line.split(":")[1].trim();
    } else if (lowerLine.startsWith("units:")) {
      units = line.split(":")[1].trim();
    } else if (lowerLine.startsWith("scale:")) {
      const scaleStr = line.split(":")[1].trim();
      const parsedScale = parseFloat(scaleStr);
      if (!isNaN(parsedScale)) {
        scale = parsedScale;
      }
    } else if (lowerLine.startsWith("rf:")) {
      const parts = line.substring(3).trim().split(/\s+/);
      if (parts.length >= 3) {
        const r = parseInt(parts[0]);
        const g = parseInt(parts[1]);
        const b = parseInt(parts[2]);
        if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
          rfColor = { r, g, b };
        }
      }
    } else if (lowerLine.startsWith("color:")) {
      const parts = line.substring(6).trim().split(/\s+/);
      if (parts.length >= 4) {
        const value = parseFloat(parts[0]);
        const r = parseInt(parts[1]);
        const g = parseInt(parts[2]);
        const b = parseInt(parts[3]);

        if (!isNaN(value) && !isNaN(r) && !isNaN(g) && !isNaN(b)) {
          colors.push({ value, r, g, b });
        }
      }
    }
  }

  colors.sort((a, b) => a.value - b.value);

  if (rfColor) {
    colors.push({ value: 999, r: rfColor.r, g: rfColor.g, b: rfColor.b });
  }

  console.log("Parsed palette:", {
    product,
    units,
    scale,
    colorCount: colors.length,
    valueRange:
      colors.length > 0
        ? [colors[0].value, colors[colors.length - 1].value]
        : [],
  });

  return { product, units, scale, colors };
}

function generateColorRampArray(colorExpression, textureSize = 256) {
  const stops = [];
  for (let i = 3; i < colorExpression.length; i += 2) {
    const value = colorExpression[i];
    const colorStr = colorExpression[i + 1];

    if (typeof value !== "number" || !isFinite(value)) {
      continue;
    }

    const matches = colorStr.match(/(\d+(\.\d+)?)/g);
    if (!matches) {
      continue;
    }

    const [r = 0, g = 0, b = 0, a = 1] = matches.map(Number);
    const rgba = [Math.round(r), Math.round(g), Math.round(b), 255];

    stops.push({ value, color: rgba });
  }

  if (!stops.length) {
    return {
      data: new Uint8Array(textureSize * 4),
      minValue: 0,
      maxValue: 1,
    };
  }

  stops.sort((a, b) => a.value - b.value);

  const numericStops = stops.filter(
    (stop) => Number.isFinite(stop.value) && stop.value < 900,
  );

  const domainStops = numericStops.length ? numericStops : stops;
  let minValue = domainStops[0].value;
  let maxValue = domainStops[domainStops.length - 1].value;
  if (minValue === maxValue) {
    maxValue = minValue + 1;
  }

  const data = new Uint8Array(textureSize * 4);
  const denom = textureSize > 1 ? textureSize - 1 : 1;

  for (let i = 0; i < textureSize; i++) {
    const sampleValue = minValue + (i / denom) * (maxValue - minValue);
    let stop1 = stops[0];
    let stop2 = stops[stops.length - 1];

    for (let j = 0; j < stops.length - 1; j++) {
      if (sampleValue >= stops[j].value && sampleValue <= stops[j + 1].value) {
        stop1 = stops[j];
        stop2 = stops[j + 1];
        break;
      }
    }

    if (sampleValue > stop2.value) {
      stop1 = stop2;
    }

    const span = stop2.value - stop1.value;
    const t = span === 0 ? 0 : (sampleValue - stop1.value) / span;
    const offset = i * 4;

    data[offset] = Math.round(
      stop1.color[0] + t * (stop2.color[0] - stop1.color[0]),
    );
    data[offset + 1] = Math.round(
      stop1.color[1] + t * (stop2.color[1] - stop1.color[1]),
    );
    data[offset + 2] = Math.round(
      stop1.color[2] + t * (stop2.color[2] - stop1.color[2]),
    );
    data[offset + 3] = Math.round(
      stop1.color[3] + t * (stop2.color[3] - stop1.color[3]),
    );
  }

  return { data, minValue, maxValue };
}

const COORD_KEY_PRECISION = 1e5;

function makeCoordKey(lng, lat) {
  return `${Math.round(lng * COORD_KEY_PRECISION)}|${Math.round(
    lat * COORD_KEY_PRECISION,
  )}`;
}

function _b64ToUint8Array(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function formatBytesForArcSync(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "--";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

export {
  clampNumber,
  isMobileDevice,
  computeUiScale,
  formatDate,
  normalizeLonLat,
  calculateDistance,
  calculateBearing,
  destinationPoint,
  isPointInPolygon,
  getPolygonCentroid,
  parsePalFile,
  generateColorRampArray,
  makeCoordKey,
  _b64ToUint8Array,
  formatBytesForArcSync,
};