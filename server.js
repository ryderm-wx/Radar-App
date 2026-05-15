const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const OpenAI = require("openai");

try {
  require("dotenv").config();
} catch (err) {
  // dotenv is optional; environment variables can still come from the host process
}

let PollyClient = null;
let SynthesizeSpeechCommand = null;
try {
  ({ PollyClient, SynthesizeSpeechCommand } = require("@aws-sdk/client-polly"));
} catch (err) {
  console.warn(
    "@aws-sdk/client-polly not installed yet. /api/tts will return unavailable until installed.",
  );
}

let ffmpegPath = null;
try {
  ffmpegPath = require("ffmpeg-static");
} catch (err) {
  console.warn("ffmpeg-static not available. RTSP snapshot fallback disabled.");
}

const app = express();
app.use(express.json({ limit: "1mb" }));

const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
const OPENAI_WEATHER_SUMMARY_WORD_LIMIT = 110;
const OPENAI_WEATHER_SUMMARY_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_WEATHER_SUMMARY_MAX_OUTPUT_TOKENS || 420,
);
const OPENAI_ALERT_SUMMARY_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_ALERT_SUMMARY_MAX_OUTPUT_TOKENS || 600,
);
const OPENAI_ALERT_SUMMARY_CACHE_TTL_MS = Number(
  process.env.OPENAI_ALERT_SUMMARY_CACHE_TTL_MS || 6 * 60 * 60 * 1000,
);
const OPENAI_WEATHER_SUMMARY_CACHE_TTL_MS = Number(
  process.env.OPENAI_WEATHER_SUMMARY_CACHE_TTL_MS || 6 * 60 * 60 * 1000,
);
const OPENAI_WEATHER_SUMMARY_CACHE_MAX_ENTRIES = Number(
  process.env.OPENAI_WEATHER_SUMMARY_CACHE_MAX_ENTRIES || 5000,
);
const OPENAI_AFD_SUMMARY_CACHE_TTL_MS = Number(
  process.env.OPENAI_AFD_SUMMARY_CACHE_TTL_MS || 6 * 60 * 60 * 1000,
);
const OPENAI_AFD_SUMMARY_CACHE_MAX_ENTRIES = Number(
  process.env.OPENAI_AFD_SUMMARY_CACHE_MAX_ENTRIES || 2000,
);
const OPENAI_MI_SITUATION_SUMMARY_CACHE_TTL_MS = Number(
  process.env.OPENAI_MI_SITUATION_SUMMARY_CACHE_TTL_MS || 15 * 60 * 1000,
);
const OPENAI_MI_SITUATION_SUMMARY_CACHE_MAX_ENTRIES = Number(
  process.env.OPENAI_MI_SITUATION_SUMMARY_CACHE_MAX_ENTRIES || 800,
);
const OPENAI_MI_SITUATION_SUMMARY_MAX_OUTPUT_TOKENS = Number(
  process.env.OPENAI_MI_SITUATION_SUMMARY_MAX_OUTPUT_TOKENS || 220,
);
const SPC_DAY1_DISCUSSION_CACHE_TTL_MS = Number(
  process.env.SPC_DAY1_DISCUSSION_CACHE_TTL_MS || 10 * 60 * 1000,
);
const SPC_DAY1_OUTLOOK_URL =
  "https://www.spc.noaa.gov/products/outlook/day1otlk.html";
const WPC_SHORT_RANGE_DISCUSSION_CACHE_TTL_MS = Number(
  process.env.WPC_SHORT_RANGE_DISCUSSION_CACHE_TTL_MS || 10 * 60 * 1000,
);
const WPC_SHORT_RANGE_DISCUSSION_URL =
  "https://www.wpc.ncep.noaa.gov/discussions/hpcdiscussions.php?disc=pmdspd";
const OPENAI_ALERT_SUMMARY_CACHE_MAX_ENTRIES = Number(
  process.env.OPENAI_ALERT_SUMMARY_CACHE_MAX_ENTRIES || 2000,
);
const YOUTUBE_API_KEY = String(process.env.YOUTUBE_API_KEY || "").trim();
const YOUTUBE_CHAT_OWNER_DEFAULT = String(
  process.env.YOUTUBE_CHAT_OWNER_NAME || "RyderM_WX",
).trim();
const YOUTUBE_CHAT_MAX_RESULTS = Math.max(
  20,
  Math.min(200, Number(process.env.YOUTUBE_CHAT_MAX_RESULTS || 200)),
);
const YOUTUBE_CHAT_AI_LOCATION_HINT =
  String(process.env.YOUTUBE_CHAT_AI_LOCATION_HINT || "true").toLowerCase() !==
  "false";
const YOUTUBE_LIVE_CHANNEL_HANDLE = String(
  process.env.YOUTUBE_LIVE_CHANNEL_HANDLE || "@MiStormChasers",
).trim();
const YOUTUBE_LIVE_CHANNEL_NAME = String(
  process.env.YOUTUBE_LIVE_CHANNEL_NAME || "Michigan Storm Chasers",
).trim();
const YOUTUBE_LIVE_CHANNEL_ID = String(
  process.env.YOUTUBE_LIVE_CHANNEL_ID || "",
).trim();
const YOUTUBE_LIVE_CHANNEL_ID_CACHE_TTL_MS = Number(
  process.env.YOUTUBE_LIVE_CHANNEL_ID_CACHE_TTL_MS || 6 * 60 * 60 * 1000,
);
const YOUTUBE_LIVE_STATUS_CACHE_TTL_MS = Number(
  process.env.YOUTUBE_LIVE_STATUS_CACHE_TTL_MS || 90 * 1000,
);
const YOUTUBE_LIVE_MENTION_CACHE_TTL_MS = Number(
  process.env.YOUTUBE_LIVE_MENTION_CACHE_TTL_MS || 4 * 60 * 60 * 1000,
);
const YOUTUBE_LIVE_MENTION_CACHE_MAX_ENTRIES = Number(
  process.env.YOUTUBE_LIVE_MENTION_CACHE_MAX_ENTRIES || 1200,
);
const YOUTUBE_LIVE_MENTION_MAX_OUTPUT_TOKENS = Number(
  process.env.YOUTUBE_LIVE_MENTION_MAX_OUTPUT_TOKENS || 120,
);
const ADMIN_REFRESH_TOKEN = String(
  process.env.ADMIN_REFRESH_TOKEN || "",
).trim();
const ADMIN_REFRESH_REASON_MAX_LEN = 180;
const REFRESH_SSE_PING_INTERVAL_MS = Number(
  process.env.REFRESH_SSE_PING_INTERVAL_MS || 25000,
);
let openaiClient = null;
const openaiAlertSummaryCache = new Map();
const openaiAlertSummaryInFlight = new Map();
const openaiWeatherSummaryCache = new Map();
const openaiWeatherSummaryInFlight = new Map();
const openaiStatewideAfdSummaryCache = new Map();
const openaiStatewideAfdSummaryInFlight = new Map();
const openaiRegionalAfdSummaryCache = new Map();
const openaiRegionalAfdSummaryInFlight = new Map();
const openaiMichiganSituationSummaryCache = new Map();
const openaiMichiganSituationSummaryInFlight = new Map();
const youtubeChatLocationHintCache = new Map();
const youtubeChatLocationHintInFlight = new Map();
const youtubeLiveStatusCache = {
  expiresAt: 0,
  payload: null,
  inFlight: null,
};
let youtubeLiveResolvedChannelId = "";
let youtubeLiveResolvedChannelIdExpiresAt = 0;
const youtubeLiveMentionCache = new Map();
const youtubeLiveMentionInFlight = new Map();
const spcDay1DiscussionCache = {
  expiresAt: 0,
  payload: null,
  inFlight: null,
};
const wpcShortRangeDiscussionCache = {
  expiresAt: 0,
  payload: null,
  inFlight: null,
};
const refreshControlClients = new Set();
let refreshBroadcastVersion = 0;
let lastRefreshBroadcast = null;

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

  if (
    typeof options.cameraCategory === "string" &&
    options.cameraCategory.trim() &&
    (typeof normalizedProperties.camera_category !== "string" ||
      !normalizedProperties.camera_category.trim())
  ) {
    normalizedProperties.camera_category = options.cameraCategory.trim();
  }

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
    const isWeatherCameraFile = /weather[_-]?cameras?/i.test(
      path.basename(filePath),
    );
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
        cameraCategory: isWeatherCameraFile ? "weather" : undefined,
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

const POLLY_REGION = String(
  process.env.AWS_REGION || process.env.POLLY_REGION || "us-east-1",
);
const POLLY_DEFAULT_VOICE_ID = String(process.env.POLLY_VOICE_ID || "Matthew");
const POLLY_DEFAULT_ENGINE = String(process.env.POLLY_ENGINE || "neural");
let pollyClient = null;

function getPollyClient() {
  if (!PollyClient || !SynthesizeSpeechCommand) {
    return { ok: false, reason: "sdk-missing" };
  }

  const accessKeyId = String(process.env.AWS_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(
    process.env.AWS_SECRET_ACCESS_KEY || "",
  ).trim();
  const sessionToken = String(process.env.AWS_SESSION_TOKEN || "").trim();

  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, reason: "credentials-missing" };
  }

  if (!pollyClient) {
    const credentials = {
      accessKeyId,
      secretAccessKey,
    };
    if (sessionToken) {
      credentials.sessionToken = sessionToken;
    }

    pollyClient = new PollyClient({
      region: POLLY_REGION,
      credentials,
    });
  }

  return { ok: true, client: pollyClient };
}

function clampPollyText(input) {
  const text = String(input || "").trim();
  return text;
}

