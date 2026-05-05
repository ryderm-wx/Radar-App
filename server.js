const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");

let ffmpegPath = null;
try {
  ffmpegPath = require("ffmpeg-static");
} catch (err) {
  console.warn("ffmpeg-static not available. RTSP snapshot fallback disabled.");
}

const app = express();

const DEFAULT_MAPS_DATA_REMOTE_URLS = [
  "https://raw.githubusercontent.com/anony121221/maps-data/main/All%20Combined/all_dot_cameras_states_only.geojson",
  "https://raw.githubusercontent.com/anony121221/maps-data/main/Misc/misc.geojson",
  "https://raw.githubusercontent.com/anony121221/maps-data/main/Skycams/skycams.geojson",
];
const MAPS_DATA_REMOTE_URLS = process.env.MAPS_DATA_REMOTE_URLS
  ? process.env.MAPS_DATA_REMOTE_URLS.split(",")
      .map((url) => url.trim())
      .filter(Boolean)
  : DEFAULT_MAPS_DATA_REMOTE_URLS;
const REMOTE_MAPS_DATA_ENABLED =
  process.env.REMOTE_MAPS_DATA_ENABLED !== "false";
const REMOTE_MAPS_DATA_CACHE_MS = Number(
  process.env.REMOTE_MAPS_DATA_CACHE_MS || 60 * 60 * 1000,
);
const CAMERA_DATA_ROOTS = [
  { dir: path.join(__dirname, "cameras"), label: "local" },
  { dir: path.join(__dirname, "maps-data"), label: "maps-data-local" },
];
const remoteMapsDataCache = {
  fetchedAt: 0,
  features: [],
  inflight: null,
};

// Serve static files from the project root directory
app.use(express.static(path.join(__dirname)));

function toFeatureCollection(payload) {
  if (!payload) return null;
  if (payload.type === "FeatureCollection" && Array.isArray(payload.features)) {
    return payload;
  }
  if (payload.type === "Feature") {
    return { type: "FeatureCollection", features: [payload] };
  }
  if (Array.isArray(payload)) {
    return { type: "FeatureCollection", features: payload };
  }
  return null;
}

function normalizeUrl(value) {
  if (typeof value !== "string") return "";
  const match = value.match(/(?:https?|rtsp):\/\/[^\s"']+/i);
  if (!match) return "";
  return match[0].replace(/[),.;]+$/, "");
}

function inferStateFromSourceFile(sourceFile) {
  if (typeof sourceFile !== "string" || !sourceFile) return "";
  const cleaned = path
    .basename(sourceFile)
    .replace(/^\d+_/, "")
    .replace(/\.(geojson|json)$/i, "");
  const stateToken = cleaned.split("_")[0];
  return stateToken ? stateToken.replace(/[-]+/g, " ").trim() : "";
}

function inferStateFromPath(filePath, rootDir) {
  const rel = path.relative(rootDir, filePath);
  if (rel.startsWith("..")) return "";
  const parts = rel.split(path.sep).filter(Boolean);
  return parts.length > 1 ? parts[0] : "";
}

function normalizeCameraFeature(feature, options = {}) {
  if (!feature || typeof feature !== "object") return null;
  if (
    !feature.geometry ||
    feature.geometry.type !== "Point" ||
    !Array.isArray(feature.geometry.coordinates)
  ) {
    return null;
  }

  const coordinates = feature.geometry.coordinates;
  if (coordinates.length < 2) return null;

  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);

  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lng < -180 ||
    lng > 180 ||
    lat < -90 ||
    lat > 90
  ) {
    return null;
  }

  const props = { ...(feature.properties || {}) };

  const preferredImageKeys = [
    "image_url",
    "imageUrl",
    "snapshot_url",
    "snapshotUrl",
    "map_image_url",
    "mapImageUrl",
    "currentImageURL",
  ];
  const preferredVideoKeys = [
    "video_url",
    "videoUrl",
    "hls_url",
    "hlsUrl",
    "dash_url",
    "dashUrl",
    "streamingVideoURL",
    "stream_url",
  ];

  let imageUrl = "";
  let videoUrl = "";

  for (const key of preferredImageKeys) {
    imageUrl = normalizeUrl(props[key]);
    if (imageUrl) break;
  }
  for (const key of preferredVideoKeys) {
    videoUrl = normalizeUrl(props[key]);
    if (videoUrl) break;
  }

  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== "string") continue;
    const candidate = normalizeUrl(value);
    if (!candidate) continue;

    const lower = candidate.split("?")[0].toLowerCase();
    const lowerKey = key.toLowerCase();

    if (
      !imageUrl &&
      (lower.endsWith(".jpg") ||
        lower.endsWith(".jpeg") ||
        lower.endsWith(".png") ||
        lower.endsWith(".gif") ||
        lower.endsWith(".webp") ||
        /image|snapshot|thumb|still/.test(lowerKey))
    ) {
      imageUrl = candidate;
    }

    if (
      !videoUrl &&
      (lower.startsWith("rtsp://") ||
        lower.endsWith(".mp4") ||
        lower.endsWith(".webm") ||
        lower.endsWith(".m3u8") ||
        lower.endsWith(".mpd") ||
        lower.endsWith(".mov") ||
        lower.endsWith(".avi") ||
        lower.endsWith(".flv") ||
        /video|stream|hls|dash|manifest|m3u8|mpd|rtsp/.test(lowerKey))
    ) {
      videoUrl = candidate;
    }

    if (imageUrl && videoUrl) break;
  }

  const nameCandidates = [
    props.name,
    props.camera_name,
    props.cameraName,
    props.location,
    props.title,
    props.id && `Camera ${props.id}`,
  ];
  const name =
    nameCandidates.find(
      (candidate) => typeof candidate === "string" && candidate.trim(),
    ) || "Traffic Camera";

  const state =
    (typeof props.state === "string" && props.state.trim()) ||
    (typeof props.State === "string" && props.State.trim()) ||
    options.stateFallback ||
    "Unknown";

  const normalizedProperties = {
    ...props,
    name,
    state,
    _source: options.sourceLabel || "unknown",
  };

  if (imageUrl) {
    normalizedProperties.image_url = imageUrl;
  }
  if (videoUrl) {
    normalizedProperties.video_url = videoUrl;
  }

  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [lng, lat],
    },
    properties: normalizedProperties,
  };
}

function collectGeoJsonFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (err) {
      continue;
    }

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }

      if (/\.(geojson|json)$/i.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function loadFeaturesFromFile(filePath, options = {}) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const collection = toFeatureCollection(parsed);
    if (!collection) return [];

    const normalized = [];
    for (const feature of collection.features) {
      const featureProps =
        feature && feature.properties ? feature.properties : {};
      const sourceState = inferStateFromSourceFile(featureProps._source_file);
      const normalizedFeature = normalizeCameraFeature(feature, {
        stateFallback:
          sourceState ||
          inferStateFromPath(
            filePath,
            options.rootDir || path.dirname(filePath),
          ),
        sourceLabel: options.sourceLabel,
      });
      if (normalizedFeature) normalized.push(normalizedFeature);
    }

    return normalized;
  } catch (err) {
    console.warn("Skipping cameras file", filePath, err && err.message);
    return [];
  }
}

function loadLocalCameraFeatures() {
  const allFeatures = [];

  for (const root of CAMERA_DATA_ROOTS) {
    const files = collectGeoJsonFiles(root.dir);
    for (const filePath of files) {
      const fileFeatures = loadFeaturesFromFile(filePath, {
        rootDir: root.dir,
        sourceLabel: root.label,
      });
      allFeatures.push(...fileFeatures);
    }
  }

  return allFeatures;
}

function fetchJsonWithNodeHttp(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": "Radar-App/1.0",
          Accept: "application/json,application/geo+json,text/plain,*/*",
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirectCount < 5
        ) {
          const redirectUrl = new URL(res.headers.location, url).toString();
          res.resume();
          resolve(fetchJsonWithNodeHttp(redirectUrl, redirectCount + 1));
          return;
        }

        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`HTTP ${status} while fetching ${url}`));
          return;
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const text = Buffer.concat(chunks).toString("utf8");
            resolve(JSON.parse(text));
          } catch (err) {
            reject(err);
          }
        });
      },
    );

    req.setTimeout(45000, () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
    req.on("error", reject);
  });
}