async function toBuffer(audioStream) {
  if (!audioStream) return Buffer.alloc(0);
  if (Buffer.isBuffer(audioStream)) return audioStream;
  if (audioStream instanceof Uint8Array) return Buffer.from(audioStream);

  if (typeof audioStream.transformToByteArray === "function") {
    const bytes = await audioStream.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (typeof audioStream[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  return Buffer.alloc(0);
}

function getOpenAiClient() {
  if (openaiClient) return openaiClient;

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "OpenAI API key is not configured. Set OPENAI_API_KEY in your environment.",
    );
  }

  openaiClient = new OpenAI({ apiKey });
  return openaiClient;
}

function extractResponseText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const block of content) {
      if (
        block?.type === "output_text" &&
        typeof block?.text === "string" &&
        block.text.trim()
      ) {
        return block.text.trim();
      }

      const candidate =
        (typeof block?.text === "string" && block.text) ||
        (typeof block?.output_text === "string" && block.output_text) ||
        (typeof block?.value === "string" && block.value) ||
        "";
      if (candidate.trim()) return candidate.trim();
    }
  }
  return "";
}

function enforceWordLimit(text, maxWords) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";

  const words = normalized.split(" ");
  if (words.length <= maxWords) return normalized;
  return `${words.slice(0, maxWords).join(" ")}`;
}

function normalizeChatText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyForecastRequest(text) {
  const normalized = normalizeChatText(text).toLowerCase();
  if (!normalized) return false;
  return (
    /(forecast|weather|temps?|temperature|rain|snow|storm|conditions?)\b/.test(
      normalized,
    ) && /\b(for|in|at|near|around)\b/.test(normalized)
  );
}

function extractLocationHintWithRegex(text) {
  const normalized = normalizeChatText(text);
  if (!normalized) return "";

  const patterns = [
    /\b(?:forecast|weather|conditions?)\s+(?:for|in|at|near|around)\s+([a-z0-9 .,'-]{2,60})/i,
    /\b(?:what(?:'s| is)\s+the\s+forecast\s+for|what(?:'s| is)\s+weather\s+in)\s+([a-z0-9 .,'-]{2,60})/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const candidate = String(match[1] || "")
      .replace(/[?!.,;:]+$/g, "")
      .trim();
    if (candidate) return candidate;
  }

  return "";
}

async function extractLocationHintWithAi(text) {
  const normalized = normalizeChatText(text).toLowerCase();
  if (!normalized) return "";
  if (youtubeChatLocationHintCache.has(normalized)) {
    return youtubeChatLocationHintCache.get(normalized);
  }
  if (youtubeChatLocationHintInFlight.has(normalized)) {
    return youtubeChatLocationHintInFlight.get(normalized);
  }

  const task = (async () => {
    try {
      const client = getOpenAiClient();
      const payload = await client.responses.create({
        model: OPENAI_MODEL,
        max_output_tokens: 60,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "Extract the city/state location a weather viewer is asking about. Return only a short location like 'Lansing' or 'Ann Arbor, MI'. Return NONE if no location is present.",
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: text }],
          },
        ],
      });
      const extracted = normalizeChatText(extractResponseText(payload));
      const value = /^none$/i.test(extracted) ? "" : extracted;
      youtubeChatLocationHintCache.set(normalized, value);
      if (youtubeChatLocationHintCache.size > 5000) {
        const oldestKey = youtubeChatLocationHintCache.keys().next().value;
        if (oldestKey) youtubeChatLocationHintCache.delete(oldestKey);
      }
      return value;
    } catch (_err) {
      return "";
    }
  })();

  youtubeChatLocationHintInFlight.set(normalized, task);
  try {
    return await task;
  } finally {
    youtubeChatLocationHintInFlight.delete(normalized);
  }
}

async function getYouTubeActiveLiveChatId(videoId) {
  const params = new URLSearchParams({
    part: "liveStreamingDetails",
    id: String(videoId || "").trim(),
    key: YOUTUBE_API_KEY,
  });
  const payload = await fetchJson(
    `https://www.googleapis.com/youtube/v3/videos?${params.toString()}`,
  );
  const item = Array.isArray(payload?.items) ? payload.items[0] : null;
  return String(item?.liveStreamingDetails?.activeLiveChatId || "").trim();
}

async function listYouTubeLiveChatMessages(liveChatId, pageToken = "") {
  const params = new URLSearchParams({
    part: "id,snippet,authorDetails",
    liveChatId: String(liveChatId || "").trim(),
    maxResults: String(YOUTUBE_CHAT_MAX_RESULTS),
    key: YOUTUBE_API_KEY,
  });
  if (pageToken) params.set("pageToken", pageToken);
  return fetchJson(
    `https://www.googleapis.com/youtube/v3/liveChat/messages?${params.toString()}`,
  );
}

function pickBestYouTubeThumbnail(thumbnails) {
  const map = thumbnails && typeof thumbnails === "object" ? thumbnails : {};
  const candidates = [
    map.maxres,
    map.standard,
    map.high,
    map.medium,
    map.default,
  ];
  for (const candidate of candidates) {
    const url = String(candidate?.url || "").trim();
    if (url) return url;
  }
  return "";
}

function normalizeYouTubeLiveText(value, maxLength = 1600) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.slice(0, Math.max(60, Number(maxLength) || 1600));
}

async function resolveYouTubeLiveChannelId() {
  if (YOUTUBE_LIVE_CHANNEL_ID) {
    return YOUTUBE_LIVE_CHANNEL_ID;
  }

  const now = Date.now();
  if (
    youtubeLiveResolvedChannelId &&
    now < youtubeLiveResolvedChannelIdExpiresAt
  ) {
    return youtubeLiveResolvedChannelId;
  }

  const handle = String(YOUTUBE_LIVE_CHANNEL_HANDLE || "")
    .trim()
    .replace(/^@/, "");

  if (handle) {
    try {
      const params = new URLSearchParams({
        part: "id,snippet",
        forHandle: handle,
        key: YOUTUBE_API_KEY,
      });
      const payload = await fetchJson(
        `https://www.googleapis.com/youtube/v3/channels?${params.toString()}`,
      );
      const item = Array.isArray(payload?.items) ? payload.items[0] : null;
      const channelId = String(item?.id || "").trim();
      if (channelId) {
        youtubeLiveResolvedChannelId = channelId;
        youtubeLiveResolvedChannelIdExpiresAt =
          now + YOUTUBE_LIVE_CHANNEL_ID_CACHE_TTL_MS;
        return channelId;
      }
    } catch (err) {
      console.warn("YouTube forHandle channel lookup failed:", err?.message);
    }
  }

  try {
    const query = handle
      ? `@${handle}`
      : String(YOUTUBE_LIVE_CHANNEL_NAME || "Michigan Storm Chasers");
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "channel",
      maxResults: "5",
      key: YOUTUBE_API_KEY,
    });
    const payload = await fetchJson(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    );

    const items = Array.isArray(payload?.items) ? payload.items : [];
    const preferred = items.find((item) => {
      const title = String(item?.snippet?.title || "").toLowerCase();
      return (
        title.includes("michigan") &&
        title.includes("storm") &&
        title.includes("chaser")
      );
    });
    const fallback = preferred || items[0] || null;
    const channelId = String(fallback?.id?.channelId || "").trim();
    if (channelId) {
      youtubeLiveResolvedChannelId = channelId;
      youtubeLiveResolvedChannelIdExpiresAt =
        now + YOUTUBE_LIVE_CHANNEL_ID_CACHE_TTL_MS;
      return channelId;
    }
  } catch (err) {
    console.warn("YouTube search channel lookup failed:", err?.message);
  }

  return "";
}

async function fetchYouTubeLiveStatus() {
  const now = Date.now();
  if (
    youtubeLiveStatusCache.payload &&
    now < youtubeLiveStatusCache.expiresAt
  ) {
    return youtubeLiveStatusCache.payload;
  }

  if (youtubeLiveStatusCache.inFlight) {
    return youtubeLiveStatusCache.inFlight;
  }

  youtubeLiveStatusCache.inFlight = (async () => {
    const channelId = await resolveYouTubeLiveChannelId();
    if (!channelId) {
      const payload = {
        isLive: false,
        channelId: "",
        channelName: YOUTUBE_LIVE_CHANNEL_NAME,
        channelHandle: YOUTUBE_LIVE_CHANNEL_HANDLE,
        checkedAt: new Date().toISOString(),
      };
      youtubeLiveStatusCache.payload = payload;
      youtubeLiveStatusCache.expiresAt =
        Date.now() + YOUTUBE_LIVE_STATUS_CACHE_TTL_MS;
      return payload;
    }

    const liveSearchParams = new URLSearchParams({
      part: "snippet",
      channelId,
      eventType: "live",
      type: "video",
      maxResults: "1",
      order: "date",
      key: YOUTUBE_API_KEY,
    });
    const searchPayload = await fetchJson(
      `https://www.googleapis.com/youtube/v3/search?${liveSearchParams.toString()}`,
    );
    const liveItem = Array.isArray(searchPayload?.items)
      ? searchPayload.items[0]
      : null;
    const videoId = String(liveItem?.id?.videoId || "").trim();

    if (!videoId) {
      const payload = {
        isLive: false,
        channelId,
        channelName: YOUTUBE_LIVE_CHANNEL_NAME,
        channelHandle: YOUTUBE_LIVE_CHANNEL_HANDLE,
        checkedAt: new Date().toISOString(),
      };
      youtubeLiveStatusCache.payload = payload;
      youtubeLiveStatusCache.expiresAt =
        Date.now() + YOUTUBE_LIVE_STATUS_CACHE_TTL_MS;
      return payload;
    }

    const videoParams = new URLSearchParams({
      part: "snippet,liveStreamingDetails",
      id: videoId,
      key: YOUTUBE_API_KEY,
    });

    let videoItem = null;
    try {
      const videoPayload = await fetchJson(
        `https://www.googleapis.com/youtube/v3/videos?${videoParams.toString()}`,
      );
      videoItem = Array.isArray(videoPayload?.items)
        ? videoPayload.items[0]
        : null;
    } catch (err) {
      console.warn("YouTube video detail lookup failed:", err?.message);
    }

    const snippet = videoItem?.snippet || liveItem?.snippet || {};
    const liveDetails = videoItem?.liveStreamingDetails || {};

    const payload = {
      isLive: true,
      videoId,
      title: normalizeYouTubeLiveText(snippet?.title || ""),
      description: normalizeYouTubeLiveText(snippet?.description || "", 2200),
      thumbnailUrl: pickBestYouTubeThumbnail(snippet?.thumbnails),
      watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
      embedUrl: `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&mute=1&rel=0&modestbranding=1`,
      startedAt: String(
        liveDetails?.actualStartTime || snippet?.publishedAt || "",
      ).trim(),
      channelId,
      channelName: normalizeYouTubeLiveText(
        snippet?.channelTitle || YOUTUBE_LIVE_CHANNEL_NAME,
        120,
      ),
      channelHandle: YOUTUBE_LIVE_CHANNEL_HANDLE,
      checkedAt: new Date().toISOString(),
    };

    youtubeLiveStatusCache.payload = payload;
    youtubeLiveStatusCache.expiresAt =
      Date.now() + YOUTUBE_LIVE_STATUS_CACHE_TTL_MS;
    return payload;
  })();

  try {
    return await youtubeLiveStatusCache.inFlight;
  } finally {
    youtubeLiveStatusCache.inFlight = null;
  }
}

function buildFallbackYouTubeLiveMention({ channelName, title, description }) {
  const safeChannel = normalizeYouTubeLiveText(
    channelName || YOUTUBE_LIVE_CHANNEL_NAME || "Michigan Storm Chasers",
    80,
  );
  const summarySource = normalizeYouTubeLiveText(
    title || description || "live weather coverage",
    180,
  );
  const topic = enforceWordLimit(summarySource, 14);
  return normalizeYouTubeLiveText(
    `${safeChannel} is live now, covering ${topic || "live weather updates"}.`,
    220,
  );
}

function buildYouTubeLiveMentionCacheKey({
  channelName,
  videoId,
  title,
  description,
}) {
  return [
    normalizeYouTubeLiveText(channelName || ""),
    normalizeYouTubeLiveText(videoId || ""),
    normalizeYouTubeLiveText(title || "", 240),
    normalizeYouTubeLiveText(description || "", 700),
  ]
    .map((part) => part.toLowerCase())
    .join("|");
}

function getCachedYouTubeLiveMention(cacheKey) {
  if (!cacheKey) return "";
  const hit = youtubeLiveMentionCache.get(cacheKey);
  if (!hit) return "";
  if (Date.now() > hit.expiresAt) {
    youtubeLiveMentionCache.delete(cacheKey);
    return "";
  }
  return String(hit.mention || "").trim();
}

function setCachedYouTubeLiveMention(cacheKey, mention) {
  if (!cacheKey || !mention) return;

  if (youtubeLiveMentionCache.size >= YOUTUBE_LIVE_MENTION_CACHE_MAX_ENTRIES) {
    const oldestKey = youtubeLiveMentionCache.keys().next().value;
    if (oldestKey) youtubeLiveMentionCache.delete(oldestKey);
  }

  youtubeLiveMentionCache.set(cacheKey, {
    mention,
    expiresAt: Date.now() + YOUTUBE_LIVE_MENTION_CACHE_TTL_MS,
  });
}

async function requestOpenAiYouTubeLiveMention({
  channelName,
  videoId,
  title,
  description,
}) {
  const normalizedInput = {
    channelName: normalizeYouTubeLiveText(
      channelName || YOUTUBE_LIVE_CHANNEL_NAME,
      120,
    ),
    videoId: normalizeYouTubeLiveText(videoId || "", 80),
    title: normalizeYouTubeLiveText(title || "", 260),
    description: normalizeYouTubeLiveText(description || "", 1400),
  };

  const cacheKey = buildYouTubeLiveMentionCacheKey(normalizedInput);
  const cached = getCachedYouTubeLiveMention(cacheKey);
  if (cached) {
    return cached;
  }

  if (youtubeLiveMentionInFlight.has(cacheKey)) {
    return youtubeLiveMentionInFlight.get(cacheKey);
  }

  const task = (async () => {
    const fallback = buildFallbackYouTubeLiveMention(normalizedInput);
    try {
      const client = getOpenAiClient();
      const prompt = [
        `Channel: ${normalizedInput.channelName}`,
        `Video title: ${normalizedInput.title || "Unknown"}`,
        `Video description: ${normalizedInput.description || "No description provided."}`,
        "Task: Write one short spoken line for a weather livestream host to say.",
        "Requirements:",
        "- Mention that the channel is live right now.",
        "- Use plain language and sound natural on-air.",
        "- Include 2-3 quick highlights inferred from the title/description.",
        "- Keep it under 24 words.",
        "- Return only the final sentence.",
      ].join("\n");

      const response = await client.responses.create({
        model: OPENAI_MODEL,
        max_output_tokens: YOUTUBE_LIVE_MENTION_MAX_OUTPUT_TOKENS,
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text: "You write short, broadcast-ready weather live mention lines.",
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
      });

      const generated = normalizeYouTubeLiveText(
        extractResponseText(response),
        260,
      );
      const normalized = normalizeYouTubeLiveText(
        enforceWordLimit(generated || fallback, 24),
        220,
      );
      const finalMention = normalized || fallback;
      setCachedYouTubeLiveMention(cacheKey, finalMention);
      return finalMention;
    } catch (err) {
      console.warn("YouTube live mention AI fallback used:", err?.message);
      setCachedYouTubeLiveMention(cacheKey, fallback);
      return fallback;
    }
  })();

  youtubeLiveMentionInFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    youtubeLiveMentionInFlight.delete(cacheKey);
  }
}

async function buildYouTubeChatForecastRequests(items, ownerName) {
  const ownerNormalized = normalizeChatText(ownerName).toLowerCase();
  const output = [];

  for (const item of Array.isArray(items) ? items : []) {
    const id = normalizeChatText(item?.id);
    const snippet = item?.snippet || {};
    const authorDetails = item?.authorDetails || {};
    const message = normalizeChatText(snippet?.displayMessage || "");
    if (!id || !message) continue;

    const type = normalizeChatText(snippet?.type || "");
    const isSuperChat =
      type === "superChatEvent" ||
      type === "superStickerEvent" ||
      !!snippet?.superChatDetails;
    const displayName = normalizeChatText(authorDetails?.displayName || "");
    const isOwnerMessage =
      authorDetails?.isChatOwner === true ||
      (ownerNormalized && displayName.toLowerCase() === ownerNormalized);
    const isAllowed =
      isSuperChat || (isOwnerMessage && type === "textMessageEvent");
    if (!isAllowed) continue;

    let locationHint = extractLocationHintWithRegex(message);
    const looksWeatherLike = isLikelyForecastRequest(message);
    if (!looksWeatherLike && !locationHint) continue;

    if (!locationHint && YOUTUBE_CHAT_AI_LOCATION_HINT) {
      locationHint = await extractLocationHintWithAi(message);
    }

    output.push({
      id,
      message,
      type,
      isSuperChat,
      isOwnerMessage,
      authorDisplayName: displayName || "Unknown",
      locationHint,
      publishedAt: normalizeChatText(snippet?.publishedAt || ""),
      amountDisplayString: normalizeChatText(
        snippet?.superChatDetails?.amountDisplayString || "",
      ),
    });
  }

  return output;
}

function buildAlertSummaryCacheKey(rawText, eventName) {
  const normalizedEvent = String(eventName || "Weather Alert")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const normalizedRaw = normalizeSummarySignatureText(
    compactAlertTextForPrompt(rawText, 2200),
  );
  return `${normalizedEvent}|${normalizedRaw}`;
}

function getCachedAlertSummary(cacheKey) {
  if (!cacheKey) return "";
  const hit = openaiAlertSummaryCache.get(cacheKey);
  if (!hit) return "";
  if (Date.now() > hit.expiresAt) {
    openaiAlertSummaryCache.delete(cacheKey);
    return "";
  }
  return String(hit.summary || "");
}

function setCachedAlertSummary(cacheKey, summary) {
  if (!cacheKey || !summary) return;

  if (openaiAlertSummaryCache.size >= OPENAI_ALERT_SUMMARY_CACHE_MAX_ENTRIES) {
    const oldestKey = openaiAlertSummaryCache.keys().next().value;
    if (oldestKey) {
      openaiAlertSummaryCache.delete(oldestKey);
    }
  }

  openaiAlertSummaryCache.set(cacheKey, {
    summary,
    expiresAt: Date.now() + OPENAI_ALERT_SUMMARY_CACHE_TTL_MS,
  });
}

function getCachedSummary(cache, cacheKey) {
  if (!cacheKey) return "";
  const hit = cache.get(cacheKey);
  if (!hit) return "";
  if (Date.now() > hit.expiresAt) {
    cache.delete(cacheKey);
    return "";
  }
  return String(hit.summary || "");
}

function setCachedSummary(cache, cacheKey, summary, ttlMs, maxEntries) {
  if (!cacheKey || !summary) return;

  if (cache.size >= maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }

  cache.set(cacheKey, {
    summary,
    expiresAt: Date.now() + ttlMs,
  });
}