async function fetchJson(url) {
  if (typeof fetch === "function") {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Radar-App/1.0",
        Accept: "application/json,application/geo+json,text/plain,*/*",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${url}`);
    }
    return response.json();
  }

  return fetchJsonWithNodeHttp(url);
}

async function loadRemoteMapsDataFeatures() {
  if (!REMOTE_MAPS_DATA_ENABLED) return [];

  const now = Date.now();
  if (
    remoteMapsDataCache.features.length > 0 &&
    now - remoteMapsDataCache.fetchedAt < REMOTE_MAPS_DATA_CACHE_MS
  ) {
    return remoteMapsDataCache.features;
  }

  if (remoteMapsDataCache.inflight) {
    return remoteMapsDataCache.inflight;
  }

  remoteMapsDataCache.inflight = (async () => {
    try {
      const normalized = [];

      for (const remoteUrl of MAPS_DATA_REMOTE_URLS) {
        try {
          const payload = await fetchJson(remoteUrl);
          const collection = toFeatureCollection(payload);
          if (!collection) {
            console.warn(
              "Skipping non-FeatureCollection maps-data URL",
              remoteUrl,
            );
            continue;
          }

          for (const feature of collection.features) {
            const props =
              feature && feature.properties ? feature.properties : {};
            const normalizedFeature = normalizeCameraFeature(feature, {
              stateFallback: inferStateFromSourceFile(props._source_file),
              sourceLabel: "maps-data-remote",
            });
            if (normalizedFeature) normalized.push(normalizedFeature);
          }
        } catch (err) {
          console.warn(
            "Failed to fetch maps-data URL",
            remoteUrl,
            err && err.message,
          );
        }
      }

      remoteMapsDataCache.features = normalized;
      remoteMapsDataCache.fetchedAt = Date.now();
      console.log(
        `Loaded ${normalized.length} cameras from maps-data remote (${MAPS_DATA_REMOTE_URLS.length} files)`,
      );

      return normalized;
    } catch (err) {
      if (remoteMapsDataCache.features.length > 0) {
        console.warn(
          "Using stale maps-data cache after fetch failure:",
          err && err.message,
        );
        return remoteMapsDataCache.features;
      }
      console.warn("Remote maps-data unavailable:", err && err.message);
      return [];
    } finally {
      remoteMapsDataCache.inflight = null;
    }
  })();

  return remoteMapsDataCache.inflight;
}

function buildFeatureKey(feature) {
  if (
    !feature ||
    !feature.geometry ||
    !Array.isArray(feature.geometry.coordinates)
  ) {
    return "";
  }
  const [lng, lat] = feature.geometry.coordinates;
  const props = feature.properties || {};
  const image = (props.image_url || "").toLowerCase();
  const video = (props.video_url || "").toLowerCase();
  const name = String(props.name || "")
    .trim()
    .toLowerCase();
  return `${lat.toFixed(6)}|${lng.toFixed(6)}|${image}|${video}|${name}`;
}

function mergeAndDedupeFeatureCollections(...collections) {
  const seen = new Set();
  const features = [];

  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    for (const feature of collection) {
      const key = buildFeatureKey(feature);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      features.push(feature);
    }
  }

  return {
    type: "FeatureCollection",
    features,
  };
}

function normalizeCameraSourceUrl(rawUrl) {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return "";
  try {
    const url = new URL(rawUrl.trim());
    if (!["http:", "https:", "rtsp:"].includes(url.protocol)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function buildSnapshotArgs(cameraUrl) {
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
  if (cameraUrl.toLowerCase().startsWith("rtsp://")) {
    args.push("-rtsp_transport", "tcp");
  }
  args.push(
    "-i",
    cameraUrl,
    "-frames:v",
    "1",
    "-vf",
    "scale='min(1280,iw)':-2",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "pipe:1",
  );
  return args;
}

app.get("/api/cameras", async (req, res) => {
  try {
    const localFeatures = loadLocalCameraFeatures();
    const remoteFeatures = await loadRemoteMapsDataFeatures();
    const merged = mergeAndDedupeFeatureCollections(
      localFeatures,
      remoteFeatures,
    );
    res.json(merged);
  } catch (err) {
    console.error("/api/cameras error", err);
    res.status(500).json({ type: "FeatureCollection", features: [] });
  }
});

app.get("/api/camera/snapshot", (req, res) => {
  const sourceUrl = normalizeCameraSourceUrl(req.query.url);
  if (!sourceUrl) {
    res.status(400).json({
      error:
        "Invalid or missing camera URL. Expected http(s):// or rtsp:// input.",
    });
    return;
  }

  if (!ffmpegPath) {
    res.status(503).json({
      error: "ffmpeg-static is not available. Install dependencies and retry.",
    });
    return;
  }

  const ffmpeg = spawn(ffmpegPath, buildSnapshotArgs(sourceUrl), {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  const chunks = [];
  let stderr = "";
  let finished = false;
  const timeout = setTimeout(() => {
    if (!finished) {
      ffmpeg.kill("SIGKILL");
    }
  }, 15000);

  ffmpeg.stdout.on("data", (chunk) => {
    chunks.push(chunk);
  });

  ffmpeg.stderr.on("data", (chunk) => {
    if (stderr.length < 4000) {
      stderr += chunk.toString();
    }
  });

  ffmpeg.on("error", (err) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    res.status(500).json({
      error: "Failed to execute ffmpeg for camera snapshot.",
      details: err.message,
    });
  });

  ffmpeg.on("close", (code) => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);

    if (code !== 0) {
      res.status(502).json({
        error: "ffmpeg could not decode this camera stream.",
        details: stderr.trim().split("\n").pop() || "Unknown ffmpeg error",
      });
      return;
    }

    const imageBuffer = Buffer.concat(chunks);
    if (!imageBuffer.length) {
      res.status(502).json({
        error: "No image frame was produced for this camera stream.",
      });
      return;
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.send(imageBuffer);
  });

  req.on("close", () => {
    if (!finished) {
      ffmpeg.kill("SIGKILL");
      finished = true;
      clearTimeout(timeout);
    }
  });
});

// Define a route for the root URL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