function normalizeSummarySignatureText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function compactAlertTextForPrompt(rawText, maxChars = 2200) {
  const text = String(rawText || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

function compactAfdTextForPrompt(text, maxChars = 420) {
  const compact = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) return "";
  return compact.slice(0, maxChars);
}

function buildWeatherSummaryCacheKey(
  cityLabel,
  current,
  forecast,
  alertContext = "",
) {
  const city = normalizeSummarySignatureText(cityLabel || "unknown-city");
  const currentKey = [
    normalizeSummarySignatureText(current?.description || ""),
    Number.isFinite(current?.tempF) ? Math.round(current.tempF) : "na",
    normalizeSummarySignatureText(current?.windDirCardinal || ""),
    Number.isFinite(current?.windSpeedMph)
      ? Math.round(current.windSpeedMph)
      : "na",
  ].join("|");

  const alertKey = normalizeSummarySignatureText(alertContext || "");

  const forecastKey = (Array.isArray(forecast) ? forecast : [])
    .slice(0, 5)
    .map((period, idx) => {
      const day = normalizeSummarySignatureText(
        period?.dayName || `day-${idx + 1}`,
      );
      const short = normalizeSummarySignatureText(period?.shortForecast || "");
      const hi = Number.isFinite(period?.highTempF)
        ? Math.round(period.highTempF)
        : "na";
      const lo = Number.isFinite(period?.lowTempF)
        ? Math.round(period.lowTempF)
        : "na";
      return `${day}:${short}:${hi}:${lo}`;
    })
    .join("||");

  return `${city}::${currentKey}::${forecastKey}::${alertKey}`;
}

function buildAfdStatewideSummaryCacheKey(afdForecasts) {
  const parts = (Array.isArray(afdForecasts) ? afdForecasts : [])
    .filter((entry) => entry && entry.text)
    .map((entry) => {
      const site = normalizeSummarySignatureText(entry.site || "unknown");
      const text = normalizeSummarySignatureText(entry.text);
      return `${site}::${text}`;
    })
    .sort();
  return parts.join("|||");
}

function buildAfdRegionalSummaryCacheKey(region, afdForecasts) {
  const office = normalizeSummarySignatureText(region?.nwsOffice || "unknown");
  const textParts = (Array.isArray(afdForecasts) ? afdForecasts : [])
    .filter((entry) => entry && entry.site === region?.nwsOffice)
    .map((entry) => normalizeSummarySignatureText(entry.text || ""))
    .filter(Boolean)
    .sort();
  return `${office}::${textParts.join("||")}`;
}

function buildMichiganSituationReviewCacheKey({
  alerts,
  afdForecasts,
  wpcShortTermDiscussion,
}) {
  const alertPart = (Array.isArray(alerts) ? alerts : [])
    .map((alert) => {
      const eventName = normalizeSummarySignatureText(alert?.eventName || "");
      const count = Math.max(1, Number(alert?.count) || 1);
      return `${eventName}:${count}`;
    })
    .filter(Boolean)
    .sort()
    .join("||");

  const afdPart = buildAfdStatewideSummaryCacheKey(afdForecasts);
  const wpcPart = normalizeSummarySignatureText(
    compactAfdTextForPrompt(wpcShortTermDiscussion, 420),
  );

  return `${alertPart}::${afdPart}::${wpcPart}`;
}

function buildMichiganSituationReviewPrompt({
  alerts,
  afdForecasts,
  wpcShortTermDiscussion,
}) {
  const alertLines = (Array.isArray(alerts) ? alerts : [])
    .slice(0, 8)
    .map((alert, idx) => {
      const eventName = String(alert?.eventName || "Weather Alert").trim();
      const count = Math.max(1, Number(alert?.count) || 1);
      return `${idx + 1}. ${eventName} x${count}`;
    })
    .join("\n");

  const afdText = (Array.isArray(afdForecasts) ? afdForecasts : [])
    .filter((entry) => entry && entry.text)
    .slice(0, 5)
    .map((entry) => {
      const compactText = compactAfdTextForPrompt(entry.text, 220);
      return `[${entry.site}]\n${compactText}`;
    })
    .join("\n\n");

  const wpcText = compactAfdTextForPrompt(wpcShortTermDiscussion, 420);

  return [
    "Create a concise Michigan weather situation review for near short-term impacts.",
    "",
    "Inputs: Michigan alert type counts + short AFD snippets (DTX, GRR, APX, IWX, MQT) + WPC short-range discussion snippet.",
    "",
    "Return exactly this plain-text format:",
    "  BULLETS:",
    "  - bullet 1",
    "  - bullet 2",
    "  - bullet 3",
    "  - bullet 4",
    "  - bullet 5",
    "  SPOKEN_SUMMARY: one sentence (18 to 35 words)",
    "Rules: each bullet 8-18 words; immediate threats first; factual; no extra sections.",
    "Only include Michigan-relevant information and near short-term impacts (roughly next 24-36 hours).",
    "Ignore non-Michigan details from national discussions.",
    "",
    "Active Michigan Alert Counts:",
    alertLines || "No active Michigan alerts.",
    "",
    "AFD Discussions:",
    afdText || "Unavailable.",
    "",
    "WPC Short Range Discussion:",
    wpcText || "Unavailable.",
  ].join("\n");
}

function parseMichiganSituationReviewPoints(summaryText) {
  return parseMichiganSituationReviewOutput(summaryText).summaryPoints;
}

function parseMichiganSituationReviewOutput(summaryText) {
  const text = String(summaryText || "").trim();
  if (!text) {
    return { summaryPoints: [], spokenSummary: "" };
  }

  const lines = text
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const bulletPoints = lines
    .map((line) => line.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter((line) => line && !/^bullets\s*:?$/i.test(line))
    .filter((line) => !/^spoken_summary\s*:/i.test(line));

  let normalizedBullets = bulletPoints;
  if (normalizedBullets.length > 5) {
    normalizedBullets = normalizedBullets.slice(0, 5);
  }
  if (normalizedBullets.length < 5) {
    normalizedBullets = text
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean)
      .slice(0, 5);
  }

  const spokenMatch = text.match(/SPOKEN_SUMMARY\s*:\s*([\s\S]*?)$/i);
  const spokenSummary = String(spokenMatch?.[1] || "")
    .replace(/\s+/g, " ")
    .trim();
  const fallbackSpoken = normalizedBullets[0] || "";

  return {
    summaryPoints: normalizedBullets.slice(0, 5),
    spokenSummary: spokenSummary || fallbackSpoken,
  };
}

async function requestOpenAiMichiganSituationReview({
  alerts,
  afdForecasts,
  wpcShortTermDiscussion,
}) {
  const cacheKey = buildMichiganSituationReviewCacheKey({
    alerts,
    afdForecasts,
    wpcShortTermDiscussion,
  });
  const cached = getCachedSummary(
    openaiMichiganSituationSummaryCache,
    cacheKey,
  );
  if (cached) {
    console.log("[AI CACHE HIT][mi-situation-review]");
    return cached;
  }

  if (openaiMichiganSituationSummaryInFlight.has(cacheKey)) {
    return openaiMichiganSituationSummaryInFlight.get(cacheKey);
  }

  const generationTask = (async () => {
    const client = getOpenAiClient();
    const userInput = buildMichiganSituationReviewPrompt({
      alerts,
      afdForecasts,
      wpcShortTermDiscussion,
    });

    console.log("[AI PROMPT][mi-situation-review]", userInput);

    const payload = await client.responses.create({
      model: OPENAI_MODEL,
      max_output_tokens: OPENAI_MI_SITUATION_SUMMARY_MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: "text",
        },
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You produce concise, high-signal Michigan situation reviews for weather operations. Follow the requested output format exactly and do not invent details.",
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userInput }],
        },
      ],
    });

    const generated = extractResponseText(payload);
    const constrained = enforceWordLimit(generated, Infinity);
    if (constrained) {
      setCachedSummary(
        openaiMichiganSituationSummaryCache,
        cacheKey,
        constrained,
        OPENAI_MI_SITUATION_SUMMARY_CACHE_TTL_MS,
        OPENAI_MI_SITUATION_SUMMARY_CACHE_MAX_ENTRIES,
      );
      return constrained;
    }

    const topAlerts = (Array.isArray(alerts) ? alerts : [])
      .slice(0, 3)
      .map((alert) => String(alert?.eventName || "Weather Alert").trim())
      .filter(Boolean);
    if (!topAlerts.length) {
      return "BULLETS:\n- No active Michigan alerts at this time across the state.\n- Near-term weather appears routine with no immediate severe focus.\n- Continue monitoring local updates for any quick trend changes.\n- AFD guidance supports generally stable short-term conditions statewide.\n- Confidence is moderate for mostly routine short-term trends.\nSPOKEN_SUMMARY: Michigan has no active alerts right now, with generally routine near-term weather expected across the state.";
    }
    return `BULLETS:\n- Active Michigan hazards include ${topAlerts.join(", ")}.\n- Immediate impacts remain tied to currently warned or advised areas.\n- Monitor near-term trend updates from local NWS forecast discussions.\n- Conditions may change quickly where strongest forcing develops.\n- Focus remains on warned counties and nearby downstream areas.\nSPOKEN_SUMMARY: Michigan remains active with ${topAlerts.join(", ")}, and near-term impacts should be monitored closely in affected areas.`;
  })();

  openaiMichiganSituationSummaryInFlight.set(cacheKey, generationTask);
  try {
    return await generationTask;
  } finally {
    openaiMichiganSituationSummaryInFlight.delete(cacheKey);
  }
}

function getCurrentTimeString() {
  const now = new Date();
  return now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function buildWeatherSummaryPrompt(
  cityLabel,
  current,
  forecast,
  alertContext = "",
) {
  const currentParts = [
    `Description: ${String(current?.description || "Unavailable")}`,
    Number.isFinite(current?.tempF)
      ? `Temperature F: ${Math.round(current.tempF)}`
      : "Temperature F: unavailable",
    `Wind: ${String(current?.windDirCardinal || "N/A")} ${
      Number.isFinite(current?.windSpeedMph)
        ? `${Math.round(current.windSpeedMph)} mph`
        : "unavailable"
    }`,
  ];

  const forecastList = Array.isArray(forecast) ? forecast.slice(0, 5) : [];
  const forecastLines = forecastList.map((period, idx) => {
    const dayName = String(period?.dayName || `Day ${idx + 1}`);
    const shortForecast = String(
      period?.shortForecast || "Forecast unavailable",
    );
    const highText = Number.isFinite(period?.highTempF)
      ? `${Math.round(period.highTempF)}F`
      : "--";
    const lowText = Number.isFinite(period?.lowTempF)
      ? `${Math.round(period.lowTempF)}F`
      : "--";
    return `${dayName}: ${shortForecast}. High ${highText}, low ${lowText}.`;
  });

  return [
    `City: ${String(cityLabel || "Unknown City")}`,
    ...(String(alertContext || "").trim()
      ? [`Alert context: ${String(alertContext).trim()}`]
      : []),
    "Current conditions:",
    ...currentParts,
    "Forecast:",
    ...(forecastLines.length ? forecastLines : ["Forecast unavailable."]),
    "",
    "Task: Create a spoken-style weather brief that sounds human and natural for live weather coverage.",
    "Rules:",
    "- Do not mention time, clock references, or time-of-day greetings.",
    "- If alert context is present, mention it briefly and naturally.",
    "- Use only provided data.",
    "- Mention current condition first.",
    "- Then list each forecast day in order.",
    "- Keep it brief and broadcast-ready, ideally around 2 to 4 sentences.",
    "- Tone should be clear, conversational, and a little enthusiastic, but never exaggerated.",
    "- Avoid repeatedly using words like 'currently' and vary sentence openings.",
    "- Keep wording varied so it does not sound repetitive or cookie-cutter.",
    "- Return only the weather brief text with no labels.",
  ].join("\n");
}

function buildWeatherSummaryFallback(
  cityLabel,
  current,
  forecast,
  alertContext = "",
) {
  const pieces = [];
  const city = String(cityLabel || "Unknown City");
  const alertText = String(alertContext || "").trim();
  const desc = String(current?.description || "Current conditions unavailable");
  const temp = Number.isFinite(current?.tempF)
    ? `${Math.round(current.tempF)} F`
    : "temperature unavailable";
  const wind = `${String(current?.windDirCardinal || "N/A")} ${
    Number.isFinite(current?.windSpeedMph)
      ? `${Math.round(current.windSpeedMph)} mph`
      : "wind unavailable"
  }`;
  pieces.push(
    `${city} currently has ${desc.toLowerCase()} with ${temp} and winds ${wind}.`,
  );

  if (alertText) {
    pieces.push(alertText);
  }

  const forecastList = Array.isArray(forecast) ? forecast.slice(0, 5) : [];
  if (forecastList.length) {
    const compact = forecastList
      .map((period) => {
        const day = String(period?.dayName || "Soon");
        const short = String(
          period?.shortForecast || "unavailable",
        ).toLowerCase();
        return `${day} ${short}`;
      })
      .join("; ");
    pieces.push(`Forecast trend: ${compact}.`);
  }

  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

async function requestOpenAiAlertSummary(rawText, eventName) {
  const cacheKey = buildAlertSummaryCacheKey(rawText, eventName);
  const cached = getCachedAlertSummary(cacheKey);
  if (cached) {
    console.log("[AI CACHE HIT][alert-summary]", eventName || "Weather Alert");
    return cached;
  }

  if (openaiAlertSummaryInFlight.has(cacheKey)) {
    return openaiAlertSummaryInFlight.get(cacheKey);
  }

  const generationTask = (async () => {
    const client = getOpenAiClient();
    const safeEventName = String(eventName || "Weather Alert").trim();
    const compactRawText = compactAlertTextForPrompt(rawText, 2200);
    const systemInstruction =
      "You create concise, spoken-style weather alert summaries. Stay factual, avoid legal boilerplate, and do not invent details.";
    const userInput = [
      `Event: ${safeEventName}`,
      "Task: 2-4 spoken broadcast sentences.",
      "Rules: threat first, then location/timing. Factual only. No labels.",
      "",
      "Alert text:",
      compactRawText,
    ].join("\n");

    const payload = await client.responses.create({
      model: OPENAI_MODEL,
      max_output_tokens: OPENAI_ALERT_SUMMARY_MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: "text",
        },
      },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemInstruction }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userInput }],
        },
      ],
    });

    console.log(
      "[AI DEBUG][alert-summary][output]",
      JSON.stringify(payload?.output || [], null, 2),
    );

    const generated = extractResponseText(payload);
    const constrained = enforceWordLimit(generated, Infinity);
    if (constrained) {
      setCachedAlertSummary(cacheKey, constrained);
      return constrained;
    }
    return "";
  })();

  openaiAlertSummaryInFlight.set(cacheKey, generationTask);
  try {
    return await generationTask;
  } finally {
    openaiAlertSummaryInFlight.delete(cacheKey);
  }
}

function getTimePeriod() {
  const now = new Date();
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}

function getCurrentTimeString() {
  const now = new Date();
  return now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function buildWeatherSummaryPrompt(
  cityLabel,
  current,
  forecast,
  alertContext = "",
) {
  const currentParts = [
    `Desc: ${String(current?.description || "Unavailable")}`,
    Number.isFinite(current?.tempF)
      ? `TempF: ${Math.round(current.tempF)}`
      : "TempF: NA",
    `Wind: ${String(current?.windDirCardinal || "N/A")} ${
      Number.isFinite(current?.windSpeedMph)
        ? `${Math.round(current.windSpeedMph)} mph`
        : "NA"
    }`,
  ];

  const forecastList = Array.isArray(forecast) ? forecast.slice(0, 4) : [];
  const forecastLines = forecastList.map((period, idx) => {
    const dayName = String(period?.dayName || `Day ${idx + 1}`);
    const shortForecast = String(
      period?.shortForecast || "Forecast unavailable",
    );
    const highText = Number.isFinite(period?.highTempF)
      ? `${Math.round(period.highTempF)}F`
      : "--";
    const lowText = Number.isFinite(period?.lowTempF)
      ? `${Math.round(period.lowTempF)}F`
      : "--";
    return `${dayName}|${shortForecast}|H:${highText}|L:${lowText}`;
  });

  return [
    `City: ${String(cityLabel || "Unknown City")}`,
    ...(String(alertContext || "").trim()
      ? [`Alert context: ${String(alertContext).trim()}`]
      : []),
    "Current:",
    ...currentParts,
    "Forecast:",
    ...(forecastLines.length ? forecastLines : ["Forecast unavailable."]),
    "",
    "Task: Write a 2-4 sentence broadcast-ready weather brief. Refrain from time-of-day references",
    "Rules: current first, then forecast in order; mention alert context if present; factual only; no labels.",
  ].join("\n");
}

function buildWeatherSummaryFallback(
  cityLabel,
  current,
  forecast,
  alertContext = "",
) {
  const pieces = [];
  const city = String(cityLabel || "Unknown City");
  const alertText = String(alertContext || "").trim();
  const desc = String(current?.description || "Current conditions unavailable");
  const temp = Number.isFinite(current?.tempF)
    ? `${Math.round(current.tempF)} F`
    : "temperature unavailable";
  const wind = `${String(current?.windDirCardinal || "N/A")} ${
    Number.isFinite(current?.windSpeedMph)
      ? `${Math.round(current.windSpeedMph)} mph`
      : "wind unavailable"
  }`;
  pieces.push(
    `${city} currently has ${desc.toLowerCase()} with ${temp} and winds ${wind}.`,
  );

  if (alertText) {
    pieces.push(alertText.endsWith(".") ? alertText : `${alertText}.`);
  }

  const forecastList = Array.isArray(forecast) ? forecast.slice(0, 5) : [];
  if (forecastList.length) {
    const dayParts = forecastList.map((period, idx) => {
      const dayName = String(period?.dayName || `Day ${idx + 1}`);
      const short = String(period?.shortForecast || "Forecast unavailable");
      const hi = Number.isFinite(period?.highTempF)
        ? `${Math.round(period.highTempF)} F`
        : "high unavailable";
      const lo = Number.isFinite(period?.lowTempF)
        ? `${Math.round(period.lowTempF)} F`
        : "low unavailable";
      return `${dayName}: ${short}, high ${hi}, low ${lo}`;
    });
    pieces.push(`Forecast: ${dayParts.join(". ")}.`);
  } else {
    pieces.push("Forecast is currently unavailable.");
  }

  return enforceWordLimit(pieces.join(" "), OPENAI_WEATHER_SUMMARY_WORD_LIMIT);
}

async function requestOpenAiWeatherSummary(
  cityLabel,
  current,
  forecast,
  alertContext = "",
) {
  const cacheKey = buildWeatherSummaryCacheKey(
    cityLabel,
    current,
    forecast,
    alertContext,
  );
  const cached = getCachedSummary(openaiWeatherSummaryCache, cacheKey);
  if (cached) {
    console.log("[AI CACHE HIT][weather-summary]", cityLabel || "Unknown City");
    return cached;
  }

  if (openaiWeatherSummaryInFlight.has(cacheKey)) {
    return openaiWeatherSummaryInFlight.get(cacheKey);
  }

  const generationTask = (async () => {
    const client = getOpenAiClient();
    const userInput = buildWeatherSummaryPrompt(
      cityLabel,
      current,
      forecast,
      alertContext,
    );

    console.log("[AI PROMPT][weather-summary]", userInput);

    const payload = await client.responses.create({
      model: OPENAI_MODEL,
      max_output_tokens: OPENAI_WEATHER_SUMMARY_MAX_OUTPUT_TOKENS,
      text: {
        format: {
          type: "text",
        },
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You produce natural, broadcaster-style weather narration from structured weather data. Sound human and slightly enthusiastic while staying factual and not inventing details.",
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userInput }],
        },
      ],
    });

    console.log(
      "[AI DEBUG][weather-summary][output]",
      JSON.stringify(payload?.output || [], null, 2),
    );

    const generated = extractResponseText(payload);
    const constrained = enforceWordLimit(generated, Infinity);
    if (constrained) {
      setCachedSummary(
        openaiWeatherSummaryCache,
        cacheKey,
        constrained,
        OPENAI_WEATHER_SUMMARY_CACHE_TTL_MS,
        OPENAI_WEATHER_SUMMARY_CACHE_MAX_ENTRIES,
      );
      return constrained;
    }

    console.warn(
      "[AI WEATHER SUMMARY] Empty model text output. Falling back to deterministic summary.",
      JSON.stringify(
        {
          id: payload?.id,
          model: payload?.model,
          outputCount: Array.isArray(payload?.output)
            ? payload.output.length
            : 0,
          outputTextType: typeof payload?.output_text,
        },
        null,
        2,
      ),
    );

    const fallback = buildWeatherSummaryFallback(
      cityLabel,
      current,
      forecast,
      alertContext,
    );
    if (fallback) {
      setCachedSummary(
        openaiWeatherSummaryCache,
        cacheKey,
        fallback,
        OPENAI_WEATHER_SUMMARY_CACHE_TTL_MS,
        OPENAI_WEATHER_SUMMARY_CACHE_MAX_ENTRIES,
      );
    }
    return fallback;
  })();

  openaiWeatherSummaryInFlight.set(cacheKey, generationTask);
  try {
    return await generationTask;
  } finally {
    openaiWeatherSummaryInFlight.delete(cacheKey);
  }
}

app.post("/api/alert-summary", async (req, res) => {
  try {
    const rawText = String(req.body?.rawText || "").trim();
    const eventName = String(req.body?.eventName || "Weather Alert").trim();

    if (!rawText) {
      res.status(400).json({ error: "Missing request body rawText." });
      return;
    }

    const summary = await requestOpenAiAlertSummary(rawText, eventName);
    if (!summary) {
      res.status(502).json({
        error: "OpenAI returned an empty summary.",
      });
      return;
    }

    res.json({
      summary,
      model: OPENAI_MODEL,
    });
  } catch (err) {
    console.error("/api/alert-summary error", err);
    res.status(502).json({
      error: "Alert summarization failed.",
      details: err?.message || "Unknown OpenAI error",
    });
  }
});

app.post("/api/weather-summary", async (req, res) => {
  try {
    const cityLabel =
      String(req.body?.cityLabel || "").trim() || "Unknown City";
    const current = req.body?.current || {};
    const forecast = Array.isArray(req.body?.forecast) ? req.body.forecast : [];
    const alertContext = String(req.body?.alertContext || "").trim();

    const summary = await requestOpenAiWeatherSummary(
      cityLabel,
      current,
      forecast,
      alertContext,
    );
    res.json({
      summary,
      model: OPENAI_MODEL,
      wordLimit: OPENAI_WEATHER_SUMMARY_WORD_LIMIT,
    });
  } catch (err) {
    console.error("/api/weather-summary error", err);
    res.status(502).json({
      error: "Weather summarization failed.",
      details: err?.message || "Unknown OpenAI error",
    });
  }
});

app.get("/api/youtube/live-status", async (_req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      res.status(503).json({
        error: "YouTube API is not configured.",
        details: "Set YOUTUBE_API_KEY in your environment.",
      });
      return;
    }

    const payload = await fetchYouTubeLiveStatus();
    res.json({
      ...payload,
      model: OPENAI_MODEL,
    });
  } catch (err) {
    console.error("/api/youtube/live-status error", err);
    res.status(502).json({
      error: "YouTube live status check failed.",
      details: err?.message || "Unknown YouTube status error",
    });
  }
});

app.post("/api/youtube/live-mention", async (req, res) => {
  try {
    const channelName = String(
      req.body?.channelName || YOUTUBE_LIVE_CHANNEL_NAME,
    ).trim();
    const videoId = String(req.body?.videoId || "").trim();
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();

    if (!title && !description) {
      res.status(400).json({
        error: "Missing title/description for live mention generation.",
      });
      return;
    }

    const mention = await requestOpenAiYouTubeLiveMention({
      channelName,
      videoId,
      title,
      description,
    });

    res.json({
      mention,
      model: OPENAI_MODEL,
    });
  } catch (err) {
    console.error("/api/youtube/live-mention error", err);
    res.status(502).json({
      error: "YouTube live mention generation failed.",
      details: err?.message || "Unknown YouTube live mention error",
    });
  }
});

app.get("/api/youtube/live-chat-requests", async (req, res) => {
  try {
    if (!YOUTUBE_API_KEY) {
      res.status(503).json({
        error: "YouTube API is not configured.",
        details: "Set YOUTUBE_API_KEY in your environment.",
      });
      return;
    }

    const videoId = String(req.query?.videoId || "").trim();
    const pageToken = String(req.query?.pageToken || "").trim();
    const ownerName =
      String(req.query?.ownerName || "").trim() || YOUTUBE_CHAT_OWNER_DEFAULT;

    if (!videoId) {
      res.status(400).json({ error: "Missing query parameter videoId." });
      return;
    }

    const liveChatId = await getYouTubeActiveLiveChatId(videoId);
    if (!liveChatId) {
      res.status(404).json({
        error: "No active live chat found for this video.",
      });
      return;
    }

    const payload = await listYouTubeLiveChatMessages(liveChatId, pageToken);
    const requests = await buildYouTubeChatForecastRequests(
      payload?.items || [],
      ownerName,
    );

    res.json({
      liveChatId,
      ownerName,
      requests,
      nextPageToken: String(payload?.nextPageToken || ""),
      pollingIntervalMillis: Number(payload?.pollingIntervalMillis || 5000),
    });
  } catch (err) {
    console.error("/api/youtube/live-chat-requests error", err);
    res.status(502).json({
      error: "YouTube live chat polling failed.",
      details: err?.message || "Unknown polling error",
    });
  }
});

function decodeHtmlEntities(value) {
  if (typeof value !== "string" || !value) return "";
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractAfdPlainText(raw) {
  const text = String(raw || "");
  if (!text) return "";

  const preMatch = text.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const source = preMatch ? preMatch[1] : text;
  const stripped = source
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(stripped).replace(/\r/g, "").trim();
}

function extractSpcDay1DiscussionText(raw) {
  const html = String(raw || "");
  if (!html) return "";

  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const preText = preMatch
    ? decodeHtmlEntities(
        String(preMatch[1] || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\r/g, ""),
      )
    : "";

  const normalized = preText
    .replace(/\u00a0/g, " ")
    .replace(/\t+/g, " ")
    .replace(/[ \f\v]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return "";

  const discussionIdx = normalized.search(/\bDISCUSSION\b[:.]?/i);
  if (discussionIdx >= 0) {
    return normalized.slice(discussionIdx).trim();
  }

  return normalized;
}

async function fetchSpcDay1Discussion() {
  if (
    spcDay1DiscussionCache.payload &&
    Date.now() < spcDay1DiscussionCache.expiresAt
  ) {
    return spcDay1DiscussionCache.payload;
  }

  if (spcDay1DiscussionCache.inFlight) {
    return spcDay1DiscussionCache.inFlight;
  }

  const task = (async () => {
    const html = await fetchText(SPC_DAY1_OUTLOOK_URL);
    const discussionText = extractSpcDay1DiscussionText(html);

    const payload = {
      discussionText,
      sourceUrl: SPC_DAY1_OUTLOOK_URL,
      fetchedAt: new Date().toISOString(),
    };

    spcDay1DiscussionCache.payload = payload;
    spcDay1DiscussionCache.expiresAt =
      Date.now() + SPC_DAY1_DISCUSSION_CACHE_TTL_MS;
    return payload;
  })();

  spcDay1DiscussionCache.inFlight = task;
  try {
    return await task;
  } finally {
    spcDay1DiscussionCache.inFlight = null;
  }
}

function extractWpcShortRangeDiscussionText(raw) {
  const html = String(raw || "");
  if (!html) return "";

  const preMatch = html.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const preText = preMatch
    ? decodeHtmlEntities(
        String(preMatch[1] || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\r/g, ""),
      )
    : "";

  const normalized = preText
    .replace(/\u00a0/g, " ")
    .replace(/\t+/g, " ")
    .replace(/[ \f\v]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\s*"|"\s*$/g, "")
    .trim();

  if (!normalized) return "";

  const shortRangeIdx = normalized.search(
    /\bSHORT RANGE FORECAST DISCUSSION\b/i,
  );
  if (shortRangeIdx >= 0) {
    return normalized.slice(shortRangeIdx).trim();
  }

  return normalized;
}

async function fetchWpcShortRangeDiscussion() {
  if (
    wpcShortRangeDiscussionCache.payload &&
    Date.now() < wpcShortRangeDiscussionCache.expiresAt
  ) {
    return wpcShortRangeDiscussionCache.payload;
  }

  if (wpcShortRangeDiscussionCache.inFlight) {
    return wpcShortRangeDiscussionCache.inFlight;
  }

  const task = (async () => {
    const html = await fetchText(WPC_SHORT_RANGE_DISCUSSION_URL);
    const discussionText = extractWpcShortRangeDiscussionText(html);

    const payload = {
      discussionText,
      sourceUrl: WPC_SHORT_RANGE_DISCUSSION_URL,
      fetchedAt: new Date().toISOString(),
    };

    wpcShortRangeDiscussionCache.payload = payload;
    wpcShortRangeDiscussionCache.expiresAt =
      Date.now() + WPC_SHORT_RANGE_DISCUSSION_CACHE_TTL_MS;
    return payload;
  })();

  wpcShortRangeDiscussionCache.inFlight = task;
  try {
    return await task;
  } finally {
    wpcShortRangeDiscussionCache.inFlight = null;
  }
}

function fetchTextWithNodeHttp(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https://") ? https : http;
    const req = client.get(
      url,
      {
        headers: {
          "User-Agent": "Radar-App/1.0 (contact: local)",
          Accept: "text/plain,text/html,application/json,*/*",
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
          resolve(fetchTextWithNodeHttp(redirectUrl, redirectCount + 1));
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
          resolve(Buffer.concat(chunks).toString("utf8"));
        });
      },
    );

    req.setTimeout(15000, () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
    req.on("error", reject);
  });
}

async function fetchText(url) {
  if (typeof fetch === "function") {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Radar-App/1.0 (contact: local)",
        Accept: "text/plain,text/html,application/json,*/*",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching ${url}`);
    }
    return response.text();
  }

  return fetchTextWithNodeHttp(url);
}

async function fetchAfdText(site) {
  const nwsApiUrl = `https://api.weather.gov/products/types/AFD/locations/${site}`;
  const fallbackUrl = `https://forecast.weather.gov/product.php?site=${site}&issuedby=${site}&product=AFD&format=txt`;

  try {
    const listing = await fetchJson(nwsApiUrl);
    const graph =
      listing && Array.isArray(listing["@graph"]) ? listing["@graph"] : [];
    const latest = graph.length ? graph[0] : null;
    const latestUrl =
      (typeof latest?.id === "string" && latest.id) ||
      (typeof latest?.["@id"] === "string" && latest["@id"]) ||
      "";

    if (latestUrl) {
      const product = await fetchJson(latestUrl);
      const productText = String(product?.productText || "").trim();
      if (productText.length >= 500) {
        return { site, text: productText, source: "api.weather.gov" };
      }
    }
  } catch (err) {
    console.warn(
      `[AFD] api.weather.gov failed for ${site}:`,
      err?.message || err,
    );
  }

  try {
    const raw = await fetchText(fallbackUrl);
    const parsed = extractAfdPlainText(raw);
    if (parsed.length >= 500) {
      return { site, text: parsed, source: "forecast.weather.gov" };
    }

    return {
      site,
      text: parsed,
      source: "forecast.weather.gov",
      error: `AFD text unexpectedly short (${parsed.length} chars)`,
      rawPreview: String(raw || "").slice(0, 220),
    };
  } catch (err) {
    console.error(`Failed to fetch AFD for ${site}:`, err.message);
    return { site, text: "", error: err.message };
  }
}

async function fetchMichiganAfdForecasts() {
  const sites = ["DTX", "GRR", "APX", "IWX", "MQT"];
  const forecasts = await Promise.all(sites.map((site) => fetchAfdText(site)));
  return forecasts;
}

async function buildStatewideForcastPrompt(afdForecasts) {
  const forecastText = afdForecasts
    .filter((f) => f.text)
    .map((f) => `\n[${f.site}]\n${compactAfdTextForPrompt(f.text, 700)}`)
    .join("\n");

  return [
    "You are a meteorologist creating a brief statewide weather summary for Michigan.",
    "",
    "AFD Forecasts:",
    forecastText,
    "",
    "Task: Synthesize the above Area Forecast Discussion texts into a natural, non-technical weather bulletin organized by Michigan region:",
    "- Upper Peninsula (MQT covers this)",
    "- Northern Lower Michigan (APX covers this)",
    "- West Michigan (GRR covers this)",
    "- Southeast Michigan (DTX covers this)",
    "- Southwest Michigan (IWX covers southern Michigan area)",
    "",
    "Rules:",
    "- Use simple, everyday language that non-technical audiences understand.",
    "- Avoid meteorological jargon.",
    "- Highlight significant weather (storms, frost, snow, etc.)",
    "- Keep it concise and suitable for spoken delivery (about 3-5 minutes).",
    "- Organize by region for clarity.",
    "- Return only the weather bulletin text with no labels or metadata.",
  ].join("\n");
}

const MICHIGAN_REGIONS = [
  {
    name: "Upper Peninsula",
    nwsOffice: "MQT",
    center: [-87.30153918596537, 46.22973266681274],
    zoom: 6.5,
    bounds: [
      [-89.5, 46.2],
      [-84.5, 48.8],
    ],
  },
  {
    name: "Northern Lower Michigan",
    nwsOffice: "APX",
    center: [-84.70828835571544, 44.804615131984995],
    zoom: 6.8,
    bounds: [
      [-87.5, 44.5],
      [-83.5, 46.5],
    ],
  },
  {
    name: "West Michigan",
    nwsOffice: "GRR",
    center: [-85.59853152673139, 42.9247797905393],
    zoom: 7.0,
    bounds: [
      [-86.8, 42],
      [-84.5, 44.8],
    ],
  },
  {
    name: "Southeast Michigan",
    nwsOffice: "DTX",
    center: [-83.54992951472778, 42.65559796676246],
    zoom: 7.2,
    bounds: [
      [-84.5, 42],
      [-82.5, 44],
    ],
  },
  {
    name: "Southwest Michigan",
    nwsOffice: "IWX",
    center: [-85.60545247947464, 41.84619093980309],
    zoom: 7.3,
    bounds: [
      [-87.2, 41.5],
      [-84.5, 42.5],
    ],
  },
];

async function buildRegionalForcastPrompt(region, afdForecasts) {
  const relevantForecasts = afdForecasts.filter(
    (f) => f.site === region.nwsOffice,
  );

  if (!relevantForecasts.length) {
    return null;
  }

  const forecastText = relevantForecasts
    .map((f) => compactAfdTextForPrompt(f.text, 520))
    .join("\n");

  const prompt = [
    `You are a meteorologist creating a brief weather summary for ${region.name}, Michigan.`,
    "",
    "AFD Forecast:",
    forecastText,
    "",
    "Task: Create a concise, natural weather summary for this region suitable for spoken delivery.",
    "Rules:",
    "- Use simple, everyday language.",
    "- Avoid meteorological jargon.",
    "- Highlight significant weather (storms, frost, snow, etc.).",
    "- Keep it brief, about 20-30 seconds of speech.",
    "- Return only the weather summary text with no labels or metadata.",
  ].join("\n");

  return prompt;
}

async function requestOpenAiStatewideForcast(afdForecasts) {
  const cacheKey = buildAfdStatewideSummaryCacheKey(afdForecasts);
  const cached = getCachedSummary(openaiStatewideAfdSummaryCache, cacheKey);
  if (cached) {
    console.log("[AI CACHE HIT][statewide-afd-summary]");
    return cached;
  }

  if (openaiStatewideAfdSummaryInFlight.has(cacheKey)) {
    return openaiStatewideAfdSummaryInFlight.get(cacheKey);
  }

  const generationTask = (async () => {
    const client = getOpenAiClient();
    const prompt = await buildStatewideForcastPrompt(afdForecasts);

    const response = await client.responses.create({
      model: OPENAI_MODEL,
      max_output_tokens: 1200,
      text: {
        format: {
          type: "text",
        },
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: "You produce clear, non-technical regional weather narration for general audiences.",
            },
          ],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
    });

    const summary = String(extractResponseText(response) || "").trim();
    if (summary) {
      setCachedSummary(
        openaiStatewideAfdSummaryCache,
        cacheKey,
        summary,
        OPENAI_AFD_SUMMARY_CACHE_TTL_MS,
        OPENAI_AFD_SUMMARY_CACHE_MAX_ENTRIES,
      );
    }
    return summary;
  })();

  openaiStatewideAfdSummaryInFlight.set(cacheKey, generationTask);
  try {
    return await generationTask;
  } finally {
    openaiStatewideAfdSummaryInFlight.delete(cacheKey);
  }
}

app.post("/api/statewide-forecast", async (req, res) => {
  try {
    const afdForecasts = await fetchMichiganAfdForecasts();
    const summary = await requestOpenAiStatewideForcast(afdForecasts);
    res.json({
      summary,
      model: OPENAI_MODEL,
      regions: [
        "Upper Peninsula",
        "Northern Lower Michigan",
        "West Michigan",
        "Southeast Michigan",
        "Southwest Michigan",
      ],
    });
  } catch (err) {
    console.error("/api/statewide-forecast error", err);
    res.status(502).json({
      error: "Statewide forecast summarization failed.",
      details: err?.message || "Unknown error",
    });
  }
});

app.post("/api/statewide-forecast-regions", async (req, res) => {
  try {
    console.log("[STATEWIDE FORECAST] Fetching AFD data from 5 NWS offices...");
    const afdForecasts = await fetchMichiganAfdForecasts();

    console.log(
      `[STATEWIDE FORECAST] AFD forecasts retrieved: ${afdForecasts.length} offices`,
    );
    for (const afd of afdForecasts) {
      const textLength = afd.text ? afd.text.length : 0;
      console.log(
        `  - ${afd.site}: ${textLength} chars source=${afd.source || "unknown"} ${afd.error ? `(error: ${afd.error})` : ""}`,
      );
      if (afd.rawPreview && textLength < 500) {
        console.log(`    preview: ${afd.rawPreview.replace(/\s+/g, " ")}`);
      }
    }

    const regionalForecasts = [];
    const client = getOpenAiClient();

    for (const region of MICHIGAN_REGIONS) {
      const prompt = await buildRegionalForcastPrompt(region, afdForecasts);
      if (!prompt) {
        console.warn(
          `[STATEWIDE FORECAST] No AFD data for region ${region.name}`,
        );
        continue;
      }

      console.log(
        `[STATEWIDE FORECAST] Generating forecast for ${region.name}...`,
      );
      const regionalCacheKey = buildAfdRegionalSummaryCacheKey(
        region,
        afdForecasts,
      );
      let forecastText = getCachedSummary(
        openaiRegionalAfdSummaryCache,
        regionalCacheKey,
      );

      if (!forecastText) {
        if (openaiRegionalAfdSummaryInFlight.has(regionalCacheKey)) {
          forecastText =
            (await openaiRegionalAfdSummaryInFlight.get(regionalCacheKey)) ||
            "";
        } else {
          const regionalTask = (async () => {
            const response = await client.responses.create({
              model: OPENAI_MODEL,
              max_output_tokens: 300,
              text: {
                format: {
                  type: "text",
                },
              },
              input: [
                {
                  role: "system",
                  content: [
                    {
                      type: "input_text",
                      text: "You produce concise, easy-to-understand regional weather narration for spoken delivery.",
                    },
                  ],
                },
                {
                  role: "user",
                  content: [{ type: "input_text", text: prompt }],
                },
              ],
            });

            const generated = String(
              extractResponseText(response) || "",
            ).trim();
            if (generated) {
              setCachedSummary(
                openaiRegionalAfdSummaryCache,
                regionalCacheKey,
                generated,
                OPENAI_AFD_SUMMARY_CACHE_TTL_MS,
                OPENAI_AFD_SUMMARY_CACHE_MAX_ENTRIES,
              );
            }
            return generated;
          })();

          openaiRegionalAfdSummaryInFlight.set(regionalCacheKey, regionalTask);
          try {
            forecastText = (await regionalTask) || "";
          } finally {
            openaiRegionalAfdSummaryInFlight.delete(regionalCacheKey);
          }
        }
      } else {
        console.log(`[AI CACHE HIT][regional-afd-summary] ${region.name}`);
      }

      if (forecastText) {
        regionalForecasts.push({
          region: region.name,
          forecast: forecastText,
          center: region.center,
          zoom: region.zoom,
          bounds: region.bounds,
          nwsOffice: region.nwsOffice,
        });
      }
    }

    res.json({
      regionalForecasts,
      model: OPENAI_MODEL,
      count: regionalForecasts.length,
    });
  } catch (err) {
    console.error("/api/statewide-forecast-regions error", err);
    res.status(502).json({
      error: "Regional forecast summarization failed.",
      details: err?.message || "Unknown error",
    });
  }
});

app.get("/api/spc/day1-discussion", async (req, res) => {
  try {
    const spc = await fetchSpcDay1Discussion();
    res.json({
      discussionText: String(spc?.discussionText || ""),
      sourceUrl: String(spc?.sourceUrl || SPC_DAY1_OUTLOOK_URL),
      fetchedAt: String(spc?.fetchedAt || new Date().toISOString()),
    });
  } catch (err) {
    console.error("/api/spc/day1-discussion error", err);
    res.status(502).json({
      error: "SPC Day 1 discussion fetch failed.",
      details: err?.message || "Unknown error",
    });
  }
});

app.post("/api/mi-situation-review", async (req, res) => {
  try {
    const alerts = Array.isArray(req.body?.alerts) ? req.body.alerts : [];
    const [afdForecasts, wpcShortRange] = await Promise.all([
      fetchMichiganAfdForecasts(),
      fetchWpcShortRangeDiscussion(),
    ]);
    const summary = await requestOpenAiMichiganSituationReview({
      alerts,
      afdForecasts,
      wpcShortTermDiscussion: String(wpcShortRange?.discussionText || ""),
    });
    const parsed = parseMichiganSituationReviewOutput(summary);

    res.json({
      summary: String(parsed?.spokenSummary || "").trim(),
      summaryPoints: Array.isArray(parsed?.summaryPoints)
        ? parsed.summaryPoints
        : [],
      spokenSummary: String(parsed?.spokenSummary || "").trim(),
      alertCount: alerts.length,
      generatedAt: new Date().toISOString(),
      model: OPENAI_MODEL,
    });
  } catch (err) {
    console.error("/api/mi-situation-review error", err);
    res.status(502).json({
      error: "Michigan situation review generation failed.",
      details: err?.message || "Unknown error",
    });
  }
});

app.post("/api/tts", async (req, res) => {
  try {
    const text = clampPollyText(req.body?.text);
    if (!text) {
      res.status(400).json({ error: "Missing request body text." });
      return;
    }

    const clientState = getPollyClient();
    if (!clientState.ok) {
      const details =
        clientState.reason === "credentials-missing"
          ? "AWS credentials are not set on the server process."
          : "Polly SDK is not available.";
      res.status(503).json({ error: "Polly is unavailable.", details });
      return;
    }

    const requestedVoiceId = String(
      req.body?.voiceId || POLLY_DEFAULT_VOICE_ID,
    ).trim();
    const requestedEngine = String(req.body?.engine || POLLY_DEFAULT_ENGINE)
      .trim()
      .toLowerCase();
    const engine = requestedEngine === "standard" ? "standard" : "neural";

    const command = new SynthesizeSpeechCommand({
      Text: text,
      TextType: "text",
      OutputFormat: "mp3",
      VoiceId: requestedVoiceId || POLLY_DEFAULT_VOICE_ID,
      Engine: engine,
    });

    const response = await clientState.client.send(command);
    const audioBuffer = await toBuffer(response?.AudioStream);

    if (!audioBuffer.length) {
      res.status(502).json({ error: "Polly returned empty audio." });
      return;
    }

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-TTS-Voice", requestedVoiceId || POLLY_DEFAULT_VOICE_ID);
    res.setHeader("X-TTS-Engine", engine);
    res.send(audioBuffer);
  } catch (err) {
    console.error("/api/tts error", err);
    res.status(502).json({
      error: "Polly synthesis failed.",
      details: err?.message || "Unknown Polly error",
    });
  }
});

function getAdminRefreshTokenFromRequest(req) {
  return String(
    req.get("x-admin-refresh-token") ||
      req.query?.token ||
      req.body?.token ||
      "",
  ).trim();
}

function isAdminRefreshAuthorized(req) {
  if (!ADMIN_REFRESH_TOKEN) return true;
  return getAdminRefreshTokenFromRequest(req) === ADMIN_REFRESH_TOKEN;
}

function writeSseEvent(res, event, data) {
  const payload =
    typeof data === "string" ? data : JSON.stringify(data == null ? {} : data);
  res.write(`event: ${event}\n`);
  res.write(`data: ${payload}\n\n`);
}

function broadcastRefreshEvent({ reason = "", source = "manual" } = {}) {
  const payload = {
    type: "refresh",
    version: ++refreshBroadcastVersion,
    triggeredAt: new Date().toISOString(),
    reason: String(reason || "")
      .trim()
      .slice(0, ADMIN_REFRESH_REASON_MAX_LEN),
    source:
      String(source || "manual")
        .trim()
        .slice(0, 60) || "manual",
    clientsConnected: refreshControlClients.size,
  };

  lastRefreshBroadcast = payload;
  let notified = 0;
  for (const client of refreshControlClients) {
    try {
      writeSseEvent(client.res, "refresh", payload);
      notified += 1;
    } catch (err) {
      // Drop broken streams on the next cleanup tick.
    }
  }

  return {
    payload,
    notified,
  };
}

app.get("/api/admin/refresh/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  res.write("retry: 5000\n\n");

  const client = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    res,
    pingTimer: null,
  };
  refreshControlClients.add(client);

  writeSseEvent(res, "connected", {
    ok: true,
    clientsConnected: refreshControlClients.size,
    tokenRequired: Boolean(ADMIN_REFRESH_TOKEN),
    lastRefresh: lastRefreshBroadcast,
  });

  client.pingTimer = setInterval(
    () => {
      try {
        res.write(`: ping ${Date.now()}\n\n`);
      } catch (err) {
        // Connection teardown is handled by the close event.
      }
    },
    Math.max(5000, REFRESH_SSE_PING_INTERVAL_MS),
  );

  req.on("close", () => {
    if (client.pingTimer) {
      clearInterval(client.pingTimer);
    }
    refreshControlClients.delete(client);
  });
});

app.get("/api/admin/refresh/status", (req, res) => {
  res.json({
    ok: true,
    tokenRequired: Boolean(ADMIN_REFRESH_TOKEN),
    clientsConnected: refreshControlClients.size,
    lastRefresh: lastRefreshBroadcast,
    serverTime: new Date().toISOString(),
  });
});

app.post("/api/admin/refresh-all", (req, res) => {
  if (!isAdminRefreshAuthorized(req)) {
    res.status(403).json({
      error: "Forbidden",
      details:
        "Invalid or missing admin refresh token. Set x-admin-refresh-token header.",
    });
    return;
  }

  const reason = String(req.body?.reason || "")
    .trim()
    .slice(0, ADMIN_REFRESH_REASON_MAX_LEN);
  const source = String(req.body?.source || "manual-trigger")
    .trim()
    .slice(0, 60);

  const { payload, notified } = broadcastRefreshEvent({ reason, source });

  res.json({
    ok: true,
    message: "Refresh signal broadcasted.",
    notified,
    clientsConnected: refreshControlClients.size,
    tokenRequired: Boolean(ADMIN_REFRESH_TOKEN),
    refresh: payload,
  });
});

app.get("/admin/refresh", (req, res) => {
  res.sendFile(path.join(__dirname, "admin-refresh.html"));
});

// Define a route for the root URL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
