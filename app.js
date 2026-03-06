const MAPTILER_API_KEY = "SskdAs3Zk3tm9lBUtRKN";
const NEXRAD_BUCKET_URL = "https://unidata-nexrad-level3.s3.amazonaws.com";
const RADAR_SITES_URL =
  "https://www.ncei.noaa.gov/access/homr/file/nexrad-stations.csv";

let enable3DTilt = false;
let beamElevationAngle = 0.5;
let tiltExaggeration = 10;
let enableShadows = true;
let shadowOpacity = 0.3;
let radarSiteLocation = null;

let enableAlertFlashing = true;
let flashMode = "hard";
let flashSpeed = 800;
let selectedAlert = null;
let alertFlashInterval = null;

const ALERT_STYLE_STORAGE_KEY = "radar-alert-style-config-v1";
let alertStyleConfig = null;
let alertsButtonUpdateRaf = null;
let inspectorMoveRaf = null;
let pendingInspectorEvent = null;

const ALERT_STYLE_GROUP_DEFINITIONS = [
  {
    id: "tornado",
    label: "Tornado",
    keywords: ["tornado"],
    accent: "#f87171",
  },
  {
    id: "severe-thunderstorm",
    label: "Severe Thunderstorm",
    keywords: ["severe thunderstorm", "thunderstorm", "svr"],
    accent: "#fb923c",
  },
  {
    id: "flash-flood",
    label: "Flash Flood",
    keywords: ["flash flood", "flash flood emergency"],
    accent: "#facc15",
  },
  {
    id: "flood",
    label: "Flood & River",
    keywords: ["flood", "river", "hydrologic"],
    accent: "#22d3ee",
  },
  {
    id: "winter",
    label: "Winter Weather",
    keywords: ["winter", "snow", "ice", "blizzard", "freezing"],
    accent: "#38bdf8",
  },
  {
    id: "heat",
    label: "Heat & Fire",
    keywords: ["heat", "heat advisory", "heat warning", "burn"],
    accent: "#fb7185",
  },
  {
    id: "cold",
    label: "Cold & Freeze",
    keywords: ["freezing", "cold", "freeze", "frost"],
    accent: "#67e8f9",
  },
  {
    id: "tropical",
    label: "Tropical",
    keywords: ["hurricane", "tropical"],
    accent: "#c084fc",
  },
  {
    id: "watch",
    label: "Watches",
    keywords: ["watch"],
    accent: "#a5b4fc",
  },
  {
    id: "advisory",
    label: "Advisories & Outlooks",
    keywords: ["advisory", "outlook", "statement"],
    accent: "#94a3b8",
  },
];
const DEFAULT_ALERT_STYLE_GROUP = {
  id: "other",
  label: "Other Alerts",
  accent: "#94a3b8",
};

const PROBE_UPDATE_MIN_INTERVAL_MS = 150;
let lastProbeUpdateTs = 0;

let coordinatePromptMarker = null;
let coordinatePromptCard = null;

let countiesData = null;
let countiesByGeoid = new Map();

const UI_DESIGN_WIDTH = 3840;
const UI_DESIGN_HEIGHT = 2160;
const UI_SCALE_MIN = 0.55;
const UI_SCALE_MAX = 1.0;
const UI_SCALE_MOBILE_BREAKPOINT = 900;

const THEME_STORAGE_KEY = "radar-ui-theme";

let uiScaleResizeRaf = null;

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getAlertStyleGroupDefinition(eventName) {
  if (!eventName) return DEFAULT_ALERT_STYLE_GROUP;
  const normalized = eventName.toLowerCase();
  for (const group of ALERT_STYLE_GROUP_DEFINITIONS) {
    if (group.keywords.some((keyword) => normalized.includes(keyword))) {
      return group;
    }
  }
  return DEFAULT_ALERT_STYLE_GROUP;
}

/**
 * Detect mobile: true when running on a narrow screen OR a touch-primary
 * device (phone/tablet), regardless of current orientation.
 */
function isMobileDevice() {
  const width = window.innerWidth || 0;
  const height = window.innerHeight || 0;
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);

  const touchUA = /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );

  const touchPoints =
    typeof navigator.maxTouchPoints === "number" &&
    navigator.maxTouchPoints > 0;

  const coarsePointer =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;

  const noHover =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: none)").matches;

  const touchPrimaryDevice = touchPoints || coarsePointer || noHover;
  const phoneTabletLikeViewport =
    shortestSide <= UI_SCALE_MOBILE_BREAKPOINT && longestSide <= 1600;

  return touchUA || (touchPrimaryDevice && phoneTabletLikeViewport);
}

function computeUiScale() {
  const w = window.innerWidth || UI_DESIGN_WIDTH;
  const h = window.innerHeight || UI_DESIGN_HEIGHT;
  const shortestSide = Math.min(w, h);
  const isPortrait = h > w;

  if (isMobileDevice()) {
    // Scale against a mobile-appropriate reference dimension.
    // Portrait → scale against width (panels are vertically stacked).
    // Landscape → scale against height (screen is short, so that's the
    //   constraining dimension for panel content).
    if (isPortrait) {
      // e.g. iPhone 14 portrait: 390 / 1300 ≈ 0.30
      return clampNumber(shortestSide / 1300, 0.24, 0.46);
    } else {
      // Landscape phones need stronger downscale due to limited height.
      // e.g. iPhone 14 landscape: 390 / 1040 ≈ 0.37
      return clampNumber(shortestSide / 1040, 0.22, 0.4);
    }
  }

  const scale = Math.min(w / UI_DESIGN_WIDTH, h / UI_DESIGN_HEIGHT);
  return clampNumber(scale, UI_SCALE_MIN, UI_SCALE_MAX);
}

function configureMobileDockSections() {
  const mobileMode =
    document.documentElement.getAttribute("data-mobile") === "true";
  const sections = document.querySelectorAll("#siteDock .dock-section");

  sections.forEach((section, index) => {
    const header = section.querySelector(".dock-section-header");
    const body = section.querySelector(".dock-section-body");
    if (!header || !body) {
      return;
    }

    if (mobileMode) {
      section.classList.add("mobile-collapsible");
      section.classList.remove("desktop-collapsible");
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");

      if (!header.dataset.mobileToggleBound) {
        const toggleSection = () => {
          if (document.documentElement.getAttribute("data-mobile") !== "true") {
            return;
          }
          section.classList.toggle("is-collapsed");
          header.setAttribute(
            "aria-expanded",
            section.classList.contains("is-collapsed") ? "false" : "true",
          );
        };

        header.addEventListener("click", toggleSection);
        header.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleSection();
          }
        });
        header.dataset.mobileToggleBound = "true";
      }

      const shouldExpand = index === 0;
      section.classList.toggle("is-collapsed", !shouldExpand);
      header.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
    } else {
      section.classList.remove("mobile-collapsible");
      section.classList.add("desktop-collapsible");

      if (!header.dataset.desktopToggleBound) {
        const toggleDesktopSection = () => {
          if (document.documentElement.getAttribute("data-mobile") === "true") {
            return;
          }
          section.classList.toggle("is-collapsed");
          header.setAttribute(
            "aria-expanded",
            section.classList.contains("is-collapsed") ? "false" : "true",
          );
        };

        header.addEventListener("click", toggleDesktopSection);
        header.dataset.desktopToggleBound = "true";
      }

      const shouldExpand = index === 0;
      section.classList.toggle("is-collapsed", !shouldExpand);
      header.removeAttribute("role");
      header.removeAttribute("tabindex");
      header.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
    }
  });
}

function applyUiScale({ shouldResizeMap } = { shouldResizeMap: true }) {
  const scale = computeUiScale();
  document.documentElement.style.setProperty("--ui-scale", scale.toFixed(3));

  // Tag <html> so CSS can target mobile mode without JS-in-CSS hacks
  if (isMobileDevice()) {
    document.documentElement.setAttribute("data-mobile", "true");
    document.documentElement.setAttribute(
      "data-orient",
      window.innerHeight > window.innerWidth ? "portrait" : "landscape",
    );
  } else {
    document.documentElement.removeAttribute("data-mobile");
    document.documentElement.removeAttribute("data-orient");
  }

  configureMobileDockSections();

  if (shouldResizeMap && typeof mapInstance?.resize === "function") {
    requestAnimationFrame(() => {
      try {
        mapInstance.resize();
      } catch (e) {
        // Ignore resize errors during startup/teardown.
      }
    });
  }
}

function installUiScaleResizeHandler() {
  const debouncedApply = () => {
    if (uiScaleResizeRaf) cancelAnimationFrame(uiScaleResizeRaf);
    uiScaleResizeRaf = requestAnimationFrame(() => {
      applyUiScale({ shouldResizeMap: true });
    });
  };

  window.addEventListener("resize", debouncedApply, { passive: true });

  // Fire on orientation flip (phones/tablets rotating)
  window.addEventListener("orientationchange", () => {
    // Give the browser time to settle the new viewport dimensions
    setTimeout(() => {
      applyUiScale({ shouldResizeMap: true });
    }, 150);
  });
}

function applyTheme(theme) {
  const nextTheme = theme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", nextTheme);
  const toggle = document.getElementById("themeToggle");
  if (toggle) {
    toggle.title =
      nextTheme === "light" ? "Switch to Dark Theme" : "Switch to Light Theme";
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (e) {
    // Ignore storage errors in restricted environments.
  }
}

function initializeTheme() {
  let initialTheme = "dark";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored) {
      initialTheme = stored;
    } else if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches
    ) {
      initialTheme = "light";
    }
  } catch (e) {
    // Ignore storage errors in restricted environments.
  }
  applyTheme(initialTheme);
}

function syncToolToggleVisualState() {
  const rows = document.querySelectorAll(".tool-toggles .check-row");
  rows.forEach((row) => {
    const input = row.querySelector('input[type="checkbox"]');
    if (!input) return;
    row.classList.toggle("is-active", !!input.checked);
  });
}

function bindToolToggleVisualState() {
  const rows = document.querySelectorAll(".tool-toggles .check-row");
  rows.forEach((row) => {
    const input = row.querySelector('input[type="checkbox"]');
    if (!input || input.dataset.visualBound === "true") return;

    input.addEventListener("change", syncToolToggleVisualState);
    input.dataset.visualBound = "true";
  });

  syncToolToggleVisualState();
}

function updateDockSummary() {
  const siteEl = document.getElementById("currentSiteName");
  const productEl = document.getElementById("currentProductName");

  if (siteEl) {
    if (dataMode === "hrrr") {
      siteEl.textContent = "HRRR - CONUS";
    } else if (selectedRadarSite) {
      siteEl.textContent = `${selectedRadarSite.id} - ${selectedRadarSite.name}`;
    } else {
      siteEl.textContent = "No site selected";
    }
  }

  if (productEl) {
    const productCode =
      dataMode === "hrrr"
        ? `HRRR_${selectedHRRRVariable.toUpperCase()}`
        : selectedRadarProduct;

    if (productCode) {
      const info = getRadarProductInfo(productCode);
      productEl.textContent = `${productCode} - ${info.name}`;
    } else {
      productEl.textContent = "Select a product";
    }
  }
}

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE = 6;
let longPressTimer = null;
let longPressStartPoint = null;

const ALERT_OUTLINE_CONFIG = {
  innerWidth: 5,
  outerWidth: 8,
  innerColor: (alertColor) => alertColor,
  outerColor: "#000000ff",
  innerOpacity: 1.0,
  outerOpacity: 1.0,
  fillOpacity: 0.15,
};

const icons = {
  "TO.W": "🌪️",
  "SV.W": "⛈️",
  "FF.W": "🌊",
  "FL.W": "💧",
  "HU.W": "🌀",
  "WS.W": "❄️",
  "BZ.W": "❄️",
  "IS.W": "🧊",
  "HS.W": "🌨️",
  "FW.W": "🔥",
  "HW.W": "💨",
  "EH.W": "🌡️",
  "EC.W": "🥶",
};

const MS_TO_MPH = 2.23694;

const DBZ_COLOR_EXPRESSION = [
  "interpolate",
  ["linear"],
  ["get", "dbz"],
  0,
  "rgba(1,243,247,0.8)",
  0.5,
  "rgba(3,231,239,0.8)",
  1.0,
  "rgba(5,219,231,0.8)",
  1.5,
  "rgba(7,207,223,0.8)",
  2.0,
  "rgba(9,195,215,0.8)",
  2.5,
  "rgba(11,183,207,0.8)",
  3.0,
  "rgba(13,171,199,0.8)",
  3.5,
  "rgba(15,195,191,0.8)",
  4.0,
  "rgba(17,147,183,0.8)",
  4.5,
  "rgba(19,135,175,0.8)",
  5.0,
  "rgba(21,123,167,0.8)",
  5.5,
  "rgba(23,112,159,0.8)",
  6.0,
  "rgba(21,114,163,0.8)",
  6.5,
  "rgba(20,117,168,0.8)",
  7.0,
  "rgba(19,120,173,0.8)",
  7.5,
  "rgba(18,123,178,0.8)",
  8.0,
  "rgba(17,126,182,0.8)",
  8.5,
  "rgba(16,129,187,0.8)",
  9.0,
  "rgba(15,132,192,0.8)",
  9.5,
  "rgba(14,135,197,0.8)",
  10.0,
  "rgba(12,137,201,0.8)",
  10.5,
  "rgba(11,140,206,0.8)",
  11.0,
  "rgba(10,143,211,0.8)",
  11.5,
  "rgba(9,146,216,0.8)",
  12.0,
  "rgba(8,149,220,0.8)",
  12.5,
  "rgba(7,152,255,0.8)",
  13.0,
  "rgba(6,155,230,0.8)",
  13.5,
  "rgba(5,158,235,0.8)",
  14.0,
  "rgba(21,191,180,0.8)",
  14.5,
  "rgba(37,225,125,0.8)",
  15.0,
  "rgba(36,221,121,0.8)",
  15.5,
  "rgba(35,218,118,0.8)",
  16.0,
  "rgba(34,214,115,0.8)",
  16.5,
  "rgba(33,211,112,0.8)",
  17.0,
  "rgba(32,207,108,0.8)",
  17.5,
  "rgba(31,204,105,0.8)",
  18.0,
  "rgba(30,200,102,0.8)",
  18.5,
  "rgba(29,197,99,0.8)",
  19.0,
  "rgba(28,194,96,0.8)",
  19.5,
  "rgba(27,190,93,0.8)",
  20.0,
  "rgba(26,187,90,0.8)",
  20.5,
  "rgba(28,184,87,0.8)",
  21.0,
  "rgba(24,180,84,0.8)",
  21.5,
  "rgba(24,177,81,0.8)",
  22.0,
  "rgba(23,174,77,0.8)",
  22.5,
  "rgba(22,170,74,0.8)",
  23.0,
  "rgba(21,167,71,0.8)",
  23.5,
  "rgba(20,164,68,0.8)",
  24.0,
  "rgba(19,160,65,0.8)",
  24.5,
  "rgba(18,157,62,0.8)",
  25.0,
  "rgba(17,154,59,0.8)",
  25.5,
  "rgba(16,150,56,0.8)",
  26.0,
  "rgba(15,147,53,0.8)",
  26.5,
  "rgba(15,144,50,0.8)",
  27.0,
  "rgba(14,140,46,0.8)",
  27.5,
  "rgba(13,137,43,0.8)",
  28.0,
  "rgba(12,133,40,0.8)",
  28.5,
  "rgba(11,130,37,0.8)",
  29.0,
  "rgba(10,127,34,0.8)",
  29.5,
  "rgba(9,123,31,0.8)",
  30.0,
  "rgba(8,120,27,0.8)",
  30.5,
  "rgba(7,117,24,0.8)",
  31.0,
  "rgba(6,113,21,0.8)",
  31.5,
  "rgba(5,110,18,0.8)",
  32.0,
  "rgba(4,107,15,0.8)",
  32.5,
  "rgba(3,103,12,0.8)",
  33.0,
  "rgba(2,100,9,0.8)",
  33.5,
  "rgba(1,96,5,0.8)",
  34.0,
  "rgba(128,175,19,0.8)",
  34.5,
  "rgba(255,255,33,0.8)",
  35.0,
  "rgba(255,247,28,0.8)",
  35.5,
  "rgba(255,239,23,0.8)",
  36.0,
  "rgba(255,231,18,0.8)",
  36.5,
  "rgba(255,223,14,0.8)",
  37.0,
  "rgba(255,215,9,0.8)",
  37.5,
  "rgba(255,207,4,0.8)",
  38.0,
  "rgba(255,199,0,0.8)",
  38.5,
  "rgba(255,191,0,0.8)",
  39.0,
  "rgba(255,183,0,0.8)",
  39.5,
  "rgba(255,175,0,0.8)",
  40.0,
  "rgba(255,157,0,0.8)",
  40.5,
  "rgba(255,140,0,0.8)",
  41.0,
  "rgba(255,122,0,0.8)",
  41.5,
  "rgba(255,105,0,0.8)",
  42.0,
  "rgba(255,87,0,0.8)",
  42.5,
  "rgba(255,70,0,0.8)",
  43.0,
  "rgba(255,52,0,0.8)",
  43.5,
  "rgba(255,35,0,0.8)",
  44.0,
  "rgba(255,17,0,0.8)",
  44.5,
  "rgba(255,0,0,0.8)",
  45.0,
  "rgba(249,0,0,0.8)",
  45.5,
  "rgba(244,0,0,0.8)",
  46.0,
  "rgba(239,0,0,0.8)",
  46.5,
  "rgba(233,0,0,0.8)",
  47.0,
  "rgba(228,0,0,0.8)",
  47.5,
  "rgba(223,0,0,0.8)",
  48.0,
  "rgba(217,0,0,0.8)",
  48.5,
  "rgba(212,0,0,0.8)",
  49.0,
  "rgba(207,0,0,0.8)",
  49.5,
  "rgba(201,0,0,0.8)",
  50.0,
  "rgba(195,0,0,0.8)",
  50.5,
  "rgba(190,0,0,0.8)",
  51.0,
  "rgba(185,0,0,0.8)",
  51.5,
  "rgba(180,0,0,0.8)",
  52.0,
  "rgba(175,0,0,0.8)",
  52.5,
  "rgba(170,0,0,0.8)",
  53.0,
  "rgba(165,0,0,0.8)",
  53.5,
  "rgba(160,0,0,0.8)",
  54.0,
  "rgba(154,0,0,0.8)",
  54.5,
  "rgba(180,0,180,0.8)",
  55.0,
  "rgba(186,9,185,0.8)",
  55.5,
  "rgba(192,19,190,0.8)",
  56.0,
  "rgba(198,29,195,0.8)",
  56.5,
  "rgba(204,39,201,0.8)",
  57.0,
  "rgba(210,49,206,0.8)",
  57.5,
  "rgba(216,59,211,0.8)",
  58.0,
  "rgba(223,68,216,0.8)",
  58.5,
  "rgba(229,78,222,0.8)",
  59.0,
  "rgba(235,88,227,0.8)",
  59.5,
  "rgba(241,98,232,0.8)",
  60.0,
  "rgba(247,108,237,0.8)",
  60.5,
  "rgba(253,117,243,0.8)",
  61.0,
  "rgba(232,109,232,0.8)",
  61.5,
  "rgba(212,104,204,0.8)",
  62.0,
  "rgba(192,93,184,0.8)",
  62.5,
  "rgba(171,85,165,0.8)",
  63.0,
  "rgba(151,77,146,0.8)",
  63.5,
  "rgba(131,69,126,0.8)",
  64.0,
  "rgba(111,61,107,0.8)",
  64.5,
  "rgba(90,53,88,0.8)",
  65.0,
  "rgba(70,45,68,0.8)",
  65.5,
  "rgba(50,37,49,0.8)",
  66.0,
  "rgba(29,30,29,0.8)",
  66.5,
  "rgba(33,34,33,0.8)",
  67.0,
  "rgba(37,38,37,0.8)",
  67.5,
  "rgba(41,42,41,0.8)",
  68.0,
  "rgba(45,46,45,0.8)",
  68.5,
  "rgba(49,50,49,0.8)",
  69.0,
  "rgba(53,54,53,0.8)",
  69.5,
  "rgba(57,58,57,0.8)",
  70.0,
  "rgba(61,62,61,0.8)",
  70.5,
  "rgba(65,66,65,0.8)",
  71.0,
  "rgba(69,70,69,0.8)",
  71.5,
  "rgba(73,74,73,0.8)",
  72.0,
  "rgba(77,78,77,0.8)",
  72.5,
  "rgba(81,82,81,0.8)",
  73.0,
  "rgba(85,86,85,0.8)",
  73.5,
  "rgba(89,90,89,0.8)",
  74.0,
  "rgba(93,94,93,0.8)",
  74.5,
  "rgba(97,98,97,0.8)",
  75.0,
  "rgba(101,102,101,0.8)",
  75.5,
  "rgba(105,106,105,0.8)",
  76.0,
  "rgba(109,110,109,0.8)",
  76.5,
  "rgba(113,114,113,0.8)",
  77.0,
  "rgba(117,118,117,0.8)",
  77.5,
  "rgba(121,122,121,0.8)",
  78.0,
  "rgba(125,126,125,0.8)",
  78.5,
  "rgba(129,130,129,0.8)",
  79.0,
  "rgba(133,134,133,0.8)",
  79.5,
  "rgba(137,138,137,0.8)",
  80.0,
  "rgba(142,142,142,0.8)",
  80.5,
  "rgba(146,146,146,0.8)",
  81.0,
  "rgba(150,150,150,0.8)",
  81.5,
  "rgba(154,154,154,0.8)",
  82.0,
  "rgba(158,158,158,0.8)",
  82.5,
  "rgba(162,162,162,0.8)",
  83.0,
  "rgba(166,166,166,0.8)",
  83.5,
  "rgba(170,170,170,0.8)",
  84.0,
  "rgba(174,174,174,0.8)",
  84.5,
  "rgba(178,178,178,0.8)",
  85.0,
  "rgba(182,182,182,0.8)",
  85.5,
  "rgba(186,186,186,0.8)",
  86.0,
  "rgba(190,190,190,0.8)",
  86.5,
  "rgba(194,194,194,0.8)",
  87.0,
  "rgba(198,198,198,0.8)",
  87.5,
  "rgba(202,202,202,0.8)",
  88.0,
  "rgba(206,206,206,0.8)",
  88.5,
  "rgba(210,210,210,0.8)",
  89.0,
  "rgba(214,214,214,0.8)",
  89.5,
  "rgba(218,218,218,0.8)",
  90.0,
  "rgba(222,222,222,0.8)",
  90.5,
  "rgba(226,226,226,0.8)",
  91.0,
  "rgba(230,230,230,0.8)",
  91.5,
  "rgba(234,234,234,0.8)",
  92.0,
  "rgba(238,238,238,0.8)",
  92.5,
  "rgba(242,242,242,0.8)",
  93.0,
  "rgba(246,246,246,0.8)",
  93.5,
  "rgba(250,250,250,0.8)",
  94.0,
  "rgba(254,254,254,0.8)",
  94.5,
  "rgba(258,258,258,0.8)",
  95.0,
  "rgba(262,262,262,0.8)",
  100.0,
  "rgba(262,262,262,0.8)",
];

const REFLECTIVITY_COLOR_EXPRESSION = DBZ_COLOR_EXPRESSION;

const PRECIP_TYPE_COLOR_STOPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95];
const PRECIP_TYPE_COLOR_TABLES = {
  rain: [
    "rgba(55,170,90,0.84)",
    "rgba(30,188,120,0.85)",
    "rgba(10,198,160,0.86)",
    "rgba(20,210,210,0.87)",
    "rgba(35,196,232,0.88)",
    "rgba(65,170,245,0.89)",
    "rgba(95,140,250,0.9)",
    "rgba(125,110,255,0.9)",
    "rgba(155,90,255,0.9)",
    "rgba(190,80,245,0.9)",
    "rgba(230,85,220,0.92)",
  ],
  frzr: [
    "rgba(255,170,210,0.84)",
    "rgba(255,150,210,0.85)",
    "rgba(255,130,205,0.86)",
    "rgba(255,110,198,0.87)",
    "rgba(250,95,188,0.88)",
    "rgba(245,82,178,0.89)",
    "rgba(236,70,168,0.9)",
    "rgba(226,60,160,0.9)",
    "rgba(213,52,150,0.9)",
    "rgba(198,45,140,0.9)",
    "rgba(182,40,130,0.92)",
  ],
  sleet: [
    "rgba(255,220,150,0.84)",
    "rgba(255,205,130,0.85)",
    "rgba(255,188,112,0.86)",
    "rgba(255,172,95,0.87)",
    "rgba(255,155,80,0.88)",
    "rgba(250,138,66,0.89)",
    "rgba(242,122,54,0.9)",
    "rgba(233,108,44,0.9)",
    "rgba(220,94,35,0.9)",
    "rgba(205,80,28,0.9)",
    "rgba(188,68,22,0.92)",
  ],
  snow: [
    "rgba(210,236,255,0.84)",
    "rgba(186,225,255,0.85)",
    "rgba(160,212,255,0.86)",
    "rgba(135,198,255,0.87)",
    "rgba(110,182,255,0.88)",
    "rgba(90,164,248,0.89)",
    "rgba(70,146,240,0.9)",
    "rgba(54,126,228,0.9)",
    "rgba(42,108,210,0.9)",
    "rgba(34,90,190,0.9)",
    "rgba(28,74,170,0.92)",
  ],
};
const PRECIP_TYPE_CATEGORY_OFFSETS = {
  rain: 0,
  frzr: 100,
  sleet: 200,
  snow: 300,
};

function buildPrecipTypeReflectivityExpression() {
  const expression = ["interpolate", ["linear"], ["get", "dbz"]];
  const categories = [
    { key: "rain", name: "Rain" },
    { key: "frzr", name: "Freezing Rain" },
    { key: "sleet", name: "Sleet" },
    { key: "snow", name: "Snow" },
  ];

  for (const category of categories) {
    const offset = PRECIP_TYPE_CATEGORY_OFFSETS[category.key];
    const colors = PRECIP_TYPE_COLOR_TABLES[category.key];
    for (let i = 0; i < PRECIP_TYPE_COLOR_STOPS.length; i += 1) {
      expression.push(offset + PRECIP_TYPE_COLOR_STOPS[i]);
      expression.push(colors[i]);
    }
  }

  return expression;
}

const PRECIP_TYPE_REFLECTIVITY_COLOR_EXPRESSION =
  buildPrecipTypeReflectivityExpression();

function isRadarReflectivityProductCode(productCode) {
  return typeof productCode === "string" && /^N[0-3]B$/.test(productCode);
}

function isHRRRReflectivityProductCode(productCode) {
  return typeof productCode === "string" && productCode === "HRRR_REFC";
}

function isReflectivityProductCode(productCode) {
  return (
    isRadarReflectivityProductCode(productCode) ||
    isHRRRReflectivityProductCode(productCode)
  );
}

const VELOCITY_COLOR_EXPRESSION = [
  "interpolate",
  ["linear"],
  ["get", "dbz"],
  -70,
  "rgba(0, 100, 0, 0.9)",
  -50,
  "rgba(0, 150, 0, 0.9)",
  -40,
  "rgba(50, 200, 50, 0.9)",
  -30,
  "rgba(100, 220, 100, 0.9)",
  -20,
  "rgba(150, 240, 150, 0.9)",
  -10,
  "rgba(200, 255, 200, 0.9)",
  -5,
  "rgba(230, 255, 230, 0.9)",
  -2,
  "rgba(245, 255, 245, 0.9)",
  0,
  "rgba(200, 200, 200, 0.5)",
  2,
  "rgba(255, 245, 245, 0.9)",
  5,
  "rgba(255, 230, 230, 0.9)",
  10,
  "rgba(255, 200, 200, 0.9)",
  20,
  "rgba(255, 150, 150, 0.9)",
  30,
  "rgba(255, 100, 100, 0.9)",
  40,
  "rgba(255, 50, 50, 0.9)",
  50,
  "rgba(220, 0, 0, 0.9)",
  60,
  "rgba(180, 0, 0, 0.9)",
  70,
  "rgba(120, 0, 0, 0.9)",
  999,
  "rgba(123, 0, 200, 0.8)",
];

/**
  "rgba(97, 6, 2, 1.0)",
  140,
  "rgba(60, 0, 0, 1.0)",
  200,
  "rgba(45, 0, 0, 1.0)",
  999, // Handling Range Folding (RF) values
  "rgba(123, 0, 200, 0.8)",
];

/**
 * Parse a .pal (palette) file content
 * @param {string} palText - The text content of a .pal file
 * @returns {object} Parsed palette with product, units, and color stops
 */
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

/**
 * Convert a parsed .pal palette to a MapLibre color expression
 * @param {object} palette - Parsed palette from parsePalFile
 * @returns {array} MapLibre-compatible color expression
 */
function palToColorExpression(palette) {
  const expression = ["interpolate", ["linear"], ["get", "dbz"]];

  const scale = palette.scale || 1.0;

  for (const color of palette.colors) {
    expression.push(color.value / scale);
    expression.push(`rgba(${color.r}, ${color.g}, ${color.b}, 0.9)`);
  }

  return expression;
}

/**
 * Helper function to get color expression and metadata for a given radar product
 */
function getReflectivityColorExpressionForCurrentMode(productCode) {
  if (precipTypeModeEnabled && isReflectivityProductCode(productCode)) {
    return PRECIP_TYPE_REFLECTIVITY_COLOR_EXPRESSION;
  }
  return REFLECTIVITY_COLOR_EXPRESSION;
}

function getRadarProductInfo(product) {
  if (typeof product === "string" && product.startsWith("HRRR_")) {
    const key = product.replace("HRRR_", "").toUpperCase();
    const unitsOverride =
      currentHRRRUnitsByVariable[key.toLowerCase()] ||
      currentHRRRMeta?.units ||
      null;
    const hrrrMap = {
      TMP2M: {
        name: "HRRR 2m Temperature",
        unit: unitsOverride || "°C",
        isVelocity: false,
        colorExpression: [
          "interpolate",
          ["linear"],
          ["get", "dbz"],
          -30,
          "rgba(80,0,120,0.85)",
          -20,
          "rgba(40,0,180,0.85)",
          -10,
          "rgba(0,80,220,0.85)",
          0,
          "rgba(0,170,255,0.85)",
          10,
          "rgba(30,210,130,0.85)",
          20,
          "rgba(230,220,60,0.85)",
          30,
          "rgba(250,140,40,0.85)",
          40,
          "rgba(220,30,30,0.9)",
        ],
      },
      RH2M: {
        name: "HRRR 2m Relative Humidity",
        unit: unitsOverride || "%",
        isVelocity: false,
        colorExpression: [
          "interpolate",
          ["linear"],
          ["get", "dbz"],
          0,
          "rgba(120,40,20,0.75)",
          20,
          "rgba(180,90,30,0.78)",
          40,
          "rgba(220,170,70,0.82)",
          60,
          "rgba(130,210,120,0.84)",
          80,
          "rgba(40,170,210,0.86)",
          100,
          "rgba(20,90,190,0.9)",
        ],
      },
      REFC: {
        name: precipTypeModeEnabled
          ? `${getActiveModelLabel()} Composite Reflectivity (Precip Type)`
          : `${getActiveModelLabel()} Composite Reflectivity`,
        unit: precipTypeModeEnabled ? "ptype + dBZ" : unitsOverride || "dBZ",
        isVelocity: false,
        colorExpression: getReflectivityColorExpressionForCurrentMode(product),
      },
      UGRD10M: {
        name: "HRRR 10m U Wind",
        unit: unitsOverride || "m/s",
        isVelocity: true,
        colorExpression: VELOCITY_COLOR_EXPRESSION,
      },
      VGRD10M: {
        name: "HRRR 10m V Wind",
        unit: unitsOverride || "m/s",
        isVelocity: true,
        colorExpression: VELOCITY_COLOR_EXPRESSION,
      },
    };

    return hrrrMap[key] || hrrrMap.TMP2M;
  }

  // Explicit MRMS product mapping: treat MRMS as composite reflectivity
  if (typeof product === "string" && String(product).toLowerCase() === "mrms") {
    return {
      name: precipTypeModeEnabled
        ? `MRMS Composite Reflectivity (Precip Type)`
        : `MRMS Composite Reflectivity`,
      unit: precipTypeModeEnabled ? "ptype + dBZ" : "dBZ",
      isVelocity: false,
      colorExpression: getReflectivityColorExpressionForCurrentMode(product),
    };
  }

  if (precipTypeModeEnabled && isReflectivityProductCode(product)) {
    return {
      name: `${product} (Precip Type)`,
      colorExpression: getReflectivityColorExpressionForCurrentMode(product),
      unit: "ptype + dBZ",
      isVelocity: false,
    };
  }

  if (customPalettes[product]) {
    const palette = customPalettes[product];
    const hasNegativeValues = palette.colors.some((c) => c.value < 0);
    const isVel =
      palette.units &&
      (palette.units.toLowerCase().includes("mph") ||
        palette.units.toLowerCase().includes("m/s") ||
        palette.units.toLowerCase().includes("knot") ||
        hasNegativeValues);

    return {
      name: palette.name || `${product} (Custom)`,
      colorExpression: palToColorExpression(palette),
      unit: palette.units || "units",
      isVelocity: isVel,
      scale: palette.scale || 1.0,
    };
  }

  const tiltMatch = product.match(/^N([0-3])([A-Z])$/);
  const tilt = tiltMatch ? parseInt(tiltMatch[1]) + 1 : 1;
  const baseProduct = tiltMatch
    ? tiltMatch[2]
    : product.charAt(product.length - 1);
  const tiltLabel = tilt > 1 ? ` (Tilt ${tilt})` : "";

  const productMap = {
    B: {
      name: precipTypeModeEnabled
        ? `Base Reflectivity${tiltLabel} (Precip Type)`
        : `Base Reflectivity${tiltLabel}`,
      colorExpression: getReflectivityColorExpressionForCurrentMode(product),
      unit: precipTypeModeEnabled ? "ptype + dBZ" : "dBZ",
      isVelocity: false,
    },
    G: {
      name: `Base Velocity${tiltLabel}`,
      colorExpression: VELOCITY_COLOR_EXPRESSION,
      unit: "mph",
      isVelocity: true,
    },
    V: {
      name: `Radial Velocity${tiltLabel}`,
      colorExpression: VELOCITY_COLOR_EXPRESSION,
      unit: "mph",
      isVelocity: true,
    },
    S: {
      name: `Storm Relative Velocity${tiltLabel}`,
      colorExpression: VELOCITY_COLOR_EXPRESSION,
      unit: "mph",
      isVelocity: true,
      requiresCalculation: true,
    },
    C: {
      name: `Correlation Coefficient${tiltLabel}`,
      colorExpression: [
        "interpolate",
        ["linear"],
        ["get", "dbz"],
        0,
        "#000000",
        0.01,
        "#4B0082",
        0.3,
        "#0000FF",
        0.5,
        "#00FF00",
        0.7,
        "#FFFF00",
        0.85,
        "#FF7F00",
        0.95,
        "#FF0000",
        1.0,
        "#FFFFFF",
      ],
      unit: "CC",
      isVelocity: false,
    },
    X: {
      name: `Differential Reflectivity${tiltLabel}`,
      colorExpression: [
        "interpolate",
        ["linear"],
        ["get", "dbz"],
        -4,
        "#0000FF",
        -2,
        "#00FFFF",
        0,
        "#00FF00",
        2,
        "#FFFF00",
        4,
        "#FF0000",
        6,
        "#FF00FF",
      ],
      unit: "dB",
      isVelocity: false,
    },
    H: {
      name: `Hydrometeor Classification${tiltLabel}`,
      colorExpression: [
        "match",
        ["get", "dbz"],
        0,
        "#9C9C9C",
        10,
        "#00ECEC",
        20,
        "#019FF4",
        30,
        "#FFFF00",
        40,
        "#FE00FE",
        50,
        "#9E0000",
        60,
        "#00FF00",
        70,
        "#00BB00",
        80,
        "#FE0000",
        90,
        "#9600B4",
        100,
        "#FFFFFF",
        140,
        "#649696",
        150,
        "#000000",
        "#CCCCCC",
      ],
      unit: "Class",
      isVelocity: false,
    },
    W: {
      name: `Spectrum Width${tiltLabel}`,
      colorExpression: [
        "interpolate",
        ["linear"],
        ["get", "dbz"],
        0,
        "#000000",
        2,
        "#0000FF",
        4,
        "#00FF00",
        6,
        "#FFFF00",
        8,
        "#FF7F00",
        10,
        "#FF0000",
      ],
      unit: "mph",
      isVelocity: false,
    },
    P: {
      name: `Differential Phase${tiltLabel}`,
      colorExpression: [
        "interpolate",
        ["linear"],
        ["get", "dbz"],
        0,
        "#000000",
        45,
        "#0000FF",
        90,
        "#00FF00",
        135,
        "#FFFF00",
        180,
        "#FF0000",
      ],
      unit: "degrees",
      isVelocity: false,
    },
  };

  return productMap[baseProduct] || productMap.B;
}

const radarLayerId = "radar-webgl-layer";
const sweepSourceId = "radar-sweep";
const sweepLayerId = "radar-sweep-layer";
let selectedRadarSite = null;
let selectedRadarProduct = "N0B";
let selectedRadarDataSource = "level3";
let dataMode = "radar";
let selectedModel = "hrrr";
let selectedHRRRVariable = "tmp2m";
let selectedHRRRForecastHour = 0;
let selectedHRRRRunDate = null;
let selectedHRRRRunHour = null;
let precipTypeModeEnabled = false;
const HRRR_RUNS_LOOKBACK_HOURS = "48";
const HRRR_RUNS_MAX = "12";
const HRRR_RUNS_CACHE_TTL_MS = 30_000;
const HRRR_PTYPE_CACHE_TTL_MS = 45_000;
const PTYPE_LOOKUP_COORD_SCALE = 8;
const PTYPE_LOOKUP_COARSE_SCALE = 4;
const MODEL_LABELS = {
  hrrr: "HRRR",
  "rrfs-a": "RRFS-a",
  nam3k: "NAM 3km Nest",
};
let hrrrRunsCacheKey = null;
let hrrrRunsCachePayload = null;
let hrrrRunsCacheTime = 0;
const hrrrPTypeLookupCache = new Map();
let currentRenderProductCode = "N0B";
let currentHRRRMeta = null;
let currentHRRRUnitsByVariable = {};
let radarSmoothingPreference = false;
let modelLoopMode = "all";
let modelLoopStartHour = 0;
let modelLoopEndHour = 48;
let modelLoopLoading = false;
const modelFrameCache = new Map();
let mapInstance = null;
let customRadarLayerInstance = null;
let radarSitesCache = [];

let stormMotionU = 0;
let stormMotionV = 0;
let useStormMotion = false;

let currentSweepAngle = 0;
let animationFrameId = null;
const SWEEP_SPEED_DPS = 0.15;
const SWEEP_LINE_WIDTH = 3;
const SWEEP_RADIUS_KM = 500;
const SWEEP_TRAIL_LENGTH = 35;
const SWEEP_TRAIL_SEGMENTS = 150;
const SWEEP_COLOR = "#ffffff";

// Sweep mode settings
let sweepMode = "full"; // "full", "simple", or "disabled"
let sweepPulsePhase = 0;
let currentLevel2SweepData = null; // For real sweep mode with L2 data

// TODO: Level 2 Real-Time Sweep Feature
// To implement a true Level 2 chunk-based real sweep:
// 1. Backend: Return azimuth angles array with radar data
// 2. Frontend: Store azimuth metadata when loading Level 2 data
// 3. Animation: Sync sweep angle with actual beam positions from azimuths array
// 4. Optional: Implement streaming to update sweep as new chunks arrive
// Current implementation displays full 360° coverage from processed Level 2 data

// High dBZ flashing animation
let flashCycleTime = 600;
let isFlashOn = true;
const FLASH_INTERVAL = 500; // milliseconds
const HIGH_DBZ_FLASH_PERIOD_MS = 1400; // slower pulse period for high dBZ flash
const HIGH_DBZ_FLASH_THRESHOLD = 50; // dBZ threshold for flash effect
let currentRadarData = null; // Store current radar data for flash processing

// Persistent settings key
const USER_SETTINGS_KEY = "radar_ui_settings_v1";

function loadUserSettings() {
  try {
    const raw = localStorage.getItem(USER_SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (typeof s.enableAlertFlashing === "boolean")
      enableAlertFlashing = s.enableAlertFlashing;
    if (typeof s.flashMode === "string") flashMode = s.flashMode;
    if (typeof s.flashSpeed === "number") flashSpeed = s.flashSpeed;
    if (typeof s.highDbzThreshold === "number") {
      // allow threshold to be saved
      window.HIGH_DBZ_FLASH_THRESHOLD = s.highDbzThreshold;
    }
    if (typeof s.sweepMode === "string") sweepMode = s.sweepMode;
    if (typeof s.sweepSpeed === "number") SWEEP_SPEED_DPS = s.sweepSpeed;
  } catch (e) {
    console.warn("Failed to load user settings:", e);
  }
}

function saveUserSettings() {
  try {
    const payload = {
      enableAlertFlashing: !!enableAlertFlashing,
      flashMode: String(flashMode || "smooth"),
      flashSpeed: Number(flashSpeed) || 800,
      highDbzThreshold: Number(HIGH_DBZ_FLASH_THRESHOLD) || 50,
      sweepMode: String(sweepMode || "full"),
      sweepSpeed: Number(SWEEP_SPEED_DPS) || 0.15,
    };
    localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn("Failed to save user settings:", e);
  }
}

// TVS Detection
let tvsDetectionEnabled = false;
let detectedTVSMarkers = [];
const TVS_THRESHOLD_VELOCITY = 30; // kt/s threshold for rotation

// Storm Track Feature
let stormTrackEnabled = false;
let stormTrackPoint = null;
let stormTrackLine = [];
let stormTrackSpeed = 35; // mph
let stormTrackMarkers = [];
let stormTrackMode = "manual"; // "manual" or "calculated"
let stormTrackFirstMarker = null;
let stormTrackSecondMarker = null;
let stormTrackTimeElapsed = 0; // minutes between markers

// Traffic Cameras Feature
let camerasEnabled = false;
let camerasData = null;
let cameraPopup = null;

let activeAlerts = new Map();
let alertDetailsElement = null;
let currentAlertInfoBox = null;
let alertInfoBoxPosition = null;

let inspectorEnabled = false;
let inspectorMouseHandler = null;

let probeToolEnabled = false;
let probeMarkers = [];
let probeIdCounter = 0;
let draggedProbe = null;

let drawToolEnabled = false;
let drawMode = "pen"; // 'polygon' | 'line' | 'pen'
let drawColor = "#ff5e00";
let drawLineWidth = 4;
let drawFillOpacity = 0.2;
let drawOutlineEnabled = true;
let drawOutlineColor = "#000000";
let drawOutlineWidth = 2;
let drawPoints = [];
let drawCursorPoint = null;
let drawnFeatures = [];
let drawHandlersInstalled = false;
let drawWasDoubleClickZoomEnabled = null;

let isPenDrawing = false;
let drawWasDragPanEnabled = null;
// Rough threshold in degrees^2 to avoid adding too many points while dragging.
// (~0.00003° is a few meters, varies with latitude)
const PEN_MIN_POINT_DIST_SQ_DEG = 0.00003 * 0.00003;

const DRAW_SOURCE_ID = "user-draw";
const DRAW_POINTS_SOURCE_ID = "user-draw-vertices";
const DRAW_PREVIEW_SOURCE_ID = "user-draw-preview";
const DRAW_LAYER_FILL_ID = "user-draw-fill";
const DRAW_LAYER_LINE_OUTLINE_ID = "user-draw-line-outline";
const DRAW_LAYER_LINE_ID = "user-draw-line";
const DRAW_LAYER_POINTS_ID = "user-draw-points";
const DRAW_LAYER_PREVIEW_ID = "user-draw-preview-line";
const DRAW_LAYER_PREVIEW_SOLID_ID = "user-draw-preview-line-solid";
const DRAW_LAYER_PREVIEW_OUTLINE_ID = "user-draw-preview-line-outline";
const DRAW_LAYER_PREVIEW_SOLID_OUTLINE_ID =
  "user-draw-preview-line-solid-outline";

function setDrawCursor() {
  if (!mapInstance) return;
  const canvas = mapInstance.getCanvas();

  if (!drawToolEnabled) {
    canvas.style.cursor = "";
    return;
  }

  if (drawMode === "pen") {
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>" +
      "<path d='M6 26l2-8L20.5 5.5c.7-.7 1.9-.7 2.6 0l2.4 2.4c.7.7.7 1.9 0 2.6L13 23l-7 3z' fill='%23ffffff' fill-opacity='0.95'/>" +
      "<path d='M6 26l7-3' stroke='%23000000' stroke-width='2' stroke-linecap='round'/>" +
      "</svg>";
    canvas.style.cursor = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      svg,
    )}") 6 26, crosshair`;
    return;
  }

  canvas.style.cursor = "crosshair";
}

let customPalettes = {};
let isArchiveMode = false;
let archiveTimestamp = null;
let archiveProductCache = {};
let fetchArchivedWarnings = true; // Toggle for fetching historical warnings

let enableSmoothing = false;

const COORD_KEY_PRECISION = 1e5;

function makeCoordKey(lng, lat) {
  return `${Math.round(lng * COORD_KEY_PRECISION)}|${Math.round(
    lat * COORD_KEY_PRECISION,
  )}`;
}

function computeBilinearCornerValues(vertices, values) {
  if (
    !vertices ||
    !values ||
    vertices.length / 2 !== values.length ||
    values.length < 6
  ) {
    return null;
  }

  const stats = new Map();
  const uniqueCornerOffsets = [0, 1, 2, 5];

  for (let base = 0; base <= values.length - 6; base += 6) {
    const gateValue = values[base];
    const corners = uniqueCornerOffsets.map((offset) => {
      const vertexIndex = base + offset;
      const lng = vertices[vertexIndex * 2];
      const lat = vertices[vertexIndex * 2 + 1];
      return { lng, lat, key: makeCoordKey(lng, lat) };
    });

    const centerLng =
      corners.reduce((sum, c) => sum + c.lng, 0) / corners.length;
    const centerLat =
      corners.reduce((sum, c) => sum + c.lat, 0) / corners.length;

    corners.forEach(({ lng, lat, key }) => {
      const dx = lng - centerLng;
      const dy = lat - centerLat;
      const dist = Math.max(Math.hypot(dx, dy), 1e-6);
      const weight = 1 / dist;
      const entry = stats.get(key) || { sum: 0, weight: 0 };
      entry.sum += gateValue * weight;
      entry.weight += weight;
      stats.set(key, entry);
    });
  }

  const smoothed = new Float32Array(values.length);
  for (
    let valueIndex = 0, vertexOffset = 0;
    valueIndex < values.length;
    valueIndex++
  ) {
    const lng = vertices[vertexOffset];
    const lat = vertices[vertexOffset + 1];
    const key = makeCoordKey(lng, lat);
    const entry = stats.get(key);
    smoothed[valueIndex] =
      entry && entry.weight > 0 ? entry.sum / entry.weight : values[valueIndex];
    vertexOffset += 2;
  }

  return smoothed;
}

/**
 * Calculate Storm Relative Velocity from base velocity data
 * SRV = Vr - (U*sin(θ) + V*cos(θ))
 * where U and V are storm motion components, θ is azimuth
 * @param {Float32Array} vertices - Radar gate vertices (lng, lat pairs)
 * @param {Float32Array} velocities - Base velocity values in mph
 * @param {number} radarLon - Radar site longitude
 * @param {number} radarLat - Radar site latitude
 * @param {number} stormU - Storm motion U component (eastward) in mph
 * @param {number} stormV - Storm motion V component (northward) in mph
 * @returns {Float32Array} - Storm relative velocity values
 */
function calculateStormRelativeVelocity(
  vertices,
  velocities,
  radarLon,
  radarLat,
  stormU,
  stormV,
) {
  const srv = new Float32Array(velocities.length);

  for (let i = 0; i < velocities.length; i += 6) {
    const gateLon =
      (vertices[i * 2] + vertices[(i + 1) * 2] + vertices[(i + 2) * 2]) / 3;
    const gateLat =
      (vertices[i * 2 + 1] +
        vertices[(i + 1) * 2 + 1] +
        vertices[(i + 2) * 2 + 1]) /
      3;

    const dLon = (gateLon - radarLon) * Math.cos((radarLat * Math.PI) / 180);
    const dLat = gateLat - radarLat;
    const azimuthRad = Math.atan2(dLon, dLat);

    const stormMotionRadial =
      stormU * Math.sin(azimuthRad) + stormV * Math.cos(azimuthRad);

    for (let j = 0; j < 6; j++) {
      const velIdx = i + j;
      srv[velIdx] = velocities[velIdx] - stormMotionRadial;
    }
  }

  return srv;
}

function loadPalettesFromStorage() {
  try {
    const stored = localStorage.getItem("radarCustomPalettes");
    if (stored) {
      customPalettes = JSON.parse(stored);
      console.log("Loaded palettes from storage:", Object.keys(customPalettes));
    }
  } catch (error) {
    console.error("Error loading palettes from storage:", error);
  }
}

function savePalettesToStorage() {
  try {
    localStorage.setItem("radarCustomPalettes", JSON.stringify(customPalettes));
    console.log("Saved palettes to storage");
  } catch (error) {
    console.error("Error saving palettes to storage:", error);
  }
}

async function loadCountiesData() {
  try {
    const response = await fetch("counties.geojson");
    if (!response.ok) {
      throw new Error(
        `Failed to load counties.geojson: ${response.statusText}`,
      );
    }
    countiesData = await response.json();
    countiesByGeoid = new Map();
    if (countiesData && countiesData.features) {
      countiesData.features.forEach((feature) => {
        const geoid = feature?.properties?.GEOID;
        if (geoid) countiesByGeoid.set(geoid, feature);
      });
    }
    console.log(`✅ Loaded ${countiesData.features.length} counties`);
  } catch (error) {
    console.error("❌ Error loading counties data:", error);
  }
}

function initAlertFeed() {
  const eventSource = new EventSource(
    "https://xmpp-api-production.up.railway.app/live-alerts",
  );

  eventSource.addEventListener("INIT", (event) => {
    const alert = JSON.parse(event.data);
    addAlertToMap(alert);
  });

  eventSource.addEventListener("NEW", (event) => {
    const alert = JSON.parse(event.data).feature;
    addAlertToMap(alert);
  });

  eventSource.addEventListener("UPDATE", (event) => {
    const alert = JSON.parse(event.data).feature;
    updateAlertOnMap(alert);
  });

  eventSource.addEventListener("ALERT_CANCELED", (event) => {
    const { id } = JSON.parse(event.data);
    removeAlertFromMap(id);
  });

  eventSource.addEventListener("SPECIAL_WEATHER_STATEMENT", (event) => {
    const alert = JSON.parse(event.data).feature;
    addAlertToMap(alert);
  });

  eventSource.onerror = (error) => {
    console.error("SSE connection error:", error);
    setTimeout(() => {
      eventSource.close();
      initAlertFeed();
      updateArcSyncToggleState();
    }, 5000);
  };
}

function showAlertsDropdown(position) {
  const existingDropdown = document.getElementById("alerts-dropdown");
  if (existingDropdown) {
    existingDropdown.remove();
  }

  const alertsInView = Array.from(activeAlerts.values());

  if (alertsInView.length === 0) return;

  const dropdown = document.createElement("div");
  dropdown.id = "alerts-dropdown";
  dropdown.className = "alerts-dropdown-panel";
  dropdown.style.top = `${position ? position.y : 60}px`;
  dropdown.style.right = "10px";

  const header = document.createElement("div");
  header.className = "alerts-dropdown-header";
  header.innerHTML = `<span>Active Alerts (${alertsInView.length})</span>
    <div class="alerts-dropdown-header-actions">
      <button class="alert-style-open-btn" type="button" title="Alert style settings">Style</button>
      <button class="close-dropdown" type="button" title="Close">x</button>
    </div>`;
  dropdown.appendChild(header);

  alertsInView.forEach((alert) => {
    const alertItem = document.createElement("div");
    alertItem.className = "dropdown-alert-item";
    alertItem.style.borderLeft = `4px solid ${getAlertColor(alert)}`;

    const icon = getAlertIcon(alert.eventCode);
    const eventName = getAlertEventName(alert);
    const enabledBadge = isAlertEnabled(eventName)
      ? ""
      : '<span class="alert-muted-pill">Muted</span>';

    alertItem.innerHTML = `
      <div class="dropdown-alert-item-row">
        <div class="dropdown-alert-item-icon">${icon}</div>
        <div>
          <div class="dropdown-alert-item-title">${eventName} ${enabledBadge}</div>
          <div class="dropdown-alert-item-subtitle">
            ${alert.counties ? alert.counties.join(", ") : "Unknown location"}
          </div>
        </div>
      </div>
    `;

    alertItem.addEventListener("click", () => {
      dropdown.remove();
      showAlertDetails(alert);
    });

    dropdown.appendChild(alertItem);
  });

  dropdown.querySelector(".close-dropdown").addEventListener("click", () => {
    dropdown.remove();
  });

  dropdown
    .querySelector(".alert-style-open-btn")
    .addEventListener("click", (event) => {
      event.stopPropagation();
      showAlertStyleMenu(event.currentTarget);
    });

  document.addEventListener(
    "click",
    (e) => {
      if (
        dropdown &&
        !dropdown.contains(e.target) &&
        !e.target.closest(".alerts-toggle-btn")
      ) {
        dropdown.remove();
      }
    },
    { once: true },
  );

  document.body.appendChild(dropdown);
  return dropdown;
}

function getAlertTypesForMenu() {
  const names = new Set(Object.keys(DEFAULT_ALERT_NAME_COLORS));
  activeAlerts.forEach((alert) => {
    names.add(getAlertEventName(alert));
  });
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function applyAlertStyleToMap(alert) {
  if (!alert || !mapInstance) return;

  const id = `alert-${alert.id}`;
  const color = getAlertColor(alert);
  const visible = isAlertEnabled(alert);
  const nextVisibility = visible ? "visible" : "none";

  if (mapInstance.getLayer(`${id}-fill`)) {
    mapInstance.setPaintProperty(`${id}-fill`, "fill-color", color);
    mapInstance.setLayoutProperty(`${id}-fill`, "visibility", nextVisibility);
  }
  if (mapInstance.getLayer(`${id}-outline-inner`)) {
    mapInstance.setPaintProperty(
      `${id}-outline-inner`,
      "line-color",
      ALERT_OUTLINE_CONFIG.innerColor(color),
    );
    mapInstance.setLayoutProperty(
      `${id}-outline-inner`,
      "visibility",
      nextVisibility,
    );
  }
  if (mapInstance.getLayer(`${id}-outline-outer`)) {
    mapInstance.setLayoutProperty(
      `${id}-outline-outer`,
      "visibility",
      nextVisibility,
    );
  }

  if (alert.marker && alert.marker.getElement) {
    const markerEl = alert.marker.getElement();
    if (markerEl) {
      markerEl.style.display = visible ? "" : "none";
      markerEl.style.backgroundColor = color;
    }
  }

  if (!visible && selectedAlert && selectedAlert.id === alert.id) {
    stopAlertFlashing(selectedAlert);
    selectedAlert = null;
  }
}

function applyAlertStylesToAllActiveAlerts() {
  activeAlerts.forEach((alert) => applyAlertStyleToMap(alert));
  scheduleAlertsButtonUpdate();
}

function showAlertStyleMenu(anchorButton) {
  const existing = document.getElementById("alert-style-menu");
  if (existing) existing.remove();

  const menu = document.createElement("div");
  menu.id = "alert-style-menu";
  menu.className = "alert-style-menu";

  const alertTypes = getAlertTypesForMenu();
  menu.innerHTML = `
    <div class="alert-style-menu__header">
      <strong>Alert Styles</strong>
      <button type="button" class="alert-style-menu__close">x</button>
    </div>
    <div class="alert-style-menu__list"></div>
  `;

  const list = menu.querySelector(".alert-style-menu__list");
  const groupedEntries = new Map();
  ALERT_STYLE_GROUP_DEFINITIONS.forEach((definition) => {
    groupedEntries.set(definition.id, {
      ...definition,
      events: [],
    });
  });
  groupedEntries.set(DEFAULT_ALERT_STYLE_GROUP.id, {
    ...DEFAULT_ALERT_STYLE_GROUP,
    events: [],
  });

  alertTypes.forEach((eventName) => {
    const group = getAlertStyleGroupDefinition(eventName);
    const entry =
      groupedEntries.get(group.id) ??
      groupedEntries.get(DEFAULT_ALERT_STYLE_GROUP.id);
    entry.events.push(eventName);
  });

  const orderedGroups = [];
  ALERT_STYLE_GROUP_DEFINITIONS.forEach((definition) => {
    const entry = groupedEntries.get(definition.id);
    if (entry && entry.events.length) {
      orderedGroups.push(entry);
    }
  });
  const fallbackEntry = groupedEntries.get(DEFAULT_ALERT_STYLE_GROUP.id);
  if (fallbackEntry && fallbackEntry.events.length) {
    orderedGroups.push(fallbackEntry);
  }

  const fragment = document.createDocumentFragment();
  orderedGroups.forEach((group) => {
    const groupSection = document.createElement("section");
    groupSection.className = "alert-style-group";
    groupSection.dataset.groupId = group.id;
    groupSection.style.setProperty(
      "--group-accent",
      group.accent || DEFAULT_ALERT_STYLE_GROUP.accent,
    );

    const header = document.createElement("div");
    header.className = "alert-style-group__header";

    const titleRow = document.createElement("div");
    titleRow.className = "alert-style-group__title";
    const titleLabel = document.createElement("span");
    titleLabel.textContent = group.label;
    const titleCount = document.createElement("span");
    titleCount.className = "alert-style-group__count";
    titleCount.textContent = `${group.events.length} type${
      group.events.length === 1 ? "" : "s"
    }`;
    titleRow.appendChild(titleLabel);
    titleRow.appendChild(titleCount);

    const controls = document.createElement("div");
    controls.className = "alert-style-group__controls";
    const enableAll = document.createElement("button");
    enableAll.type = "button";
    enableAll.className = "alert-style-group__control";
    enableAll.dataset.groupId = group.id;
    enableAll.dataset.action = "enable";
    enableAll.textContent = "Enable all";
    const muteAll = document.createElement("button");
    muteAll.type = "button";
    muteAll.className = "alert-style-group__control";
    muteAll.dataset.groupId = group.id;
    muteAll.dataset.action = "disable";
    muteAll.textContent = "Mute all";
    controls.appendChild(enableAll);
    controls.appendChild(muteAll);

    header.appendChild(titleRow);
    header.appendChild(controls);

    const rowsContainer = document.createElement("div");
    rowsContainer.className = "alert-style-group__rows";
    group.events.forEach((eventName) => {
      const style = getAlertStyle(eventName);
      const row = document.createElement("div");
      row.className = "alert-style-row";
      row.dataset.group = group.id;

      const nameLabel = document.createElement("label");
      nameLabel.className = "alert-style-row__name";
      nameLabel.title = eventName;
      nameLabel.textContent = eventName;

      const enabledInput = document.createElement("input");
      enabledInput.className = "alert-style-row__enabled";
      enabledInput.type = "checkbox";
      enabledInput.checked = !!style.enabled;
      enabledInput.dataset.eventName = eventName;

      const colorInput = document.createElement("input");
      colorInput.className = "alert-style-row__color";
      colorInput.type = "color";
      colorInput.value = style.color || "#ffffff";
      colorInput.dataset.eventName = eventName;

      row.appendChild(nameLabel);
      row.appendChild(enabledInput);
      row.appendChild(colorInput);
      rowsContainer.appendChild(row);
    });

    groupSection.appendChild(header);
    groupSection.appendChild(rowsContainer);
    fragment.appendChild(groupSection);
  });

  list.appendChild(fragment);
  document.body.appendChild(menu);

  const anchorRect = anchorButton.getBoundingClientRect();
  menu.style.top = `${Math.round(anchorRect.bottom + 8)}px`;
  menu.style.right = `${Math.max(10, Math.round(window.innerWidth - anchorRect.right))}px`;

  menu.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const eventName = target.dataset.eventName;
    if (!eventName) return;

    const style = getAlertStyle(eventName);
    if (target.classList.contains("alert-style-row__enabled")) {
      style.enabled = target.checked;
    }
    if (target.classList.contains("alert-style-row__color")) {
      style.color = target.value;
    }

    saveAlertStyleConfig();
    applyAlertStylesToAllActiveAlerts();
  });

  menu.addEventListener("click", (event) => {
    const control =
      event.target instanceof HTMLElement
        ? event.target.closest(".alert-style-group__control")
        : null;
    if (!control) return;
    event.stopPropagation();

    const { action, groupId } = control.dataset;
    if (!action || !groupId) return;

    const shouldEnable = action === "enable";
    const checkboxes = menu.querySelectorAll(
      `.alert-style-row[data-group="${groupId}"] .alert-style-row__enabled`,
    );
    if (!checkboxes.length) return;

    checkboxes.forEach((checkbox) => {
      checkbox.checked = shouldEnable;
      const eventName = checkbox.dataset.eventName;
      if (!eventName) return;
      const style = getAlertStyle(eventName);
      style.enabled = shouldEnable;
    });

    saveAlertStyleConfig();
    applyAlertStylesToAllActiveAlerts();
  });

  menu
    .querySelector(".alert-style-menu__close")
    .addEventListener("click", () => menu.remove());

  document.addEventListener(
    "click",
    (e) => {
      if (
        menu &&
        !menu.contains(e.target) &&
        !e.target.closest(".alert-style-btn") &&
        !e.target.closest(".alert-style-open-btn")
      ) {
        menu.remove();
      }
    },
    { once: true },
  );
}

function createAlertsToggleButton() {
  const existingToolbar = document.querySelector(".alerts-toolbar");
  if (existingToolbar) existingToolbar.remove();

  const toolbar = document.createElement("div");
  toolbar.className = "alerts-toolbar";

  const button = document.createElement("button");
  button.className = "alerts-toggle-btn";
  button.type = "button";
  button.innerHTML = `<span class="alert-main-icon">!</span>
    <span>Alerts</span>
    <span class="alert-count">${activeAlerts.size}</span>`;

  const styleButton = document.createElement("button");
  styleButton.className = "alert-style-btn";
  styleButton.type = "button";
  styleButton.title = "Alert style settings";
  styleButton.textContent = "Style";

  button.addEventListener("click", (e) => {
    e.stopPropagation();
    showAlertsDropdown({ x: e.clientX, y: e.clientY + 30 });
  });

  styleButton.addEventListener("click", (e) => {
    e.stopPropagation();
    showAlertStyleMenu(styleButton);
  });

  toolbar.appendChild(button);
  toolbar.appendChild(styleButton);
  document.body.appendChild(toolbar);
  return button;
}

function scheduleAlertsButtonUpdate() {
  if (alertsButtonUpdateRaf) return;
  alertsButtonUpdateRaf = requestAnimationFrame(() => {
    alertsButtonUpdateRaf = null;
    updateAlertsButton();
  });
}

function updateAlertsButton() {
  const button = document.querySelector(".alerts-toggle-btn");
  if (!button) {
    createAlertsToggleButton();
    return;
  }

  const countElement = button.querySelector(".alert-count");
  if (countElement) {
    countElement.textContent = activeAlerts.size;
  }
}

const style = document.createElement("style");
style.textContent = `
  .alerts-toolbar {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 8px;
    z-index: 1000;
  }

  .alerts-toggle-btn,
  .alert-style-btn {
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(15, 23, 42, 0.9);
    color: #ffffff;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.25);
  }

  .alerts-toggle-btn:hover,
  .alert-style-btn:hover {
    background: rgba(30, 41, 59, 0.95);
  }

  .alert-main-icon {
    font-weight: 700;
    color: #60a5fa;
  }

  .alert-count {
    margin-left: 2px;
    background-color: #dc2626;
    color: #fff;
    border-radius: 999px;
    min-width: 20px;
    height: 20px;
    display: inline-flex;
    justify-content: center;
    align-items: center;
    font-size: 0.8em;
    padding: 0 6px;
  }

  .alerts-dropdown-panel {
    position: absolute;
    background: #ffffff;
    border-radius: 8px;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
    z-index: 1001;
    width: 320px;
    max-height: 430px;
    overflow: auto;
    padding: 10px;
  }

  .alerts-dropdown-header {
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 10px;
    margin-bottom: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .alerts-dropdown-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .alerts-dropdown-header-actions button {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    background: #f8fafc;
    color: #0f172a;
    font-size: 12px;
    padding: 4px 8px;
    cursor: pointer;
  }

  .dropdown-alert-item {
    padding: 8px;
    margin: 5px 0;
    border-radius: 5px;
    cursor: pointer;
    background-color: #f8f8f8;
    transition: background-color 0.15s ease;
  }

  .dropdown-alert-item-row {
    display: flex;
    align-items: center;
  }

  .dropdown-alert-item-icon {
    margin-right: 10px;
  }

  .dropdown-alert-item-title {
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .dropdown-alert-item-subtitle {
    font-size: 0.8em;
    color: #4b5563;
  }

  .alert-muted-pill {
    background: #e5e7eb;
    color: #374151;
    border-radius: 999px;
    font-size: 10px;
    padding: 2px 8px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .alert-style-menu {
    position: absolute;
    z-index: 1010;
    width: min(520px, calc(100vw - 20px));
    max-height: 70vh;
    background: #020617;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 16px;
    padding: 12px 14px;
    box-shadow: 0 25px 60px rgba(2, 6, 23, 0.35);
    color: #e2e8f0;
  }

  .alert-style-menu__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    font-size: 0.95rem;
    letter-spacing: 0.02em;
  }

  .alert-style-menu__close {
    border: 1px solid rgba(148, 163, 184, 0.5);
    background: rgba(15, 23, 42, 0.7);
    color: #e2e8f0;
    border-radius: 10px;
    cursor: pointer;
    width: 30px;
    height: 30px;
    font-weight: 600;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .alert-style-menu__close:hover {
    border-color: rgba(248, 250, 252, 0.8);
    background: rgba(51, 65, 85, 0.9);
  }

  .alert-style-menu__list {
    max-height: calc(70vh - 64px);
    overflow: auto;
    padding-right: 4px;
  }

  .alert-style-group {
    border-left: 3px solid var(--group-accent, #94a3b8);
    padding: 12px 14px 14px;
    margin-bottom: 12px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.02);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .alert-style-group__header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }

  .alert-style-group__title {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .alert-style-group__count {
    font-size: 0.65rem;
    color: #94a3b8;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .alert-style-group__controls {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .alert-style-group__control {
    border: 1px solid rgba(226, 232, 240, 0.4);
    background: rgba(226, 232, 240, 0.08);
    color: #e2e8f0;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .alert-style-group__control:hover {
    border-color: rgba(59, 130, 246, 0.7);
    background: rgba(59, 130, 246, 0.18);
  }

  .alert-style-group__rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }

  .alert-style-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.25);
  }

  .alert-style-row:last-child {
    border-bottom: none;
  }

  .alert-style-row__name {
    font-size: 0.85rem;
    color: #e2e8f0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .alert-style-row__name:hover {
    color: #f8fafc;
  }

  .alert-style-row__enabled {
    width: 20px;
    height: 20px;
    accent-color: #34d399;
    cursor: pointer;
  }

  .alert-style-row__color {
    width: 38px;
    height: 28px;
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.6);
    background: transparent;
    padding: 0;
    cursor: pointer;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  .alert-style-row__color::-webkit-color-swatch-wrapper {
    padding: 0;
  }

  .alert-style-row__color::-webkit-color-swatch {
    border-radius: 6px;
  }

  .dropdown-alert-item:hover {
    background-color: #f0f0f0 !important;
  }
`;
document.head.appendChild(style);

function normalizeAlertValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? String(value[0]) : "";
  }
  if (value == null) return "";
  return String(value);
}

function applyRealAlertPresetRules(alert) {
  if (!alert || typeof alert !== "object") return alert;

  const parameters = alert;
  parameters.threats =
    parameters.threats && typeof parameters.threats === "object"
      ? parameters.threats
      : {};

  let eventName =
    normalizeAlertValue(parameters.eventName) ||
    normalizeAlertValue(parameters.event) ||
    normalizeAlertValue(parameters.headline);

  if (!eventName) return parameters;

  if (eventName.includes("Tornado Warning")) {
    if (eventName === "Radar Confirmed Tornado Warning") {
      parameters.source = "RADAR CONFIRMED TORNADO";
      eventName = "Tornado Warning";
    } else if (eventName === "Spotter Confirmed Tornado Warning") {
      parameters.threats.tornadoDetection = "OBSERVED";
      parameters.source = "WEATHER SPOTTERS CONFIRMED TORNADO";
      eventName = "Tornado Warning";
    } else if (eventName === "Emergency Mgmt Confirmed Tornado Warning") {
      parameters.threats.tornadoDetection = "OBSERVED";
      parameters.source = "EMERGENCY MANAGEMENT CONFIRMED TORNADO";
      eventName = "Tornado Warning";
    } else if (eventName === "Law Enforcement Confirmed Tornado Warning") {
      parameters.threats.tornadoDetection = "OBSERVED";
      parameters.source = "LAW ENFORCEMENT CONFIRMED TORNADO";
      eventName = "Tornado Warning";
    } else if (eventName === "Public Confirmed Tornado Warning") {
      parameters.threats.tornadoDetection = "OBSERVED";
      parameters.source = "PUBLIC CONFIRMED TORNADO";
      eventName = "Tornado Warning";
    } else if (eventName === "Observed Tornado Warning") {
      parameters.threats.tornadoDetection = "OBSERVED";
      parameters.source = "CONFIRMED TORNADO";
      eventName = "Tornado Warning";
    } else if (eventName === "PDS Tornado Warning") {
      parameters.threats.tornadoDamageThreat = "CONSIDERABLE";
      parameters.source = "RADAR INDICATED ROTATION";
      eventName = "Tornado Warning";
    } else if (eventName === "Tornado Emergency") {
      parameters.threats.tornadoDamageThreat = "CATASTROPHIC";
      parameters.source = "RADAR INDICATED ROTATION";
      eventName = "Tornado Warning";
    } else if (eventName === "Tornado Warning") {
      if (!parameters.source) {
        parameters.source = "RADAR INDICATED ROTATION";
      }
    }
  } else if (eventName.includes("Severe Thunderstorm Warning")) {
    if (eventName === "Destructive Severe Thunderstorm Warning") {
      parameters.threats.thunderstormDamageThreat = "DESTRUCTIVE";
      eventName = "Severe Thunderstorm Warning";
    } else if (eventName === "Considerable Severe Thunderstorm Warning") {
      parameters.threats.thunderstormDamageThreat = "CONSIDERABLE";
      eventName = "Severe Thunderstorm Warning";
    }
  } else if (eventName === "Flash Flood Emergency") {
    parameters.threats.flashFloodDamageThreat = "CATASTROPHIC";
    eventName = "Flash Flood Warning";
  } else if (eventName === "Considerable Flash Flood Warning") {
    parameters.threats.flashFloodDamageThreat = "CONSIDERABLE";
    eventName = "Flash Flood Warning";
  }

  // Normalize string/array fields after preset mapping
  if (parameters.source) {
    parameters.source = normalizeAlertValue(parameters.source);
  }
  if (parameters.threats) {
    Object.keys(parameters.threats).forEach((key) => {
      parameters.threats[key] = normalizeAlertValue(parameters.threats[key]);
    });
  }

  parameters.eventName = eventName;
  if (!parameters.event || normalizeAlertValue(parameters.event) === "") {
    parameters.event = eventName;
  }
  if (!parameters.headline || normalizeAlertValue(parameters.headline) === "") {
    parameters.headline = eventName;
  }

  return parameters;
}

function addAlertToMap(alert) {
  alert = applyRealAlertPresetRules(alert);

  // Detect special weather statements from SSE or product
  try {
    if (alert.eventName && /severe weather statement/i.test(alert.eventName)) {
      alert.isSpecialWeatherStatement = true;
    }
    if (!alert.isSpecialWeatherStatement && alert.rawText) {
      if (/Severe Weather Statement/i.test(alert.rawText)) {
        alert.isSpecialWeatherStatement = true;
      }
    }
  } catch (e) {
    console.warn("Error detecting special weather statement:", e);
  }
  if (activeAlerts.has(alert.id)) {
    updateAlertOnMap(alert);
    return;
  }

  activeAlerts.set(alert.id, alert);

  if (alert.polygon) {
    addAlertPolygon(mapInstance, alert);
  } else if (
    (alert.ugc && alert.ugc.length > 0) ||
    (alert.geocode && alert.geocode.SAME && alert.geocode.SAME.length > 0)
  ) {
    addAlertCounties(alert);
  }

  applyAlertStyleToMap(alert);
  scheduleAlertsButtonUpdate();
}

// Try to synthesize threat information when the alert doesn't include
// a structured `threats` object. This pulls useful bits from available
// fields and the raw product text so the threats panel isn't empty.
function synthesizeThreats(alert) {
  if (!alert) return {};
  // Start with any explicit threats (we'll augment missing pieces)
  const out =
    alert.threats && Object.keys(alert.threats).length
      ? Object.assign({}, alert.threats)
      : {};

  // Look for tornado indicators (including POSSIBLE for SV warnings)
  try {
    const rt = alert.rawText || "";
    const hazards = (alert.hazards || "") + " " + (alert.impact || "");

    let tornadoMatch =
      /TORNADO\.\.\.\s*(OBSERVED|RADAR INDICATED|RADAR|POSSIBLE)/i.exec(rt) ||
      null;
    if (!tornadoMatch) {
      tornadoMatch =
        /TORNADO\s*(OBSERVED|RADAR INDICATED|POSSIBLE)?/i.exec(rt) ||
        /TORNADO/i.exec(hazards) ||
        null;
    }
    if (tornadoMatch) {
      const detected = (tornadoMatch[1] || "Observed/Indicated").trim();
      out.tornadoDetection = detected;
      // keep legacy key too
      if (!out.tornado) out.tornado = detected;
    } else {
      // If this is a Severe Thunderstorm warning, look for 'tornado possible'
      if (
        (alert.eventCode && alert.eventCode.startsWith("SV")) ||
        /Severe Thunderstorm Warning/i.test(alert.eventName || "")
      ) {
        if (
          /TORNADO\s*POSSIBLE/i.test(rt) ||
          /TORNADO\s*POSSIBLE/i.test(hazards)
        ) {
          out.tornadoDetection = "POSSIBLE";
          if (!out.tornado) out.tornado = "POSSIBLE";
        }
      }
    }

    const damageMatch =
      /TORNADO DAMAGE THREAT\.{3}\s*([A-Z0-9 _-]+)/i.exec(rt) ||
      /TORNADO DAMAGE THREAT\.{3}\s*([A-Z0-9 _-]+)/i.exec(hazards);
    if (damageMatch) out.tornadoDamageThreat = damageMatch[1].trim();

    const hailMatch =
      /MAX HAIL SIZE\.{3}\s*([0-9]+\.?[0-9]*\s*IN)/i.exec(rt) ||
      /MAX HAIL SIZE\.{3}\s*([0-9]+\.?[0-9]*\s*IN)/i.exec(hazards);
    if (hailMatch) out.hail = hailMatch[1].trim();

    const hailAlt = alert.maxHailSize || alert.threats?.maxHailSize;
    if (hailAlt && !out.hail) out.hail = hailAlt;

    const windAlt =
      alert.threats?.wind ||
      /WIND\.{3}\s*([^\n]+)/i.exec(rt)?.[1] ||
      alert.source;
    if (windAlt) out.wind = windAlt;

    if (alert.hazards && !out.hazards) out.hazards = alert.hazards;
    if (alert.source && !out.source) out.source = alert.source;

    // Use generic impact text if hazards empty
    if ((!out.hazards || out.hazards.trim() === "") && alert.impact)
      out.hazards = alert.impact;
  } catch (err) {
    console.warn("synthesizeThreats error:", err);
  }

  return out;
}

function removeAlertFromMap(alertId) {
  const alert = activeAlerts.get(alertId);
  if (!alert) return;

  detachAlertMapEventHandlers(mapInstance, alert);

  activeAlerts.delete(alertId);

  if (selectedAlert && selectedAlert.id === alertId && alertDetailsElement) {
    alertDetailsElement.remove();
    alertDetailsElement = null;
    selectedAlert = null;
  }

  if (alert.marker) {
    alert.marker.remove();
  }

  if (mapInstance.getLayer(`alert-${alertId}-fill`)) {
    mapInstance.removeLayer(`alert-${alertId}-fill`);
  }

  if (mapInstance.getLayer(`alert-${alertId}-outline-inner`)) {
    mapInstance.removeLayer(`alert-${alertId}-outline-inner`);
  }

  if (mapInstance.getLayer(`alert-${alertId}-outline-outer`)) {
    mapInstance.removeLayer(`alert-${alertId}-outline-outer`);
  }

  if (mapInstance.getSource(`alert-${alertId}`)) {
    mapInstance.removeSource(`alert-${alertId}`);
  }

  if (selectedAlert && selectedAlert.id === alertId) {
    const alertToReset = selectedAlert;
    selectedAlert = null;
    stopAlertFlashing(alertToReset);
  }

  scheduleAlertsButtonUpdate();
}

function detachAlertMapEventHandlers(map, alert) {
  if (!map || !alert || !alert._mapHandlers) return;

  const id = alert.mapLayerId || `alert-${alert.id}`;
  const innerLayerId = `${id}-outline-inner`;
  const outerLayerId = `${id}-outline-outer`;
  const handlers = alert._mapHandlers;

  if (handlers.onLineClick) {
    map.off("click", innerLayerId, handlers.onLineClick);
    map.off("click", outerLayerId, handlers.onLineClick);
  }
  if (handlers.onMouseEnter) {
    map.off("mouseenter", innerLayerId, handlers.onMouseEnter);
    map.off("mouseenter", outerLayerId, handlers.onMouseEnter);
  }
  if (handlers.onMouseLeave) {
    map.off("mouseleave", innerLayerId, handlers.onMouseLeave);
    map.off("mouseleave", outerLayerId, handlers.onMouseLeave);
  }

  alert._mapHandlers = null;
}

function startAlertFlashing() {
  if (!enableAlertFlashing || alertFlashInterval || !selectedAlert) return;

  const alert = selectedAlert;
  if (!mapInstance || !alert.mapLayerId) return;

  if (alert.isCountyBased) return;

  const innerOutlineId = `${alert.mapLayerId}-outline-inner`;
  const outerOutlineId = `${alert.mapLayerId}-outline-outer`;

  if (!mapInstance.getLayer(innerOutlineId)) return;

  let flashState = false;
  let currentOpacity = ALERT_OUTLINE_CONFIG.innerOpacity;

  alertFlashInterval = setInterval(() => {
    flashState = !flashState;

    if (flashMode === "smooth") {
      const innerOpacity = flashState ? 0.0 : ALERT_OUTLINE_CONFIG.innerOpacity;
      const outerOpacity = flashState ? 1.0 : 0.6;

      mapInstance.setPaintProperty(
        innerOutlineId,
        "line-opacity",
        innerOpacity,
      );
      mapInstance.setPaintProperty(
        outerOutlineId,
        "line-opacity",
        outerOpacity,
      );
    } else if (flashMode === "hard") {
      const innerOpacity = flashState ? 0.0 : ALERT_OUTLINE_CONFIG.innerOpacity;
      const outerOpacity = flashState ? 1.0 : 0.6;
      const innerWidth = ALERT_OUTLINE_CONFIG.innerWidth;
      const outerWidth = flashState
        ? ALERT_OUTLINE_CONFIG.outerWidth + 2
        : ALERT_OUTLINE_CONFIG.outerWidth;

      mapInstance.setPaintProperty(
        innerOutlineId,
        "line-opacity",
        innerOpacity,
      );
      mapInstance.setPaintProperty(
        outerOutlineId,
        "line-opacity",
        outerOpacity,
      );
      mapInstance.setPaintProperty(innerOutlineId, "line-width", innerWidth);
      mapInstance.setPaintProperty(outerOutlineId, "line-width", outerWidth);
    }
  }, flashSpeed);
}

function stopAlertFlashing(alertToReset = selectedAlert) {
  if (alertFlashInterval) {
    clearInterval(alertFlashInterval);
    alertFlashInterval = null;
  }

  if (
    alertToReset &&
    alertToReset.mapLayerId &&
    mapInstance &&
    !alertToReset.isCountyBased
  ) {
    const innerOutlineId = `${alertToReset.mapLayerId}-outline-inner`;
    const outerOutlineId = `${alertToReset.mapLayerId}-outline-outer`;

    if (mapInstance.getLayer(innerOutlineId)) {
      mapInstance.setPaintProperty(
        innerOutlineId,
        "line-opacity",
        ALERT_OUTLINE_CONFIG.innerOpacity,
      );
      mapInstance.setPaintProperty(
        innerOutlineId,
        "line-width",
        ALERT_OUTLINE_CONFIG.innerWidth,
      );
    }

    if (mapInstance.getLayer(outerOutlineId)) {
      mapInstance.setPaintProperty(
        outerOutlineId,
        "line-opacity",
        ALERT_OUTLINE_CONFIG.outerOpacity,
      );
      mapInstance.setPaintProperty(
        outerOutlineId,
        "line-width",
        ALERT_OUTLINE_CONFIG.outerWidth,
      );
    }
  }
}

function initializeWeatherAlerts() {
  const style = document.createElement("style");
  style.textContent = `
    .alert-marker {
      transition: transform 0.2s ease;
    }
    .alert-marker:hover {
      transform: scale(1.2);
    }
  `;
  document.head.appendChild(style);

  createAlertsToggleButton();

  startAlertFlashing();
}

const enhancedStyles = `
  :root {
    --glass-bg: rgba(10, 15, 30, 0.9);
    --glass-border: rgba(255, 255, 255, 0.08);
    --glass-shadow: 0 20px 50px rgba(2, 6, 23, 0.75);
    --accent-glow: rgba(59, 130, 246, 0.4);
    --text-primary: rgba(255, 255, 255, 0.95);
    --text-secondary: rgba(226, 232, 240, 0.6);
    --panel-gradient: linear-gradient(145deg, rgba(30, 64, 175, 0.6), rgba(59, 130, 246, 0.35));
  }

  .glass-morphism {
    background: var(--glass-bg);
    backdrop-filter: blur(18px) saturate(180%);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
    border-radius: 18px;
  }

  .alert-dropdown {
    position: fixed;
    top: 80px;
    right: 30px;
    min-width: 340px;
    max-width: 400px;
    padding: 18px;
    color: var(--text-primary);
    animation: fadeIn 0.25s ease-out;
    z-index: 1100;
  }

  .alert-item {
    padding: 14px;
    margin: 6px 0;
    border-radius: 12px;
    transition: all 0.25s ease;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    position: relative;
    overflow: hidden;
  }

  .alert-item::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--panel-gradient);
    opacity: 0;
    transition: opacity 0.25s ease;
  }

  .alert-item > * {
    position: relative;
  }

  .alert-item:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 35px rgba(15, 23, 42, 0.5);
  }

  .alert-item:hover::before {
    opacity: 0.3;
  }

  #alert-detail {
    animation: panelSlideIn 0.35s cubic-bezier(0.16, 0.68, 0.43, 0.99);
  }

  .alert-detail {
    position: fixed;
    top: 30px;
    right: 30px;
    width: 380px;
    max-height: calc(100vh - 60px);
    background: rgba(3, 7, 18, 0.92);
    border-radius: 20px;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 25px 80px rgba(2, 6, 23, 0.8);
    backdrop-filter: blur(22px);
    color: #f9fafb;
    z-index: 1200;
    display: flex;
    flex-direction: column;
  }

  .alert-detail__header {
    padding: 22px 22px 16px;
    display: flex;
    align-items: center;
    gap: 14px;
    background: radial-gradient(circle at top right, rgba(59, 130, 246, 0.35), transparent);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .alert-detail__header-icon {
    width: 54px;
    height: 54px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.08);
    display: grid;
    place-items: center;
    font-size: 26px;
    animation: pulseRing 2.4s ease-out infinite;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 0 20px var(--accent-glow);
  }

  .alert-detail__header-content {
    flex: 1;
    min-width: 0;
  }

  .alert-detail__eyebrow {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.35em;
    opacity: 0.75;
  }

  .alert-detail__title {
    margin: 6px 0 0;
    font-size: 1.35rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .alert-detail__meta {
    margin: 6px 0 0;
    font-size: 0.85rem;
    color: var(--text-secondary);
  }

  .alert-detail__close {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.12);
    width: 34px;
    height: 34px;
    border-radius: 10px;
    color: #fff;
    cursor: pointer;
    font-size: 18px;
    display: grid;
    place-items: center;
    transition: all 0.2s ease;
  }

  .alert-detail__close:hover {
    background: rgba(248, 250, 252, 0.08);
  }

  .alert-detail__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    padding: 12px 22px 16px;
  }

  .alert-detail__chip {
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(148, 163, 184, 0.12);
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .alert-detail__section {
    padding: 18px 22px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.12);
    font-size: 0.95rem;
    line-height: 1.6;
  }

  .alert-detail__section-title {
    margin: 0 0 10px;
    font-size: 0.78rem;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--text-secondary);
  }

  .alert-detail__section strong {
    display: block;
    margin-top: 6px;
    font-size: 1rem;
    color: var(--text-primary);
  }

  .alert-detail__section span {
    display: block;
    margin-top: 2px;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .alert-detail__actions {
    display: flex;
    gap: 12px;
    padding: 18px 22px 22px;
    background: rgba(2, 6, 23, 0.9);
  }

  .alert-detail__action {
    flex: 1;
    border: none;
    border-radius: 14px;
    padding: 12px 16px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  .alert-detail__action.primary {
    background: linear-gradient(135deg, #f43f5e, #fb7185);
    color: #fff;
    box-shadow: 0 12px 30px rgba(244, 63, 94, 0.4);
  }

  .alert-detail__action.secondary {
    background: rgba(15, 23, 42, 0.85);
    color: #fff;
    border: 1px solid rgba(148, 163, 184, 0.25);
  }

  .alert-detail__action:hover {
    transform: translateY(-2px);
    opacity: 0.92;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes panelSlideIn {
    from { opacity: 0; transform: translate(40px, -20px) scale(0.96); }
    to { opacity: 1; transform: translate(0, 0) scale(1); }
  }

  @keyframes pulseRing {
    0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.35); }
    70% { box-shadow: 0 0 0 18px rgba(59, 130, 246, 0); }
    100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
  }
`;

function isValidCoordinate(coord) {
  const [lon, lat] = coord;
  return (
    typeof lon === "number" &&
    typeof lat === "number" &&
    lon >= -180 &&
    lon <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

function getAlertLayerAnchorId(map) {
  if (!map || typeof map.getStyle !== "function") return null;
  const style = map.getStyle();
  if (!style || !Array.isArray(style.layers)) return null;

  return (
    style.layers.find(
      (layer) =>
        layer.type === "symbol" ||
        (layer.type === "line" &&
          (layer.id.includes("Road") ||
            layer.id.includes("Transit") ||
            layer.id.includes("Path") ||
            layer.id.includes("Railway"))),
    )?.id || null
  );
}

function ensureAlertOutlinesAboveRadar(
  alertIds = null,
  targetMap = mapInstance,
) {
  if (
    !targetMap ||
    typeof targetMap.getLayer !== "function" ||
    typeof targetMap.moveLayer !== "function"
  ) {
    return;
  }
  if (!targetMap.getLayer(radarLayerId)) return;

  const anchorLayerId = getAlertLayerAnchorId(targetMap);
  if (!anchorLayerId) return;

  const fallbackIds =
    typeof activeAlerts !== "undefined" && activeAlerts instanceof Map
      ? Array.from(activeAlerts.keys())
      : [];
  const idsToProcess =
    Array.isArray(alertIds) && alertIds.length > 0 ? alertIds : fallbackIds;

  idsToProcess.forEach((alertId) => {
    if (alertId === undefined || alertId === null) return;
    const id = `alert-${alertId}`;
    const outerId = `${id}-outline-outer`;
    const innerId = `${id}-outline-inner`;

    if (targetMap.getLayer(outerId)) {
      targetMap.moveLayer(outerId, anchorLayerId);
    }
    if (targetMap.getLayer(innerId)) {
      targetMap.moveLayer(innerId, anchorLayerId);
    }
  });
}

function addAlertPolygon(map, alert) {
  if (!map || !alert.polygon) return;

  const id = `alert-${alert.id}`;
  const color = getAlertColor(alert);

  const fixedPolygon = {
    type: "Polygon",
    coordinates: alert.polygon.coordinates.map((ring) =>
      ring
        .map((coord) => {
          const fixed = [coord[1], coord[0]];
          if (!isValidCoordinate(fixed)) {
            console.warn(`Invalid coordinate in alert ${alert.id}:`, coord);
            return null;
          }
          return fixed;
        })
        .filter((coord) => coord !== null),
    ),
  };

  if (
    fixedPolygon.coordinates.length === 0 ||
    fixedPolygon.coordinates[0].length < 3
  ) {
    console.warn(
      `Invalid polygon for alert ${alert.id}: insufficient valid coordinates`,
    );
    return;
  }

  alert.areaGeometry = fixedPolygon;

  if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
  if (map.getLayer(`${id}-outline-inner`))
    map.removeLayer(`${id}-outline-inner`);
  if (map.getLayer(`${id}-outline-outer`))
    map.removeLayer(`${id}-outline-outer`);
  if (map.getSource(id)) map.removeSource(id);

  map.addSource(id, {
    type: "geojson",
    data: {
      type: "Feature",
      geometry: fixedPolygon,
      properties: {
        id: id,
        eventCode: alert.eventCode,
      },
    },
  });

  const radarExists = map.getLayer(radarLayerId);
  const alertLayerAnchorId = getAlertLayerAnchorId(map);

  if (radarExists) {
    map.addLayer(
      {
        id: `${id}-fill`,
        type: "fill",
        source: id,
        paint: {
          "fill-color": color,
          "fill-opacity": ALERT_OUTLINE_CONFIG.fillOpacity,
        },
      },
      radarLayerId,
    );
  } else if (alertLayerAnchorId) {
    map.addLayer(
      {
        id: `${id}-fill`,
        type: "fill",
        source: id,
        paint: {
          "fill-color": color,
          "fill-opacity": ALERT_OUTLINE_CONFIG.fillOpacity,
        },
      },
      alertLayerAnchorId,
    );
  } else {
    map.addLayer({
      id: `${id}-fill`,
      type: "fill",
      source: id,
      paint: {
        "fill-color": color,
        "fill-opacity": ALERT_OUTLINE_CONFIG.fillOpacity,
      },
    });
  }

  if (alertLayerAnchorId) {
    map.addLayer(
      {
        id: `${id}-outline-outer`,
        type: "line",
        source: id,
        paint: {
          "line-color": ALERT_OUTLINE_CONFIG.outerColor,
          "line-width": ALERT_OUTLINE_CONFIG.outerWidth,
          "line-opacity": ALERT_OUTLINE_CONFIG.outerOpacity,
        },
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
      },
      alertLayerAnchorId,
    );
  } else {
    map.addLayer({
      id: `${id}-outline-outer`,
      type: "line",
      source: id,
      paint: {
        "line-color": ALERT_OUTLINE_CONFIG.outerColor,
        "line-width": ALERT_OUTLINE_CONFIG.outerWidth,
        "line-opacity": ALERT_OUTLINE_CONFIG.outerOpacity,
      },
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }

  if (alertLayerAnchorId) {
    map.addLayer(
      {
        id: `${id}-outline-inner`,
        type: "line",
        source: id,
        paint: {
          "line-color": ALERT_OUTLINE_CONFIG.innerColor(color),
          "line-width": ALERT_OUTLINE_CONFIG.innerWidth,
          "line-opacity": ALERT_OUTLINE_CONFIG.innerOpacity,
        },
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
      },
      alertLayerAnchorId,
    );
  } else {
    map.addLayer({
      id: `${id}-outline-inner`,
      type: "line",
      source: id,
      paint: {
        "line-color": ALERT_OUTLINE_CONFIG.innerColor(color),
        "line-width": ALERT_OUTLINE_CONFIG.innerWidth,
        "line-opacity": ALERT_OUTLINE_CONFIG.innerOpacity,
      },
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }

  alert.mapLayerId = id;

  ensureAlertOutlinesAboveRadar([alert.id], map);

  detachAlertMapEventHandlers(map, alert);

  const onLineClick = (e) => handleAlertLineClick(e, alert);
  const onMouseEnter = () => {
    map.getCanvas().style.cursor = "pointer";
  };
  const onMouseLeave = () => {
    map.getCanvas().style.cursor = "";
  };

  alert._mapHandlers = {
    onLineClick,
    onMouseEnter,
    onMouseLeave,
  };

  // Add click handler for alert lines only (no fill clicks)
  map.on("click", `${id}-outline-inner`, onLineClick);
  map.on("click", `${id}-outline-outer`, onLineClick);

  // Cursor change when hovering alert outlines
  map.on("mouseenter", `${id}-outline-inner`, onMouseEnter);
  map.on("mouseenter", `${id}-outline-outer`, onMouseEnter);
  map.on("mouseleave", `${id}-outline-inner`, onMouseLeave);
  map.on("mouseleave", `${id}-outline-outer`, onMouseLeave);
}

function handleAlertClick(e, alert) {
  e.originalEvent.stopPropagation();

  const previousSelection = selectedAlert;
  selectedAlert = alert;

  stopAlertFlashing(previousSelection);
  startAlertFlashing();
}

// NEW: Handle alert line clicks with draggable info box
function handleAlertLineClick(e, alert) {
  e.originalEvent.stopPropagation();
  const map = e.target;
  const containerRect = map.getContainer().getBoundingClientRect();

  // Remove existing info box if any
  if (currentAlertInfoBox) {
    currentAlertInfoBox.remove();
    currentAlertInfoBox = null;
    // Also remove the arrow
    const existingArrow = document.querySelector(".alert-info-arrow");
    if (existingArrow) existingArrow.remove();
  }

  // Store the click point for arrow positioning
  const anchorLngLat = e.lngLat;

  // Create draggable info box
  const infoBox = document.createElement("div");
  infoBox.className = "alert-info-box";
  const defaultLeft = containerRect.left + e.point.x + 20;
  const defaultTop = containerRect.top + e.point.y - 100;
  const initialLeft = alertInfoBoxPosition?.left ?? defaultLeft;
  const initialTop = alertInfoBoxPosition?.top ?? defaultTop;

  // Create arrow element that stays anchored to click point
  const arrow = document.createElement("div");
  arrow.className = "alert-info-arrow";
  arrow.style.cssText = `
    position: absolute;
    width: 120px;
    height: 4px;
    background: linear-gradient(90deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.35), rgba(255, 255, 255, 0.7));
    border-radius: 999px;
    transform-origin: 0 50%;
    transform: translate(0, -50%) rotate(0deg);
    z-index: 9990;
    pointer-events: none;
    box-shadow: 0 0 14px rgba(255, 255, 255, 0.25), 0 4px 18px rgba(0,0,0,0.55);
  `;
  document.body.appendChild(arrow);

  const getLineEndPoint = (ax, ay, bx, by, rect) => {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) return null;

    const candidates = [];
    const tLeft = dx !== 0 ? (rect.left - ax) / dx : null;
    const tRight = dx !== 0 ? (rect.right - ax) / dx : null;
    const tTop = dy !== 0 ? (rect.top - ay) / dy : null;
    const tBottom = dy !== 0 ? (rect.bottom - ay) / dy : null;

    if (tLeft !== null) candidates.push(tLeft);
    if (tRight !== null) candidates.push(tRight);
    if (tTop !== null) candidates.push(tTop);
    if (tBottom !== null) candidates.push(tBottom);

    let best = null;
    candidates.forEach((t) => {
      if (t <= 0) return;
      const x = ax + dx * t;
      const y = ay + dy * t;
      if (x + 0.5 < rect.left || x - 0.5 > rect.right) return;
      if (y + 0.5 < rect.top || y - 0.5 > rect.bottom) return;
      if (!best || t < best.t) best = { x, y, t };
    });

    return best ? { x: best.x, y: best.y } : null;
  };

  // Function to update arrow position
  const updateArrowPosition = () => {
    if (!map || !anchorLngLat) return;
    const anchorPoint = map.project(anchorLngLat);
    const anchorX = containerRect.left + anchorPoint.x;
    const anchorY = containerRect.top + anchorPoint.y;
    const boxRect = infoBox.getBoundingClientRect();
    const boxCenterX = boxRect.left + boxRect.width / 2;
    const boxCenterY = boxRect.top + boxRect.height / 2;
    const dx = boxCenterX - anchorX;
    const dy = boxCenterY - anchorY;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const lineEnd = getLineEndPoint(
      anchorX,
      anchorY,
      boxCenterX,
      boxCenterY,
      boxRect,
    );
    const endX = lineEnd ? lineEnd.x : boxCenterX;
    const endY = lineEnd ? lineEnd.y : boxCenterY;

    const distance = Math.hypot(endX - anchorX, endY - anchorY);
    const lineLength = Math.max(24, distance);
    arrow.style.width = `${lineLength}px`;
    arrow.style.left = `${anchorX}px`;
    arrow.style.top = `${anchorY}px`;
    arrow.style.transform = `translate(0, -50%) rotate(${angle}deg)`;
  };

  let arrowUpdateRaf = null;
  const requestArrowPositionUpdate = () => {
    if (arrowUpdateRaf) return;
    arrowUpdateRaf = requestAnimationFrame(() => {
      arrowUpdateRaf = null;
      updateArrowPosition();
    });
  };

  // Calculate time remaining
  const expiresDate = new Date(alert.expires);
  const now = new Date();
  const msRemaining = expiresDate - now;
  const minutesRemaining = Math.floor(msRemaining / 60000);
  const secondsRemaining = Math.floor((msRemaining % 60000) / 1000);

  // Get closest radars
  const closestRadars = getClosestRadars(alert, 2);

  // Get threat data from threats object or synthesize
  const threats = alert.threats || synthesizeThreats(alert);
  const accentColor = getAlertColor(alert);
  const accentRgb =
    typeof accentColor === "string" && accentColor.startsWith("#")
      ? hexToRgb(accentColor)
      : "255, 255, 255";
  const resolvedAlertName = getAlertName(alert) || "Weather Alert";
  const baseAlertName = alert.eventName || alert.event || "Weather Alert";
  const alertSubtype =
    resolvedAlertName !== baseAlertName ? resolvedAlertName : null;

  arrow.style.background = `linear-gradient(90deg, rgba(${accentRgb}, 0.08), rgba(${accentRgb}, 0.42), rgba(${accentRgb}, 0.78))`;
  arrow.style.boxShadow = `0 0 14px rgba(${accentRgb}, 0.28), 0 4px 18px rgba(0,0,0,0.55)`;

  infoBox.style.cssText = `
    position: absolute;
    left: ${initialLeft}px;
    top: ${initialTop}px;
    background: linear-gradient(160deg, rgba(17, 21, 31, 0.97), rgba(13, 17, 26, 0.97));
    border: 1px solid rgba(${accentRgb}, 0.42);
    border-radius: 12px;
    padding: 0;
    color: white;
    font-size: 13px;
    min-width: 300px;
    max-width: 360px;
    cursor: move;
    z-index: 10000;
    box-shadow: 0 10px 34px rgba(0,0,0,0.52), 0 0 0 1px rgba(${accentRgb}, 0.16) inset;
    pointer-events: auto;
    overflow: hidden;
  `;

  const formatMaxThreat = (value, detail) => {
    if (!value) return "";
    if (!detail) return value;
    if (value.includes("(")) return value;
    return `${value} (${detail})`;
  };

  // Build info content
  let infoHTML = `
    <div style="height: 4px; background: linear-gradient(90deg, rgba(${accentRgb}, 0.95), rgba(${accentRgb}, 0.35));"></div>
    <div style="padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,0.12); position: relative;
                background: linear-gradient(180deg, rgba(${accentRgb}, 0.14), rgba(${accentRgb}, 0.03));">
      <button class="alert-info-close"
        style="position: absolute; top: 10px; right: 10px; width: 24px; height: 24px;
        border-radius: 6px; border: 1px solid rgba(255,255,255,0.24); background: rgba(255,255,255,0.07);
        color: white; cursor: pointer; font-size: 15px; line-height: 1; padding: 0; font-weight: 600;">×</button>
      
      <div style="font-weight: 700; font-size: 15px; margin-bottom: 8px; padding-right: 28px; letter-spacing: 0.2px;">${baseAlertName}</div>
      <div style="font-size: 11px; opacity: 0.9; display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        ${alertSubtype ? `<span style="background: rgba(${accentRgb}, 0.2); color: rgba(255,255,255,0.96); border: 1px solid rgba(${accentRgb}, 0.55); padding: 2px 7px; border-radius: 999px; font-weight: 600;">${alertSubtype}</span>` : ""}
        ${alert.eventCode ? `<span style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16); padding: 2px 7px; border-radius: 999px;">${alert.eventCode}</span>` : ""}
        ${alert.office ? `<span style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); padding: 2px 7px; border-radius: 999px;">📡 ${alert.office}</span>` : ""}
        <span class="alert-info-countdown" style="font-weight: 600; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); padding: 2px 7px; border-radius: 999px;">
          ⏰ ${minutesRemaining}m ${secondsRemaining}s
        </span>
      </div>
    </div>
    
    <div style="padding: 12px 14px; font-size: 12.5px; line-height: 1.55;">
  `;

  // Display counties if available
  if (alert.counties && alert.counties.length > 0) {
    infoHTML += `
      <div style="margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.05); 
                  border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);">
        <div style="font-weight: 600; font-size: 10px; text-transform: uppercase; 
                    letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 4px;">Affected Counties</div>
        <div style="font-weight: 500;">${alert.counties.join(", ")}</div>
      </div>`;
  }

  // Threat information section
  let threatCount = 0;
  let threatsHTML = "";

  // Display tornado information
  if (threats.tornadoDetection) {
    threatsHTML += `
      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="opacity: 0.85;">🌪️ Tornado</span>
        <span style="font-weight: 600; color: #fbbf24; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">${threats.tornadoDetection}</span>
      </div>`;
    threatCount++;
  }
  if (threats.tornadoDamageThreat) {
    threatsHTML += `
      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="opacity: 0.85;">💥 Damage Threat</span>
        <span style="font-weight: 600; color: #ef4444; text-shadow: 0 1px 3px rgba(0,0,0,0.5);">${threats.tornadoDamageThreat}</span>
      </div>`;
    threatCount++;
  }

  // Display thunderstorm threat
  if (threats.thunderstormDamageThreat) {
    threatsHTML += `
      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="opacity: 0.85;">⚡ Storm Threat</span>
        <span style="font-weight: 600; color: #fbbf24;">${threats.thunderstormDamageThreat}</span>
      </div>`;
    threatCount++;
  }

  // Display wind information
  if (threats.maxWindGust) {
    threatsHTML += `
      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="opacity: 0.85;">💨 Max Wind</span>
        <span style="font-weight: 600; color: #60a5fa;">${formatMaxThreat(threats.maxWindGust, threats.windThreat)}</span>
      </div>`;
    threatCount++;
  }

  // Display hail information
  if (threats.maxHailSize) {
    threatsHTML += `
      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
        <span style="opacity: 0.85;">🧊 Max Hail</span>
        <span style="font-weight: 600; color: #a78bfa;">${formatMaxThreat(threats.maxHailSize, threats.hailThreat)}</span>
      </div>`;
    threatCount++;
  }

  // Add threats section if we have any threats
  if (threatCount > 0) {
    infoHTML += `
      <div style="margin-bottom: 12px; padding: 10px; background: rgba(255,255,255,0.05); 
                  border-radius: 8px; border: 1px solid rgba(${accentRgb}, 0.3);">
        <div style="font-weight: 600; font-size: 10px; text-transform: uppercase; 
                    letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 8px;">Threat Details</div>
        ${threatsHTML}
      </div>`;
  }

  // Add closest radars
  if (closestRadars.length > 0) {
    infoHTML += `
      <div style="padding: 10px; background: rgba(255,255,255,0.05); border-radius: 6px; 
                  border: 1px solid rgba(255,255,255,0.12);">
        <div style="font-weight: 600; font-size: 10px; text-transform: uppercase; 
                    letter-spacing: 0.5px; opacity: 0.7; margin-bottom: 8px;">📡 Nearby Radars</div>`;
    closestRadars.forEach((radar) => {
      infoHTML += `
        <a href="javascript:void(0)" onclick="selectRadarSite('${radar.id}')" 
           style="display: flex; justify-content: space-between; align-items: center; 
                  color: #93c5fd; text-decoration: none; font-weight: 500; padding: 7px 8px; 
                  border-radius: 6px; margin-bottom: 5px;
                  background: rgba(147, 197, 253, 0.12); border: 1px solid rgba(147, 197, 253, 0.2);"
            >
          <span>${radar.id}</span>
          <span style="opacity: 0.8; font-size: 11px;">${radar.distance.toFixed(0)}mi</span>
        </a>
      `;
    });
    infoHTML += `</div>`;
  }

  infoHTML += `</div>`; // Close content area

  infoBox.innerHTML = infoHTML;

  const cleanupInfoBox = () => {
    clearInterval(updateCountdown);
    if (arrowUpdateRaf) {
      cancelAnimationFrame(arrowUpdateRaf);
      arrowUpdateRaf = null;
    }
    if (infoBox.parentNode) infoBox.remove();
    if (arrow.parentNode) arrow.remove();
    if (map) {
      map.off("move", requestArrowPositionUpdate);
      map.off("zoom", requestArrowPositionUpdate);
      map.off("resize", requestArrowPositionUpdate);
    }
    document.removeEventListener("mousemove", handleDocumentMouseMove);
    document.removeEventListener("mouseup", handleDocumentMouseUp);
  };

  const closeButton = infoBox.querySelector(".alert-info-close");
  if (closeButton) {
    closeButton.addEventListener("click", cleanupInfoBox);
  }

  // Make draggable
  let isDragging = false;
  let dragStartX, dragStartY;

  infoBox.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "A") return;
    isDragging = true;
    dragStartX = e.clientX - infoBox.offsetLeft;
    dragStartY = e.clientY - infoBox.offsetTop;
    infoBox.style.cursor = "grabbing";
  });

  const handleDocumentMouseMove = (e) => {
    if (isDragging) {
      infoBox.style.left = e.clientX - dragStartX + "px";
      infoBox.style.top = e.clientY - dragStartY + "px";
      alertInfoBoxPosition = {
        left: infoBox.offsetLeft,
        top: infoBox.offsetTop,
      };
      requestArrowPositionUpdate();
    }
  };

  const handleDocumentMouseUp = () => {
    if (isDragging) {
      isDragging = false;
      infoBox.style.cursor = "move";
      alertInfoBoxPosition = {
        left: infoBox.offsetLeft,
        top: infoBox.offsetTop,
      };
    }
  };

  document.addEventListener("mousemove", handleDocumentMouseMove);
  document.addEventListener("mouseup", handleDocumentMouseUp);

  document.body.appendChild(infoBox);
  currentAlertInfoBox = infoBox;
  alertInfoBoxPosition = {
    left: infoBox.offsetLeft,
    top: infoBox.offsetTop,
  };

  // Initial arrow position
  setTimeout(requestArrowPositionUpdate, 10);
  map.on("move", requestArrowPositionUpdate);
  map.on("zoom", requestArrowPositionUpdate);
  map.on("resize", requestArrowPositionUpdate);

  // Update countdown every second
  const updateCountdown = setInterval(() => {
    const now = new Date();
    const msRemaining = expiresDate - now;
    if (msRemaining <= 0) {
      clearInterval(updateCountdown);
      cleanupInfoBox();
      return;
    }
    const mins = Math.floor(msRemaining / 60000);
    const secs = Math.floor((msRemaining % 60000) / 1000);
    const countdownSpan = infoBox.querySelector(".alert-info-countdown");
    if (countdownSpan) {
      countdownSpan.textContent = `⏰ ${mins}m ${secs}s`;
    }
  }, 1000);
}

// Get closest radars to an alert
function getClosestRadars(alert, count = 2) {
  if (
    (!alert.polygon && !alert.areaGeometry) ||
    !radarSitesCache ||
    radarSitesCache.length === 0
  ) {
    return [];
  }

  if (alert.areaCenter) {
    const { lat, lon } = alert.areaCenter;
    const radarsWithDistance = radarSitesCache.map((radar) => {
      const distance = calculateDistance(
        lat,
        lon,
        radar.latitude,
        radar.longitude,
      );
      return { ...radar, distance };
    });
    return radarsWithDistance
      .sort((a, b) => a.distance - b.distance)
      .slice(0, count);
  }

  const geometry = alert.areaGeometry || alert.polygon;
  const coords = geometry?.coordinates?.[0] || [];
  const centroid = getPolygonCentroid(coords, Boolean(alert.areaGeometry));
  if (!centroid) return [];

  // Calculate distances
  const radarsWithDistance = radarSitesCache.map((radar) => {
    const distance = calculateDistance(
      centroid.lat,
      centroid.lon,
      radar.latitude,
      radar.longitude,
    );
    return { ...radar, distance };
  });

  // Sort by distance and return top N
  return radarsWithDistance
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

function normalizeLonLat(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return null;
  const a = Number(coord[0]);
  const b = Number(coord[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

  // Default assumption for alert input is [lat, lon]
  return { lon: b, lat: a };
}

function getPolygonCentroid(coords, assumeLonLat = false) {
  if (!Array.isArray(coords) || coords.length < 3) return null;

  const points = coords.slice();
  const first = points[0];
  const last = points[points.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    points.push(first);
  }

  // Use planar centroid on lon/lat degrees for small polygons
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
    // Fallback to average
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

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
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

// Global function to select radar from alert info box
window.selectRadarSite = function (siteId) {
  const select = document.getElementById("radarSiteSelect");
  if (select) {
    select.value = siteId;
    select.dispatchEvent(new Event("change"));
  }
};

// TVS Detection Functions
function detectTVS(data) {
  if (!tvsDetectionEnabled || !data || !data.vertices || !data.values) {
    return [];
  }

  // Simple TVS detection: look for strong velocity gradients
  const tvsLocations = [];
  const velocityProduct =
    selectedRadarProduct === "N0G" ||
    selectedRadarProduct === "N1G" ||
    selectedRadarProduct === "N0V";

  if (!velocityProduct) return [];

  // Sample velocity data for strong rotation signatures
  // Radar data has vertices as [lon, lat, lon, lat, ...] pairs
  // Process every 30 vertices to avoid too many markers
  for (let i = 0; i < data.values.length - 10; i += 30) {
    const localVals = data.values.slice(
      i,
      Math.min(i + 10, data.values.length),
    );
    const maxVal = Math.max(...localVals);
    const minVal = Math.min(...localVals);
    const gradient = Math.abs(maxVal - minVal);

    // Strong velocity gradient indicates rotation
    if (gradient > TVS_THRESHOLD_VELOCITY) {
      // Get the middle vertex of this group for marker placement
      const centerIdx = i + 5;

      // Ensure centerIdx is within valid range
      if (centerIdx < data.values.length) {
        // Calculate vertex index: each value corresponds to a vertex pair (lon, lat)
        const vertexLonIdx = centerIdx * 2;
        const vertexLatIdx = centerIdx * 2 + 1;

        // Validate indices and coordinates
        if (vertexLatIdx < data.vertices.length) {
          const lon = data.vertices[vertexLonIdx];
          const lat = data.vertices[vertexLatIdx];

          // Validate that coordinates are valid numbers and not at origin (0,0)
          if (
            !isNaN(lon) &&
            !isNaN(lat) &&
            Math.abs(lon) > 0.001 &&
            Math.abs(lat) > 0.001
          ) {
            console.log(
              `TVS detected at: lon=${lon.toFixed(4)}, lat=${lat.toFixed(4)}, strength=${gradient.toFixed(1)} kt/s`,
            );
            tvsLocations.push({
              lon: lon,
              lat: lat,
              strength: gradient,
            });
          } else {
            console.warn(
              `Invalid TVS coordinates skipped: lon=${lon}, lat=${lat}`,
            );
          }
        }
      }
    }
  }

  return tvsLocations;
}

function displayTVSMarkers(tvsLocations) {
  // Remove old markers
  detectedTVSMarkers.forEach((marker) => marker.remove());
  detectedTVSMarkers = [];

  if (!tvsDetectionEnabled || !mapInstance) return;

  console.log(`Displaying ${tvsLocations.length} TVS markers`);

  tvsLocations.forEach((tvs, index) => {
    // Validate coordinates before creating marker
    if (!tvs || typeof tvs.lon !== "number" || typeof tvs.lat !== "number") {
      console.error(`Invalid TVS data at index ${index}:`, tvs);
      return;
    }

    if (isNaN(tvs.lon) || isNaN(tvs.lat)) {
      console.error(
        `NaN coordinates for TVS at index ${index}: lon=${tvs.lon}, lat=${tvs.lat}`,
      );
      return;
    }

    console.log(
      `Creating TVS marker ${index + 1}: [${tvs.lon.toFixed(4)}, ${tvs.lat.toFixed(4)}]`,
    );

    // Create circular container with Font Awesome tornado icon
    const el = document.createElement("div");
    el.className = "tvs-marker";
    el.innerHTML = '<i class="fas fa-tornado"></i>';
    el.style.cssText = `
      animation: tvs-pulse 1.5s ease-in-out infinite;
      position: relative;
      pointer-events: auto;
    `;

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      alert(
        `TVS Detected\\nStrength: ${tvs.strength.toFixed(1)} kt/s\\nLocation: ${tvs.lat.toFixed(4)}°N, ${tvs.lon.toFixed(4)}°W`,
      );
    });

    // Create marker at the TVS coordinates with explicit positioning
    const marker = new maplibregl.Marker({
      element: el,
      anchor: "center", // Center the marker on the coordinates
      className: "tvs-marker-container",
    })
      .setLngLat([tvs.lon, tvs.lat])
      .addTo(mapInstance);

    console.log(`TVS marker ${index + 1} added to map at:`, marker.getLngLat());

    detectedTVSMarkers.push(marker);
  });

  // Add TVS pulse animation
  if (!document.getElementById("tvs-pulse-style")) {
    const style = document.createElement("style");
    style.id = "tvs-pulse-style";
    style.textContent = `
      @keyframes tvs-pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.2); opacity: 0.8; }
      }
    `;
    document.head.appendChild(style);
  }
}

// Storm Track Functions
function enableStormTrack() {
  stormTrackEnabled = true;
  mapInstance.getCanvas().style.cursor = "crosshair";

  // Show instructions
  const instructions = document.createElement("div");
  instructions.id = "storm-track-instructions";
  instructions.style.cssText = `
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(20, 20, 30, 0.9);
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-size: 13px;
    z-index: 10000;
    border: 1px solid rgba(255,255,255,0.2);
  `;
  instructions.textContent =
    "Click to set storm origin, then click to set direction. ESC to cancel.";
  document.body.appendChild(instructions);

  // Add click handler
  const clickHandler = (e) => {
    if (!stormTrackPoint) {
      // First click: set origin
      stormTrackPoint = [e.lngLat.lng, e.lngLat.lat];
      instructions.textContent = "Click to set storm movement direction...";
    } else {
      // Second click: set direction
      stormTrackLine = [stormTrackPoint, [e.lngLat.lng, e.lngLat.lat]];
      showStormTrackDialog();
      mapInstance.off("click", clickHandler);
      instructions.remove();
    }
  };

  mapInstance.on("click", clickHandler);

  // ESC to cancel
  const escHandler = (e) => {
    if (e.key === "Escape") {
      stormTrackEnabled = false;
      stormTrackPoint = null;
      stormTrackLine = [];
      mapInstance.off("click", clickHandler);
      mapInstance.getCanvas().style.cursor = "";
      instructions.remove();
      document.removeEventListener("keydown", escHandler);
    }
  };
  document.addEventListener("keydown", escHandler);
}

function showStormTrackDialog() {
  const dialog = document.createElement("div");
  dialog.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(20, 20, 30, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 12px;
    padding: 20px;
    color: white;
    z-index: 10001;
    min-width: 350px;
  `;

  dialog.innerHTML = `
    <h3 style="margin: 0 0 16px 0; font-size: 16px;">Storm Track Projection</h3>
    
    <div style="margin-bottom: 16px;">
      <label style="display: block; margin-bottom: 8px; font-size: 13px; font-weight: 600;">Speed Mode:</label>
      <div style="display: flex; gap: 8px;">
        <button id="speedModeManual" class="speed-mode-btn active" data-mode="manual" 
          style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3);
          background: rgba(79, 184, 255, 0.3); color: white; cursor: pointer; font-size: 12px;">
          Manual Speed
        </button>
        <button id="speedModeCalculated" class="speed-mode-btn" data-mode="calculated"
          style="flex: 1; padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.3);
          background: rgba(255,255,255,0.1); color: white; cursor: pointer; font-size: 12px;">
          Calculate from Markers
        </button>
      </div>
    </div>

    <div id="manualSpeedInputs" style="display: block;">
      <div style="margin-bottom: 12px;">
        <label style="display: block; margin-bottom: 4px; font-size: 13px;">Speed (mph):</label>
        <input type="number" id="stormTrackSpeed" value="${stormTrackSpeed}" min="5" max="100" 
          style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.3); 
          background: rgba(255,255,255,0.1); color: white;">
      </div>
    </div>

    <div id="calculatedSpeedInputs" style="display: none;">
      <div style="margin-bottom: 12px; padding: 12px; background: rgba(79, 184, 255, 0.1); border-radius: 6px;">
        <div style="font-size: 12px; margin-bottom: 8px;">
          Click on two points (past and current storm location) and enter the time elapsed between them.
        </div>
        <label style="display: block; margin-bottom: 4px; font-size: 13px;">Time Elapsed (minutes):</label>
        <input type="number" id="stormTrackTimeElapsed" value="30" min="1" max="360" 
          style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.3); 
          background: rgba(255,255,255,0.1); color: white;">
        <div id="calculatedSpeedDisplay" style="margin-top: 8px; font-size: 12px; color: #4fb8ff;"></div>
      </div>
    </div>

    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-size: 13px;">Projection Time (hours):</label>
      <input type="number" id="stormTrackTime" value="3" min="0.5" max="24" step="0.5"
        style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.3); 
        background: rgba(255,255,255,0.1); color: white;">
    </div>

    <div style="margin-bottom: 12px;">
      <label style="display: block; margin-bottom: 4px; font-size: 13px;">Cone Width Factor:</label>
      <input type="range" id="stormTrackConeWidth" value="0.15" min="0.05" max="0.5" step="0.05"
        style="width: 100%;">
      <div style="font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 4px;">
        Wider cone = more uncertainty
      </div>
    </div>

    <div style="display: flex; gap: 8px; margin-top: 16px;">
      <button id="stormTrackApply" style="flex: 2; padding: 10px; border-radius: 6px; 
        background: #4a9eff; color: white; border: none; cursor: pointer; font-size: 13px; font-weight: 600;">
        Generate Projection
      </button>
      <button id="stormTrackCancel" style="flex: 1; padding: 10px; border-radius: 6px; 
        background: rgba(255,255,255,0.2); color: white; border: none; cursor: pointer; font-size: 13px;">
        Cancel
      </button>
    </div>
  `;

  document.body.appendChild(dialog);

  // Mode switching
  const modeButtons = dialog.querySelectorAll(".speed-mode-btn");
  modeButtons.forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.mode;
      stormTrackMode = mode;

      modeButtons.forEach((b) => {
        b.style.background = "rgba(255,255,255,0.1)";
        b.classList.remove("active");
      });
      btn.style.background = "rgba(79, 184, 255, 0.3)";
      btn.classList.add("active");

      document.getElementById("manualSpeedInputs").style.display =
        mode === "manual" ? "block" : "none";
      document.getElementById("calculatedSpeedInputs").style.display =
        mode === "calculated" ? "block" : "none";

      if (mode === "calculated") {
        enableMarkerSelection(dialog);
      }
    };
  });

  document.getElementById("stormTrackApply").onclick = () => {
    let speed = stormTrackSpeed;

    if (
      stormTrackMode === "calculated" &&
      stormTrackFirstMarker &&
      stormTrackSecondMarker
    ) {
      const timeMinutes = parseFloat(
        document.getElementById("stormTrackTimeElapsed").value,
      );
      const distance = calculateDistance(
        stormTrackFirstMarker[1],
        stormTrackFirstMarker[0],
        stormTrackSecondMarker[1],
        stormTrackSecondMarker[0],
      );
      speed = (distance / timeMinutes) * 60; // Convert to mph
      stormTrackSpeed = speed;
    } else if (stormTrackMode === "manual") {
      speed = parseFloat(document.getElementById("stormTrackSpeed").value);
      stormTrackSpeed = speed;
    }

    const projectionHours = parseFloat(
      document.getElementById("stormTrackTime").value,
    );
    const coneWidth = parseFloat(
      document.getElementById("stormTrackConeWidth").value,
    );

    projectStormPath(projectionHours, coneWidth);
    dialog.remove();
  };

  document.getElementById("stormTrackCancel").onclick = () => {
    stormTrackPoint = null;
    stormTrackLine = [];
    stormTrackFirstMarker = null;
    stormTrackSecondMarker = null;
    stormTrackEnabled = false;
    mapInstance.getCanvas().style.cursor = "";

    // Remove marker visuals
    stormTrackMarkers.forEach((m) => m.remove());
    stormTrackMarkers = [];

    dialog.remove();
  };
}

function enableMarkerSelection(dialog) {
  const display = document.getElementById("calculatedSpeedDisplay");
  display.textContent = "Click first marker (past location)...";

  mapInstance.getCanvas().style.cursor = "crosshair";

  const clickHandler = (e) => {
    if (!stormTrackFirstMarker) {
      stormTrackFirstMarker = [e.lngLat.lng, e.lngLat.lat];

      // Add marker visual
      const marker = new maplibregl.Marker({ color: "#ff9800" })
        .setLngLat(stormTrackFirstMarker)
        .addTo(mapInstance);
      stormTrackMarkers.push(marker);

      display.textContent = "Click second marker (current location)...";
    } else if (!stormTrackSecondMarker) {
      stormTrackSecondMarker = [e.lngLat.lng, e.lngLat.lat];

      // Add marker visual
      const marker = new maplibregl.Marker({ color: "#f44336" })
        .setLngLat(stormTrackSecondMarker)
        .addTo(mapInstance);
      stormTrackMarkers.push(marker);

      // Update line
      stormTrackLine = [stormTrackFirstMarker, stormTrackSecondMarker];

      // Calculate and display speed
      const timeMinutes = parseFloat(
        document.getElementById("stormTrackTimeElapsed").value,
      );
      const distance = calculateDistance(
        stormTrackFirstMarker[1],
        stormTrackFirstMarker[0],
        stormTrackSecondMarker[1],
        stormTrackSecondMarker[0],
      );
      const calculatedSpeed = ((distance / timeMinutes) * 60).toFixed(1);

      display.innerHTML = `✓ Calculated Speed: <strong>${calculatedSpeed} mph</strong>`;
      mapInstance.getCanvas().style.cursor = "";
      mapInstance.off("click", clickHandler);
    }
  };

  mapInstance.on("click", clickHandler);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 3959; // Earth radius in miles
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

function projectStormPath(hours, coneWidthFactor = 0.15) {
  if (!stormTrackLine || stormTrackLine.length < 2) return;

  const [start, end] = stormTrackLine;
  const bearing = calculateBearing(start[1], start[0], end[1], end[0]);
  const distanceMiles = stormTrackSpeed * hours;

  // Create expanding cone polygon
  const centerPoints = [];
  const leftPoints = [];
  const rightPoints = [];
  const steps = 30;

  for (let i = 0; i <= steps; i++) {
    const fraction = i / steps;
    const dist = distanceMiles * fraction;
    const widthAtPoint = dist * coneWidthFactor; // Width grows with distance

    const centerPoint = destinationPoint(start[1], start[0], bearing, dist);
    centerPoints.push(centerPoint);

    // Calculate perpendicular points for cone edges
    const leftBearing = (bearing - 90 + 360) % 360;
    const rightBearing = (bearing + 90) % 360;

    const leftPoint = destinationPoint(
      centerPoint.lat,
      centerPoint.lon,
      leftBearing,
      widthAtPoint,
    );
    const rightPoint = destinationPoint(
      centerPoint.lat,
      centerPoint.lon,
      rightBearing,
      widthAtPoint,
    );

    leftPoints.push(leftPoint);
    rightPoints.push(rightPoint);
  }

  // Create polygon coordinates (left edge, then right edge reversed)
  const polygonCoords = [
    ...leftPoints.map((p) => [p.lon, p.lat]),
    ...rightPoints.reverse().map((p) => [p.lon, p.lat]),
    [leftPoints[0].lon, leftPoints[0].lat], // Close polygon
  ];

  // Draw cone on map
  if (!mapInstance.getSource("storm-track-cone")) {
    mapInstance.addSource("storm-track-cone", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [polygonCoords],
        },
      },
    });

    mapInstance.addLayer({
      id: "storm-track-cone-fill",
      type: "fill",
      source: "storm-track-cone",
      paint: {
        "fill-color": "#ff4444",
        "fill-opacity": 0.2,
      },
    });

    mapInstance.addLayer({
      id: "storm-track-cone-outline",
      type: "line",
      source: "storm-track-cone",
      paint: {
        "line-color": "#ff4444",
        "line-width": 2,
        "line-dasharray": [3, 2],
      },
    });

    // Add center line
    mapInstance.addSource("storm-track-centerline", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: centerPoints.map((p) => [p.lon, p.lat]),
        },
      },
    });

    mapInstance.addLayer({
      id: "storm-track-centerline",
      type: "line",
      source: "storm-track-centerline",
      paint: {
        "line-color": "#ff6666",
        "line-width": 2,
      },
    });
  } else {
    mapInstance.getSource("storm-track-cone").setData({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [polygonCoords],
      },
    });
    mapInstance.getSource("storm-track-centerline").setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: centerPoints.map((p) => [p.lon, p.lat]),
      },
    });
  }

  // Query cities from MapTiler and calculate ETAs
  findCitiesAlongPath(polygonCoords, centerPoints, hours);
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
  const R = 3959; // Earth radius in miles
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

function findCitiesAlongPath(polygonCoords, centerPoints, hours) {
  // Query rendered features from MapTiler to find cities
  const cityLayers = [
    "place-city-label",
    "place-town-label",
    "place-village-label",
    "place-label",
  ];

  // Create bounding box from polygon
  const lngs = polygonCoords.map((c) => c[0]);
  const lats = polygonCoords.map((c) => c[1]);
  const bbox = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];

  // Query features
  let features = [];
  try {
    features = mapInstance.queryRenderedFeatures(undefined, {
      layers: cityLayers,
    });
  } catch (e) {
    console.log("Could not query city features:", e);
  }

  // Filter features within polygon and calculate ETAs
  const citiesWithETA = [];
  const startPoint = centerPoints[0];

  features.forEach((feature) => {
    if (!feature.properties || !feature.properties.name) return;

    const coords = feature.geometry.coordinates;
    if (!coords || coords.length < 2) return;

    // Check if point is in polygon
    if (!isPointInPolygon([coords[0], coords[1]], polygonCoords)) return;

    // Calculate distance from storm origin
    const cityLat = coords[1];
    const cityLon = coords[0];
    const distance = calculateDistance(
      startPoint.lat,
      startPoint.lon,
      cityLat,
      cityLon,
    );
    const eta = distance / stormTrackSpeed; // hours

    citiesWithETA.push({
      name: feature.properties.name,
      distance: distance,
      eta: eta,
      lat: cityLat,
      lon: cityLon,
    });
  });

  // Sort by ETA
  citiesWithETA.sort((a, b) => a.eta - b.eta);

  // Display results
  displayCityETAs(citiesWithETA, hours);

  // Mark cities on map
  markCitiesOnMap(citiesWithETA);
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

function displayCityETAs(cities, maxHours) {
  // Remove existing dialog
  const existing = document.getElementById("city-eta-dialog");
  if (existing) existing.remove();

  const dialog = document.createElement("div");
  dialog.id = "city-eta-dialog";
  dialog.style.cssText = `
    position: absolute;
    top: 100px;
    right: 20px;
    background: rgba(20, 20, 30, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 12px;
    padding: 16px;
    color: white;
    max-width: 350px;
    max-height: 500px;
    overflow-y: auto;
    z-index: 10000;
  `;

  let html = `
    <h3 style="margin: 0 0 12px 0; font-size: 14px;">Storm Impact Forecast</h3>
    <div style="font-size: 12px; line-height: 1.6;">
      <div><strong>Speed:</strong> ${stormTrackSpeed.toFixed(1)} mph</div>
      <div><strong>Projection:</strong> ${maxHours} hours</div>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.2);">
  `;

  if (cities.length === 0) {
    html += `<em>No cities found in projected path</em>`;
  } else {
    html += `<div style="margin-bottom: 8px;"><strong>Cities in Path (${cities.length}):</strong></div>`;
    cities.slice(0, 20).forEach((city) => {
      const hours = Math.floor(city.eta);
      const minutes = Math.round((city.eta - hours) * 60);
      const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      html += `
        <div style="padding: 6px; margin: 4px 0; background: rgba(255,255,255,0.1); border-radius: 4px;">
          <div style="font-weight: bold;">${city.name}</div>
          <div style="font-size: 11px; opacity: 0.8;">
            ETA: ${timeStr} (${city.distance.toFixed(1)} mi)
          </div>
        </div>
      `;
    });

    if (cities.length > 20) {
      html += `<div style="font-size: 11px; opacity: 0.7; margin-top: 8px;">...and ${cities.length - 20} more</div>`;
    }
  }

  html += `
      </div>
      <button onclick="document.getElementById('city-eta-dialog').remove()" 
        style="margin-top: 12px; width: 100%; padding: 8px; background: rgba(255,70,70,0.8); 
        border: none; border-radius: 6px; color: white; cursor: pointer; font-weight: bold;">
        Close
      </button>
    </div>
  `;

  dialog.innerHTML = html;
  document.body.appendChild(dialog);
}

function markCitiesOnMap(cities) {
  // Remove existing city markers
  if (mapInstance.getLayer("storm-city-markers")) {
    mapInstance.removeLayer("storm-city-markers");
  }
  if (mapInstance.getLayer("storm-city-labels")) {
    mapInstance.removeLayer("storm-city-labels");
  }
  if (mapInstance.getSource("storm-cities")) {
    mapInstance.removeSource("storm-cities");
  }

  if (cities.length === 0) return;

  const features = cities.map((city) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [city.lon, city.lat],
    },
    properties: {
      name: city.name,
      eta: city.eta.toFixed(2),
      distance: city.distance.toFixed(1),
    },
  }));

  mapInstance.addSource("storm-cities", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: features,
    },
  });

  mapInstance.addLayer({
    id: "storm-city-markers",
    type: "circle",
    source: "storm-cities",
    paint: {
      "circle-radius": 6,
      "circle-color": "#ffff00",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 2,
    },
  });

  mapInstance.addLayer({
    id: "storm-city-labels",
    type: "symbol",
    source: "storm-cities",
    layout: {
      "text-field": ["get", "name"],
      "text-offset": [0, 1.5],
      "text-anchor": "top",
      "text-size": 12,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 2,
    },
  });
}

// ========================================
// Traffic Cameras Feature
// ========================================

async function loadCameras() {
  try {
    const response = await fetch("/api/cameras");
    if (!response.ok) {
      throw new Error(`Failed to fetch cameras: ${response.statusText}`);
    }
    const data = await response.json();
    camerasData = data;
    console.log(`📷 Loaded ${data.features.length} cameras`);
    return data;
  } catch (error) {
    console.error("Error loading cameras:", error);
    return { type: "FeatureCollection", features: [] };
  }
}

function initCameraLayer() {
  if (!mapInstance || !camerasData) return;

  // Add camera source if it doesn't exist
  if (!mapInstance.getSource("cameras")) {
    mapInstance.addSource("cameras", {
      type: "geojson",
      data: camerasData,
    });

    // Add camera marker layer with color-coded based on media type
    mapInstance.addLayer({
      id: "camera-markers",
      type: "circle",
      source: "cameras",
      paint: {
        "circle-radius": 6,
        "circle-color": [
          "case",
          // Green if has video_url
          ["all", ["has", "video_url"], ["!=", ["get", "video_url"], ""]],
          "#4ade80", // green for video
          // Blue if has image_url
          ["all", ["has", "image_url"], ["!=", ["get", "image_url"], ""]],
          "#4fb8ff", // blue for image
          "#6b7280", // grey if no media
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });

    // Add camera icon layer (optional enhancement)
    mapInstance.addLayer({
      id: "camera-icons",
      type: "symbol",
      source: "cameras",
      layout: {
        "icon-image": "camera-15",
        "icon-size": 1.2,
        "icon-allow-overlap": true,
      },
    });

    // Add click handler for cameras
    mapInstance.on("click", "camera-markers", handleCameraClick);
    mapInstance.on("mouseenter", "camera-markers", () => {
      mapInstance.getCanvas().style.cursor = "pointer";
    });
    mapInstance.on("mouseleave", "camera-markers", () => {
      mapInstance.getCanvas().style.cursor = "";
    });

    // Set initial visibility
    mapInstance.setLayoutProperty(
      "camera-markers",
      "visibility",
      camerasEnabled ? "visible" : "none",
    );
    mapInstance.setLayoutProperty(
      "camera-icons",
      "visibility",
      camerasEnabled ? "visible" : "none",
    );
  }
}

// Helper function to detect if a URL is a video based on file extension
function isVideoUrl(url) {
  if (!url) return false;

  // Remove query parameters
  const urlWithoutQuery = url.split("?")[0].split("#")[0];

  // Get the file extension
  const extension = urlWithoutQuery
    .substring(urlWithoutQuery.lastIndexOf("."))
    .toLowerCase();

  // Check if it matches a known video extension
  const videoExtensions = [
    ".mp4",
    ".webm",
    ".ogg",
    ".m3u8",
    ".flv",
    ".mov",
    ".avi",
  ];
  return videoExtensions.includes(extension);
}

function handleCameraClick(e) {
  if (!e.features || e.features.length === 0) return;

  const feature = e.features[0];
  const coordinates = feature.geometry.coordinates.slice();
  const imageUrl = feature.properties.image_url;
  const videoUrl = feature.properties.video_url;
  const state = feature.properties.state || "Unknown";
  const name = feature.properties.name || "Traffic Camera";

  // Ensure the popup appears over the correct location
  while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
    coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
  }

  // Close existing popup
  if (cameraPopup) {
    cameraPopup.remove();
  }

  // Determine available media
  const hasImage = Boolean(imageUrl);
  const hasVideo = Boolean(videoUrl);
  const hasBoth = hasImage && hasVideo;

  // Default to video if both available, otherwise first available
  let activeMediaUrl = videoUrl || imageUrl;
  let activeMediaType = videoUrl ? "video" : "image";

  // Detect if URL is a video format
  const isVideo = activeMediaType === "video" || isVideoUrl(activeMediaUrl);

  // Create popup content with dark mode styling
  const popupContent = document.createElement("div");
  popupContent.style.cssText = `
    min-width: 280px;
    max-width: 380px;
    background: rgba(13, 16, 24, 0.98);
    border-radius: 12px;
    padding: 16px;
    color: #f7f9ff;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  `;

  // Media type toggle buttons (if both formats available)
  const mediaToggle = hasBoth
    ? `
    <div style="display: flex; gap: 6px; margin-bottom: 12px; padding: 4px; background: rgba(0, 0, 0, 0.3); border-radius: 8px;">
      <button 
        id="camera-toggle-video"
        onclick="switchCameraMedia('video', '${videoUrl}', '${imageUrl}')"
        style="flex: 1; padding: 6px 10px; background: rgba(79, 184, 255, 0.25); border: 1px solid rgba(79, 184, 255, 0.4); border-radius: 6px; color: #4fb8ff; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s;"
      >
        🎥 Video
      </button>
      <button 
        id="camera-toggle-image"
        onclick="switchCameraMedia('image', '${videoUrl}', '${imageUrl}')"
        style="flex: 1; padding: 6px 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 6px; color: rgba(255, 255, 255, 0.5); cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s;"
      >
        🖼️ Image
      </button>
    </div>
  `
    : "";

  const buildMediaContent = (url, type) => {
    if (!url) {
      return '<div style="padding: 30px; text-align: center; color: rgba(255,255,255,0.5); font-size: 13px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.2);">📷<br/>No media available</div>';
    }

    const isVid = type === "video" || isVideoUrl(url);

    if (isVid) {
      const videoId = `camera-video-${Date.now()}`;
      const loaderId = `video-loading-${Date.now()}`;
      return `
        <div style="position: relative; width: 100%; padding-bottom: 56.25%; background: #000; border-radius: 8px; overflow: hidden; margin-bottom: 12px;">
          <video 
            id="${videoId}"
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain;"
            autoplay
            loop
            muted
            playsinline
            onloadeddata="this.style.opacity='1'; const loader = document.getElementById('${loaderId}'); if(loader) loader.style.display='none';"
            onerror="this.parentElement.innerHTML='<div style=\\'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.6); text-align: center; padding: 20px;\\'>⚠️<br/>Video unavailable<br/><span style=\\'font-size: 11px;\\'>Stream may be offline</span></div>';"
          >
            <source src="${url}" type="${url.includes(".m3u8") ? "application/x-mpegURL" : url.includes(".webm") ? "video/webm" : url.includes(".ogg") ? "video/ogg" : "video/mp4"}">
            Your browser does not support video playback.
          </video>
          <div id="${loaderId}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.7); font-size: 12px;">
            <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(79, 184, 255, 0.3); border-top-color: #4fb8ff; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 8px;"></div>
            <div>Loading video...</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button onclick="const vid = document.getElementById('${videoId}'); if(vid) { vid.paused ? vid.play() : vid.pause(); }" 
            style="flex: 1; padding: 6px 12px; background: rgba(79, 184, 255, 0.15); border: 1px solid rgba(79, 184, 255, 0.3); border-radius: 6px; color: #4fb8ff; cursor: pointer; font-size: 12px; transition: all 0.2s;"
            onmouseover="this.style.background='rgba(79, 184, 255, 0.25)';"
            onmouseout="this.style.background='rgba(79, 184, 255, 0.15)';">
            ⏯️ Play/Pause
          </button>
          <a href="${url}" target="_blank" 
            style="flex: 1; padding: 6px 12px; background: rgba(79, 184, 255, 0.15); border: 1px solid rgba(79, 184, 255, 0.3); border-radius: 6px; color: #4fb8ff; cursor: pointer; font-size: 12px; text-decoration: none; text-align: center; transition: all 0.2s; display: block;"
            onmouseover="this.style.background='rgba(79, 184, 255, 0.25)';"
            onmouseout="this.style.background='rgba(79, 184, 255, 0.15)';">
            🔗 Open Stream
          </a>
        </div>
      `;
    } else {
      const imgId = `camera-img-${Date.now()}`;
      const loaderId = `img-loading-${Date.now()}`;
      return `
        <div style="position: relative; width: 100%; padding-bottom: 56.25%; background: #000; border-radius: 8px; overflow: hidden; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
          <img 
            id="${imgId}"
            src="${url}" 
            alt="Camera view" 
            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity 0.3s;"
            onload="this.style.opacity='1'; const loader = document.getElementById('${loaderId}'); if(loader) loader.style.display='none';"
            onerror="this.parentElement.innerHTML='<div style=\\'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.6); text-align: center; padding: 20px;\\'>⚠️<br/>Image unavailable<br/><span style=\\'font-size: 11px;\\'>Camera may be offline</span></div>';"
          />
          <div id="${loaderId}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.7); font-size: 12px; text-align: center;">
            <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(79, 184, 255, 0.3); border-top-color: #4fb8ff; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 8px;"></div>
            <div>Loading image...</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 8px;">
          <button onclick="const img = document.getElementById('${imgId}'); if(img) { img.src = img.src.split('?')[0] + '?t=' + Date.now(); }" 
            style="flex: 1; padding: 6px 12px; background: rgba(79, 184, 255, 0.15); border: 1px solid rgba(79, 184, 255, 0.3); border-radius: 6px; color: #4fb8ff; cursor: pointer; font-size: 12px; transition: all 0.2s;"
            onmouseover="this.style.background='rgba(79, 184, 255, 0.25)';"
            onmouseout="this.style.background='rgba(79, 184, 255, 0.15)';">
            🔄 Refresh
          </button>
          <a href="${url}" target="_blank" 
            style="flex: 1; padding: 6px 12px; background: rgba(79, 184, 255, 0.15); border: 1px solid rgba(79, 184, 255, 0.3); border-radius: 6px; color: #4fb8ff; cursor: pointer; font-size: 12px; text-decoration: none; text-align: center; transition: all 0.2s; display: block;"
            onmouseover="this.style.background='rgba(79, 184, 255, 0.25)';"
            onmouseout="this.style.background='rgba(79, 184, 255, 0.15)';">
            🖼️ Full Size
          </a>
        </div>
      `;
    }
  };

  const mediaContent = buildMediaContent(activeMediaUrl, activeMediaType);

  popupContent.innerHTML = `
    <div style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
      <h3 style="margin: 0 0 6px 0; font-size: 15px; font-weight: 600; color: #f7f9ff; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">📹</span>
        ${name}
      </h3>
      <div style="font-size: 12px; color: rgba(180, 189, 210, 0.8);">
        <span style="display: inline-block; padding: 2px 8px; background: rgba(79, 184, 255, 0.15); border-radius: 4px; font-weight: 500;">
          ${state}
        </span>
        <span style="margin-left: 8px; opacity: 0.6;">
          ${coordinates[1].toFixed(4)}°, ${coordinates[0].toFixed(4)}°
        </span>
      </div>
    </div>
    ${mediaToggle}
    <div id="camera-media-container">
      ${mediaContent}
    </div>
  `;

  // Create and show popup with custom styling
  cameraPopup = new maplibregl.Popup({
    closeButton: true,
    closeOnClick: false,
    maxWidth: "420px",
    className: "camera-popup-dark",
  })
    .setLngLat(coordinates)
    .setDOMContent(popupContent)
    .addTo(mapInstance);

  // Store media URLs for toggle function
  if (hasBoth) {
    popupContent._cameraVideoUrl = videoUrl;
    popupContent._cameraImageUrl = imageUrl;
  }

  // Handle HLS video streams if available
  if (isVideo && activeMediaUrl.includes(".m3u8")) {
    const videoElement = popupContent.querySelector("video");
    if (videoElement && window.Hls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(activeMediaUrl);
      hls.attachMedia(videoElement);
    } else if (
      videoElement &&
      videoElement.canPlayType("application/vnd.apple.mpegurl")
    ) {
      // Native HLS support (Safari)
      videoElement.src = activeMediaUrl;
    }
  }
}

// Helper function to switch between image and video in camera popup
function switchCameraMedia(type, videoUrl, imageUrl) {
  const container = document.getElementById("camera-media-container");
  if (!container) return;

  const url = type === "video" ? videoUrl : imageUrl;

  // Update toggle button styles
  const videoBtn = document.getElementById("camera-toggle-video");
  const imageBtn = document.getElementById("camera-toggle-image");

  if (type === "video") {
    if (videoBtn) {
      videoBtn.style.background = "rgba(79, 184, 255, 0.25)";
      videoBtn.style.borderColor = "rgba(79, 184, 255, 0.4)";
      videoBtn.style.color = "#4fb8ff";
    }
    if (imageBtn) {
      imageBtn.style.background = "rgba(255, 255, 255, 0.05)";
      imageBtn.style.borderColor = "rgba(255, 255, 255, 0.1)";
      imageBtn.style.color = "rgba(255, 255, 255, 0.5)";
    }
  } else {
    if (imageBtn) {
      imageBtn.style.background = "rgba(79, 184, 255, 0.25)";
      imageBtn.style.borderColor = "rgba(79, 184, 255, 0.4)";
      imageBtn.style.color = "#4fb8ff";
    }
    if (videoBtn) {
      videoBtn.style.background = "rgba(255, 255, 255, 0.05)";
      videoBtn.style.borderColor = "rgba(255, 255, 255, 0.1)";
      videoBtn.style.color = "rgba(255, 255, 255, 0.5)";
    }
  }

  // Build new media content
  const isVid = type === "video" || isVideoUrl(url);

  if (isVid) {
    const videoId = `camera-video-${Date.now()}`;
    const loaderId = `video-loading-${Date.now()}`;
    container.innerHTML = `
      <div style="position: relative; width: 100%; padding-bottom: 56.25%; background: #000; border-radius: 8px; overflow: hidden; margin-bottom: 12px;">
        <video 
          id="${videoId}"
          style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain;"
          autoplay
          loop
          muted
          playsinline
          onloadeddata="this.style.opacity='1'; const loader = document.getElementById('${loaderId}'); if(loader) loader.style.display='none';"
          onerror="this.parentElement.innerHTML='<div style=\\'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.6); text-align: center; padding: 20px;\\'>⚠️<br/>Video unavailable<br/><span style=\\'font-size: 11px;\\'>Stream may be offline</span></div>';"
        >
          <source src="${url}" type="${url.includes(".m3u8") ? "application/x-mpegURL" : url.includes(".webm") ? "video/webm" : "video/mp4"}">
        </video>
        <div id="${loaderId}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.7); font-size: 12px; text-align: center;">
          <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(79, 184, 255, 0.3); border-top-color: #4fb8ff; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 8px;"></div>
          <div>Loading video...</div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="const vid = document.getElementById('${videoId}'); if(vid) { vid.paused ? vid.play() : vid.pause(); }" 
          style="flex: 1; padding: 6px 12px; background: rgba(79, 184, 255, 0.15); border: 1px solid rgba(79, 184, 255, 0.3); border-radius: 6px; color: #4fb8ff; cursor: pointer; font-size: 12px;"
          onmouseover="this.style.background='rgba(79, 184, 255, 0.25)';"
          onmouseout="this.style.background='rgba(79, 184, 255, 0.15)';">
          ⏯️ Play/Pause
        </button>
        <a href="${url}" target="_blank" 
          style="flex: 1; padding: 6px 12px; background: rgba(79, 184, 255, 0.15); border: 1px solid rgba(79, 184, 255, 0.3); border-radius: 6px; color: #4fb8ff; text-decoration: none; text-align: center; display: block;"
          onmouseover="this.style.background='rgba(79, 184, 255, 0.25)';"
          onmouseout="this.style.background='rgba(79, 184, 255, 0.15)';">
          🔗 Open Stream
        </a>
      </div>
    `;

    // Handle HLS
    if (url.includes(".m3u8")) {
      const videoElement = document.getElementById(videoId);
      if (videoElement && window.Hls && Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(url);
        hls.attachMedia(videoElement);
      } else if (
        videoElement &&
        videoElement.canPlayType("application/vnd.apple.mpegurl")
      ) {
        videoElement.src = url;
      }
    }
  } else {
    const imgId = `camera-img-${Date.now()}`;
    const loaderId = `img-loading-${Date.now()}`;
    container.innerHTML = `
      <div style="position: relative; width: 100%; padding-bottom: 56.25%; background: #000; border-radius: 8px; overflow: hidden; margin-bottom: 12px; border: 1px solid rgba(255, 255, 255, 0.1);">
        <img 
          id="${imgId}"
          src="${url}" 
          alt="Camera view" 
          style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0; transition: opacity 0.3s;"
          onload="this.style.opacity='1'; const loader = document.getElementById('${loaderId}'); if(loader) loader.style.display='none';"
          onerror="this.parentElement.innerHTML='<div style=\\'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.6); text-align: center; padding: 20px;\\'>⚠️<br/>Image unavailable<br/><span style=\\'font-size: 11px;\\'>Camera may be offline</span></div>';"
        />
        <div id="${loaderId}" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: rgba(255,255,255,0.7); font-size: 12px; text-align: center;">
          <div style="display: inline-block; width: 20px; height: 20px; border: 2px solid rgba(79, 184, 255, 0.3); border-top-color: #4fb8ff; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 8px;"></div>
          <div>Loading image...</div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button onclick="const img = document.getElementById('${imgId}'); if(img) { img.src = img.src.split('?')[0] + '?t=' + Date.now(); }" 
          style="flex: 1; padding: 6px 12px; background: rgba(79, 184, 255, 0.15); border: 1px solid rgba(79, 184, 255, 0.3); border-radius: 6px; color: #4fb8ff; cursor: pointer; font-size: 12px;"
          onmouseover="this.style.background='rgba(79, 184, 255, 0.25)';"
          onmouseout="this.style.background='rgba(79, 184, 255, 0.15)';">
          🔄 Refresh
        </button>
        <a href="${url}" target="_blank" 
          style="flex: 1; padding: 6px 12px; background: rgba(79, 184, 255, 0.15); border: 1px solid rgba(79, 184, 255, 0.3); border-radius: 6px; color: #4fb8ff; text-decoration: none; text-align: center; display: block;"
          onmouseover="this.style.background='rgba(79, 184, 255, 0.25)';"
          onmouseout="this.style.background='rgba(79, 184, 255, 0.15)';">
          🖼️ Full Size
        </a>
      </div>
    `;
  }
}

function toggleCameras(enabled) {
  camerasEnabled = enabled;

  if (!mapInstance) return;

  if (enabled && !camerasData) {
    // Load cameras data if not already loaded
    loadCameras().then((data) => {
      camerasData = data;
      initCameraLayer();
    });
  } else if (mapInstance.getLayer("camera-markers")) {
    // Toggle visibility
    mapInstance.setLayoutProperty(
      "camera-markers",
      "visibility",
      enabled ? "visible" : "none",
    );
    if (mapInstance.getLayer("camera-icons")) {
      mapInstance.setLayoutProperty(
        "camera-icons",
        "visibility",
        enabled ? "visible" : "none",
      );
    }

    // Close popup if disabling
    if (!enabled && cameraPopup) {
      cameraPopup.remove();
      cameraPopup = null;
    }
  }
}

function handleMapClick(e) {
  // Don't close alert info box if clicking on it
  if (e.originalEvent && e.originalEvent.target) {
    const target = e.originalEvent.target;
    if (target.closest && target.closest(".alert-info-box")) {
      return;
    }
  }

  const features = mapInstance.queryRenderedFeatures(e.point, {
    layers: ["radar-sites-layer"],
  });

  if (features && features.length > 0) {
    return;
  }

  const alertsInArea = getAlertsAtPoint(e.lngLat);

  showCoordinateMarker(e.lngLat);

  if (alertsInArea.length > 0) {
    showAlertDropdown(e.point, alertsInArea, e.lngLat);
  } else {
    showCoordinatePrompt(e.point, e.lngLat);
  }
}

function handleMapPointerDown(e) {
  if (e.originalEvent && e.originalEvent.target) {
    const target = e.originalEvent.target;
    if (
      target.closest &&
      target.closest(
        ".alert-dropdown, #alert-detail, .coord-copy-card, .alert-info-box",
      )
    ) {
      return;
    }
  }

  cancelMapLongPress();

  const features = mapInstance.queryRenderedFeatures(e.point, {
    layers: ["radar-sites-layer"],
  });

  if (features && features.length > 0) {
    return;
  }

  const alertsInArea = getAlertsAtPoint(e.lngLat);

  if (alertsInArea.length > 0) {
    showCoordinateMarker(e.lngLat);
    showAlertDropdown(e.point, alertsInArea, e.lngLat);
    return;
  }

  longPressStartPoint = e.point;
  longPressTimer = setTimeout(() => handleMapLongPress(e), LONG_PRESS_MS);
}

function handleMapPointerMove(e) {
  if (!longPressStartPoint) return;
  const dx = e.point.x - longPressStartPoint.x;
  const dy = e.point.y - longPressStartPoint.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > LONG_PRESS_MOVE_TOLERANCE) {
    cancelMapLongPress();
  }
}

function cancelMapLongPress() {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  longPressStartPoint = null;
}

function handleMapLongPress(e) {
  if (!longPressTimer) return;
  longPressTimer = null;
  longPressStartPoint = null;
  handleMapClick(e);
}

function formatLngLat(lngLat) {
  return `${lngLat.lng.toFixed(4)}, ${lngLat.lat.toFixed(4)}`;
}

function copyCoordinatesToClipboard(lngLat) {
  const text = `${lngLat.lat.toFixed(6)}, ${lngLat.lng.toFixed(6)}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch((err) => {
      console.error("Clipboard write failed", err);
    });
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
  } catch (err) {
    console.error("Clipboard copy failed", err);
  }
  document.body.removeChild(textarea);
}

function ensureCoordPromptStyles() {
  if (document.getElementById("coord-prompt-style")) return;
  const style = document.createElement("style");
  style.id = "coord-prompt-style";
  style.textContent = `
    .coord-btn {
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(8,12,20,0.8);
      color: #d7dff2;
      border-radius: 12px;
      padding: 8px 14px;
      cursor: pointer;
      transition: border 0.2s ease, background 0.2s ease, transform 0.2s ease;
      font-weight: 500;
      letter-spacing: 0.02em;
    }
    .coord-btn.primary {
      background: linear-gradient(120deg, #42c9ff, #2f7dff);
      border-color: rgba(66,201,255,0.4);
      color: #04121f;
      box-shadow: 0 12px 26px rgba(22,33,66,0.55);
    }
    .coord-btn.ghost {
      background: transparent;
      color: #939ab7;
    }
    .coord-btn:hover { transform: translateY(-1px); border-color: rgba(255,255,255,0.2); }
    .coord-btn:active { transform: translateY(0); }
  `;
  document.head.appendChild(style);
}

function showCoordinateMarker(lngLat) {
  if (!mapInstance) return;

  if (!coordinatePromptMarker) {
    const markerEl = document.createElement("div");
    markerEl.style.width = "16px";
    markerEl.style.height = "16px";
    markerEl.style.borderRadius = "50%";
    markerEl.style.border = "2px solid #fff";
    markerEl.style.boxShadow = "0 0 12px rgba(0,0,0,0.6)";
    markerEl.style.background = "#0f172a";
    markerEl.style.position = "relative";

    const inner = document.createElement("div");
    inner.style.position = "absolute";
    inner.style.top = "50%";
    inner.style.left = "50%";
    inner.style.transform = "translate(-50%, -50%)";
    inner.style.width = "6px";
    inner.style.height = "6px";
    inner.style.borderRadius = "50%";
    inner.style.background = "#38bdf8";
    inner.style.boxShadow = "0 0 10px rgba(56,189,248,0.8)";
    markerEl.appendChild(inner);

    coordinatePromptMarker = new maplibregl.Marker({
      element: markerEl,
      anchor: "center",
    });
  }

  coordinatePromptMarker.setLngLat(lngLat).addTo(mapInstance);
}

function showCoordinatePrompt(screenPoint, lngLat) {
  ensureCoordPromptStyles();

  if (coordinatePromptCard) {
    coordinatePromptCard.remove();
    coordinatePromptCard = null;
  }

  const existingDropdown = document.getElementById("alert-dropdown");
  if (existingDropdown) existingDropdown.remove();

  const card = document.createElement("div");
  card.className = "coord-copy-card";
  Object.assign(card.style, {
    position: "fixed",
    left: `${screenPoint.x + 12}px`,
    top: `${screenPoint.y - 12}px`,
    transform: "translate(-35%, -110%)",
    background: "rgba(6, 9, 16, 0.96)",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 24px 48px rgba(3,5,10,0.65)",
    borderRadius: "18px",
    padding: "18px",
    color: "#f4f6ff",
    zIndex: 12000,
    minWidth: "240px",
    backdropFilter: "blur(18px)",
    fontFamily: "'Space Grotesk', 'IBM Plex Sans', sans-serif",
  });

  card.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:14px;">
      <span style="font-size:11px; letter-spacing:0.25em; color:#6c7388;">LAT / LON</span>
      <strong style="font-size:1rem; font-weight:600;">${formatLngLat(
        lngLat,
      )}</strong>
      <span style="font-size:12px; color:#8d93a5;">Long-press anywhere to drop a marker.</span>
    </div>
    <div style="display:flex; gap:10px; justify-content:flex-end;">
      <button class="coord-btn ghost">No</button>
      <button class="coord-btn primary">Copy</button>
    </div>
  `;

  document.body.appendChild(card);
  coordinatePromptCard = card;

  const [noBtn, yesBtn] = card.querySelectorAll(".coord-btn");
  noBtn.onclick = () => {
    card.remove();
    coordinatePromptCard = null;
  };
  yesBtn.onclick = () => {
    copyCoordinatesToClipboard(lngLat);
    card.remove();
    coordinatePromptCard = null;
  };
}

function ensureAlertGeometry(alert) {
  if (!alert) return null;
  if (alert.areaGeometry) return alert.areaGeometry;

  if (alert.polygon?.coordinates?.length) {
    const normalized = {
      type: "Polygon",
      coordinates: alert.polygon.coordinates.map((ring) =>
        ring
          .map((coord) => {
            const fixed = [coord[1], coord[0]];
            return isValidCoordinate(fixed) ? fixed : null;
          })
          .filter(Boolean),
      ),
    };

    if (
      normalized.coordinates.length > 0 &&
      normalized.coordinates[0].length >= 3
    ) {
      alert.areaGeometry = normalized;
      return normalized;
    }
  }

  return null;
}

function getAlertsAtPoint(lngLat) {
  if (!lngLat || !turf) return [];
  if (!activeAlerts || activeAlerts.size === 0) return [];

  const pointFeature = turf.point([lngLat.lng, lngLat.lat]);
  const alertsInArea = [];

  activeAlerts.forEach((alert) => {
    const geometry = ensureAlertGeometry(alert);
    if (!geometry) return;

    try {
      if (
        turf.booleanPointInPolygon(pointFeature, {
          type: "Feature",
          geometry,
        })
      ) {
        alertsInArea.push(alert);
      }
    } catch (error) {
      console.error("Error checking point in alert geometry:", error);
    }
  });

  return alertsInArea;
}

function findClosestRadarSites(lngLat, count = 2) {
  if (!lngLat || radarSitesCache.length === 0 || !turf) return [];

  const targetPoint = turf.point([lngLat.lng, lngLat.lat]);

  return radarSitesCache
    .map((site) => {
      const sitePoint = turf.point([site.longitude, site.latitude]);
      const distance = turf.distance(targetPoint, sitePoint, {
        units: "miles",
      });
      return { site, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
}

function showAlertDropdown(point, alerts, clickedLngLat = null) {
  const existing = document.getElementById("alert-dropdown");
  if (existing) existing.remove();

  ensureCoordPromptStyles();

  const dropdown = document.createElement("div");
  dropdown.id = "alert-dropdown";
  dropdown.className = "alert-dropdown";

  Object.assign(dropdown.style, {
    position: "fixed",
    background: "rgba(5, 8, 14, 0.97)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "20px",
    boxShadow: "0 30px 60px rgba(2,4,10,0.6)",
    width: "360px",
    maxHeight: "520px",
    overflowY: "auto",
    zIndex: "10000",
    padding: "0",
    color: "#f6f8ff",
    fontFamily: "'Space Grotesk', 'IBM Plex Sans', sans-serif",
    animation: "dropdownFade 0.25s ease",
    backdropFilter: "blur(24px)",
  });

  dropdown.style.top = "24px";
  dropdown.style.right = "24px";

  const alertCountText = `${alerts.length} alert${
    alerts.length === 1 ? "" : "s"
  } in this area`;
  const timestampLabel = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const closestRadarSites = clickedLngLat
    ? findClosestRadarSites(clickedLngLat, 2)
    : [];

  let outsideClickHandler = null;

  const clearFlashingSelection = () => {
    if (!selectedAlert) return;
    stopAlertFlashing(selectedAlert);
    selectedAlert = null;
  };

  const closeDropdown = (preserveSelection = false) => {
    if (!dropdown.isConnected) return;
    dropdown.remove();
    if (outsideClickHandler) {
      document.removeEventListener("click", outsideClickHandler);
      outsideClickHandler = null;
    }
    if (!preserveSelection) {
      clearFlashingSelection();
    }
  };

  const header = document.createElement("div");
  Object.assign(header.style, {
    padding: "20px 24px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    borderRadius: "20px 20px 0 0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
  });

  header.innerHTML = `
    <div style="flex:1;">
      <p style="margin:0; font-size:0.75rem; letter-spacing:0.2em; color:#6f768b;">Point sample</p>
      <h3 style="margin:6px 0 0; font-weight:600; font-size:1.05rem;">${alertCountText}</h3>
      <span style="font-size:0.8rem; color:#8d93a5;">${timestampLabel} local</span>
    </div>
    <button style="background: rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:50%; width:36px; height:36px; color:#f6f8ff; font-size:1rem; cursor:pointer;">×</button>
  `;
  dropdown.appendChild(header);

  header.querySelector("button").onclick = () => closeDropdown();

  if (closestRadarSites.length > 0) {
    const radarSection = document.createElement("div");
    Object.assign(radarSection.style, {
      padding: "14px 22px 6px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      background: "rgba(255,255,255,0.01)",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
    });

    radarSection.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between;">
        <p style="margin:0; font-size:0.7rem; letter-spacing:0.3em; color:#6f768b;">CLOSEST RADAR SITES</p>
        <span style="font-size:0.75rem; color:#8d93a5;">Top ${
          closestRadarSites.length
        }</span>
      </div>
      ${closestRadarSites
        .map(
          ({ site, distance }) => `
            <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.04); border-radius:12px; padding:10px 12px;">
              <div>
                <strong style="display:block; font-size:0.95rem; color:#f6f8ff;">K${
                  site.id
                }</strong>
                <span style="font-size:0.8rem; color:#8d93a5;">${
                  site.name
                }</span>
              </div>
              <span style="font-size:0.85rem; color:#9ba3bd;">${distance.toFixed(
                1,
              )} mi</span>
            </div>
          `,
        )
        .join("")}
    `;

    dropdown.appendChild(radarSection);
  }

  if (clickedLngLat) {
    const coordBlock = document.createElement("div");
    Object.assign(coordBlock.style, {
      padding: "16px 22px",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      background: "rgba(255,255,255,0.01)",
    });

    coordBlock.innerHTML = `
      <div>
        <p style="margin:0; font-size:0.75rem; letter-spacing:0.2em; color:#6f768b;">Map Point</p>
        <strong style="font-size:0.95rem;">${formatLngLat(
          clickedLngLat,
        )}</strong>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="coord-btn ghost">Skip</button>
        <button class="coord-btn primary">Copy</button>
      </div>
    `;

    dropdown.appendChild(coordBlock);

    const [noBtn, yesBtn] = coordBlock.querySelectorAll(".coord-btn");
    noBtn.onclick = () => coordBlock.remove();
    yesBtn.onclick = () => {
      copyCoordinatesToClipboard(clickedLngLat);
      coordBlock.remove();
    };
  }

  const alertsList = document.createElement("div");
  alertsList.style.padding = "12px";
  alertsList.style.display = "flex";
  alertsList.style.flexDirection = "column";
  alertsList.style.gap = "8px";

  if (alerts.length === 0) {
    const emptyState = document.createElement("div");
    Object.assign(emptyState.style, {
      padding: "20px",
      borderRadius: "14px",
      border: "1px solid rgba(255,255,255,0.05)",
      background: "rgba(255,255,255,0.01)",
      color: "#9ba3bd",
      fontSize: "0.9rem",
      textAlign: "center",
    });
    emptyState.textContent = "No active alerts at this point.";
    alertsList.appendChild(emptyState);
  }

  alerts.forEach((alert) => {
    const item = document.createElement("div");
    item.className = "alert-item-modern";
    const color = getAlertColor(alert);
    const hasCounties = alert.counties && alert.counties.length;
    const countyPrimary = hasCounties ? alert.counties[0] : "Area unspecified";
    const countySuffix =
      hasCounties && alert.counties.length > 1
        ? ` +${alert.counties.length - 1} more`
        : "";

    Object.assign(item.style, {
      padding: "16px 18px",
      borderRadius: "14px",
      cursor: "pointer",
      background: "rgba(255, 255, 255, 0.02)",
      border: "1px solid rgba(255, 255, 255, 0.05)",
      transition: "border 0.2s ease, transform 0.2s ease, background 0.2s ease",
    });

    const content = document.createElement("div");
    content.innerHTML = `
      <div style="display:flex; align-items:flex-start; gap:12px;">
        <div style="width:10px; height:10px; border-radius:50%; margin-top:6px; background:${color}; box-shadow:0 0 12px ${color}33;"></div>
        <div style="flex:1;">
          <p style="margin:0; font-size:0.75rem; letter-spacing:0.2em; color:#6f768b;">${
            alert.eventCode || "ALERT"
          }</p>
          <strong style="display:block; margin:6px 0; font-size:1rem;">${
            alert.eventName
          }</strong>
          <span style="font-size:0.85rem; color:#a1a7bb;">${countyPrimary}${countySuffix}</span>
        </div>
        <span style="font-size:1.2rem; color:#5f6578;">→</span>
      </div>
    `;
    item.appendChild(content);

    item.addEventListener("mouseenter", () => {
      item.style.background = "rgba(255, 255, 255, 0.05)";
      item.style.borderColor = color;
      item.style.transform = "translateX(4px)";
    });

    item.addEventListener("mouseleave", () => {
      item.style.background = "rgba(255, 255, 255, 0.02)";
      item.style.borderColor = "rgba(255, 255, 255, 0.05)";
      item.style.transform = "translateX(0)";
    });

    item.onclick = () => {
      const previousSelection = selectedAlert;
      selectedAlert = alert;
      stopAlertFlashing(previousSelection);
      startAlertFlashing();
      closeDropdown(true);
      showDetailedAlert(alert);
    };

    alertsList.appendChild(item);
  });

  dropdown.appendChild(alertsList);
  document.body.appendChild(dropdown);

  outsideClickHandler = (e) => {
    if (
      !dropdown.contains(e.target) &&
      !e.target.closest(".alerts-toggle-btn")
    ) {
      closeDropdown();
    }
  };

  setTimeout(() => {
    document.addEventListener("click", outsideClickHandler);
  }, 0);

  if (!document.getElementById("alert-dropdown-styles")) {
    const style = document.createElement("style");
    style.id = "alert-dropdown-styles";
    style.textContent = `
      @keyframes dropdownFade {
        from { opacity: 0; transform: translateY(-12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .alert-dropdown::-webkit-scrollbar {
        width: 6px;
      }
      .alert-dropdown::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.08);
        border-radius: 999px;
      }
      .alert-dropdown::-webkit-scrollbar-track {
        background: transparent;
      }
    `;
    document.head.appendChild(style);
  }
}

function showDetailedAlert(alert) {
  try {
    const polygon = alert.polygon?.coordinates?.length
      ? {
          type: "Polygon",
          coordinates: alert.polygon.coordinates.map((ring) =>
            ring.map(([lat, lng]) => [lng, lat]),
          ),
        }
      : null;

    if (polygon) {
      const bbox = turf.bbox(polygon);
      mapInstance.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 40, duration: 900, maxZoom: 11 },
      );
    }

    const color = getAlertColor(alert);
    const icon = getAlertIcon(alert.eventCode);
    const issued = alert.effective ? formatDate(alert.effective) : "N/A";
    const expires = alert.expires ? formatDate(alert.expires) : "N/A";
    const expiringSoon = isExpiringSoon(alert.expires);

    const existing = document.getElementById("alert-detail");
    if (existing) existing.remove();

    const panel = document.createElement("div");
    panel.id = "alert-detail";
    panel.className = "alert-cinematic";

    // 🔑 Accent variables (THIS is the magic)
    panel.style.setProperty("--accent", color);
    panel.style.setProperty("--accent-glass", `${color}22`);
    panel.style.setProperty("--accent-soft", `${color}14`);

    panel.innerHTML = `
      <header class="alert-cinematic__header">
        <div class="alert-cinematic__badge">
          <span>${icon}</span>
          <small>${alert.eventCode || "ALERT"}</small>
        </div>

        <div class="alert-cinematic__title">
          <p>${alert.office || "National Weather Service"}</p>
          <h2>${alert.eventName || "Weather Alert"}</h2>
          <span>
            ${alert.counties?.slice(0, 2).join(", ") || "Multiple areas"}
            ${
              alert.counties?.length > 2 ? ` +${alert.counties.length - 2}` : ""
            }
          </span>
        </div>

        <button class="alert-cinematic__close">×</button>
      </header>

      <section class="alert-cinematic__meta">
        <article>
          <p>Issued</p>
          <strong>${issued}</strong>
        </article>
        <article class="${expiringSoon ? "alert-soon" : ""}">
          <p>Expires</p>
          <strong>${expires}</strong>
        </article>
        <article>
          <p>Severity</p>
          <strong>${alert.severity || "Unknown"}</strong>
        </article>
      </section>

      <section class="alert-cinematic__body">
        <div>
          <h4>Threats & Impacts</h4>
          ${buildThreatsList(alert)}
        </div>

        <div>
          <h4>Affected Areas</h4>
          <p>${alert.counties?.join(", ") || "Not specified"}</p>
        </div>

        <div>
          <h4>Summary</h4>
          <p>${
            alert.headline || alert.description || "Details unavailable."
          }</p>
        </div>
      </section>

      <footer class="alert-cinematic__actions">
        <button class="ghost">Focus Polygon</button>
        <button class="primary">View Full Alert</button>
      </footer>
    `;

    document.body.appendChild(panel);

    if (!document.getElementById("alert-cinematic-style")) {
      const style = document.createElement("style");
      style.id = "alert-cinematic-style";
      style.textContent = `
        @keyframes panelEnter {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .alert-cinematic {
          position: fixed;
          top: 20px;
          left: 23%;
          width: 460px;
          max-height: calc(100vh - 40px);
          background:
            linear-gradient(180deg, var(--accent-soft), transparent 40%),
            rgba(10,15,30,0.92);
          backdrop-filter: blur(18px) saturate(130%);
          border: 1px solid rgba(255,255,255,0.08);
          border-left: 4px solid var(--accent);
          border-radius: 18px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.55);
          color: #e5e7eb;
          animation: panelEnter 0.35s ease-out;
          display: flex;
          flex-direction: column;
          z-index: 1300;
        }

        .alert-cinematic__header {
          display: flex;
          gap: 16px;
          padding: 20px 22px;
          background:
            linear-gradient(90deg, var(--accent-glass), transparent 65%),
            rgba(15,23,42,0.75);
          border-bottom: 1px solid rgba(255,255,255,0.06);
          align-items: center;
        }

        .alert-cinematic__badge {
          width: 54px;
          height: 54px;
          border-radius: 14px;
          background:
            linear-gradient(145deg, var(--accent-glass), rgba(255,255,255,0.03));
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .alert-cinematic__badge small {
          font-size: 0.6rem;
          opacity: 0.7;
          letter-spacing: 0.12em;
        }

        .alert-cinematic__title p {
          margin: 0;
          font-size: 0.7rem;
          letter-spacing: 0.18em;
          opacity: 0.65;
          text-transform: uppercase;
        }

        .alert-cinematic__title h2 {
          margin: 6px 0;
          font-size: 1.35rem;
          font-weight: 600;
        }

        .alert-cinematic__title span {
          font-size: 0.85rem;
          opacity: 0.75;
        }

        .alert-cinematic__close {
          margin-left: auto;
          background: none;
          border: none;
          color: #9ca3af;
          font-size: 1.3rem;
          cursor: pointer;
        }

        .alert-cinematic__meta {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }

        .alert-cinematic__meta article {
          background: rgba(255,255,255,0.03);
          border-radius: 12px;
          padding: 12px;
          text-align: center;
        }

        .alert-cinematic__meta p {
          font-size: 0.6rem;
          letter-spacing: 0.18em;
          opacity: 0.6;
          text-transform: uppercase;
          margin: 0;
        }

        .alert-cinematic__meta strong {
          display: block;
          margin-top: 6px;
          font-size: 0.95rem;
        }

        .alert-soon {
          border: 1px solid rgba(239,68,68,0.6);
        }

        .alert-cinematic__body {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          overflow-y: auto;
        }

        .alert-cinematic__body > div {
          background: rgba(255,255,255,0.025);
          border-radius: 14px;
          padding: 14px;
        }

        .alert-cinematic__body h4 {
          font-size: 0.65rem;
          letter-spacing: 0.18em;
          opacity: 0.7;
          text-transform: uppercase;
          margin-bottom: 6px;
        }

        .alert-cinematic__actions {
          display: flex;
          gap: 12px;
          padding: 16px 20px 20px;
        }

        .alert-cinematic__actions button {
          flex: 1;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: #e5e7eb;
          font-weight: 600;
          cursor: pointer;
        }

        .alert-cinematic__actions .primary {
          background: var(--accent);
          color: #020617;
          border: none;
        }
      `;
      document.head.appendChild(style);
    }

    panel.querySelector(".alert-cinematic__close").onclick = () =>
      panel.remove();

    panel.querySelector(".ghost").onclick = () => {
      if (!polygon) return;
      const bbox = turf.bbox(polygon);
      mapInstance.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding: 40, duration: 800, maxZoom: 11 },
      );
    };

    panel.querySelector(".primary").onclick = () =>
      alert.rawText ? showFullAlertText(alert.rawText) : alert("No text.");
  } catch (err) {
    console.error("showDetailedAlert failed:", err);
  }
}

function buildThreatsList(alert) {
  const threats =
    alert.threats && Object.keys(alert.threats).length
      ? alert.threats
      : synthesizeThreats(alert);

  if (!threats || Object.keys(threats).length === 0) {
    // Provide useful fallback text from hazards/impact/precautionaryActions
    const parts = [];
    if (alert.hazards) parts.push(alert.hazards);
    if (alert.impact) parts.push(alert.impact);
    if (alert.precautionaryActions) parts.push(alert.precautionaryActions);
    if (parts.length > 0) {
      return `<p style="opacity: 0.9;">${parts.join(" — ")}</p>`;
    }
    return '<p style="opacity: 0.7;">No specific threat information available.</p>';
  }

  let html = '<ul style="margin: 0; padding-left: 20px; line-height: 1.8;">';

  if (threats.wind) {
    html += `<li><strong>💨 Wind:</strong> ${threats.wind}</li>`;
  }
  if (threats.hail) {
    html += `<li><strong>🧊 Hail:</strong> ${threats.hail}</li>`;
  }
  if (threats.tornado) {
    html += `<li><strong>🌪️ Tornado:</strong> ${threats.tornado}</li>`;
  }
  if (threats.tornadoDetection && !threats.tornado) {
    html += `<li><strong>🌪️ Detection:</strong> ${threats.tornadoDetection}</li>`;
  } else if (threats.tornadoDetection && threats.tornado) {
    html += `<li><strong>🌪️ Detection:</strong> ${threats.tornadoDetection}</li>`;
  }
  if (threats.tornadoDamageThreat) {
    html += `<li><strong>⚠️ Damage Threat:</strong> ${threats.tornadoDamageThreat}</li>`;
  }
  if (threats.flooding) {
    html += `<li><strong>🌊 Flooding:</strong> ${threats.flooding}</li>`;
  }
  if (threats.lightning) {
    html += `<li><strong>⚡ Lightning:</strong> ${threats.lightning}</li>`;
  }

  if (threats.hazards && !threats.hail && !threats.tornado && !threats.wind) {
    html += `<li><strong>⚠️ Hazards:</strong> ${threats.hazards}</li>`;
  }

  // Always show hazards/source if present but keep them subtle to avoid clutter
  if (threats.hazards && (threats.hail || threats.tornado || threats.wind)) {
    html += `<li style="opacity:0.92"><strong>⚠️ Hazards:</strong> ${threats.hazards}</li>`;
  }
  if (threats.source) {
    html += `<li style="opacity:0.85"><strong>📡 Source:</strong> ${threats.source}</li>`;
  }

  html += "</ul>";
  return html;
}

function isExpiringSoon(expiresDate) {
  if (!expiresDate) return false;
  const expires = new Date(expiresDate);
  const now = new Date();
  const hoursUntilExpiry = (expires - now) / (1000 * 60 * 60);
  return hoursUntilExpiry < 1 && hoursUntilExpiry > 0;
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(
        result[3],
        16,
      )}`
    : "255, 255, 255";
}

const styles = `

`;

const styleSheet = document.createElement("style");
styleSheet.textContent = styles;
document.head.appendChild(styleSheet);

function getAlertName(alert) {
  const normalizedAlert = applyRealAlertPresetRules(
    alert && typeof alert === "object" ? { ...alert } : alert,
  );

  // Get the full text content for enhanced detection
  const alertText =
    normalizedAlert.description ||
    normalizedAlert.text ||
    normalizedAlert.headline ||
    "";

  // Determine base event name
  let eventName =
    normalizedAlert.event ||
    normalizedAlert.eventName ||
    normalizedAlert.headline;

  if (!eventName && normalizedAlert.eventCode) {
    const codeNames = {
      "TO.W": "Tornado Warning",
      "SV.W": "Severe Thunderstorm Warning",
      "FF.W": "Flash Flood Warning",
      "FL.W": "Flood Warning",
      "WS.W": "Winter Storm Warning",
      "BZ.W": "Blizzard Warning",
    };
    eventName =
      codeNames[normalizedAlert.eventCode] || normalizedAlert.eventCode;
  }

  if (!eventName) {
    return "Weather Alert";
  }

  const threatObj = normalizedAlert.threats || {};
  const tornadoDetection = normalizeAlertValue(
    threatObj.tornadoDetection,
  ).toUpperCase();
  const tornadoDamageThreat = normalizeAlertValue(
    threatObj.tornadoDamageThreat,
  ).toUpperCase();
  const thunderstormDamageThreat = normalizeAlertValue(
    threatObj.thunderstormDamageThreat,
  ).toUpperCase();
  const flashFloodDamageThreat = normalizeAlertValue(
    threatObj.flashFloodDamageThreat,
  ).toUpperCase();
  const sourceText = normalizeAlertValue(normalizedAlert.source).toUpperCase();

  if (eventName.includes("Tornado Warning")) {
    if (tornadoDamageThreat === "CATASTROPHIC") {
      return "Tornado Emergency";
    }
    if (tornadoDamageThreat === "CONSIDERABLE") {
      return "PDS Tornado Warning";
    }
    if (sourceText.includes("RADAR CONFIRMED TORNADO")) {
      return "Radar Confirmed Tornado Warning";
    }
    if (sourceText.includes("SPOTTER")) {
      return "Spotter Confirmed Tornado Warning";
    }
    if (sourceText.includes("EMERGENCY MANAGEMENT")) {
      return "Emergency Mgmt Confirmed Tornado Warning";
    }
    if (sourceText.includes("LAW ENFORCEMENT")) {
      return "Law Enforcement Confirmed Tornado Warning";
    }
    if (sourceText.includes("PUBLIC CONFIRMED")) {
      return "Public Confirmed Tornado Warning";
    }
    if (
      tornadoDetection === "OBSERVED" ||
      sourceText.includes("CONFIRMED TORNADO")
    ) {
      return "Observed Tornado Warning";
    }
  }

  if (eventName.includes("Severe Thunderstorm Warning")) {
    if (thunderstormDamageThreat === "DESTRUCTIVE") {
      return "Destructive Severe Thunderstorm Warning";
    }
    if (thunderstormDamageThreat === "CONSIDERABLE") {
      return "Considerable Severe Thunderstorm Warning";
    }
  }

  if (eventName.includes("Flash Flood Warning")) {
    if (flashFloodDamageThreat === "CATASTROPHIC") {
      return "Flash Flood Emergency";
    }
    if (flashFloodDamageThreat === "CONSIDERABLE") {
      return "Considerable Flash Flood Warning";
    }
  }

  // Enhanced detection for Tornado Warnings
  if (eventName.includes("Tornado Warning")) {
    // Check TORNADO DAMAGE THREAT first (takes precedence)
    const tornadoDamageMatch = alertText.match(
      /TORNADO DAMAGE THREAT\.{3}(CONSIDERABLE|CATASTROPHIC)/i,
    );
    if (tornadoDamageMatch) {
      const threatLevel = tornadoDamageMatch[1].toUpperCase();
      if (threatLevel === "CATASTROPHIC") {
        console.log("🚨 [getAlertName] TORNADO EMERGENCY detected!");
        return "Tornado Emergency";
      } else if (threatLevel === "CONSIDERABLE") {
        console.log("⚠️ [getAlertName] PDS Tornado Warning detected");
        return "PDS Tornado Warning";
      }
    }
    // Only check for OBSERVED if no DAMAGE THREAT was found
    else if (/TORNADO\.{3}OBSERVED/i.test(alertText)) {
      console.log("👁️ [getAlertName] Observed Tornado Warning detected");
      return "Tornado Warning (Observed)";
    }
  }

  // Enhanced detection for Severe Thunderstorm Warnings
  if (eventName.includes("Severe Thunderstorm Warning")) {
    const tstormDamageMatch = alertText.match(
      /THUNDERSTORM DAMAGE THREAT\.{3}(CONSIDERABLE|DESTRUCTIVE)/i,
    );
    if (tstormDamageMatch) {
      const threatLevel = tstormDamageMatch[1].toUpperCase();
      if (threatLevel === "DESTRUCTIVE") {
        console.log(
          "💥 [getAlertName] Destructive Severe Thunderstorm Warning detected",
        );
        return "Destructive Severe Thunderstorm Warning";
      } else if (threatLevel === "CONSIDERABLE") {
        console.log(
          "⚡ [getAlertName] Considerable Severe Thunderstorm Warning detected",
        );
        return "Considerable Severe Thunderstorm Warning";
      }
    }
  }

  return eventName;
}

const DEFAULT_ALERT_NAME_COLORS = {
  "Tornado Warning": "#FF0000",
  "Tornado Warning (Observed)": "#FF0000",
  "Observed Tornado Warning": "#FF00FF",
  "Radar Confirmed Tornado Warning": "#FF00FF",
  "Spotter Confirmed Tornado Warning": "#FF00FF",
  "Emergency Mgmt Confirmed Tornado Warning": "#FF00FF",
  "Law Enforcement Confirmed Tornado Warning": "#FF00FF",
  "Public Confirmed Tornado Warning": "#FF00FF",
  "PDS Tornado Warning": "#FF00FF",
  "Tornado Emergency": "#850085",
  "Tornado Watch": "#8B0000",
  "Severe Thunderstorm Warning": "#FF8000",
  "Considerable Severe Thunderstorm Warning": "#FF6347",
  "Destructive Severe Thunderstorm Warning": "#FF4500",
  "Severe Thunderstorm Watch": "#DB7093",
  "Flash Flood Warning": "#228B22",
  "Flash Flood Emergency": "#8B0000",
  "Considerable Flash Flood Warning": "#32CD32",
  "Flood Warning": "#3CB371",
  "Flood Watch": "#66CDAA",
  "Flood Advisory": "#9ACD32",
  "Coastal Flood Warning": "#4682B4",
  "Coastal Flood Watch": "#87CEEB",
  "Coastal Flood Advisory": "#ADD8E6",
  "Winter Weather Advisory": "#7B68EE",
  "Winter Storm Warning": "#FF69B4",
  "Winter Storm Watch": "#6699CC",
  "Ice Storm Warning": "#8B008B",
  "Blizzard Warning": "#FF4500",
  "Snow Squall Warning": "#64B5F6",
  "Freezing Rain Advisory": "#008080",
  "Freezing Fog Advisory": "#008080",
  "Sleet Advisory": "#B0E0E6",
  "Lake Effect Snow Warning": "#4169E1",
  "Lake Effect Snow Advisory": "#87CEFA",
  "High Wind Warning": "#DAA520",
  "High Wind Watch": "#B8860B",
  "Wind Advisory": "#D2B48C",
  "Gale Warning": "#008B8B",
  "Storm Warning": "#483D8B",
  "Hurricane Force Wind Warning": "#8B0000",
  "Excessive Heat Warning": "#FFD700",
  "Heat Advisory": "#F0E68C",
  "Excessive Wind Chill Warning": "#ADD8E6",
  "Wind Chill Advisory": "#B0C4DE",
  "Freeze Warning": "#6A5ACD",
  "Hard Freeze Warning": "#483D8B",
  "Red Flag Warning": "#B22222",
  "Fire Weather Watch": "#CD5C5C",
  "High Surf Advisory": "#4682B4",
  "Rip Current Statement": "#1E90FF",
  "Small Craft Advisory": "#5F9EA0",
  "Dense Fog Advisory": "#708090",
  "Dust Advisory": "#BDB76B",
  "Dust Storm Warning": "#8B4513",
  "Air Quality Alert": "#A9A9A9",
  "Dense Smoke Advisory": "#696969",
  "Hurricane Warning": "#8B0000",
  "Hurricane Watch": "#DC143C",
  "Tropical Storm Warning": "#FF4500",
  "Tropical Storm Watch": "#FFA07A",
  "Tropical Depression": "#FFB6C1",
  "Storm Surge Warning": "#800000",
  "Storm Surge Watch": "#A52A2A",
  "Tsunami Warning": "#8B0000",
  "Tsunami Watch": "#DC143C",
  "Tsunami Advisory": "#FF4500",
  "Volcanic Ash Advisory": "#8B4513",
  "Special Weather Statement": "#FFE4B5",
  "Mesoscale Discussion": "#0066ff",
  "Hazardous Weather Outlook": "#808080",
  "Hydrologic Outlook": "#B0C4DE",
  "Beach Hazards Statement": "#F4A460",
};

function ensureAlertStyleConfig() {
  if (alertStyleConfig) return;

  const defaults = {};
  Object.keys(DEFAULT_ALERT_NAME_COLORS).forEach((name) => {
    defaults[name] = {
      color: DEFAULT_ALERT_NAME_COLORS[name],
      enabled: true,
    };
  });

  try {
    const raw = localStorage.getItem(ALERT_STYLE_STORAGE_KEY);
    if (!raw) {
      alertStyleConfig = defaults;
      return;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      alertStyleConfig = defaults;
      return;
    }

    alertStyleConfig = defaults;
    Object.entries(parsed).forEach(([eventName, style]) => {
      if (!eventName || !style || typeof style !== "object") return;
      const color =
        typeof style.color === "string" && style.color.trim()
          ? style.color
          : DEFAULT_ALERT_NAME_COLORS[eventName] || "#ffffff";
      const enabled = style.enabled !== false;
      alertStyleConfig[eventName] = { color, enabled };
    });
  } catch (error) {
    console.warn("Unable to restore alert style config:", error);
    alertStyleConfig = defaults;
  }
}

function saveAlertStyleConfig() {
  try {
    ensureAlertStyleConfig();
    localStorage.setItem(
      ALERT_STYLE_STORAGE_KEY,
      JSON.stringify(alertStyleConfig),
    );
  } catch (error) {
    console.warn("Unable to save alert style config:", error);
  }
}

function getAlertEventName(alertOrName) {
  return typeof alertOrName === "string"
    ? alertOrName
    : getAlertName(alertOrName);
}

function getAlertStyle(eventName) {
  ensureAlertStyleConfig();
  if (!alertStyleConfig[eventName]) {
    alertStyleConfig[eventName] = {
      color: DEFAULT_ALERT_NAME_COLORS[eventName] || "rgba(255, 255, 255, 0.9)",
      enabled: true,
    };
  }
  return alertStyleConfig[eventName];
}

function isAlertEnabled(alertOrName) {
  const eventName = getAlertEventName(alertOrName);
  return getAlertStyle(eventName).enabled !== false;
}

function getAlertColor(alert) {
  const eventName = getAlertEventName(alert);
  return getAlertStyle(eventName).color || "rgba(255, 255, 255, 0.9)";
}

function createAlertMarker(title, icon, color) {
  const el = document.createElement("div");
  el.className = "alert-marker";
  el.style.backgroundColor = color;
  el.style.color = "#fff";
  el.style.borderRadius = "50%";
  el.style.width = "30px";
  el.style.height = "30px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.fontSize = "18px";
  el.style.boxShadow = "0 0 10px rgba(0,0,0,0.3)";
  el.innerHTML = icon;
  el.title = title;
  return el;
}

function getBoundsFromPolygon(polygon) {
  let minLat = 90,
    maxLat = -90,
    minLng = 180,
    maxLng = -180;

  if (
    polygon.type === "Polygon" &&
    polygon.coordinates &&
    polygon.coordinates.length > 0
  ) {
    const coords = polygon.coordinates[0];

    for (const coord of coords) {
      const lng = coord[0];
      const lat = coord[1];

      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    }
  }

  return { minLat, maxLat, minLng, maxLng };
}

function addAlertCounties(alert) {
  if (!countiesData || !countiesData.features) {
    console.warn("Counties data not loaded yet");
    return;
  }

  const sameCodes = alert.geocode?.SAME || [];
  const ugcCodes = alert.ugc || alert.geocode?.UGC || [];

  if (sameCodes.length === 0 && ugcCodes.length === 0) {
    console.warn(`Alert ${alert.id} has no SAME or UGC codes`);
    return;
  }

  const matchingCounties = sameCodes
    .map((code) => countiesByGeoid.get(code))
    .filter(Boolean);

  if (matchingCounties.length === 0) {
    console.warn(`No matching counties found for alert ${alert.id}`);
    return;
  }

  const id = `alert-${alert.id}`;
  const color = getAlertColor(alert);

  if (mapInstance.getLayer(`${id}-fill`)) mapInstance.removeLayer(`${id}-fill`);
  if (mapInstance.getSource(id)) mapInstance.removeSource(id);

  const alertFeature = {
    type: "FeatureCollection",
    features: matchingCounties.map((county) => ({
      type: "Feature",
      geometry: county.geometry,
      properties: {
        id: id,
        eventCode: alert.eventCode,
      },
    })),
  };

  // Cache a center for closest-radar calculations without heavy polygon unions
  try {
    const center = turf.centroid(alertFeature);
    const [lon, lat] = center?.geometry?.coordinates || [];
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      alert.areaCenter = { lon, lat };
    }
  } catch (error) {
    console.warn(`Centroid calc failed for alert ${alert.id}:`, error);
  }

  mapInstance.addSource(id, {
    type: "geojson",
    data: alertFeature,
  });

  const radarExists = mapInstance.getLayer(radarLayerId);
  const firstLabelLayer = mapInstance
    .getStyle()
    .layers.find(
      (l) =>
        l.type === "symbol" ||
        (l.type === "line" &&
          (l.id.includes("Road") ||
            l.id.includes("Transit") ||
            l.id.includes("Path") ||
            l.id.includes("Railway"))),
    )?.id;

  if (radarExists) {
    mapInstance.addLayer(
      {
        id: `${id}-fill`,
        type: "fill",
        source: id,
        paint: {
          "fill-color": color,
          "fill-opacity": ALERT_OUTLINE_CONFIG.fillOpacity,
        },
      },
      radarLayerId,
    );
  } else if (firstLabelLayer) {
    mapInstance.addLayer(
      {
        id: `${id}-fill`,
        type: "fill",
        source: id,
        paint: {
          "fill-color": color,
          "fill-opacity": ALERT_OUTLINE_CONFIG.fillOpacity,
        },
      },
      firstLabelLayer,
    );
  } else {
    mapInstance.addLayer({
      id: `${id}-fill`,
      type: "fill",
      source: id,
      paint: {
        "fill-color": color,
        "fill-opacity": ALERT_OUTLINE_CONFIG.fillOpacity,
      },
    });
  }

  alert.mapLayerId = id;
  alert.isCountyBased = true;

  mapInstance.on("click", `${id}-fill`, (e) => handleAlertClick(e, alert));

  console.log(
    `✅ Added county-based alert ${alert.id} with ${matchingCounties.length} counties`,
  );
}

function addAlertMarker(alert, position) {
  return;
}
function showAlertDetails(alert) {
  selectedAlert = alert;

  const existing = document.getElementById("alert-details-panel");
  if (existing) existing.remove();

  const icon = getAlertIcon(alert.eventCode);
  const color = getAlertColor(alert);
  const issued = alert.effective ? formatDate(alert.effective) : "N/A";
  const expires = alert.expires ? formatDate(alert.expires) : "N/A";
  const expiringSoon = isExpiringSoon(alert.expires);

  const panel = document.createElement("div");
  panel.id = "alert-details-panel";
  panel.className = "alert-panel";

  panel.innerHTML = `
    <div class="alert-panel__header" style="--accent:${color}">
      <div class="alert-panel__badge">${icon}</div>
      <div class="alert-panel__title">
        <p class="eyebrow">${alert.eventCode || "ALERT"}</p>
        <h3>${alert.eventName || "Unknown Alert"}</h3>
        <small>${alert.office || "National Weather Service"}</small>
      </div>
      <button class="alert-panel__close" aria-label="Close">×</button>
    </div>

    <div class="alert-panel__body">
      <section class="stats">
        <article>
          <span>Issued</span>
          <strong>${issued}</strong>
        </article>
        <article class="${expiringSoon ? "danger" : ""}">
          <span>Expires</span>
          <strong>${expires}</strong>
        </article>
        <article>
          <span>Severity</span>
          <strong>${alert.severity || "Unknown"}</strong>
        </article>
      </section>

      <section class="details">
        <h4>Affected Areas</h4>
        <p>${
          alert.counties
            ? alert.counties.join(", ")
            : alert.zones?.join(", ") || "Not specified"
        }</p>
      </section>

      ${buildCompactThreatsList(alert)}

      <section class="details">
        <h4>Summary</h4>
        <p>${alert.headline || alert.description || "No summary available."}</p>
      </section>
    </div>

    <div class="alert-panel__footer">
      <button class="ghost-btn" id="focus-alert">Zoom to Polygon</button>
      <button class="solid-btn" id="view-full-alert">View Full Text</button>
    </div>
  `;

  document.body.appendChild(panel);

  panel.querySelector(".alert-panel__close").onclick = () => panel.remove();
  panel.querySelector("#view-full-alert").onclick = () => {
    if (alert.rawText) showFullAlertText(alert.rawText);
    else alert("Full alert text not available.");
  };
  panel.querySelector("#focus-alert").onclick = () => {
    showDetailedAlert(alert);
  };

  panel.style.top = "24px";
  panel.style.right = "24px";

  document.addEventListener(
    "click",
    function dismiss(e) {
      if (
        !panel.contains(e.target) &&
        !e.target.closest(".alert-item-modern")
      ) {
        panel.remove();
        document.removeEventListener("click", dismiss);
      }
    },
    { capture: true },
  );

  injectAlertPanelStyles();
}

function buildCompactThreatsList(alert) {
  if (!alert.threats) return "";

  const rows = [
    { key: "tornadoDetection", icon: "🌪️", label: "Tornado" },
    { key: "hailThreat", icon: "🧊", label: "Hail" },
    { key: "windThreat", icon: "💨", label: "Wind" },
    { key: "floodThreat", icon: "🌊", label: "Flood" },
  ]
    .filter(({ key }) => alert.threats[key])
    .map(
      ({ key, icon, label }) => `
      <li>
        <span>${icon}</span>
        <div>
          <strong>${label}</strong>
          <small>${alert.threats[key]}</small>
        </div>
      </li>`,
    );

  if (!rows.length) return "";

  return `
    <section class="details">
      <h4>Threats</h4>
      <ul class="threat-list">
        ${rows.join("")}
      </ul>
    </section>
  `;
}

let alertPanelStyleInjected = false;
function injectAlertPanelStyles() {
  if (alertPanelStyleInjected) return;
  alertPanelStyleInjected = true;

  const style = document.createElement("style");
  style.textContent = `
    .alert-panel {
      position: fixed;
      width: 360px;
      max-height: calc(100vh - 48px);
      background: rgba(8,12,24,0.92);
      backdrop-filter: blur(22px);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 24px;
      box-shadow: 0 25px 70px rgba(2,6,23,0.85);
      color: #f8fafc;
      font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont;
      display: flex;
      flex-direction: column;
      animation: panelSlideIn 0.35s cubic-bezier(0.16,0.68,0.43,0.99);
      z-index: 1100;
    }

    .alert-panel__header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 22px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: radial-gradient(circle at top right, color-mix(in srgb, var(--accent, #4ade80) 40%, transparent), transparent);
    }

    .alert-panel__badge {
      width: 58px;
      height: 58px;
      border-radius: 18px;
      background: rgba(255,255,255,0.08);
      display: grid;
      place-items: center;
      font-size: 30px;
      border: 1px solid rgba(255,255,255,0.15);
      box-shadow: 0 0 25px color-mix(in srgb, var(--accent, #4ade80) 35%, transparent);
      animation: pulseRing 2.2s ease-out infinite;
    }

    .alert-panel__title .eyebrow {
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.4em;
      font-size: 0.7rem;
      opacity: 0.65;
    }
    .alert-panel__title h3 {
      margin: 4px 0;
      font-size: 1.35rem;
      line-height: 1.3;
    }
    .alert-panel__title small {
      opacity: 0.7;
      font-size: 0.85rem;
    }

    .alert-panel__close {
      margin-left: auto;
      border: none;
      background: rgba(255,255,255,0.08);
      color: #fff;
      width: 34px;
      height: 34px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 20px;
      transition: all 0.2s;
    }
    .alert-panel__close:hover {
      background: rgba(255,255,255,0.2);
      transform: translateY(-2px);
    }

    .alert-panel__body {
      padding: 20px 22px 10px;
      overflow-y: auto;
      flex: 1;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 18px;
    }
    .stats article {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 14px;
      padding: 12px;
      text-align: center;
    }
    .stats article span {
      display: block;
      text-transform: uppercase;
      letter-spacing: 0.3em;
      font-size: 0.65rem;
      opacity: 0.6;
      margin-bottom: 6px;
    }
    .stats article strong {
      font-size: 0.9rem;
      line-height: 1.2;
    }
    .stats article.danger {
      border-color: rgba(239,68,68,0.5);
      box-shadow: 0 0 15px rgba(239,68,68,0.15);
      color: #fecaca;
    }

    .details {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 14px;
    }
    .details h4 {
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.35em;
      font-size: 0.7rem;
      opacity: 0.65;
    }
    .details p {
      margin: 0;
      font-size: 0.95rem;
      line-height: 1.5;
      color: rgba(248,250,252,0.9);
    }

    .threat-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .threat-list li {
      display: flex;
      gap: 12px;
      padding: 10px;
      border-radius: 12px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.05);
      align-items: center;
    }
    .threat-list span {
      font-size: 24px;
    }
    .threat-list strong {
      display: block;
      margin-bottom: 2px;
    }
    .threat-list small {
      color: rgba(226,232,240,0.75);
      font-size: 0.85rem;
    }

    .alert-panel__footer {
      padding: 16px 22px 20px;
      display: flex;
      gap: 12px;
      border-top: 1px solid rgba(255,255,255,0.08);
      background: rgba(2,6,23,0.9);
    }
    .solid-btn,
    .ghost-btn {
      flex: 1;
      border-radius: 14px;
      padding: 12px 16px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .solid-btn {
      border: none;
      background: linear-gradient(135deg, rgba(249,115,22,0.95), rgba(244,63,94,0.95));
      color: #fff;
      box-shadow: 0 15px 30px rgba(244,63,94,0.35);
    }
    .ghost-btn {
      border: 1px solid rgba(255,255,255,0.25);
      background: rgba(255,255,255,0.05);
      color: #fff;
    }
    .solid-btn:hover,
    .ghost-btn:hover {
      transform: translateY(-2px);
      opacity: 0.93;
    }

    @keyframes panelSlideIn {
      from { opacity: 0; transform: translate(40px,-20px) scale(0.95); }
      to { opacity: 1; transform: translate(0,0) scale(1); }
    }
    @keyframes pulseRing {
      0% { box-shadow: 0 0 0 0 rgba(255,255,255,0.25); }
      70% { box-shadow: 0 0 0 24px rgba(255,255,255,0); }
      100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
    }

    @media (max-width: 600px) {
      .alert-panel {
        width: calc(100vw - 32px);
        right: 16px;
        top: 16px;
      }
      .stats {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `;
  document.head.appendChild(style);
}

function updateAlertOnMap(alert) {
  removeAlertFromMap(alert.id);
  addAlertToMap(alert);
}

function removeAlertFromMap(alertId) {
  const alert = activeAlerts.get(alertId);
  if (!alert) return;

  if (alert.marker) {
    alert.marker.remove();
  }

  if (mapInstance.getLayer(`alert-${alertId}-fill`)) {
    mapInstance.removeLayer(`alert-${alertId}-fill`);
  }

  if (mapInstance.getLayer(`alert-${alertId}-outline-inner`)) {
    mapInstance.removeLayer(`alert-${alertId}-outline-inner`);
  }

  if (mapInstance.getLayer(`alert-${alertId}-outline-outer`)) {
    mapInstance.removeLayer(`alert-${alertId}-outline-outer`);
  }

  if (mapInstance.getSource(`alert-${alertId}`)) {
    mapInstance.removeSource(`alert-${alertId}`);
  }

  activeAlerts.delete(alertId);

  if (selectedAlert && selectedAlert.id === alertId) {
    const alertToReset = selectedAlert;
    selectedAlert = null;
    stopAlertFlashing(alertToReset);
  }

  if (selectedAlert && selectedAlert.id === alertId && alertDetailsElement) {
    alertDetailsElement.remove();
    alertDetailsElement = null;
    selectedAlert = null;
  }

  scheduleAlertsButtonUpdate();
}

function getAlertIcon(eventCode) {
  if (!eventCode) return "⚠️";

  const icons = {
    TO: "🌪️",
    SV: "⛈️",
    FF: "🌊",
    FL: "💧",
    WS: "❄️",
    WW: "🌨️",
    HU: "🌀",
    TY: "🌀",
    TR: "🌀",
    BZ: "❄️",
    HS: "🔥",
    EH: "🔥",
    HW: "💨",
    FW: "🔥",
    RH: "☢️",
    EC: "🚗",
    EVI: "🏃",
    HMW: "☣️",
    NUW: "☢️",
    SPW: "🏠",
    VOW: "🌋",
    AF: "🌋",
    AVW: "⛰️",
    CAE: "👶",
    CDW: "⚠️",
    CEM: "⚠️",
    CF: "🌊",
    CFW: "🌊",
    DSW: "💨",
    EQW: "🏚️",
    FRW: "🔥",
    HLS: "🌀",
    LEW: "👮",
    LAE: "⚠️",
    TS: "🌊",
    TSW: "🌊",
    SSW: "🌊",
    TOW: "🌪️",
    TRW: "🌀",
    WIW: "💨",
    SPS: "⚠️",
  };

  const mainCode = eventCode.substring(0, 2);
  return icons[mainCode] || icons[eventCode] || "⚠️";
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

function initializeWeatherAlerts() {
  const style = document.createElement("style");
  style.textContent = `
    .alert-marker {
      transition: transform 0.2s ease;
    }
    .alert-marker:hover {
      transform: scale(1.2);
    }
  `;
  document.head.appendChild(style);

  if (!isArchiveMode) {
    initAlertFeed();
  }
}

/**
 * Fetch historical warnings from IEM API for a specific timestamp
 * @param {Date} timestamp - The timestamp to fetch warnings for
 */
async function fetchHistoricalWarnings(timestamp) {
  try {
    const dateStr = timestamp.toISOString().split("T")[0];
    const timeStr = timestamp.toISOString().split("T")[1].split(".")[0];

    console.log(`🌩️ Fetching warnings ACTIVE at ${dateStr} ${timeStr}...`);

    const torUrl = `https://radar-api-production-076b.up.railway.app/api/archive/warnings?date=${dateStr}&time=${timeStr}&pil=TOR`;
    const svrUrl = `https://radar-api-production-076b.up.railway.app/api/archive/warnings?date=${dateStr}&time=${timeStr}&pil=SVR`;

    console.log(`   Fetching TOR: ${torUrl}`);
    console.log(`   Fetching SVR: ${svrUrl}`);

    const [torResponse, svrResponse] = await Promise.all([
      fetch(torUrl),
      fetch(svrUrl),
    ]);

    if (!torResponse.ok || !svrResponse.ok) {
      throw new Error(
        `HTTP error! TOR: ${torResponse.status}, SVR: ${svrResponse.status}`,
      );
    }

    const torData = await torResponse.json();
    const svrData = await svrResponse.json();

    const allAlerts = [...(torData.alerts || []), ...(svrData.alerts || [])];

    console.log(
      `✅ Loaded ${allAlerts.length} historical warnings (${
        torData.count || 0
      } TOR, ${svrData.count || 0} SVR)`,
    );

    displayHistoricalWarningsAsLive(allAlerts);

    return allAlerts;
  } catch (error) {
    console.error("❌ Error fetching historical warnings:", error);
    return [];
  }
}

/**
 * Display historical warnings on the map AS IF they were live alerts
 * Uses the exact same polygon plotting logic as real-time alerts
 */
function displayHistoricalWarningsAsLive(alerts) {
  const targetMap = mapInstance;
  if (!targetMap) {
    console.warn(
      "Map instance unavailable; cannot display historical warnings.",
    );
    return;
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`🗺️ [MAP] Displaying ${alerts.length} historical warnings`);
  console.log(`${"=".repeat(60)}`);

  clearHistoricalAlerts();

  if (alerts.length === 0) {
    console.log("📭 No historical warnings to display");
    return;
  }

  alerts.forEach((alert, idx) => {
    console.log(
      `\n[${idx + 1}/${alerts.length}] Adding historical alert to map:`,
    );
    console.log(`   Event: ${alert.event}`);
    console.log(`   ID: ${alert.id}`);
    console.log(
      `   Polygon: ${alert.polygon ? alert.polygon.length + " points" : "NONE"}`,
    );

    if (!alert.polygon || alert.polygon.length === 0) {
      console.warn(`   ⚠️ Skipping - no polygon data`);
      return;
    }

    let severity = "Severe";
    let eventCode = "SV.W";

    if (alert.phenomena === "TO" && alert.significance === "W") {
      eventCode = "TO.W";
      severity = "Extreme";
    } else if (alert.phenomena === "SV" && alert.significance === "W") {
      eventCode = "SV.W";
      severity = "Severe";
    }

    const formattedAlert = {
      id: alert.id,
      event: alert.event,
      eventCode: eventCode,
      headline: alert.event,
      description: alert.text || "",
      instruction: "",
      severity: severity,
      urgency: "Immediate",
      certainty: "Observed",
      onset: alert.entered || new Date().toISOString(),
      expires: alert.entered || new Date().toISOString(),
      status: "Actual",
      messageType: "Alert",
      category: "Met",
      sender: alert.cccc || "NWS",
      senderName: alert.source || "National Weather Service",
      sent: alert.entered || new Date().toISOString(),
      vtecCode: alert.vtecCode,
      phenomena: alert.phenomena,
      significance: alert.significance,
      polygon: {
        type: "Polygon",
        coordinates: [alert.polygon.map((coord) => [coord[1], coord[0]])],
      },
      isHistorical: true,
    };

    addAlertToMap(formattedAlert);
    console.log(`   ✅ Alert added successfully`);
  });

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    `✅ [MAP] Finished displaying ${alerts.length} historical warnings`,
  );
  console.log(`${"=".repeat(60)}\n`);
}

/**
 * Clear all historical alerts from the map
 */
function clearHistoricalAlerts() {
  const targetMap = mapInstance;
  if (!targetMap) return;

  console.log("🧹 Clearing existing historical alerts...");

  const layersToRemove = [];
  const sourcesToRemove = [];

  const style = targetMap.getStyle();
  if (style && style.layers) {
    style.layers.forEach((layer) => {
      if (layer.id && layer.id.includes("historical")) {
        layersToRemove.push(layer.id);
      }
    });
  }

  if (style && style.sources) {
    Object.keys(style.sources).forEach((sourceId) => {
      if (sourceId.includes("historical")) {
        sourcesToRemove.push(sourceId);
      }
    });
  }

  layersToRemove.forEach((layerId) => {
    if (targetMap.getLayer(layerId)) {
      targetMap.removeLayer(layerId);
    }
  });

  sourcesToRemove.forEach((sourceId) => {
    if (targetMap.getSource(sourceId)) {
      targetMap.removeSource(sourceId);
    }
  });

  console.log(
    `   Removed ${layersToRemove.length} layers, ${sourcesToRemove.length} sources`,
  );
}

/**
 * Fetch available archive timestamps for a specific date
 * @param {string} siteId - Radar site ID
 * @param {string} product - Radar product code
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Array} Array of timestamp objects
 */
async function fetchArchiveTimestamps(siteId, product, date) {
  try {
    const apiUrl = `https://radar-api-production-076b.up.railway.app/api/archive/timestamps/${siteId}?product=${product}&date=${date}`;
    console.log(`Fetching archive timestamps via backend: ${apiUrl}`);

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Archive timestamp request failed (${response.status})`);
    }

    const data = await response.json();
    const scans = Array.isArray(data.scans) ? data.scans : [];

    const timestamps = scans.map((scan) => {
      const isoStamp = scan.timestamp;
      const parsedDate = isoStamp ? new Date(isoStamp) : null;
      return {
        key: scan.key,
        timestamp: parsedDate,
        timeString:
          scan.timeString ||
          (parsedDate
            ? `${parsedDate.toISOString().slice(11, 19)} UTC`
            : "Unknown time"),
        sizeBytes: scan.sizeBytes,
        lastModified: scan.lastModified,
        fileName: scan.fileName,
      };
    });

    console.log(`Found ${timestamps.length} archive scans`);
    return timestamps;
  } catch (error) {
    console.error("Error fetching archive timestamps:", error);
    return [];
  }
}

/**
 * Load archive radar data for a specific S3 key
 * @param {string} siteId - Radar site ID
 * @param {string} product - Radar product code
 * @param {string} key - S3 key for the specific radar file
 * @param {Date} timestamp - The timestamp for archive data
 */
async function loadArchiveRadarData(siteId, product, key, timestamp) {
  try {
    console.log(`Loading archive radar: ${key}`);

    const apiUrl = `https://radar-api-production-076b.up.railway.app/api/radar-webgl/${siteId}?product=${product}&key=${key}&format=binary`;
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch archive radar data: ${response.statusText}`,
      );
    }

    const contentEncoding = response.headers.get("Content-Encoding");
    let arrayBuffer;
    if (contentEncoding === "gzip") {
      const blob = await response.blob();
      const decompressedStream = blob
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      const decompressedBlob = await new Response(decompressedStream).blob();
      arrayBuffer = await decompressedBlob.arrayBuffer();
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

    const radarData = parseBinaryRadarData(arrayBuffer);

    const cacheKey = `${siteId}_${product}_${timestamp.getTime()}`;
    archiveProductCache[cacheKey] = radarData;

    if (mapInstance) {
      updateRadarLayer(mapInstance, radarData);
      console.log(
        `✅ Loaded archive radar data: ${
          radarData.vertices.length / 2
        } vertices`,
      );

      updateAllProbes();
    } else {
      console.warn(
        "Map instance is not initialized; cannot render archive data.",
      );
    }

    archiveTimestamp = timestamp;
  } catch (error) {
    console.error("Error loading archive radar data:", error);
    alert(`Failed to load archive data: ${error.message}`);
  }
}

window.onload = async () => {
  loadPalettesFromStorage();
  ensureAlertStyleConfig();

  initializeTheme();
  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const currentTheme =
        document.documentElement.getAttribute("data-theme") || "dark";
      applyTheme(currentTheme === "dark" ? "light" : "dark");
    });
  }

  const dockMinimizeBtn = document.getElementById("dockMinimizeBtn");
  if (dockMinimizeBtn) {
    dockMinimizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const leftPanel = document.querySelector(".bottom-panel.bottom-left");
      if (leftPanel) {
        leftPanel.classList.toggle("minimized");
        const icon = dockMinimizeBtn.querySelector("i");
        if (leftPanel.classList.contains("minimized")) {
          icon.className = "fas fa-window-maximize";
          dockMinimizeBtn.title = "Restore Panel";
        } else {
          icon.className = "fas fa-window-minimize";
          dockMinimizeBtn.title = "Minimize Panel";
        }
      }
    });
  }

  installUiScaleResizeHandler();
  applyUiScale({ shouldResizeMap: false });
  bindToolToggleVisualState();
  createAlertsToggleButton();

  loadCountiesData();

  mapInstance = new maplibregl.Map({
    container: "map",
    style: `https://api.maptiler.com/maps/01977107-2c8b-7b89-873e-7e5019dbb13c/style.json?key=${MAPTILER_API_KEY}`,
    center: [-98.585522, 39.8333333],
    zoom: 4,
    antialias: false,
    refreshExpiredTiles: false,
    fadeDuration: 0,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5),
  });
  mapInstance.on("load", () => {
    initializeWeatherAlerts();
    initDrawTool(mapInstance);
  });
  mapInstance.on("contextmenu", handleMapPointerDown);
  mapInstance.on("mouseup", cancelMapLongPress);
  mapInstance.on("touchend", cancelMapLongPress);
  mapInstance.on("dragstart", cancelMapLongPress);
  mapInstance.on("mousemove", handleMapPointerMove);
  mapInstance.on("touchmove", handleMapPointerMove);

  const radarSites = await fetchRadarSites();
  radarSitesCache = radarSites;
  populateRadarSitesDropdown(radarSites);

  addRadarSitesToMap(mapInstance, radarSites);

  createColorScaleLegend();
  applyDataModeUI();

  const dataModeSelect = document.getElementById("dataModeSelect");
  if (dataModeSelect) {
    dataModeSelect.value = dataMode;
    dataModeSelect.addEventListener("change", async (e) => {
      await switchDataMode(e.target.value);
    });
  }

  const modelSourceSelect = document.getElementById("modelSourceSelect");
  if (modelSourceSelect) {
    modelSourceSelect.value = selectedModel;
    modelSourceSelect.addEventListener("change", async (e) => {
      const nextModel = String(e.target.value || "hrrr").toLowerCase();
      if (!["hrrr", "rrfs-a", "nam3k"].includes(nextModel)) {
        e.target.value = selectedModel;
        return;
      }

      selectedModel = nextModel;
      hrrrRunsCacheKey = null;
      hrrrRunsCachePayload = null;
      hrrrRunsCacheTime = 0;
      hrrrPTypeLookupCache.clear();
      modelFrameCache.clear();
      selectedHRRRRunDate = null;
      selectedHRRRRunHour = null;
      applyModelControlConstraints();

      await refreshHRRRRunSelector();
      if (dataMode === "hrrr") {
        await fetchAndDisplayHRRRData(mapInstance);
      }
      saveUserSettings();
    });
  }

  const precipTypeToggle = document.getElementById("precipTypeToggle");
  if (precipTypeToggle) {
    precipTypeToggle.checked = precipTypeModeEnabled;
    precipTypeToggle.addEventListener("change", async (e) => {
      precipTypeModeEnabled = Boolean(e.target.checked);
      hrrrPTypeLookupCache.clear();

      const activeProductCode =
        dataMode === "hrrr"
          ? `HRRR_${selectedHRRRVariable.toUpperCase()}`
          : selectedRadarProduct;

      if (customRadarLayerInstance?.updateColorRamp) {
        customRadarLayerInstance.updateColorRamp(activeProductCode);
      }
      createColorScaleLegend(activeProductCode);

      if (dataMode === "hrrr") {
        await fetchAndDisplayHRRRData(mapInstance);
      } else if (selectedRadarSite) {
        await fetchAndDisplayRadarData(
          mapInstance,
          selectedRadarSite,
          selectedRadarProduct,
        );
      }
    });
  }

  const hrrrVariableSelect = document.getElementById("hrrrVariableSelect");
  if (hrrrVariableSelect) {
    applyModelControlConstraints();
    hrrrVariableSelect.addEventListener("change", async (e) => {
      selectedHRRRVariable = e.target.value || "tmp2m";
      applyModelControlConstraints();
      hrrrRunsCacheKey = null;
      hrrrRunsCachePayload = null;
      hrrrRunsCacheTime = 0;
      hrrrPTypeLookupCache.clear();
      modelFrameCache.clear();
      await refreshHRRRRunSelector();
      if (dataMode === "hrrr") {
        await fetchAndDisplayHRRRData(mapInstance);
      }
    });
  }

  const hrrrForecastHourInput = document.getElementById("hrrrForecastHour");
  if (hrrrForecastHourInput) {
    hrrrForecastHourInput.addEventListener("change", async (e) => {
      if (dataMode === "mrms") {
        selectedHRRRForecastHour = 0;
        e.target.value = "0";
        updateHRRRTimeCard(currentHRRRMeta);
        return;
      }
      const parsed = parseInt(e.target.value, 10);
      selectedHRRRForecastHour = Number.isFinite(parsed)
        ? Math.max(0, Math.min(48, parsed))
        : 0;
      hrrrPTypeLookupCache.clear();
      e.target.value = selectedHRRRForecastHour;
      updateHRRRTimeCard(currentHRRRMeta);
      if (dataMode === "hrrr") {
        await fetchAndDisplayHRRRData(mapInstance);
      }
    });
  }

  const hrrrForecastSlider = document.getElementById("hrrrForecastSlider");
  if (hrrrForecastSlider) {
    hrrrForecastSlider.value = String(selectedHRRRForecastHour);
    hrrrForecastSlider.addEventListener("input", (e) => {
      if (dataMode === "mrms") {
        selectedHRRRForecastHour = 0;
        e.target.value = "0";
        updateHRRRTimeCard(currentHRRRMeta);
        return;
      }
      const parsed = parseInt(e.target.value, 10);
      selectedHRRRForecastHour = Number.isFinite(parsed)
        ? Math.max(0, Math.min(48, parsed))
        : 0;
      hrrrPTypeLookupCache.clear();
      updateHRRRTimeCard(currentHRRRMeta);
    });

    hrrrForecastSlider.addEventListener("change", async () => {
      if (dataMode === "hrrr") {
        await fetchAndDisplayHRRRData(mapInstance);
      }
    });
  }

  const hrrrRunSelect = document.getElementById("hrrrRunSelect");
  if (hrrrRunSelect) {
    hrrrRunSelect.addEventListener("change", async (e) => {
      const value = e.target.value || "latest";
      if (value === "latest") {
        selectedHRRRRunDate = null;
        selectedHRRRRunHour = null;
      } else {
        const [datePart, hourPart] = String(value).split("|");
        const parsedHour = parseInt(hourPart, 10);
        if (datePart && Number.isFinite(parsedHour)) {
          selectedHRRRRunDate = datePart;
          selectedHRRRRunHour = parsedHour;
        } else {
          selectedHRRRRunDate = null;
          selectedHRRRRunHour = null;
          e.target.value = "latest";
        }
      }

      hrrrPTypeLookupCache.clear();
      modelFrameCache.clear();

      if (dataMode === "hrrr") {
        await fetchAndDisplayHRRRData(mapInstance);
      }
    });
  }

  applyModelControlConstraints();
  updateHRRRTimeCard(currentHRRRMeta);
  await refreshHRRRRunSelector();

  const hrrrLoopModeSelect = document.getElementById("hrrrLoopMode");
  const hrrrLoopRangeControls = document.getElementById(
    "hrrrLoopRangeControls",
  );
  if (hrrrLoopModeSelect) {
    hrrrLoopModeSelect.value = modelLoopMode;
    hrrrLoopModeSelect.addEventListener("change", (e) => {
      modelLoopMode = e.target.value === "range" ? "range" : "all";
      if (hrrrLoopRangeControls) {
        hrrrLoopRangeControls.style.display =
          modelLoopMode === "range" ? "grid" : "none";
      }
    });
  }
  if (hrrrLoopRangeControls) {
    hrrrLoopRangeControls.style.display =
      modelLoopMode === "range" ? "grid" : "none";
  }

  const hrrrLoopStartInput = document.getElementById("hrrrLoopStartHour");
  const hrrrLoopEndInput = document.getElementById("hrrrLoopEndHour");
  if (hrrrLoopStartInput) {
    hrrrLoopStartInput.value = String(modelLoopStartHour);
    hrrrLoopStartInput.addEventListener("change", (e) => {
      const parsed = parseInt(e.target.value, 10);
      modelLoopStartHour = Number.isFinite(parsed)
        ? Math.max(0, Math.min(48, parsed))
        : 0;
      e.target.value = String(modelLoopStartHour);
    });
  }
  if (hrrrLoopEndInput) {
    hrrrLoopEndInput.value = String(modelLoopEndHour);
    hrrrLoopEndInput.addEventListener("change", (e) => {
      const parsed = parseInt(e.target.value, 10);
      modelLoopEndHour = Number.isFinite(parsed)
        ? Math.max(0, Math.min(48, parsed))
        : 48;
      e.target.value = String(modelLoopEndHour);
    });
  }

  const hrrrLoadLoopBtn = document.getElementById("hrrrLoadLoopBtn");
  if (hrrrLoadLoopBtn) {
    hrrrLoadLoopBtn.addEventListener("click", async () => {
      if (dataMode !== "hrrr") {
        alert("Switch to Model (HRRR) mode first.");
        return;
      }
      await loadAndPlayModelLoop(mapInstance);
    });
  }

  const hrrrToggleLoopBtn = document.getElementById("hrrrToggleLoopBtn");
  if (hrrrToggleLoopBtn) {
    hrrrToggleLoopBtn.addEventListener("click", () => {
      if (radarFrames.length === 0) {
        alert("Load model loop frames first.");
        return;
      }
      toggleLoop();
      hrrrToggleLoopBtn.textContent = isLooping ? "Pause" : "Play";
    });
  }

  const hrrrPrecacheBtn = document.getElementById("hrrrPrecacheBtn");
  if (hrrrPrecacheBtn) {
    hrrrPrecacheBtn.addEventListener("click", async () => {
      if (dataMode !== "hrrr") {
        alert("Switch to Model (HRRR) mode first.");
        return;
      }
      await precacheModelRange(mapInstance);
    });
  }

  document
    .getElementById("radarSiteSelect")
    .addEventListener("change", async (e) => {
      const siteId = e.target.value;
      if (siteId) {
        selectedRadarSite = radarSites.find((site) => site.id === siteId);

        radarSiteLocation = {
          longitude: selectedRadarSite.longitude,
          latitude: selectedRadarSite.latitude,
        };

        mapInstance.flyTo({
          center: [selectedRadarSite.longitude, selectedRadarSite.latitude],
          zoom: 7,
          duration: 1500,
        });

        document.getElementById("radarControlsSection").style.display = "block";
        applyDataModeUI();

        // Only start polling if not in archive mode
        if (!isArchiveMode && dataMode === "radar") {
          startRadarPolling(
            mapInstance,
            selectedRadarSite,
            selectedRadarProduct,
            selectedRadarDataSource,
          );
        }
        updateDockSummary();
      } else {
        document.getElementById("radarControlsSection").style.display = "none";
        applyDataModeUI();

        radarSiteLocation = null;

        removeRadarLayer(mapInstance);
        stopSweepAnimation(mapInstance);
        stopArcSyncStream();
        updateArcSyncToggleState();

        stopLoop();
        radarFrames = [];
        updateDockSummary();
      }
    });

  document
    .getElementById("radarProductSelect")
    .addEventListener("change", async (e) => {
      if (dataMode !== "radar") return;
      const newProduct = e.target.value;
      console.log(`Product changed to: ${newProduct}`);

      selectedRadarProduct = newProduct;
      createColorScaleLegend(newProduct);
      updateDockSummary();

      if (
        customRadarLayerInstance &&
        customRadarLayerInstance.updateColorRamp
      ) {
        customRadarLayerInstance.updateColorRamp(newProduct);
      }

      if (isArchiveMode && archiveTimestamp && selectedRadarSite) {
        console.log(`Reloading archive data with product: ${newProduct}`);

        const cacheKey = `${
          selectedRadarSite.id
        }_${newProduct}_${archiveTimestamp.getTime()}`;

        if (archiveProductCache[cacheKey]) {
          console.log("Using cached archive data for new product");
          updateRadarLayer(mapInstance, archiveProductCache[cacheKey]);
        } else {
          const dateStr = archiveTimestamp.toISOString().split("T")[0];
          const timestamps = await fetchArchiveTimestamps(
            selectedRadarSite.id,
            newProduct,
            dateStr,
          );

          const closestTimestamp = timestamps.reduce((prev, curr) => {
            const prevDiff = Math.abs(prev.timestamp - archiveTimestamp);
            const currDiff = Math.abs(curr.timestamp - archiveTimestamp);
            return currDiff < prevDiff ? curr : prev;
          });

          if (closestTimestamp) {
            await loadArchiveRadarData(
              selectedRadarSite.id,
              newProduct,
              closestTimestamp.key,
              closestTimestamp.timestamp,
            );
          }
        }

        return;
      }

      if (selectedRadarSite && !isArchiveMode) {
        if (radarPollingTimer) {
          clearInterval(radarPollingTimer);
        }

        stopLoop();
        radarFrames = [];

        await fetchAndDisplayRadarData(
          mapInstance,
          selectedRadarSite,
          newProduct,
          selectedRadarDataSource,
        );
        startSweepAnimation(mapInstance, selectedRadarSite);

        // Only start polling if not in archive mode
        if (!isArchiveMode) {
          startRadarPolling(
            mapInstance,
            selectedRadarSite,
            newProduct,
            selectedRadarDataSource,
          );
        }
      }
    });

  const radarDataSourceSelect = document.getElementById(
    "radarDataSourceSelect",
  );
  if (radarDataSourceSelect) {
    radarDataSourceSelect.value = selectedRadarDataSource;
    radarDataSourceSelect.addEventListener("change", async (e) => {
      const nextSource = e.target.value === "level2" ? "level2" : "level3";
      if (nextSource === selectedRadarDataSource) {
        return;
      }

      selectedRadarDataSource = nextSource;
      lastRadarKey = null;
      stopArcSyncStream();
      updateArcSyncToggleState();

      if (dataMode === "radar" && selectedRadarSite && !isArchiveMode) {
        await fetchAndDisplayRadarData(
          mapInstance,
          selectedRadarSite,
          selectedRadarProduct,
          selectedRadarDataSource,
        );
        startSweepAnimation(mapInstance, selectedRadarSite);
        startRadarPolling(
          mapInstance,
          selectedRadarSite,
          selectedRadarProduct,
          selectedRadarDataSource,
        );
      }

      updateDockSummary();
    });
  }

  updateDockSummary();

  document
    .getElementById("radarProductSelect")
    .addEventListener("change", (e) => {
      if (dataMode !== "radar") return;
      const product = e.target.value;
      const isVelocityProduct = product.match(/N[0-3][GVS]$/);
      const stormControls = document.getElementById("stormMotionControls");
      stormControls.style.display = isVelocityProduct ? "block" : "none";
    });

  document
    .getElementById("enableStormMotion")
    .addEventListener("change", (e) => {
      useStormMotion = e.target.checked;
      const inputs = document.getElementById("stormMotionInputs");
      inputs.style.display = useStormMotion ? "block" : "none";

      if (selectedRadarSite && !isArchiveMode) {
        fetchAndDisplayRadarData(
          mapInstance,
          selectedRadarSite,
          selectedRadarProduct,
          selectedRadarDataSource,
        );
      }
    });

  document.getElementById("stormMotionU").addEventListener("change", (e) => {
    stormMotionU = parseFloat(e.target.value) || 0;
    if (useStormMotion && selectedRadarSite && !isArchiveMode) {
      fetchAndDisplayRadarData(
        mapInstance,
        selectedRadarSite,
        selectedRadarProduct,
        selectedRadarDataSource,
      );
    }
  });

  document.getElementById("stormMotionV").addEventListener("change", (e) => {
    stormMotionV = parseFloat(e.target.value) || 0;
    if (useStormMotion && selectedRadarSite && !isArchiveMode) {
      fetchAndDisplayRadarData(
        mapInstance,
        selectedRadarSite,
        selectedRadarProduct,
        selectedRadarDataSource,
      );
    }
  });

  document
    .getElementById("refreshRadar")
    .addEventListener("click", async () => {
      if (dataMode === "hrrr") {
        await fetchAndDisplayHRRRData(mapInstance);
        return;
      }

      if (isArchiveMode) {
        alert("Cannot refresh while in archive mode. Exit archive mode first.");
        return;
      }

      if (selectedRadarSite) {
        await fetchAndDisplayRadarData(
          mapInstance,
          selectedRadarSite,
          selectedRadarProduct,
          selectedRadarDataSource,
        );
        startSweepAnimation(mapInstance, selectedRadarSite);
      }
    });

  document.getElementById("toggleRadar").addEventListener("click", () => {
    if (mapInstance.getLayer(radarLayerId)) {
      const visibility = mapInstance.getLayoutProperty(
        radarLayerId,
        "visibility",
      );
      if (visibility === "visible" || visibility === undefined) {
        mapInstance.setLayoutProperty(radarLayerId, "visibility", "none");
        document.getElementById("toggleRadar").innerHTML =
          '<i class="fas fa-eye"></i>';
        document.getElementById("toggleRadar").title = "Show Radar";
        document.getElementById("radarLegend").style.display = "none";
      } else {
        mapInstance.setLayoutProperty(radarLayerId, "visibility", "visible");
        document.getElementById("toggleRadar").innerHTML =
          '<i class="fas fa-eye-slash"></i>';
        document.getElementById("toggleRadar").title = "Hide Radar";
        document.getElementById("radarLegend").style.display = "block";
      }
    }
  });

  document.getElementById("loadLoopBtn").addEventListener("click", async () => {
    if (!selectedRadarSite) {
      alert("Please select a radar site first.");
      return;
    }

    const frameCount =
      parseInt(document.getElementById("frameCount").value) || 10;

    const progressDiv = document.getElementById("loadingProgress");
    const progressText = document.getElementById("progressText");
    const progressBar = document.getElementById("progressBar");
    progressDiv.style.display = "block";

    stopLoop();

    if (isArchiveMode && archiveTimestamp) {
      console.log("Loading archive loop frames...");

      const dateStr = archiveTimestamp.toISOString().split("T")[0];
      const timestamps = await fetchArchiveTimestamps(
        selectedRadarSite.id,
        selectedRadarProduct,
        dateStr,
      );

      if (timestamps.length === 0) {
        alert("No archive timestamps available for loop");
        progressDiv.style.display = "none";
        return;
      }

      const currentIndex = timestamps.findIndex(
        (t) => Math.abs(t.timestamp - archiveTimestamp) < 60000,
      );

      const startIndex = Math.max(
        0,
        currentIndex >= 0
          ? currentIndex - frameCount + 1
          : timestamps.length - frameCount,
      );
      const framesToLoad = timestamps.slice(
        startIndex,
        startIndex + frameCount,
      );

      const downloadedFrames = [];
      for (let i = 0; i < framesToLoad.length; i++) {
        const ts = framesToLoad[i];
        try {
          const apiUrl = `https://radar-api-production-076b.up.railway.app/api/radar-webgl/${selectedRadarSite.id}?product=${selectedRadarProduct}&key=${ts.key}&format=binary`;
          const response = await fetch(apiUrl);
          const contentEncoding = response.headers.get("Content-Encoding");
          let arrayBuffer;
          if (contentEncoding === "gzip") {
            const blob = await response.blob();
            const decompressedStream = blob
              .stream()
              .pipeThrough(new DecompressionStream("gzip"));
            const decompressedBlob = await new Response(
              decompressedStream,
            ).blob();
            arrayBuffer = await decompressedBlob.arrayBuffer();
          } else {
            arrayBuffer = await response.arrayBuffer();
          }

          const radarData = parseBinaryRadarData(arrayBuffer);

          downloadedFrames.push({
            data: radarData,
            timestamp: ts.timestamp,
            key: ts.key,
          });

          const percent = Math.round(((i + 1) / framesToLoad.length) * 100);
          progressText.textContent = `${percent}% (${i + 1}/${
            framesToLoad.length
          })`;
          if (progressBar) progressBar.style.width = `${percent}%`;
        } catch (error) {
          console.error(`Failed to load archive frame ${ts.key}:`, error);
        }
      }

      radarFrames = downloadedFrames.map((frame) => {
        const rawVertices = new Float32Array(frame.data.vertices);
        const rawValues = new Float32Array(frame.data.values);
        const smoothedValues = computeBilinearCornerValues(
          rawVertices,
          rawValues,
        );
        const mercatorCoords = new Float32Array(rawVertices.length);

        const DEG_TO_RAD = Math.PI / 180;
        const RAD_TO_DEG = 180 / Math.PI;
        const PI_4 = Math.PI / 4;
        const MIN_LAT = -85.0511 * DEG_TO_RAD;
        const MAX_LAT = 85.0511 * DEG_TO_RAD;

        for (let i = 0; i < rawVertices.length; i += 2) {
          const lng = rawVertices[i];
          const lat = rawVertices[i + 1];

          mercatorCoords[i] = (lng + 180) / 360;
          const latRad = Math.max(MIN_LAT, Math.min(MAX_LAT, lat * DEG_TO_RAD));
          mercatorCoords[i + 1] =
            (180 - RAD_TO_DEG * Math.log(Math.tan(PI_4 + latRad / 2))) / 360;
        }

        return {
          mercatorPositions: mercatorCoords,
          rawVertices,
          rawValues,
          smoothedValues,
          timestamp: frame.timestamp,
          key: frame.key,
          vertexCount: rawVertices.length / 2,
        };
      });

      progressDiv.style.display = "none";
      console.log(
        `Loaded and pre-processed ${radarFrames.length} archive frames for loop`,
      );

      if (radarFrames.length > 0) {
        document.getElementById("loopControlsContainer").style.display = "flex";
        document.getElementById("totalFrames").textContent = radarFrames.length;
        displayFrame(0);
        startLoop();
      }
    } else {
      await loadRadarFrames(selectedRadarSite, frameCount, (current, total) => {
        if (total > 0) {
          const percent = Math.round((current / total) * 100);
          progressText.textContent = `${percent}% (${current}/${total})`;
          if (progressBar) progressBar.style.width = `${percent}%`;
        } else {
          progressDiv.style.display = "none";
        }
      });

      progressDiv.style.display = "none";
    }
  });

  document.getElementById("inspectorToggle").addEventListener("click", () => {
    toggleInspector();
  });

  // TVS Detection Toggle
  document
    .getElementById("tvsDetectionToggle")
    .addEventListener("change", (e) => {
      tvsDetectionEnabled = e.target.checked;
      if (!tvsDetectionEnabled) {
        // Remove all TVS markers
        detectedTVSMarkers.forEach((marker) => marker.remove());
        detectedTVSMarkers = [];
      } else if (currentRadarData) {
        // Re-run detection on current data
        const tvsLocations = detectTVS(currentRadarData);
        displayTVSMarkers(tvsLocations);
      }
    });

  // Storm Track Toggle
  document.getElementById("stormTrackToggle").addEventListener("click", () => {
    const btn = document.getElementById("stormTrackToggle");
    btn.classList.toggle("active");
    if (btn.classList.contains("active")) {
      enableStormTrack();
    } else {
      stormTrackEnabled = false;
      stormTrackPoint = null;
      stormTrackLine = [];
      stormTrackMode = null;
      stormTrackFirstMarker = null;
      stormTrackSecondMarker = null;
      stormTrackTimeElapsed = 0;

      // Clear all storm track layers from map
      const layers = [
        "storm-track-path",
        "storm-track-cone-fill",
        "storm-track-cone-outline",
        "storm-track-centerline",
        "storm-city-markers",
        "storm-city-labels",
      ];
      const sources = [
        "storm-track-path",
        "storm-track-cone",
        "storm-track-centerline",
        "storm-cities",
      ];

      layers.forEach((layer) => {
        if (mapInstance.getLayer(layer)) {
          mapInstance.removeLayer(layer);
        }
      });

      sources.forEach((source) => {
        if (mapInstance.getSource(source)) {
          mapInstance.removeSource(source);
        }
      });

      // Remove markers
      stormTrackMarkers.forEach((m) => m.remove());
      stormTrackMarkers = [];

      // Remove city ETA dialog if open
      const dialog = document.getElementById("city-eta-dialog");
      if (dialog) dialog.remove();
    }
  });

  // Traffic Cameras Toggle
  document.getElementById("camerasToggle").addEventListener("change", (e) => {
    toggleCameras(e.target.checked);
  });

  document
    .getElementById("palFileInput")
    .addEventListener("change", async (e) => {
      const file = e.target.files[0];
      const statusDiv = document.getElementById("palFileStatus");

      if (!file) {
        statusDiv.textContent = "";
        return;
      }

      try {
        statusDiv.textContent = "Loading palette...";
        statusDiv.style.color = "rgba(255, 200, 100, 0.8)";

        const text = await file.text();
        const palette = parsePalFile(text);

        if (palette.colors.length === 0) {
          statusDiv.textContent = "⚠️ Invalid palette file";
          statusDiv.style.color = "rgba(255, 100, 100, 0.8)";
          return;
        }

        if (!selectedRadarProduct) {
          statusDiv.textContent = "⚠️ Select a radar product first";
          statusDiv.style.color = "rgba(255, 200, 100, 0.8)";
          return;
        }

        customPalettes[selectedRadarProduct] = palette;

        savePalettesToStorage();

        statusDiv.textContent = `✅ Loaded palette for ${selectedRadarProduct} (${
          palette.colors.length
        } colors, ${palette.units || "no units"})`;
        statusDiv.style.color = "rgba(100, 255, 150, 0.8)";

        console.log(
          `Custom palette applied to ${selectedRadarProduct}:`,
          palette,
        );

        if (selectedRadarSite) {
          console.log(
            `Applying custom palette to current product ${selectedRadarProduct}...`,
          );

          if (
            customRadarLayerInstance &&
            customRadarLayerInstance.updateColorRamp
          ) {
            customRadarLayerInstance.updateColorRamp(selectedRadarProduct);
          }

          createColorScaleLegend(selectedRadarProduct);

          statusDiv.textContent += " (Applied!)";
        }
      } catch (error) {
        console.error("Error loading palette file:", error);
        statusDiv.textContent = "❌ Error loading file";
        statusDiv.style.color = "rgba(255, 100, 100, 0.8)";
      }
    });

  document.getElementById("archiveRadar").addEventListener("click", () => {
    console.log("Opening archive radar modal...");
    const modal = document.getElementById("archiveModal");
    modal.classList.add("active");

    const now = new Date();
    document.getElementById("archiveDate").valueAsDate = now;

    document.getElementById("timestampList").style.display = "none";
    document.getElementById("timestampLoader").style.display = "none";
  });

  document.getElementById("archiveClose").addEventListener("click", () => {
    document.getElementById("archiveModal").classList.remove("active");
  });

  document
    .getElementById("archiveClearBtn")
    .addEventListener("click", async () => {
      isArchiveMode = false;
      archiveTimestamp = null;
      document.getElementById("archiveModal").classList.remove("active");

      const badge = document.querySelector(".archive-badge");
      if (badge) badge.remove();

      if (map.getLayer("historical-warnings-fill")) {
        map.removeLayer("historical-warnings-fill");
      }
      if (map.getLayer("historical-warnings-line")) {
        map.removeLayer("historical-warnings-line");
      }
      if (map.getSource("historical-warnings")) {
        map.removeSource("historical-warnings");
      }

      initAlertFeed();

      // Restart live radar data fetching and polling
      if (selectedRadarSite && selectedRadarProduct) {
        await fetchAndDisplayRadarData(
          mapInstance,
          selectedRadarSite,
          selectedRadarProduct,
          selectedRadarDataSource,
        );
        startSweepAnimation(mapInstance, selectedRadarSite);
        startRadarPolling(
          mapInstance,
          selectedRadarSite,
          selectedRadarProduct,
          selectedRadarDataSource,
        );
      }
    });

  document
    .getElementById("archiveFetchBtn")
    .addEventListener("click", async () => {
      const dateInput = document.getElementById("archiveDate").value;

      if (!dateInput) {
        alert("Please select a date");
        return;
      }

      if (!selectedRadarSite || !selectedRadarProduct) {
        alert("Please select a radar site and product first");
        return;
      }

      document.getElementById("timestampLoader").style.display = "block";
      document.getElementById("timestampList").style.display = "none";

      const timestamps = await fetchArchiveTimestamps(
        selectedRadarSite.id,
        selectedRadarProduct,
        dateInput,
      );

      document.getElementById("timestampLoader").style.display = "none";

      if (timestamps.length === 0) {
        alert(
          `No archive data found for ${selectedRadarSite.id} on ${dateInput}`,
        );
        return;
      }

      const container = document.getElementById("timestampContainer");
      container.innerHTML = "";

      timestamps.forEach((ts, index) => {
        const item = document.createElement("div");
        item.className = "timestamp-item";
        item.innerHTML = `
        <span class="timestamp-time">${ts.timeString}</span>
        <span class="timestamp-badge">#${index + 1}</span>
      `;

        item.addEventListener("click", async () => {
          document.querySelectorAll(".timestamp-item").forEach((el) => {
            el.classList.remove("selected");
          });

          item.classList.add("selected");

          isArchiveMode = true;
          archiveTimestamp = ts.timestamp;

          // Stop radar polling when entering archive mode
          if (radarPollingTimer) {
            clearInterval(radarPollingTimer);
            radarPollingTimer = null;
            console.log("Radar polling stopped - entering archive mode");
          }
          stopArcSyncStream();
          updateArcSyncToggleState();

          fetchArchivedWarnings = document.getElementById(
            "fetchArchivedWarningsCheckbox",
          ).checked;

          document.getElementById("archiveModal").classList.remove("active");

          let badge = document.querySelector(".archive-badge");
          if (!badge) {
            badge = document.createElement("span");
            badge.className = "archive-badge";
            const badgeHost = document.getElementById("archiveBadgeHost");
            if (badgeHost) {
              badgeHost.appendChild(badge);
            }
          }
          badge.textContent = `📅 ${ts.timestamp.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
            timeZoneName: "short",
          })}`;

          if (fetchArchivedWarnings) {
            await fetchHistoricalWarnings(ts.timestamp);
          }

          await loadArchiveRadarData(
            selectedRadarSite.id,
            selectedRadarProduct,
            ts.key,
            ts.timestamp,
          );
        });

        container.appendChild(item);
      });

      document.getElementById("timestampCount").textContent = timestamps.length;
      document.getElementById("timestampList").style.display = "block";
    });

  document.getElementById("archiveModal").addEventListener("click", (e) => {
    if (e.target.id === "archiveModal") {
      document.getElementById("archiveModal").classList.remove("active");
    }
  });
};

async function fetchRadarSites() {
  try {
    return [
      {
        id: "ABR",
        name: "Aberdeen, SD",
        latitude: 45.4558,
        longitude: -98.4131,
      },
      {
        id: "ENX",
        name: "Albany, NY",
        latitude: 42.5864,
        longitude: -74.0639,
      },
      {
        id: "ABX",
        name: "Albuquerque, NM",
        latitude: 35.1497,
        longitude: -106.8239,
      },
      {
        id: "FDR",
        name: "Altus AFB, OK",
        latitude: 34.3622,
        longitude: -98.9764,
      },
      {
        id: "AMA",
        name: "Amarillo, TX",
        latitude: 35.2333,
        longitude: -101.7092,
      },
      {
        id: "AHG",
        name: "Anchorage, AK",
        latitude: 60.7258,
        longitude: -151.3514,
      },
      {
        id: "GUA",
        name: "Anderson AFB, GU",
        latitude: 13.4525,
        longitude: 144.8058,
      },
      {
        id: "FFC",
        name: "Atlanta, GA",
        latitude: 33.3636,
        longitude: -84.5658,
      },
      {
        id: "EWX",
        name: "Austin/San Antonio, TX",
        latitude: 29.7039,
        longitude: -98.0283,
      },
      {
        id: "BBX",
        name: "Beale AFB, CA",
        latitude: 39.4961,
        longitude: -121.6317,
      },
      {
        id: "ABC",
        name: "Bethel, AK",
        latitude: 60.7919,
        longitude: -161.8764,
      },
      {
        id: "BLX",
        name: "Billings, MT",
        latitude: 45.8539,
        longitude: -108.6067,
      },
      {
        id: "BGM",
        name: "Binghamton, NY",
        latitude: 42.1997,
        longitude: -75.9847,
      },
      {
        id: "BMX",
        name: "Birmingham, AL",
        latitude: 33.1722,
        longitude: -86.7697,
      },
      {
        id: "BIS",
        name: "Bismarck, ND",
        latitude: 46.7708,
        longitude: -100.7603,
      },
      {
        id: "CBX",
        name: "Boise, ID",
        latitude: 43.4906,
        longitude: -116.2361,
      },
      {
        id: "BOX",
        name: "Boston, MA",
        latitude: 41.9558,
        longitude: -71.1369,
      },
      {
        id: "BRO",
        name: "Brownsville, TX",
        latitude: 25.9161,
        longitude: -97.4189,
      },
      {
        id: "BUF",
        name: "Buffalo, NY",
        latitude: 42.9489,
        longitude: -78.7369,
      },
      {
        id: "CXX",
        name: "Burlington, VT",
        latitude: 44.5111,
        longitude: -73.1669,
      },
      {
        id: "RSG",
        name: "Camp Humphreys, Korea",
        latitude: 36.9558,
        longitude: 127.0211,
      },
      {
        id: "FDX",
        name: "Cannon AFB, NM",
        latitude: 34.6353,
        longitude: -103.6297,
      },
      {
        id: "ICX",
        name: "Cedar City, UT",
        latitude: 37.5908,
        longitude: -112.8622,
      },
      {
        id: "CLX",
        name: "Charleston, SC",
        latitude: 32.6556,
        longitude: -81.0422,
      },
      {
        id: "RLX",
        name: "Charleston, WV",
        latitude: 38.3111,
        longitude: -81.7231,
      },
      {
        id: "CYS",
        name: "Cheyenne, WY",
        latitude: 41.1519,
        longitude: -104.8061,
      },
      {
        id: "LOT",
        name: "Chicago, IL",
        latitude: 41.6047,
        longitude: -88.0847,
      },
      {
        id: "ILN",
        name: "Cincinnati, OH",
        latitude: 39.4203,
        longitude: -83.8217,
      },
      {
        id: "CLE",
        name: "Cleveland, OH",
        latitude: 41.4131,
        longitude: -81.8597,
      },
      {
        id: "CAE",
        name: "Columbia, SC",
        latitude: 33.9486,
        longitude: -81.1183,
      },
      {
        id: "GWX",
        name: "Columbus AFB, MS",
        latitude: 33.8969,
        longitude: -88.3289,
      },
      {
        id: "CRP",
        name: "Corpus Christi, TX",
        latitude: 27.7842,
        longitude: -97.5111,
      },
      {
        id: "FWS",
        name: "Dallas/Ft. Worth, TX",
        latitude: 32.5731,
        longitude: -97.3031,
      },
      {
        id: "DVN",
        name: "Davenport, IA",
        latitude: 41.6117,
        longitude: -90.5808,
      },
      {
        id: "FTG",
        name: "Denver, CO",
        latitude: 39.7867,
        longitude: -104.5458,
      },
      {
        id: "DMX",
        name: "Des Moines, IA",
        latitude: 41.7311,
        longitude: -93.7228,
      },
      {
        id: "DTX",
        name: "Detroit, MI",
        latitude: 42.6997,
        longitude: -83.4717,
      },
      {
        id: "DDC",
        name: "Dodge City, KS",
        latitude: 37.7608,
        longitude: -99.9689,
      },
      {
        id: "DOX",
        name: "Dover AFB, DE",
        latitude: 38.8256,
        longitude: -75.44,
      },
      {
        id: "DLH",
        name: "Duluth, MN",
        latitude: 46.8369,
        longitude: -92.2097,
      },
      {
        id: "DYX",
        name: "Dyess AFB, TX",
        latitude: 32.5383,
        longitude: -99.2544,
      },
      {
        id: "EYX",
        name: "Edwards AFB, CA",
        latitude: 35.0978,
        longitude: -117.5608,
      },
      {
        id: "EVX",
        name: "Eglin AFB, FL",
        latitude: 30.5644,
        longitude: -85.9214,
      },
      {
        id: "EPZ",
        name: "El Paso, TX",
        latitude: 31.8731,
        longitude: -106.6981,
      },
      {
        id: "LRX",
        name: "Elko, NV",
        latitude: 40.7397,
        longitude: -116.8028,
      },
      {
        id: "BHX",
        name: "Eureka, CA",
        latitude: 40.4983,
        longitude: -124.2922,
      },
      {
        id: "APD",
        name: "Fairbanks, AK",
        latitude: 65.035,
        longitude: -147.5017,
      },
      {
        id: "FSX",
        name: "Flagstaff, AZ",
        latitude: 34.5744,
        longitude: -111.1978,
      },
      {
        id: "HPX",
        name: "Fort Campbell, KY",
        latitude: 36.7367,
        longitude: -87.2853,
      },
      {
        id: "GRK",
        name: "Fort Hood, TX",
        latitude: 30.7219,
        longitude: -97.3828,
      },
      {
        id: "POE",
        name: "Fort Polk, LA",
        latitude: 31.1556,
        longitude: -92.9758,
      },
      {
        id: "EOX",
        name: "Fort Rucker, AL",
        latitude: 31.4606,
        longitude: -85.4594,
      },
      {
        id: "SRX",
        name: "Fort Smith, AR",
        latitude: 35.2906,
        longitude: -94.3617,
      },
      {
        id: "IWX",
        name: "Fort Wayne, IN",
        latitude: 41.3589,
        longitude: -85.7,
      },
      {
        id: "APX",
        name: "Gaylord, MI",
        latitude: 44.9072,
        longitude: -84.7197,
      },
      {
        id: "GGW",
        name: "Glasgow, MT",
        latitude: 48.2064,
        longitude: -106.625,
      },
      {
        id: "GLD",
        name: "Goodland, KS",
        latitude: 39.3669,
        longitude: -101.7003,
      },
      {
        id: "MVX",
        name: "Grand Forks, ND",
        latitude: 47.5278,
        longitude: -97.3256,
      },
      {
        id: "GJX",
        name: "Grand Junction, CO",
        latitude: 39.0622,
        longitude: -108.2139,
      },
      {
        id: "GRR",
        name: "Grand Rapids, MI",
        latitude: 42.8939,
        longitude: -85.5447,
      },
      {
        id: "TFX",
        name: "Great Falls, MT",
        latitude: 47.4597,
        longitude: -111.3853,
      },
      {
        id: "GRB",
        name: "Green Bay, WI",
        latitude: 44.4983,
        longitude: -88.1114,
      },
      {
        id: "GSP",
        name: "Greer, SC",
        latitude: 34.8833,
        longitude: -82.22,
      },
      {
        id: "RMX",
        name: "Griffiss AFB, NY",
        latitude: 43.4678,
        longitude: -75.4578,
      },
      {
        id: "UEX",
        name: "Hastings, NE",
        latitude: 40.3208,
        longitude: -98.4419,
      },
      {
        id: "HDX",
        name: "Holloman AFB, NM",
        latitude: 33.0764,
        longitude: -106.1228,
      },
      {
        id: "CBW",
        name: "Houlton, ME",
        latitude: 46.0392,
        longitude: -67.8064,
      },
      {
        id: "HGX",
        name: "Houston/Galveston, TX",
        latitude: 29.4719,
        longitude: -95.0792,
      },
      {
        id: "HTX",
        name: "Huntsville, AL",
        latitude: 34.9306,
        longitude: -86.0833,
      },
      {
        id: "IND",
        name: "Indianapolis, IN",
        latitude: 39.7075,
        longitude: -86.2803,
      },
      {
        id: "JKL",
        name: "Jackson, KY",
        latitude: 37.5908,
        longitude: -83.3131,
      },
      {
        id: "DGX",
        name: "Jackson, MS",
        latitude: 32.3178,
        longitude: -90.08,
      },
      {
        id: "JAX",
        name: "Jacksonville, FL",
        latitude: 30.4847,
        longitude: -81.7019,
      },
      {
        id: "ODN",
        name: "Kadena, Okinawa",
        latitude: 26.3019,
        longitude: 127.9097,
      },
      {
        id: "HKN",
        name: "Kamuela, HI",
        latitude: 20.1256,
        longitude: -155.7778,
      },
      {
        id: "EAX",
        name: "Kansas City, MO",
        latitude: 38.8103,
        longitude: -94.2644,
      },
      {
        id: "BYX",
        name: "Key West, FL",
        latitude: 24.5975,
        longitude: -81.7031,
      },
      {
        id: "AKC",
        name: "King Salmon, AK",
        latitude: 58.6794,
        longitude: -156.6294,
      },
      {
        id: "MRX",
        name: "Knoxville/Tri-Cities, TN",
        latitude: 36.1686,
        longitude: -83.4017,
      },
      {
        id: "KJK",
        name: "Kunsan AB, Korea",
        latitude: 35.9242,
        longitude: 126.6222,
      },
      {
        id: "ARX",
        name: "La Crosse, WI",
        latitude: 43.8228,
        longitude: -91.1911,
      },
      {
        id: "PLA",
        name: "Lajes AB, Azores",
        latitude: 38.7303,
        longitude: -27.3217,
      },
      {
        id: "LCH",
        name: "Lake Charles, LA",
        latitude: 30.1253,
        longitude: -93.2158,
      },
      {
        id: "ESX",
        name: "Las Vegas, NV",
        latitude: 35.7011,
        longitude: -114.8914,
      },
      {
        id: "DFX",
        name: "Laughlin AFB, TX",
        latitude: 29.2728,
        longitude: -100.2806,
      },
      {
        id: "ILX",
        name: "Lincoln, IL",
        latitude: 40.1506,
        longitude: -89.3367,
      },
      {
        id: "LZK",
        name: "Little Rock, AR",
        latitude: 34.8364,
        longitude: -92.2622,
      },
      {
        id: "VTX",
        name: "Los Angeles, CA",
        latitude: 34.4117,
        longitude: -119.1794,
      },
      {
        id: "LVX",
        name: "Louisville, KY",
        latitude: 37.9753,
        longitude: -85.9439,
      },
      {
        id: "LBB",
        name: "Lubbock, TX",
        latitude: 33.6542,
        longitude: -101.8142,
      },
      {
        id: "MQT",
        name: "Marquette, MI",
        latitude: 46.5311,
        longitude: -87.5483,
      },
      {
        id: "MXX",
        name: "Maxwell AFB, AL",
        latitude: 32.5367,
        longitude: -85.7897,
      },
      {
        id: "MAX",
        name: "Medford, OR",
        latitude: 42.0811,
        longitude: -122.7172,
      },
      {
        id: "MLB",
        name: "Melbourne, FL",
        latitude: 28.1133,
        longitude: -80.6542,
      },
      {
        id: "NQA",
        name: "Memphis, TN",
        latitude: 35.3447,
        longitude: -89.8733,
      },
      {
        id: "AMX",
        name: "Miami, FL",
        latitude: 25.6111,
        longitude: -80.4128,
      },
      {
        id: "AIH",
        name: "Middleton Island, AK",
        latitude: 59.4614,
        longitude: -146.3031,
      },
      {
        id: "MAF",
        name: "Midland/Odessa, TX",
        latitude: 31.9433,
        longitude: -102.1894,
      },
      {
        id: "MKX",
        name: "Milwaukee, WI",
        latitude: 42.9678,
        longitude: -88.5506,
      },
      {
        id: "MPX",
        name: "Minneapolis/St. Paul, MN",
        latitude: 44.8489,
        longitude: -93.5656,
      },
      {
        id: "MBX",
        name: "Minot AFB, ND",
        latitude: 48.3925,
        longitude: -100.8644,
      },
      {
        id: "MSX",
        name: "Missoula, MT",
        latitude: 47.0411,
        longitude: -113.9864,
      },
      {
        id: "MOB",
        name: "Mobile, AL",
        latitude: 30.6794,
        longitude: -88.2397,
      },
      {
        id: "HMO",
        name: "Molokai, HI",
        latitude: 21.1328,
        longitude: -157.18,
      },
      {
        id: "VAX",
        name: "Moody AFB, GA",
        latitude: 30.3903,
        longitude: -83.0017,
      },
      {
        id: "MHX",
        name: "Morehead City, NC",
        latitude: 34.7761,
        longitude: -76.8761,
      },
      {
        id: "OHX",
        name: "Nashville, TN",
        latitude: 36.2472,
        longitude: -86.5625,
      },
      {
        id: "LIX",
        name: "New Orleans, LA",
        latitude: 30.3367,
        longitude: -89.8256,
      },
      {
        id: "OKX",
        name: "New York City, NY",
        latitude: 40.8656,
        longitude: -72.8639,
      },
      {
        id: "AEC",
        name: "Nome, AK",
        latitude: 64.5114,
        longitude: -165.295,
      },
      {
        id: "AKQ",
        name: "Norfolk/Richmond, VA",
        latitude: 36.9839,
        longitude: -77.0072,
      },
      {
        id: "LNX",
        name: "North Platte, NE",
        latitude: 41.9578,
        longitude: -100.5764,
      },
      {
        id: "TLX",
        name: "Oklahoma City, OK",
        latitude: 35.3331,
        longitude: -97.2775,
      },
      {
        id: "OAX",
        name: "Omaha, NE",
        latitude: 41.3203,
        longitude: -96.3667,
      },
      {
        id: "PAH",
        name: "Paducah, KY",
        latitude: 37.0683,
        longitude: -88.7719,
      },
      {
        id: "PDT",
        name: "Pendleton, OR",
        latitude: 45.6906,
        longitude: -118.8528,
      },
      {
        id: "DIX",
        name: "Philadelphia, PA",
        latitude: 39.9469,
        longitude: -74.4108,
      },
      {
        id: "IWA",
        name: "Phoenix, AZ",
        latitude: 33.2892,
        longitude: -111.67,
      },
      {
        id: "PBZ",
        name: "Pittsburgh, PA",
        latitude: 40.5317,
        longitude: -80.2181,
      },
      {
        id: "SFX",
        name: "Pocatello/Idaho Falls, ID",
        latitude: 43.1056,
        longitude: -112.6861,
      },
      {
        id: "GYX",
        name: "Portland, ME",
        latitude: 43.8914,
        longitude: -70.2564,
      },
      {
        id: "RTX",
        name: "Portland, OR",
        latitude: 45.7147,
        longitude: -122.9658,
      },
      {
        id: "PUX",
        name: "Pueblo, CO",
        latitude: 38.4594,
        longitude: -104.1814,
      },
      {
        id: "RAX",
        name: "Raleigh/Durham, NC",
        latitude: 35.6656,
        longitude: -78.4897,
      },
      {
        id: "UDX",
        name: "Rapid City, SD",
        latitude: 44.1247,
        longitude: -102.8297,
      },
      {
        id: "RGX",
        name: "Reno, NV",
        latitude: 39.7544,
        longitude: -119.4622,
      },
      {
        id: "RIW",
        name: "Riverton, WY",
        latitude: 43.0661,
        longitude: -108.4772,
      },
      {
        id: "FCX",
        name: "Roanoke, VA",
        latitude: 37.0244,
        longitude: -80.2739,
      },
      {
        id: "JGX",
        name: "Robins AFB, GA",
        latitude: 32.6753,
        longitude: -83.3511,
      },
      {
        id: "DAX",
        name: "Sacramento, CA",
        latitude: 38.5011,
        longitude: -121.6778,
      },
      {
        id: "LSX",
        name: "Saint Louis, MO",
        latitude: 38.6989,
        longitude: -90.6828,
      },
      {
        id: "MTX",
        name: "Salt Lake City, UT",
        latitude: 41.2628,
        longitude: -112.4481,
      },
      {
        id: "SJT",
        name: "San Angelo, TX",
        latitude: 31.3714,
        longitude: -100.4925,
      },
      {
        id: "NKX",
        name: "San Diego, CA",
        latitude: 32.9189,
        longitude: -117.0419,
      },
      {
        id: "MUX",
        name: "San Francisco, CA",
        latitude: 37.1553,
        longitude: -121.8983,
      },
      {
        id: "HNX",
        name: "San Joaquin Valley, CA",
        latitude: 36.3142,
        longitude: -119.6319,
      },
      {
        id: "JUA",
        name: "San Juan, PR",
        latitude: 18.1156,
        longitude: -66.0778,
      },
      {
        id: "SOX",
        name: "Santa Ana Mountains, CA",
        latitude: 33.8178,
        longitude: -117.6358,
      },
      {
        id: "ATX",
        name: "Seattle/Tacoma, WA",
        latitude: 48.1944,
        longitude: -122.4958,
      },
      {
        id: "SHV",
        name: "Shreveport, LA",
        latitude: 32.4508,
        longitude: -93.8414,
      },
      {
        id: "FSD",
        name: "Sioux Falls, SD",
        latitude: 43.5878,
        longitude: -96.7294,
      },
      {
        id: "ACG",
        name: "Sitka, AK",
        latitude: 56.8528,
        longitude: -135.5292,
      },
      {
        id: "HKI",
        name: "South Kauai, HI",
        latitude: 21.8942,
        longitude: -159.5522,
      },
      {
        id: "HWA",
        name: "South Shore, HI",
        latitude: 19.095,
        longitude: -155.5689,
      },
      {
        id: "OTX",
        name: "Spokane, WA",
        latitude: 47.6803,
        longitude: -117.6267,
      },
      {
        id: "SGF",
        name: "Springfield, MO",
        latitude: 37.2353,
        longitude: -93.4006,
      },
      {
        id: "CCX",
        name: "State College, PA",
        latitude: 40.9231,
        longitude: -78.0036,
      },
      {
        id: "LWX",
        name: "Sterling, VA",
        latitude: 38.9753,
        longitude: -77.4778,
      },
      {
        id: "TLH",
        name: "Tallahassee, FL",
        latitude: 30.3975,
        longitude: -84.3289,
      },
      {
        id: "TBW",
        name: "Tampa, FL",
        latitude: 27.7056,
        longitude: -82.4017,
      },
      {
        id: "TWX",
        name: "Topeka, KS",
        latitude: 38.9969,
        longitude: -96.2325,
      },
      {
        id: "EMX",
        name: "Tucson, AZ",
        latitude: 31.8936,
        longitude: -110.6303,
      },
      {
        id: "INX",
        name: "Tulsa, OK",
        latitude: 36.175,
        longitude: -95.5647,
      },
      {
        id: "VNX",
        name: "Vance AFB, OK",
        latitude: 36.7408,
        longitude: -98.1278,
      },
      {
        id: "VBX",
        name: "Vandenberg AFB, CA",
        latitude: 34.8381,
        longitude: -120.3975,
      },
      {
        id: "ICT",
        name: "Wichita, KS",
        latitude: 37.6547,
        longitude: -97.4428,
      },
      {
        id: "LTX",
        name: "Wilmington, NC",
        latitude: 33.9894,
        longitude: -78.4289,
      },
      {
        id: "YUX",
        name: "Yuma, AZ",
        latitude: 32.4953,
        longitude: -114.6567,
      },
    ];
  } catch (error) {
    console.error("Error fetching radar sites:", error);
    return [];
  }
}

function populateRadarSitesDropdown(sites) {
  const select = document.getElementById("radarSiteSelect");
  select.innerHTML = '<option value="">Select a radar site</option>';

  let optionsHtml = sites
    .map(
      (site) => `<option value="${site.id}">${site.id} - ${site.name}</option>`,
    )
    .join("");
  select.insertAdjacentHTML("beforeend", optionsHtml);
}

function addRadarSitesToMap(map, sites) {
  const features = sites.map((site) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [site.longitude, site.latitude],
    },
    properties: {
      id: site.id,
      name: site.name,
    },
  }));

  map.on("load", () => {
    map.addSource("radar-sites", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: features,
      },
    });
    map.addLayer({
      id: "radar-sites-layer",
      type: "circle",
      source: "radar-sites",
      paint: {
        "circle-radius": 6,
        "circle-color": "#B42222",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#FFFFFF",
      },
    });

    map.on("click", "radar-sites-layer", (e) => {
      const siteId = e.features[0].properties.id;
      const siteName = e.features[0].properties.name;

      document.getElementById("radarSiteSelect").value = siteId;

      const event = new Event("change");
      document.getElementById("radarSiteSelect").dispatchEvent(event);
    });

    map.on("mouseenter", "radar-sites-layer", () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "radar-sites-layer", () => {
      map.getCanvas().style.cursor = "";
    });
  });
}

/**
 * Generates a Uint8Array for a 1D texture to be used as a color ramp in WebGL.
 * @param {Array} colorExpression The MapLibre color expression array.
 * @param {number} textureSize The width of the texture (e.g., 256).
 * @returns {{data: Uint8Array, minValue: number, maxValue: number}} The ramp texture data and its value domain.
 */
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

const RadarWebGLLayer = {
  id: radarLayerId,
  type: "custom",
  renderingMode: "3d",
  currentValueRange: { min: 0, max: 95 },

  onAdd: function (map, gl) {
    this.map = map;
    this.gl = gl;
    this.programValid = false;
    this.enableSmoothing = enableSmoothing;
    this.rawVertexLonLat = null;
    this.rawValues = null;
    this.smoothedValues = null;
    this.chunkFlashEndTime = 0;
    this.chunkFlashDurationMs = 420;

    customRadarLayerInstance = this;

    console.log("🔧 Initializing RadarWebGLLayer...");

    const vertexSource = `
      precision mediump float;
      uniform mat4 u_matrix;
          attribute vec2 a_position;
          attribute float a_dbz;
          attribute float a_distance; // Distance from radar in meters (pre-computed)
          varying float v_dbz;
          varying float v_distance;
          
          uniform float u_enable3D; // 0.0 or 1.0
          uniform float u_beamAngle; // Beam elevation angle in radians
          uniform float u_heightExaggeration; // Height multiplier

          void main() {
              vec2 pos = a_position;
              float elevation = 0.0;
              
              // Calculate 3D elevation if enabled
              if (u_enable3D > 0.5) {
                  // Use pre-computed distance from radar origin
                  float dist = a_distance;
                  
                  // Calculate beam height: height = distance * tan(angle)
                  // Add Earth curvature correction: curve = distance^2 / (2 * Earth_radius)
                  float beamHeight = dist * tan(u_beamAngle);
                  float earthCurve = (dist * dist) / (2.0 * 6371000.0); // Earth radius in meters
                  float actualHeight = beamHeight + earthCurve;
                  
                  // Apply exaggeration and convert to mercator Z
                  elevation = actualHeight * u_heightExaggeration / 100000.0; // Scale for visibility
              }
              
              gl_Position = u_matrix * vec4(pos, elevation, 1.0);
              v_dbz = a_dbz;
              v_distance = a_distance;
          }`;

    const fragmentSource = `
          precision mediump float;
          varying float v_dbz;
          varying float v_distance;
          uniform sampler2D u_color_ramp;
          uniform vec2 u_dbz_range;
          uniform float u_enableShadows;
          uniform float u_shadowOpacity;
          uniform float u_enable3D;
          uniform float u_chunkFlash;
          uniform float u_flash_enabled;
          uniform float u_flash_threshold;
          uniform float u_flash_opacity;

          void main() {
              float normalized_dbz = (v_dbz - u_dbz_range[0]) / (u_dbz_range[1] - u_dbz_range[0]);
              normalized_dbz = clamp(normalized_dbz, 0.0, 1.0);

              vec4 color = texture2D(u_color_ramp, vec2(normalized_dbz, 0.5));
              
              // Apply distance-based shadow in 3D mode
              if (u_enable3D > 0.5 && u_enableShadows > 0.5) {
                  // Darken based on distance for depth perception
                  float shadowFactor = 1.0 - (v_distance * u_shadowOpacity * 0.3);
                  shadowFactor = clamp(shadowFactor, 0.7, 1.0);
                  color.rgb *= shadowFactor;
              }

                // Arc-Sync pulse when a fresh Level 2 chunk lands
                color.rgb = mix(color.rgb, vec3(1.0), clamp(u_chunkFlash, 0.0, 1.0));

                // High dBZ flash overlay: blend toward white when enabled and value >= threshold
                if (u_flash_enabled > 0.5 && v_dbz >= u_flash_threshold) {
                    float ao = clamp(u_flash_opacity, 0.0, 1.0);
                    color.rgb = mix(color.rgb, vec3(1.0), ao);
                }

              gl_FragColor = color;
          }`;

    console.log("📝 Compiling vertex shader...");
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error(
        "❌ Vertex shader compile error:",
        gl.getShaderInfoLog(vertexShader),
      );
      this.programValid = false;
      return;
    }
    console.log("✅ Vertex shader compiled");

    console.log("📝 Compiling fragment shader...");
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error(
        "❌ Fragment shader compile error:",
        gl.getShaderInfoLog(fragmentShader),
      );
      this.programValid = false;
      return;
    }
    console.log("✅ Fragment shader compiled");

    console.log("🔗 Linking shader program...");
    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error(
        "❌ Program link error:",
        gl.getProgramInfoLog(this.program),
      );
      console.error("Vertex shader log:", gl.getShaderInfoLog(vertexShader));
      console.error(
        "Fragment shader log:",
        gl.getShaderInfoLog(fragmentShader),
      );

      console.warn("Attempting fallback 2D shader to keep layer functional...");

      const fallbackVertex = `
          uniform mat4 u_matrix;
          attribute vec2 a_position;
          attribute float a_dbz;
          varying float v_dbz;
          void main() {
            v_dbz = a_dbz;
            gl_Position = u_matrix * vec4(a_position, 0.0, 1.0);
          }`;

      const fallbackFragment = `
          precision mediump float;
          varying float v_dbz;
          uniform sampler2D u_color_ramp;
          uniform vec2 u_dbz_range;
          void main() {
            float normalized_dbz = (v_dbz - u_dbz_range[0]) / (u_dbz_range[1] - u_dbz_range[0]);
            normalized_dbz = clamp(normalized_dbz, 0.0, 1.0);
            gl_FragColor = texture2D(u_color_ramp, vec2(normalized_dbz, 0.5));
          }`;

      const fbV = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(fbV, fallbackVertex);
      gl.compileShader(fbV);
      const fbF = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fbF, fallbackFragment);
      gl.compileShader(fbF);

      const fbProg = gl.createProgram();
      gl.attachShader(fbProg, fbV);
      gl.attachShader(fbProg, fbF);
      gl.linkProgram(fbProg);
      if (!gl.getProgramParameter(fbProg, gl.LINK_STATUS)) {
        console.error(
          "Fallback program link failed:",
          gl.getProgramInfoLog(fbProg),
        );
        console.error("Fallback V log:", gl.getShaderInfoLog(fbV));
        console.error("Fallback F log:", gl.getShaderInfoLog(fbF));
        this.programValid = false;
      } else {
        this.program = fbProg;
        this.useFallbackProgram = true;
        this.programValid = true;
        console.log(
          "✅ Fallback 2D shader linked - using 2D rendering until 3D shader is fixed",
        );
      }
    } else {
      this.programValid = true;
      console.log("✅ WebGL program compiled and linked successfully");
    }

    this.a_pos_loc = gl.getAttribLocation(this.program, "a_position");
    this.a_dbz_loc = gl.getAttribLocation(this.program, "a_dbz");
    this.a_distance_loc = gl.getAttribLocation(this.program, "a_distance");
    this.u_matrix_loc = gl.getUniformLocation(this.program, "u_matrix");
    this.u_color_ramp_loc = gl.getUniformLocation(this.program, "u_color_ramp");
    this.u_dbz_range_loc = gl.getUniformLocation(this.program, "u_dbz_range");

    this.u_enable3D_loc = gl.getUniformLocation(this.program, "u_enable3D");
    this.u_beamAngle_loc = gl.getUniformLocation(this.program, "u_beamAngle");
    this.u_heightExaggeration_loc = gl.getUniformLocation(
      this.program,
      "u_heightExaggeration",
    );
    this.u_enableShadows_loc = gl.getUniformLocation(
      this.program,
      "u_enableShadows",
    );
    this.u_shadowOpacity_loc = gl.getUniformLocation(
      this.program,
      "u_shadowOpacity",
    );
    this.u_chunkFlash_loc = gl.getUniformLocation(this.program, "u_chunkFlash");
    this.u_flash_enabled_loc = gl.getUniformLocation(
      this.program,
      "u_flash_enabled",
    );
    this.u_flash_threshold_loc = gl.getUniformLocation(
      this.program,
      "u_flash_threshold",
    );
    this.u_flash_opacity_loc = gl.getUniformLocation(
      this.program,
      "u_flash_opacity",
    );

    if (this.a_pos_loc === -1 || this.a_dbz_loc === -1) {
      console.error("❌ Failed to get essential attribute locations:", {
        a_position: this.a_pos_loc,
        a_dbz: this.a_dbz_loc,
        a_distance: this.a_distance_loc,
      });
      this.programValid = false;
      return;
    }

    this.hasDistanceAttr = this.a_distance_loc !== -1;

    console.log("✅ Attribute locations:", {
      a_position: this.a_pos_loc,
      a_dbz: this.a_dbz_loc,
      a_distance: this.a_distance_loc,
      hasDistanceAttr: this.hasDistanceAttr,
    });

    this.positionBuffer = gl.createBuffer();
    this.dbzBuffer = gl.createBuffer();
    this.distanceBuffer = gl.createBuffer();
    this.vertexCount = 0;
    this.rawData = null;
    this.mercatorPositions = null;
    this.distanceData = null;
    this.needsMercatorUpdate = true;

    const vaoExt = gl.getExtension("OES_vertex_array_object");
    if (vaoExt) {
      this.vao = vaoExt.createVertexArrayOES();
      this.vaoExt = vaoExt;
      this.useVAO = true;
      console.log("VAO support detected - using VAO for faster rendering");
    } else {
      this.useVAO = false;
      console.log("VAO not supported - using standard attribute binding");
    }

    if (this.useVAO && this.vao) {
      this.vaoExt.bindVertexArrayOES(this.vao);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      if (this.a_pos_loc !== -1) {
        gl.enableVertexAttribArray(this.a_pos_loc);
        gl.vertexAttribPointer(this.a_pos_loc, 2, gl.FLOAT, false, 0, 0);
      }

      gl.bindBuffer(gl.ARRAY_BUFFER, this.dbzBuffer);
      if (this.a_dbz_loc !== -1) {
        gl.enableVertexAttribArray(this.a_dbz_loc);
        gl.vertexAttribPointer(this.a_dbz_loc, 1, gl.FLOAT, false, 0, 0);
      }

      if (this.hasDistanceAttr && this.a_distance_loc !== -1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.distanceBuffer);
        gl.enableVertexAttribArray(this.a_distance_loc);
        gl.vertexAttribPointer(this.a_distance_loc, 1, gl.FLOAT, false, 0, 0);
      }

      this.vaoExt.bindVertexArrayOES(null);
    }

    const productInfo = getRadarProductInfo(selectedRadarProduct);
    const {
      data: colorRampData,
      minValue,
      maxValue,
    } = generateColorRampArray(productInfo.colorExpression, 256);
    this.currentValueRange = { min: minValue, max: maxValue };
    this.colorRampTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.colorRampTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      colorRampData,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  },

  updateData: function (data) {
    console.time("updateData-TOTAL");
    console.log(
      `Processing ${data ? data.vertices.length / 2 : 0} vertices...`,
    );
    const hasData = Boolean(data && data.vertices && data.values);
    this.vertexCount = hasData ? data.vertices.length / 2 : 0;
    this.rawVertexLonLat = hasData ? new Float32Array(data.vertices) : null;
    this.rawValues = hasData ? new Float32Array(data.values) : null;

    if (
      hasData &&
      useStormMotion &&
      radarSiteLocation &&
      selectedRadarProduct.match(/N[0-3][GS]$/)
    ) {
      console.log(
        `Calculating SRV with storm motion: U=${stormMotionU} mph, V=${stormMotionV} mph`,
      );
      this.rawValues = calculateStormRelativeVelocity(
        this.rawVertexLonLat,
        this.rawValues,
        radarSiteLocation.longitude,
        radarSiteLocation.latitude,
        stormMotionU,
        stormMotionV,
      );
    }

    this.smoothedValues = null;
    this.rawData = hasData
      ? { vertices: this.rawVertexLonLat, values: this.rawValues }
      : null;

    if (this.gl && hasData && this.rawVertexLonLat) {
      const gl = this.gl;

      console.time("1-mercator-conversion");
      const vertices = this.rawVertexLonLat;
      const mercatorCoords = new Float32Array(vertices.length);
      const distances = new Float32Array(vertices.length / 2);

      const DEG_TO_RAD = Math.PI / 180;
      const RAD_TO_DEG = 180 / Math.PI;
      const PI_4 = Math.PI / 4;
      const MIN_LAT = -85.0511 * DEG_TO_RAD;
      const MAX_LAT = 85.0511 * DEG_TO_RAD;

      const radarOriginMercator = radarSiteLocation
        ? [
            (radarSiteLocation.longitude + 180) / 360,
            (180 -
              RAD_TO_DEG *
                Math.log(
                  Math.tan(
                    PI_4 +
                      Math.max(
                        MIN_LAT,
                        Math.min(
                          MAX_LAT,
                          radarSiteLocation.latitude * DEG_TO_RAD,
                        ),
                      ) /
                        2,
                  ),
                )) /
              360,
          ]
        : [0, 0];

      for (let i = 0, j = 0; i < vertices.length; i += 2, j++) {
        const lng = vertices[i];
        const lat = vertices[i + 1];

        const mercX = (lng + 180) / 360;
        mercatorCoords[i] = mercX;

        const latRad = Math.max(MIN_LAT, Math.min(MAX_LAT, lat * DEG_TO_RAD));
        const mercY =
          (180 - RAD_TO_DEG * Math.log(Math.tan(PI_4 + latRad / 2))) / 360;
        mercatorCoords[i + 1] = mercY;

        if (radarSiteLocation) {
          const dx = mercX - radarOriginMercator[0];
          const dy = mercY - radarOriginMercator[1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          distances[j] = Math.min(dist * 100, 1.0);
        } else {
          distances[j] = 0.0;
        }
      }
      this.mercatorPositions = mercatorCoords;
      this.distanceData = distances;
      console.timeEnd("1-mercator-conversion");

      console.time("2-buffer-upload");

      const valueArray = this.getActiveValueArray() || this.rawValues;

      if (this.useVAO && this.vao) {
        this.vaoExt.bindVertexArrayOES(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.mercatorPositions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.a_pos_loc);
        gl.vertexAttribPointer(this.a_pos_loc, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.dbzBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, valueArray, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.a_dbz_loc);
        gl.vertexAttribPointer(this.a_dbz_loc, 1, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.distanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.distanceData, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(this.a_distance_loc);
        gl.vertexAttribPointer(this.a_distance_loc, 1, gl.FLOAT, false, 0, 0);

        this.vaoExt.bindVertexArrayOES(null);
      } else {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.mercatorPositions, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.dbzBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, valueArray, gl.STATIC_DRAW);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.distanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.distanceData, gl.STATIC_DRAW);
      }

      console.timeEnd("2-buffer-upload");

      this.needsMercatorUpdate = false;
      this.rawData = {
        vertices: this.rawVertexLonLat,
        values: valueArray,
      };
    }

    console.timeEnd("updateData-TOTAL");
    console.time("3-triggerRepaint");
    if (this.map) {
      this.map.triggerRepaint();
    }
    console.timeEnd("3-triggerRepaint");
  },

  triggerChunkFlash: function () {
    this.chunkFlashEndTime = performance.now() + this.chunkFlashDurationMs;
    if (this.map) {
      this.map.triggerRepaint();
    }
  },

  removeData: function () {
    this.rawData = null;
    this.mercatorPositions = null;
    this.vertexCount = 0;
    this.needsMercatorUpdate = true;
    this.rawVertexLonLat = null;
    this.rawValues = null;
    this.smoothedValues = null;
    if (this.map) {
      this.map.triggerRepaint();
    }
  },

  render: function (gl, matrix) {
    if (!this.programValid) {
      console.warn("Skipping render - shader program is invalid");
      return;
    }

    if (!this.mercatorPositions || this.vertexCount === 0) return;

    gl.useProgram(this.program);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    if (enable3DTilt) {
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
    } else {
      gl.disable(gl.DEPTH_TEST);
    }

    if (this.u_matrix_loc)
      gl.uniformMatrix4fv(this.u_matrix_loc, false, matrix);

    if (this.u_enable3D_loc)
      gl.uniform1f(this.u_enable3D_loc, enable3DTilt ? 1.0 : 0.0);
    if (this.u_beamAngle_loc)
      gl.uniform1f(this.u_beamAngle_loc, (beamElevationAngle * Math.PI) / 180);
    if (this.u_heightExaggeration_loc)
      gl.uniform1f(this.u_heightExaggeration_loc, tiltExaggeration);
    if (this.u_enableShadows_loc)
      gl.uniform1f(this.u_enableShadows_loc, enableShadows ? 1.0 : 0.0);
    if (this.u_shadowOpacity_loc)
      gl.uniform1f(this.u_shadowOpacity_loc, shadowOpacity);

    const now = performance.now();
    const flashRemaining = Math.max(0, this.chunkFlashEndTime - now);
    const chunkFlash =
      flashRemaining > 0
        ? Math.min(1, flashRemaining / this.chunkFlashDurationMs)
        : 0;
    if (this.u_chunkFlash_loc) {
      gl.uniform1f(this.u_chunkFlash_loc, chunkFlash);
    }

    if (this.u_flash_enabled_loc) {
      const enabled = enableAlertFlashing ? 1.0 : 0.0;
      gl.uniform1f(this.u_flash_enabled_loc, enabled);
    }
    if (this.u_flash_threshold_loc) {
      gl.uniform1f(
        this.u_flash_threshold_loc,
        Number(HIGH_DBZ_FLASH_THRESHOLD) || 50,
      );
    }
    if (this.u_flash_opacity_loc) {
      // Smooth sine-based flash opacity between 0.20 and 0.55 (dedicated high-dBZ period)
      const nowMs = performance.now();
      const period = Math.max(50, Number(HIGH_DBZ_FLASH_PERIOD_MS) || 1400);
      const phase = ((nowMs % period) / period) * Math.PI * 2;
      const smoothOpacity = 0.2 + 0.35 * (0.5 * (1 + Math.sin(phase))); // ~0.20-0.55
      gl.uniform1f(this.u_flash_opacity_loc, smoothOpacity);
    }

    if (this.useVAO && this.vao) {
      this.vaoExt.bindVertexArrayOES(this.vao);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.enableVertexAttribArray(this.a_pos_loc);
      gl.vertexAttribPointer(this.a_pos_loc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this.dbzBuffer);
      gl.enableVertexAttribArray(this.a_dbz_loc);
      gl.vertexAttribPointer(this.a_dbz_loc, 1, gl.FLOAT, false, 0, 0);

      if (this.hasDistanceAttr && this.a_distance_loc !== -1) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.distanceBuffer);
        gl.enableVertexAttribArray(this.a_distance_loc);
        gl.vertexAttribPointer(this.a_distance_loc, 1, gl.FLOAT, false, 0, 0);
      }
    }

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.colorRampTexture);
    if (this.u_color_ramp_loc) gl.uniform1i(this.u_color_ramp_loc, 0);
    if (this.u_dbz_range_loc) {
      const range = this.currentValueRange || { min: 0, max: 95 };
      gl.uniform2f(this.u_dbz_range_loc, range.min, range.max);
    }

    if (this.enableSmoothing || enableSmoothing) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.blendEquation(gl.FUNC_ADD);
    }

    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);

    if (this.useVAO && this.vao) {
      this.vaoExt.bindVertexArrayOES(null);
    }

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);

    if (chunkFlash > 0 && this.map) {
      this.map.triggerRepaint();
    }
  },

  ensureSmoothedValues: function () {
    if (!this.rawVertexLonLat || !this.rawValues) {
      return null;
    }
    if (
      this.smoothedValues &&
      this.smoothedValues.length === this.rawValues.length
    ) {
      return this.smoothedValues;
    }

    this.smoothedValues = computeBilinearCornerValues(
      this.rawVertexLonLat,
      this.rawValues,
    );
    return this.smoothedValues;
  },

  getActiveValueArray: function () {
    if (!this.rawValues) {
      return null;
    }
    const smoothingActive = this.enableSmoothing || enableSmoothing;
    if (!smoothingActive) {
      return this.rawValues;
    }
    const smoothed = this.ensureSmoothedValues();
    return smoothed || this.rawValues;
  },

  setSmoothingEnabled: function (flag) {
    this.enableSmoothing = flag;
    if (!this.gl || !this.dbzBuffer || !this.rawValues) {
      if (this.map) {
        this.map.triggerRepaint();
      }
      return;
    }

    const gl = this.gl;
    const valueArray = this.getActiveValueArray() || this.rawValues;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dbzBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, valueArray, gl.STATIC_DRAW);
    this.rawData = {
      vertices: this.rawVertexLonLat,
      values: valueArray,
    };
    if (this.map) {
      this.map.triggerRepaint();
    }
    updateAllProbes();
  },

  updateColorRamp: function (product) {
    if (!this.gl || !this.colorRampTexture) {
      console.warn("Cannot update color ramp: WebGL context not initialized");
      return;
    }

    const gl = this.gl;
    const productInfo = getRadarProductInfo(product);
    const {
      data: colorRampData,
      minValue,
      maxValue,
    } = generateColorRampArray(productInfo.colorExpression, 256);
    this.currentValueRange = { min: minValue, max: maxValue };

    gl.bindTexture(gl.TEXTURE_2D, this.colorRampTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      colorRampData,
    );

    console.log(
      `✅ Updated color ramp for product: ${product} (${productInfo.name})`,
    );

    if (this.map) {
      this.map.triggerRepaint();
    }
  },

  onRemove: function (gl) {
    if (this.program) gl.deleteProgram(this.program);
    if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
    if (this.dbzBuffer) gl.deleteBuffer(this.dbzBuffer);
    if (this.distanceBuffer) gl.deleteBuffer(this.distanceBuffer);
    if (this.colorRampTexture) gl.deleteTexture(this.colorRampTexture);

    if (this.useVAO && this.vao && this.vaoExt) {
      this.vaoExt.deleteVertexArrayOES(this.vao);
    }

    this.rawData = null;
    this.mercatorPositions = null;
    this.vertexCount = 0;
    customRadarLayerInstance = null;
    console.log(
      "Custom layer instance's onRemove called. WebGL resources cleaned up.",
    );
  },
};

let lastRadarKey = null;
let latestArcSyncState = null;
let lastRenderedRadarToken = null;
let radarPollingTimer = null;
const POLLING_INTERVAL = 15000;
const LEVEL2_POLLING_INTERVAL = 5000;
let arcSyncEnabled = true;
let arcSyncEventSource = null;
let arcSyncSessionKey = null;
let arcSyncReconnectTimer = null;
const ARC_SYNC_RECONNECT_MS = 4000;

// Partial-scan flash state (used when a sweep is still filling in)
const partialScanFlash = {
  active: false,
  rafId: null,
  startTs: 0,
  periodMs: 1000,
  minOpacity: 0.25,
  maxOpacity: 0.5,
};

function _b64ToUint8Array(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function _setHighDbzOpacity(map, v) {
  try {
    if (map && map.getLayer && map.getLayer("radar-high-dbz-flash")) {
      map.setPaintProperty("radar-high-dbz-flash", "fill-opacity", v);
    }
  } catch (e) {
    // Ignore errors when map not ready
  }
}

function _partialFlashTick(map) {
  const now = performance.now();
  const t =
    ((now - partialScanFlash.startTs) % partialScanFlash.periodMs) /
    partialScanFlash.periodMs; // 0..1
  // sinusoidal between min and max
  const v =
    partialScanFlash.minOpacity +
    (partialScanFlash.maxOpacity - partialScanFlash.minOpacity) *
      (0.5 * (1 + Math.sin(2 * Math.PI * t)));
  _setHighDbzOpacity(map, v);
  partialScanFlash.rafId = requestAnimationFrame(() => _partialFlashTick(map));
}

function startPartialScanFlash(map) {
  if (partialScanFlash.active) return;
  partialScanFlash.active = true;
  partialScanFlash.startTs = performance.now();
  if (partialScanFlash.rafId) cancelAnimationFrame(partialScanFlash.rafId);
  partialScanFlash.rafId = requestAnimationFrame(() => _partialFlashTick(map));
}

function stopPartialScanFlash(map) {
  if (!partialScanFlash.active) return;
  partialScanFlash.active = false;
  if (partialScanFlash.rafId) {
    cancelAnimationFrame(partialScanFlash.rafId);
    partialScanFlash.rafId = null;
  }
  // restore default opacity
  _setHighDbzOpacity(map, partialScanFlash.maxOpacity);
}

function formatBytesForArcSync(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "--";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatLocalDateTimeParts(isoString) {
  if (!isoString) {
    return { date: "--", time: "--" };
  }

  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return { date: "--", time: "--" };
  }

  const date = parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = parsed.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return { date, time };
}

function updateHRRRTimeCard(meta) {
  const runDateEl = document.getElementById("hrrrRunDateLocal");
  const runTimeEl = document.getElementById("hrrrRunTimeLocal");
  const validDateEl = document.getElementById("hrrrValidDateLocal");
  const validTimeEl = document.getElementById("hrrrValidTimeLocal");
  const unitsEl = document.getElementById("hrrrUnitsLabel");
  const hourValueEl = document.getElementById("hrrrForecastSliderValue");
  const numberInput = document.getElementById("hrrrForecastHour");
  const sliderInput = document.getElementById("hrrrForecastSlider");

  if (hourValueEl) {
    hourValueEl.textContent = `F${String(selectedHRRRForecastHour).padStart(2, "0")}`;
  }
  if (numberInput) {
    numberInput.value = String(selectedHRRRForecastHour);
  }
  if (sliderInput) {
    sliderInput.value = String(selectedHRRRForecastHour);
  }

  const runParts = formatLocalDateTimeParts(meta?.runIso);
  const validParts = formatLocalDateTimeParts(meta?.validIso);

  if (runDateEl) runDateEl.textContent = runParts.date;
  if (runTimeEl) runTimeEl.textContent = runParts.time;
  if (validDateEl) validDateEl.textContent = validParts.date;
  if (validTimeEl) validTimeEl.textContent = validParts.time;
  if (unitsEl) unitsEl.textContent = meta?.units || "--";
}

function setModelSmoothingState(enabled) {
  const smoothingToggle = document.getElementById("enableSmoothing");

  if (enabled) {
    enableSmoothing = true;
    if (customRadarLayerInstance?.setSmoothingEnabled) {
      customRadarLayerInstance.setSmoothingEnabled(true);
    }
    if (smoothingToggle) {
      smoothingToggle.checked = true;
      smoothingToggle.disabled = true;
      smoothingToggle.title = "Smoothing is always enabled for model data";
    }
    return;
  }

  enableSmoothing = !!radarSmoothingPreference;
  if (customRadarLayerInstance?.setSmoothingEnabled) {
    customRadarLayerInstance.setSmoothingEnabled(enableSmoothing);
  }
  if (smoothingToggle) {
    smoothingToggle.disabled = false;
    smoothingToggle.checked = enableSmoothing;
    smoothingToggle.title = "Bilinear Smoothing";
  }
}

function getCurrentMapBoundsObject(map) {
  const bounds =
    map && typeof map.getBounds === "function" ? map.getBounds() : null;
  if (!bounds) return null;
  return {
    minLon: bounds.getWest(),
    minLat: bounds.getSouth(),
    maxLon: bounds.getEast(),
    maxLat: bounds.getNorth(),
  };
}

function getRequestedHRRRVariable() {
  if (dataMode === "mrms") {
    return "refc";
  }
  if (precipTypeModeEnabled && selectedHRRRVariable === "refc") {
    return "refc_ptype";
  }
  return selectedHRRRVariable;
}

function applyModelControlConstraints() {
  const variableSelect = document.getElementById("hrrrVariableSelect");
  const forecastHourInput = document.getElementById("hrrrForecastHour");
  const forecastSlider = document.getElementById("hrrrForecastSlider");
  const forecastSliderValue = document.getElementById(
    "hrrrForecastSliderValue",
  );
  const mrmsMode = dataMode === "mrms";

  if (variableSelect) {
    Array.from(variableSelect.options).forEach((option) => {
      option.disabled = mrmsMode && option.value !== "refc";
    });

    if (mrmsMode && selectedHRRRVariable !== "refc") {
      selectedHRRRVariable = "refc";
      variableSelect.value = "refc";
    }
  }

  if (mrmsMode) {
    selectedHRRRForecastHour = 0;
  }

  if (forecastHourInput) {
    forecastHourInput.value = String(selectedHRRRForecastHour);
    forecastHourInput.disabled = mrmsMode;
    forecastHourInput.title = mrmsMode
      ? "MRMS uses latest observed scan only"
      : "Forecast hour";
  }

  if (forecastSlider) {
    forecastSlider.value = String(selectedHRRRForecastHour);
    forecastSlider.disabled = mrmsMode;
    forecastSlider.title = mrmsMode
      ? "MRMS uses latest observed scan only"
      : "Model forecast hour";
  }

  if (forecastSliderValue) {
    forecastSliderValue.textContent = `F${String(selectedHRRRForecastHour).padStart(2, "0")}`;
  }
}

async function applyPrecipTypeToModelReflectivityIfNeeded(
  map,
  modelData,
  requestedVariable,
) {
  if (
    !(
      precipTypeModeEnabled &&
      dataMode === "mrms" &&
      requestedVariable === "refc"
    )
  ) {
    return modelData;
  }

  const ptypeLookup = await fetchHRRRPTypeLookup(map);
  return applyPTypeEncodingToRadarData(modelData, ptypeLookup);
}

function getActiveModelLabel() {
  if (dataMode === "mrms") return "MRMS Seamless HSR";
  return MODEL_LABELS[selectedModel] || selectedModel.toUpperCase();
}

function makePTypeCoordKey(lon, lat, scale = PTYPE_LOOKUP_COORD_SCALE) {
  const x = Math.round(Number(lon) * scale);
  const y = Math.round(Number(lat) * scale);
  return `${x}|${y}`;
}

function decodePTypeCodeFromValue(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value >= 300) return 4;
  if (value >= 200) return 3;
  if (value >= 100) return 2;

  if (value <= 4.5) {
    return Math.max(1, Math.min(4, Math.round(value)));
  }

  return 1;
}

function resolvePTypeCodeFromLookup(
  lon,
  lat,
  ptypeLookup,
  scale,
  searchRadius,
) {
  const x = Math.round(Number(lon) * scale);
  const y = Math.round(Number(lat) * scale);

  const direct = ptypeLookup.get(`${x}|${y}`);
  if (direct) {
    return direct;
  }

  let bestCode = 1;
  for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
    for (let dy = -searchRadius; dy <= searchRadius; dy += 1) {
      if (dx === 0 && dy === 0) continue;
      const nearby = ptypeLookup.get(`${x + dx}|${y + dy}`);
      if (nearby && nearby > bestCode) {
        bestCode = nearby;
      }
    }
  }

  return bestCode;
}

function buildPTypeLookupFromTriangles(
  hrrrPTypeData,
  scale = PTYPE_LOOKUP_COORD_SCALE,
) {
  const lookup = new Map();
  if (!hrrrPTypeData?.vertices || !hrrrPTypeData?.values) {
    return lookup;
  }

  const vertices = hrrrPTypeData.vertices;
  const values = hrrrPTypeData.values;
  const pairCount = Math.min(values.length, Math.floor(vertices.length / 2));

  for (let i = 0; i < pairCount; i += 1) {
    const ptypeCode = decodePTypeCodeFromValue(values[i]);
    if (ptypeCode <= 0) {
      continue;
    }

    const lon = vertices[i * 2];
    const lat = vertices[i * 2 + 1];
    const key = makePTypeCoordKey(lon, lat, scale);
    const existing = lookup.get(key);
    if (!existing || ptypeCode > existing) {
      lookup.set(key, ptypeCode);
    }
  }

  return lookup;
}

function encodeDbzByPType(dbz, ptypeCode) {
  const clampedDbz = Math.max(0, Math.min(95, Number(dbz) || 0));
  switch (ptypeCode) {
    case 2:
      return 100 + clampedDbz;
    case 3:
      return 200 + clampedDbz;
    case 4:
      return 300 + clampedDbz;
    case 1:
    default:
      return clampedDbz;
  }
}

function applyPTypeEncodingToRadarData(radarData, ptypeLookup) {
  if (
    !radarData?.vertices ||
    !radarData?.values ||
    !ptypeLookup ||
    !(ptypeLookup.fine instanceof Map) ||
    !(ptypeLookup.coarse instanceof Map)
  ) {
    return radarData;
  }

  const encodedValues = new Float32Array(radarData.values.length);
  let matchedCount = 0;
  let nonRainCount = 0;

  for (let i = 0; i < radarData.values.length; i += 1) {
    const value = radarData.values[i];
    if (!Number.isFinite(value)) {
      encodedValues[i] = value;
      continue;
    }

    const lon = radarData.vertices[i * 2];
    const lat = radarData.vertices[i * 2 + 1];
    let ptypeCode = resolvePTypeCodeFromLookup(
      lon,
      lat,
      ptypeLookup.fine,
      PTYPE_LOOKUP_COORD_SCALE,
      2,
    );
    if (ptypeCode <= 1) {
      ptypeCode = resolvePTypeCodeFromLookup(
        lon,
        lat,
        ptypeLookup.coarse,
        PTYPE_LOOKUP_COARSE_SCALE,
        3,
      );
    }

    if (ptypeCode > 1) {
      nonRainCount += 1;
    }
    if (ptypeCode >= 1) {
      matchedCount += 1;
    }
    encodedValues[i] = encodeDbzByPType(value, ptypeCode);
  }

  const totalCount = radarData.values.length;
  const matchedPct = totalCount
    ? ((matchedCount / totalCount) * 100).toFixed(1)
    : "0.0";
  const nonRainPct = totalCount
    ? ((nonRainCount / totalCount) * 100).toFixed(1)
    : "0.0";
  console.log(
    `[PrecipType] Radar mapping total=${totalCount} matched=${matchedPct}% nonRain=${nonRainPct}% fineBins=${ptypeLookup.fine.size} coarseBins=${ptypeLookup.coarse.size}`,
  );

  return {
    vertices: radarData.vertices,
    values: encodedValues,
  };
}

async function fetchHRRRPTypeLookup(map) {
  const bounds = getCurrentMapBoundsObject(map);
  const cacheKey = JSON.stringify({
    model: selectedModel,
    runDate: selectedHRRRRunDate || "latest",
    runHour:
      selectedHRRRRunHour === null || selectedHRRRRunHour === undefined
        ? "latest"
        : Number(selectedHRRRRunHour),
    forecastHour: Number(selectedHRRRForecastHour) || 0,
    bounds,
  });

  const now = Date.now();
  const cached = hrrrPTypeLookupCache.get(cacheKey);
  if (cached && now - cached.time < HRRR_PTYPE_CACHE_TTL_MS) {
    return cached.lookup;
  }

  const params = new URLSearchParams({
    model: selectedModel,
    variable: "refc_ptype",
    forecast_hour: String(selectedHRRRForecastHour),
    format: "binary",
    stride: "1",
  });

  if (selectedHRRRRunDate && selectedHRRRRunHour !== null) {
    params.set("date", selectedHRRRRunDate);
    params.set("run_hour", String(selectedHRRRRunHour));
  }

  if (bounds) {
    params.set("minLon", String(bounds.minLon));
    params.set("minLat", String(bounds.minLat));
    params.set("maxLon", String(bounds.maxLon));
    params.set("maxLat", String(bounds.maxLat));
  }

  const fetchLookupWithParams = async (queryParams) => {
    const response = await fetch(
      `https://radar-api-production-076b.up.railway.app/api/hrrr-webgl?${queryParams.toString()}`,
    );
    if (!response.ok) {
      throw new Error(
        `Failed to fetch HRRR precip lookup (${response.status})`,
      );
    }

    const contentEncoding = response.headers.get("Content-Encoding");
    let arrayBuffer;
    if (contentEncoding === "gzip") {
      const blob = await response.blob();
      const decompressedStream = blob
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      const decompressedBlob = await new Response(decompressedStream).blob();
      arrayBuffer = await decompressedBlob.arrayBuffer();
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

    const ptypeData = parseBinaryRadarData(arrayBuffer);
    const lookup = {
      fine: buildPTypeLookupFromTriangles(ptypeData, PTYPE_LOOKUP_COORD_SCALE),
      coarse: buildPTypeLookupFromTriangles(
        ptypeData,
        PTYPE_LOOKUP_COARSE_SCALE,
      ),
    };
    return { lookup, vertexCount: ptypeData.values.length };
  };

  let { lookup, vertexCount } = await fetchLookupWithParams(params);

  if (bounds && lookup.fine.size === 0 && lookup.coarse.size === 0) {
    console.warn(
      "[PrecipType] Empty bounded ptype lookup; retrying without bounds",
    );
    const unboundedParams = new URLSearchParams(params);
    unboundedParams.delete("minLon");
    unboundedParams.delete("minLat");
    unboundedParams.delete("maxLon");
    unboundedParams.delete("maxLat");
    ({ lookup, vertexCount } = await fetchLookupWithParams(unboundedParams));
  }

  console.log(
    `[PrecipType] HRRR ptype fetch vertices=${vertexCount} fineBins=${lookup.fine.size} coarseBins=${lookup.coarse.size}`,
  );
  hrrrPTypeLookupCache.set(cacheKey, { time: now, lookup });
  return lookup;
}

async function fetchAvailableHRRRRuns() {
  const requestedVariable = getRequestedHRRRVariable();
  const params = new URLSearchParams({
    model: selectedModel,
    variable: requestedVariable,
    forecast_hour: String(selectedHRRRForecastHour),
    lookback: HRRR_RUNS_LOOKBACK_HOURS,
    max_runs: HRRR_RUNS_MAX,
  });
  const cacheKey = params.toString();
  const now = Date.now();

  if (
    hrrrRunsCachePayload &&
    hrrrRunsCacheKey === cacheKey &&
    now - hrrrRunsCacheTime < HRRR_RUNS_CACHE_TTL_MS
  ) {
    return hrrrRunsCachePayload;
  }

  const response = await fetch(
    `https://radar-api-production-076b.up.railway.app/api/hrrr-runs?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to load HRRR runs (${response.status})`);
  }
  const payload = await response.json();
  hrrrRunsCacheKey = cacheKey;
  hrrrRunsCachePayload = payload;
  hrrrRunsCacheTime = now;
  return payload;
}

async function refreshHRRRRunSelector() {
  const runSelect = document.getElementById("hrrrRunSelect");
  if (!runSelect) return;

  const previousValue = runSelect.value;
  runSelect.innerHTML = `<option value="latest">Latest ${getActiveModelLabel()} run</option>`;

  try {
    const payload = await fetchAvailableHRRRRuns();
    const runs = Array.isArray(payload?.runs) ? payload.runs : [];

    for (const run of runs) {
      const runDate = String(run.date || "");
      const runHour = Number(run.hour);
      if (!runDate || !Number.isFinite(runHour)) continue;

      const value = `${runDate}|${String(runHour).padStart(2, "0")}`;
      const localParts = formatLocalDateTimeParts(run.runTimestampUtc);
      const label = `${runDate} ${String(runHour).padStart(2, "0")}z (${localParts.date} ${localParts.time})${run.isLastSuccessful ? " • last good" : ""}`;
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      runSelect.appendChild(option);
    }

    if (selectedHRRRRunDate && selectedHRRRRunHour !== null) {
      const selectedValue = `${selectedHRRRRunDate}|${String(selectedHRRRRunHour).padStart(2, "0")}`;
      if (runSelect.querySelector(`option[value="${selectedValue}"]`)) {
        runSelect.value = selectedValue;
      } else {
        runSelect.value = "latest";
        selectedHRRRRunDate = null;
        selectedHRRRRunHour = null;
      }
    } else if (
      previousValue &&
      runSelect.querySelector(`option[value="${previousValue}"]`)
    ) {
      runSelect.value = previousValue;
    } else {
      runSelect.value = "latest";
    }
  } catch (error) {
    console.warn("Failed to refresh HRRR run selector:", error);
    runSelect.value = "latest";
    selectedHRRRRunDate = null;
    selectedHRRRRunHour = null;
  }
}

function getModelLoopHours() {
  if (modelLoopMode !== "range") {
    return Array.from({ length: 49 }, (_, index) => index);
  }

  const start = Math.max(0, Math.min(48, Number(modelLoopStartHour) || 0));
  const end = Math.max(0, Math.min(48, Number(modelLoopEndHour) || 48));
  const minHour = Math.min(start, end);
  const maxHour = Math.max(start, end);
  const hours = [];
  for (let hour = minHour; hour <= maxHour; hour += 1) {
    hours.push(hour);
  }
  return hours;
}

function generateModelFrameCacheKey(
  model,
  variable,
  forecastHour,
  runDate,
  runHour,
  bounds,
) {
  const boundsKey = bounds
    ? `${bounds.minLon.toFixed(2)},${bounds.minLat.toFixed(2)},${bounds.maxLon.toFixed(2)},${bounds.maxLat.toFixed(2)}`
    : "nobounds";
  const runKey =
    runDate && runHour !== null ? `${runDate}_${runHour}` : "latest";
  return `${model}_${variable}_f${String(forecastHour).padStart(2, "0")}_${runKey}_${boundsKey}`;
}

function buildRenderableFrameFromRaw(
  rawData,
  timestampValue,
  keyValue,
  meta = null,
) {
  const rawVertices = new Float32Array(rawData.vertices);
  const rawValues = new Float32Array(rawData.values);
  const smoothedValues = computeBilinearCornerValues(rawVertices, rawValues);
  const mercatorCoords = new Float32Array(rawVertices.length);

  const DEG_TO_RAD = Math.PI / 180;
  const RAD_TO_DEG = 180 / Math.PI;
  const PI_4 = Math.PI / 4;
  const MIN_LAT = -85.0511 * DEG_TO_RAD;
  const MAX_LAT = 85.0511 * DEG_TO_RAD;

  for (let index = 0; index < rawVertices.length; index += 2) {
    const longitude = rawVertices[index];
    const latitude = rawVertices[index + 1];

    mercatorCoords[index] = (longitude + 180) / 360;
    const latitudeRadians = Math.max(
      MIN_LAT,
      Math.min(MAX_LAT, latitude * DEG_TO_RAD),
    );
    mercatorCoords[index + 1] =
      (180 - RAD_TO_DEG * Math.log(Math.tan(PI_4 + latitudeRadians / 2))) / 360;
  }

  return {
    mercatorPositions: mercatorCoords,
    rawVertices,
    rawValues,
    smoothedValues,
    timestamp: timestampValue,
    key: keyValue,
    vertexCount: rawVertices.length / 2,
    meta,
  };
}

async function fetchHRRRFrameForHour(map, forecastHour) {
  const requestedVariable = getRequestedHRRRVariable();
  const bounds = getCurrentMapBoundsObject(map);

  const effectiveModel = dataMode === "mrms" ? "mrms" : selectedModel;
  const effectiveForecastHour = dataMode === "mrms" ? 0 : forecastHour;

  // Generate cache key for this frame
  const cacheKey = generateModelFrameCacheKey(
    effectiveModel,
    requestedVariable,
    effectiveForecastHour,
    selectedHRRRRunDate,
    selectedHRRRRunHour,
    bounds,
  );

  // Check if we have this frame cached
  const cachedFrame = modelFrameCache.get(cacheKey);
  if (cachedFrame) {
    // Return cached frame with proper structure
    const frameTimestamp = cachedFrame.meta.validIso
      ? new Date(cachedFrame.meta.validIso)
      : new Date();
    return {
      data: cachedFrame.data,
      timestamp: frameTimestamp,
      key: `${effectiveModel}_${requestedVariable}_f${String(effectiveForecastHour).padStart(2, "0")}`,
      meta: cachedFrame.meta,
    };
  }

  // Not in cache, proceed with fetch
  const params = new URLSearchParams({
    model: effectiveModel,
    variable: requestedVariable,
    forecast_hour: String(effectiveForecastHour),
    format: "binary",
    stride: "1",
  });
  if (selectedHRRRRunDate && selectedHRRRRunHour !== null) {
    params.set("date", selectedHRRRRunDate);
    params.set("run_hour", String(selectedHRRRRunHour));
  }

  if (bounds) {
    params.set("minLon", String(bounds.minLon));
    params.set("minLat", String(bounds.minLat));
    params.set("maxLon", String(bounds.maxLon));
    params.set("maxLat", String(bounds.maxLat));
  }

  const response = await fetch(
    `https://radar-api-production-076b.up.railway.app/api/hrrr-webgl?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(
      `Failed to fetch HRRR hour ${forecastHour} (${response.status})`,
    );
  }

  const responseMeta = {
    runIso: response.headers.get("X-HRRR-Run-ISO"),
    validIso: response.headers.get("X-HRRR-Valid-ISO"),
    units: response.headers.get("X-HRRR-Units") || "",
    variable: response.headers.get("X-HRRR-Variable") || requestedVariable,
    valueName: response.headers.get("X-HRRR-Value-Name") || "",
    forecastHour,
  };

  const contentEncoding = response.headers.get("Content-Encoding");
  let arrayBuffer;
  if (contentEncoding === "gzip") {
    const blob = await response.blob();
    const decompressedStream = blob
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const decompressedBlob = await new Response(decompressedStream).blob();
    arrayBuffer = await decompressedBlob.arrayBuffer();
  } else {
    arrayBuffer = await response.arrayBuffer();
  }

  const parsedData = parseBinaryRadarData(arrayBuffer);
  const displayData = await applyPrecipTypeToModelReflectivityIfNeeded(
    map,
    parsedData,
    requestedVariable,
  );
  const frameTimestamp = responseMeta.validIso
    ? new Date(responseMeta.validIso)
    : new Date();

  // Store in cache for future use
  modelFrameCache.set(cacheKey, {
    data: displayData,
    meta: responseMeta,
  });

  return {
    data: displayData,
    timestamp: frameTimestamp,
    key: `${effectiveModel}_${requestedVariable}_f${String(effectiveForecastHour).padStart(2, "0")}`,
    meta: responseMeta,
  };
}

async function loadAndPlayModelLoop(map) {
  if (modelLoopLoading) {
    return;
  }

  const hours = getModelLoopHours();
  if (hours.length < 2) {
    alert("Model loop needs at least 2 forecast hours.");
    return;
  }

  modelLoopLoading = true;
  stopLoop();

  try {
    const statusDiv = document.getElementById("sidebarStatus");
    const statusText = document.getElementById("statusText");
    if (statusDiv) {
      statusDiv.style.display = "block";
    }

    const downloadedFrames = [];
    for (let index = 0; index < hours.length; index += 1) {
      const hour = hours[index];
      if (statusText) {
        statusText.textContent = `Loading model loop ${index + 1}/${hours.length} (F${String(hour).padStart(2, "0")})...`;
      }
      const frame = await fetchHRRRFrameForHour(map, hour);
      downloadedFrames.push(frame);
    }

    radarFrames = downloadedFrames.map((frame) =>
      buildRenderableFrameFromRaw(
        frame.data,
        frame.timestamp,
        frame.key,
        frame.meta,
      ),
    );

    if (!radarFrames.length) {
      throw new Error("No model frames available for loop.");
    }

    const totalFramesEl = document.getElementById("totalFrames");
    const loopControlsContainer = document.getElementById(
      "loopControlsContainer",
    );
    if (totalFramesEl) {
      totalFramesEl.textContent = String(radarFrames.length);
    }
    if (loopControlsContainer) {
      loopControlsContainer.style.display = "flex";
    }

    currentFrameIndex = 0;
    displayFrameFast(currentFrameIndex);
    startLoop();
  } finally {
    modelLoopLoading = false;
    const statusDiv = document.getElementById("sidebarStatus");
    if (statusDiv) {
      statusDiv.style.display = "none";
    }
  }
}

async function precacheModelRange(map) {
  const hours = getModelLoopHours();
  if (!hours.length) {
    alert("No model hours selected to pre-cache.");
    return;
  }

  const startHour = Math.min(...hours);
  const endHour = Math.max(...hours);
  const bounds = getCurrentMapBoundsObject(map);

  const statusDiv = document.getElementById("sidebarStatus");
  const statusText = document.getElementById("statusText");
  if (statusDiv) {
    statusDiv.style.display = "block";
  }
  if (statusText) {
    statusText.textContent = `Pre-caching ${getActiveModelLabel()} F${String(startHour).padStart(2, "0")}–F${String(endHour).padStart(2, "0")}...`;
  }

  try {
    const response = await fetch(
      "https://radar-api-production-076b.up.railway.app/api/hrrr-precache",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          variable: getRequestedHRRRVariable(),
          start_hour: startHour,
          end_hour: endHour,
          date: selectedHRRRRunDate,
          run_hour: selectedHRRRRunHour,
          bounds,
        }),
      },
    );

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || `Pre-cache failed (${response.status})`);
    }

    const summary = `Pre-cache complete: fetched ${result.fetchedCount}, already cached ${result.cachedCount}, errors ${result.errorCount}.`;
    if (statusText) {
      statusText.textContent = summary;
    }
    alert(summary);
  } finally {
    if (statusDiv) {
      statusDiv.style.display = "none";
    }
  }
}

function applyDataModeUI() {
  const radarSiteControl = document.getElementById("radarSiteControl");
  const radarProductControl = document.getElementById("radarProductControl");
  const hrrrControls = document.getElementById("hrrrControls");
  const loopSection = document.getElementById("loopSection");
  const tilt3DSection = document.getElementById("tilt3DSection");
  const stormMotionControls = document.getElementById("stormMotionControls");

  const radarVisible = dataMode === "radar";
  if (radarSiteControl)
    radarSiteControl.style.display = radarVisible ? "" : "none";
  if (radarProductControl)
    radarProductControl.style.display = radarVisible ? "" : "none";
  if (hrrrControls)
    hrrrControls.style.display = radarVisible ? "none" : "block";

  if (loopSection) {
    loopSection.style.display =
      radarVisible && selectedRadarSite ? "block" : "none";
  }
  if (tilt3DSection) {
    tilt3DSection.style.display =
      radarVisible && selectedRadarSite ? "block" : "none";
  }
  const sweepAnimationSection = document.getElementById(
    "sweepAnimationSection",
  );
  if (sweepAnimationSection) {
    sweepAnimationSection.style.display =
      radarVisible && selectedRadarSite ? "block" : "none";
  }

  const showStormMotion =
    radarVisible && typeof selectedRadarProduct === "string"
      ? Boolean(selectedRadarProduct.match(/N[0-3][GVS]$/))
      : false;
  if (stormMotionControls) {
    stormMotionControls.style.display = showStormMotion ? "block" : "none";
  }

  setModelSmoothingState(!radarVisible);
  updateArcSyncToggleState();
}

async function fetchAndDisplayHRRRData(map, retryWithFallback = true) {
  try {
    const requestedVariable = getRequestedHRRRVariable();
    const effectiveForecastHour =
      dataMode === "mrms" ? 0 : selectedHRRRForecastHour;
    const bounds = getCurrentMapBoundsObject(map);
    const effectiveModel = dataMode === "mrms" ? "mrms" : selectedModel;

    // Generate cache key for this request
    const cacheKey = generateModelFrameCacheKey(
      effectiveModel,
      requestedVariable,
      effectiveForecastHour,
      selectedHRRRRunDate,
      selectedHRRRRunHour,
      bounds,
    );

    // Check if we have this frame cached
    const cachedFrame = modelFrameCache.get(cacheKey);
    if (cachedFrame) {
      // Use cached frame for instant display
      currentHRRRMeta = cachedFrame.meta;
      currentHRRRUnitsByVariable[selectedHRRRVariable] = cachedFrame.meta.units;
      currentRenderProductCode = `HRRR_${selectedHRRRVariable.toUpperCase()}`;

      if (
        customRadarLayerInstance &&
        customRadarLayerInstance.updateColorRamp
      ) {
        customRadarLayerInstance.updateColorRamp(currentRenderProductCode);
      }

      createColorScaleLegend(currentRenderProductCode);
      const cachedDisplayData =
        await applyPrecipTypeToModelReflectivityIfNeeded(
          map,
          cachedFrame.data,
          requestedVariable,
        );
      updateRadarLayer(map, cachedDisplayData);
      updateHRRRTimeCard(cachedFrame.meta);
      updateAllProbes();
      updateDockSummary();

      const legend = document.getElementById("radarLegend");
      if (legend) legend.style.display = "block";

      return; // Exit early since we used cached data
    }

    // Not in cache, proceed with fetch
    const statusDiv = document.getElementById("sidebarStatus");
    if (statusDiv) {
      statusDiv.style.display = "block";
      const statusText = document.getElementById("statusText");
      if (statusText) {
        statusText.textContent = `Loading ${getActiveModelLabel()} data...`;
      }
    }

    const params = new URLSearchParams({
      model: effectiveModel,
      variable: requestedVariable,
      forecast_hour: String(effectiveForecastHour),
      format: "binary",
      stride: "1",
    });
    if (selectedHRRRRunDate && selectedHRRRRunHour !== null) {
      params.set("date", selectedHRRRRunDate);
      params.set("run_hour", String(selectedHRRRRunHour));
    }

    if (bounds) {
      params.set("minLon", String(bounds.minLon));
      params.set("minLat", String(bounds.minLat));
      params.set("maxLon", String(bounds.maxLon));
      params.set("maxLat", String(bounds.maxLat));
    }

    const response = await fetch(
      `https://radar-api-production-076b.up.railway.app/api/hrrr-webgl?${params.toString()}`,
    );
    if (!response.ok) {
      let backendError = "";
      try {
        const errPayload = await response.json();
        backendError = errPayload?.error ? String(errPayload.error) : "";
      } catch (_) {
        backendError = "";
      }

      if (
        response.status === 404 &&
        retryWithFallback &&
        !selectedHRRRRunDate &&
        selectedHRRRRunHour === null
      ) {
        try {
          const runsPayload = await fetchAvailableHRRRRuns();
          const fallbackRun = runsPayload?.lastSuccessfulRun;
          if (
            fallbackRun &&
            fallbackRun.date &&
            Number.isFinite(Number(fallbackRun.hour))
          ) {
            selectedHRRRRunDate = String(fallbackRun.date);
            selectedHRRRRunHour = Number(fallbackRun.hour);

            const runSelect = document.getElementById("hrrrRunSelect");
            if (runSelect) {
              const fallbackValue = `${selectedHRRRRunDate}|${String(selectedHRRRRunHour).padStart(2, "0")}`;
              if (runSelect.querySelector(`option[value="${fallbackValue}"]`)) {
                runSelect.value = fallbackValue;
              }
            }

            return await fetchAndDisplayHRRRData(map, false);
          }
        } catch (fallbackError) {
          console.warn("HRRR fallback run retry failed:", fallbackError);
        }
      }

      const detailSuffix = backendError ? `: ${backendError}` : "";
      throw new Error(
        `Failed to fetch HRRR data (${response.status})${detailSuffix}`,
      );
    }

    const responseMeta = {
      runIso: response.headers.get("X-HRRR-Run-ISO"),
      validIso: response.headers.get("X-HRRR-Valid-ISO"),
      units: response.headers.get("X-HRRR-Units") || "",
      variable: response.headers.get("X-HRRR-Variable") || requestedVariable,
      valueName: response.headers.get("X-HRRR-Value-Name") || "",
      forecastHour: effectiveForecastHour,
    };

    const contentEncoding = response.headers.get("Content-Encoding");
    let arrayBuffer;
    if (contentEncoding === "gzip") {
      const blob = await response.blob();
      const decompressedStream = blob
        .stream()
        .pipeThrough(new DecompressionStream("gzip"));
      const decompressedBlob = await new Response(decompressedStream).blob();
      arrayBuffer = await decompressedBlob.arrayBuffer();
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

    const hrrrData = parseBinaryRadarData(arrayBuffer);
    const displayData = await applyPrecipTypeToModelReflectivityIfNeeded(
      map,
      hrrrData,
      requestedVariable,
    );

    // Store in cache for instant future access
    modelFrameCache.set(cacheKey, {
      data: displayData,
      meta: responseMeta,
    });

    currentHRRRMeta = responseMeta;
    currentHRRRUnitsByVariable[selectedHRRRVariable] = responseMeta.units;
    currentRenderProductCode = `HRRR_${selectedHRRRVariable.toUpperCase()}`;

    if (customRadarLayerInstance && customRadarLayerInstance.updateColorRamp) {
      customRadarLayerInstance.updateColorRamp(currentRenderProductCode);
    }

    createColorScaleLegend(currentRenderProductCode);
    updateRadarLayer(map, displayData);
    updateHRRRTimeCard(responseMeta);
    updateAllProbes();
    updateDockSummary();

    const legend = document.getElementById("radarLegend");
    if (legend) legend.style.display = "block";
  } catch (error) {
    console.error("Error loading HRRR data:", error);
    alert(`Error loading HRRR data: ${error.message}`);
  } finally {
    const statusDiv = document.getElementById("sidebarStatus");
    if (statusDiv) {
      statusDiv.style.display = "none";
    }
  }
}

async function switchDataMode(nextMode) {
  // Support explicit mrms mode in addition to hrrr/radar
  if (nextMode === "hrrr") dataMode = "hrrr";
  else if (nextMode === "mrms") dataMode = "mrms";
  else dataMode = "radar";
  if (dataMode === "hrrr" || dataMode === "mrms") {
    radarSmoothingPreference = !!enableSmoothing;
  }
  applyDataModeUI();
  stopLoop();

  if (dataMode === "hrrr") {
    if (radarPollingTimer) {
      clearInterval(radarPollingTimer);
      radarPollingTimer = null;
    }
    stopArcSyncStream();
    stopSweepAnimation(mapInstance);
    applyModelControlConstraints();
    await refreshHRRRRunSelector();
    await fetchAndDisplayHRRRData(mapInstance);
    return;
  }

  if (dataMode === "mrms") {
    if (radarPollingTimer) {
      clearInterval(radarPollingTimer);
      radarPollingTimer = null;
    }
    stopArcSyncStream();
    stopSweepAnimation(mapInstance);
    applyModelControlConstraints();

    // Auto-select MRMS in the products menu if present
    const productSelect = document.getElementById("radarProductSelect");
    if (productSelect) {
      const mrmsOption = Array.from(productSelect.options).find(
        (o) => String(o.value).toLowerCase() === "mrms",
      );
      if (mrmsOption) {
        productSelect.value = mrmsOption.value;
        selectedRadarProduct = mrmsOption.value;
      }
    }

    currentRenderProductCode = selectedRadarProduct;
    createColorScaleLegend(currentRenderProductCode);
    await fetchAndDisplayHRRRData(mapInstance);
    return;
  }

  const productSelect = document.getElementById("radarProductSelect");
  if (productSelect && productSelect.value) {
    selectedRadarProduct = productSelect.value;
  }
  currentRenderProductCode = selectedRadarProduct;
  createColorScaleLegend(currentRenderProductCode);
  if (selectedRadarSite) {
    await fetchAndDisplayRadarData(
      mapInstance,
      selectedRadarSite,
      selectedRadarProduct,
      selectedRadarDataSource,
    );
    startSweepAnimation(mapInstance, selectedRadarSite);
    startRadarPolling(
      mapInstance,
      selectedRadarSite,
      selectedRadarProduct,
      selectedRadarDataSource,
    );
  } else {
    removeRadarLayer(mapInstance);
  }
  updateDockSummary();
}

function stopArcSyncStream() {
  if (arcSyncEventSource) {
    arcSyncEventSource.close();
    arcSyncEventSource = null;
  }
  if (arcSyncReconnectTimer) {
    clearTimeout(arcSyncReconnectTimer);
    arcSyncReconnectTimer = null;
  }
  arcSyncSessionKey = null;
}

function updateArcSyncToggleState() {
  const toggle = document.getElementById("arcSyncToggle");
  if (!toggle) return;
  const isLevel2 = selectedRadarDataSource === "level2";
  const enabled = dataMode === "radar" && isLevel2 && !isArchiveMode;
  toggle.disabled = !enabled;
  toggle.title = enabled
    ? "Arc-Sync Live (Level 2 SSE)"
    : "Arc-Sync is available for live Level 2 radar";
}

function buildRadarDataFromPayload(payload) {
  try {
    // Prefer binary base64-encoded payloads (more efficient)
    if (payload?.verticesB64 && payload?.valuesB64) {
      const vBytes = _b64ToUint8Array(payload.verticesB64);
      const valBytes = _b64ToUint8Array(payload.valuesB64);

      const vCount = Number(payload.verticesCount || 0);
      const valCount = Number(payload.valuesCount || 0);

      const vDtype = (payload.verticesDtype || "float32").toLowerCase();
      const valDtype = (payload.valuesDtype || "float32").toLowerCase();

      let verticesArr;
      if (vDtype.includes("float32")) {
        verticesArr = new Float32Array(
          vBytes.buffer,
          vBytes.byteOffset,
          vCount,
        );
      } else if (vDtype.includes("float64")) {
        verticesArr = new Float64Array(
          vBytes.buffer,
          vBytes.byteOffset,
          vCount,
        );
      } else {
        verticesArr = new Float32Array(
          vBytes.buffer,
          vBytes.byteOffset,
          vCount,
        );
      }

      let valuesArr;
      if (valDtype.includes("float32")) {
        valuesArr = new Float32Array(
          valBytes.buffer,
          valBytes.byteOffset,
          valCount,
        );
      } else if (valDtype.includes("float64")) {
        valuesArr = new Float64Array(
          valBytes.buffer,
          valBytes.byteOffset,
          valCount,
        );
      } else {
        valuesArr = new Float32Array(
          valBytes.buffer,
          valBytes.byteOffset,
          valCount,
        );
      }

      return { vertices: verticesArr, values: valuesArr };
    }
  } catch (e) {
    console.warn("Failed to decode binary SSE payload, falling back:", e);
  }

  const vertices = Array.isArray(payload?.vertices) ? payload.vertices : [];
  const values = Array.isArray(payload?.values) ? payload.values : [];
  return {
    vertices: new Float32Array(vertices),
    values: new Float32Array(values),
  };
}

function mergeRadarData(baseData, deltaData) {
  if (!baseData || !baseData.vertices || baseData.vertices.length === 0) {
    return deltaData;
  }

  const mergedVertices = new Float32Array(
    baseData.vertices.length + deltaData.vertices.length,
  );
  mergedVertices.set(baseData.vertices, 0);
  mergedVertices.set(deltaData.vertices, baseData.vertices.length);

  const mergedValues = new Float32Array(
    baseData.values.length + deltaData.values.length,
  );
  mergedValues.set(baseData.values, 0);
  mergedValues.set(deltaData.values, baseData.values.length);

  return { vertices: mergedVertices, values: mergedValues };
}

function applyIncrementalRadarUpdate(map, deltaData, meta) {
  const merged = mergeRadarData(currentRadarData, deltaData);
  currentRadarData = merged;

  if (customRadarLayerInstance?.updateColorRamp) {
    customRadarLayerInstance.updateColorRamp(currentRenderProductCode);
  }
  updateRadarLayer(map, merged);
  updateAllProbes();
  // If the incoming metadata indicates a partial sweep (coverage < 360°),
  // animate the high-dBZ flash to indicate old/partial data while the sweep fills in.
  try {
    const coverageDeg = Number(meta?.sweepCoverageDeg || 0);
    const rayCount = Number(meta?.rayCount || 0);
    const totalRays = Number(meta?.totalRays || meta?.sweepRays || 0);
    const sweepComplete = Boolean(meta?.sweepComplete);
    const partial =
      meta &&
      rayCount > 0 &&
      ((coverageDeg > 0 && coverageDeg < 360) ||
        (!sweepComplete && totalRays > 0 && rayCount < totalRays));
    if (partial) {
      startPartialScanFlash(map);
    } else {
      stopPartialScanFlash(map);
    }
  } catch (e) {
    // ignore
  }

  if (meta && selectedRadarSite) {
    latestArcSyncState = {
      sessionKey: meta.sessionKey || null,
      updateToken: meta.sessionKey || null,
      sweepCoverageDeg: 0,
      sweepRays: Number(meta.totalRays || meta.rayCount || 0),
      sweepComplete: false,
      prodBytes: Number(meta.totalBytes || 0),
      elevation: Number(meta.elevation || 0).toFixed(2),
      sweepIndex: Number(meta.sweepIndex || 0),
      timestamp: meta.timestamp || null,
      connectionStatus: "connected",
      updatedAt: Date.now(),
    };
    updateRadarInfo(selectedRadarSite, "level2", latestArcSyncState);
  }
}

function startArcSyncStream(map, site, product) {
  if (!arcSyncEnabled || !site || dataMode !== "radar" || isArchiveMode) {
    return;
  }

  stopArcSyncStream();
  currentRadarData = null;
  arcSyncSessionKey = null;
  lastRenderedRadarToken = null;

  const radarProduct = product || selectedRadarProduct;
  const streamUrl = `https://radar-api-production-076b.up.railway.app/api/radar/level2-stream?site=${encodeURIComponent(
    site.id,
  )}&product=${encodeURIComponent(radarProduct)}`;

  arcSyncEventSource = new EventSource(streamUrl);

  arcSyncEventSource.onopen = () => {
    console.log("Arc-Sync SSE connection opened for Level 2 data");
    if (latestArcSyncState) {
      latestArcSyncState.connectionStatus = "connected";
      updateRadarInfo(site, "level2", latestArcSyncState);
    }
  };

  arcSyncEventSource.onmessage = (event) => {
    if (!event?.data) return;

    let payload;
    try {
      payload = JSON.parse(event.data);
    } catch (e) {
      console.warn("Failed to parse SSE message:", e);
      return;
    }

    if (payload.error) {
      console.error("Arc-Sync stream error:", payload.error);
      // Show error in UI
      if (latestArcSyncState) {
        latestArcSyncState.lastError = payload.error;
      }
      return;
    }

    const sessionKey = payload.sessionKey || null;
    if (sessionKey && sessionKey !== arcSyncSessionKey) {
      arcSyncSessionKey = sessionKey;
      currentRadarData = null;
      lastRenderedRadarToken = null;
      console.log("New Level 2 file detected:", sessionKey);
    }

    const deltaData = buildRadarDataFromPayload(payload);
    if (!deltaData.vertices.length) {
      console.log("No vertex data in payload (keepalive or empty update)");
      return;
    }

    applyIncrementalRadarUpdate(map, deltaData, payload);
  };

  arcSyncEventSource.onerror = (err) => {
    console.error("Arc-Sync SSE error:", err);

    // Update connection status
    if (latestArcSyncState) {
      latestArcSyncState.connectionStatus = "disconnected";
      latestArcSyncState.lastError = `Connection error: ${err.type || "unknown"}`;
      updateRadarInfo(site, "level2", latestArcSyncState);
    }

    if (arcSyncEventSource) {
      arcSyncEventSource.close();
      arcSyncEventSource = null;
    }
    if (!arcSyncEnabled || dataMode !== "radar" || isArchiveMode) {
      return;
    }
    if (arcSyncReconnectTimer) {
      clearTimeout(arcSyncReconnectTimer);
    }
    arcSyncReconnectTimer = setTimeout(() => {
      startArcSyncStream(map, site, radarProduct);
    }, ARC_SYNC_RECONNECT_MS);
  };
}

async function pollForNewRadarData(map, site, product, source) {
  if (dataMode !== "radar") {
    return;
  }

  // Don't poll for new data while in archive mode
  if (isArchiveMode) {
    console.log("Skipping radar poll - in archive mode");
    return;
  }

  console.log("Polling for new radar data...");
  try {
    const radarProduct = product || selectedRadarProduct;
    const radarSource = source || selectedRadarDataSource;

    const keyResp = await fetch(
      `https://radar-api-production-076b.up.railway.app/api/radar-latest-key/${site.id}?product=${radarProduct}&source=${encodeURIComponent(radarSource)}`,
    );
    if (!keyResp.ok) throw new Error("Failed to check latest radar key");
    const keyData = await keyResp.json();
    const key = keyData?.key;
    let updateToken = keyData?.updateToken || key;

    if (radarSource === "level2") {
      if (!arcSyncEnabled) {
        // Arc-Sync disabled: use full file key, skip sweep metadata
        updateToken = key;
        latestArcSyncState = null;
      } else {
        const sweepCoverageDeg = Number(keyData?.sweepCoverageDeg || 0);
        const sweepRays = Number(keyData?.sweepRays || 0);
        const sweepComplete = Boolean(keyData?.sweepComplete);
        const prodBytes = Number(keyData?.prodBytes || 0);

        latestArcSyncState = {
          sessionKey: key || null,
          updateToken: updateToken || null,
          sweepCoverageDeg,
          sweepRays,
          sweepComplete,
          prodBytes,
          updatedAt: Date.now(),
        };
      }
    } else {
      latestArcSyncState = null;
    }

    if (updateToken && updateToken !== lastRadarKey) {
      lastRadarKey = updateToken;
      await fetchAndDisplayRadarData(
        map,
        site,
        radarProduct,
        radarSource,
        updateToken,
        latestArcSyncState,
      );
      startSweepAnimation(mapInstance, selectedRadarSite);
    }
  } catch (err) {
    console.error("Radar polling error:", err);
  }
}

function startRadarPolling(map, site, product, source) {
  if (radarPollingTimer) clearInterval(radarPollingTimer);
  stopArcSyncStream();

  if (dataMode !== "radar") {
    return;
  }

  // Don't start polling while in archive mode
  if (isArchiveMode) {
    console.log("Radar polling disabled - in archive mode");
    return;
  }

  const radarProduct = product || selectedRadarProduct;
  const radarSource = source || selectedRadarDataSource;
  const pollInterval =
    radarSource === "level2" ? LEVEL2_POLLING_INTERVAL : POLLING_INTERVAL;

  if (radarSource === "level2" && arcSyncEnabled) {
    startArcSyncStream(map, site, radarProduct);
    return;
  }

  pollForNewRadarData(map, site, radarProduct, radarSource);
  radarPollingTimer = setInterval(() => {
    pollForNewRadarData(map, site, radarProduct, radarSource);
  }, pollInterval);
}

async function fetchAndDisplayRadarData(
  map,
  site,
  product,
  source,
  refreshToken = null,
  arcSyncState = null,
) {
  try {
    console.time("FETCH-TOTAL");

    const statusDiv = document.getElementById("sidebarStatus");
    if (statusDiv) {
      statusDiv.style.display = "block";
      document.getElementById("statusText").textContent =
        "Loading radar data...";
    }

    const radarProduct = product || selectedRadarProduct;
    const radarSource = source || selectedRadarDataSource;
    currentRenderProductCode = radarProduct;

    console.time("FETCH-request");
    const revQuery = refreshToken
      ? `&rev=${encodeURIComponent(refreshToken)}`
      : "";
    let response = await fetch(
      `https://radar-api-production-076b.up.railway.app/api/radar-webgl/${site.id}?product=${radarProduct}&source=${encodeURIComponent(radarSource)}&format=binary${revQuery}`,
    );

    let radarData;
    const contentType = response.headers.get("content-type");

    if (
      response.ok &&
      contentType &&
      contentType.includes("application/octet-stream")
    ) {
      console.timeEnd("FETCH-request");
      console.time("PARSE-binary");

      const contentEncoding = response.headers.get("Content-Encoding");
      let arrayBuffer;

      if (contentEncoding === "gzip") {
        const blob = await response.blob();
        const decompressedStream = blob
          .stream()
          .pipeThrough(new DecompressionStream("gzip"));
        const decompressedBlob = await new Response(decompressedStream).blob();
        arrayBuffer = await decompressedBlob.arrayBuffer();
      } else {
        arrayBuffer = await response.arrayBuffer();
      }

      radarData = parseBinaryRadarData(arrayBuffer);
      console.timeEnd("PARSE-binary");
      console.log(
        "✅ Using fast binary format" +
          (contentEncoding === "gzip" ? " (gzip)" : ""),
      );
    } else {
      console.timeEnd("FETCH-request");
      console.log("⚠️ Binary format not available, using JSON fallback");

      response = await fetch(
        `https://radar-api-production-076b.up.railway.app/api/radar-webgl/${site.id}?product=${radarProduct}&source=${encodeURIComponent(radarSource)}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch radar data: ${response.statusText}`);
      }

      console.time("PARSE-json");
      radarData = await response.json();
      console.timeEnd("PARSE-json");
    }

    if (precipTypeModeEnabled && isRadarReflectivityProductCode(radarProduct)) {
      try {
        const ptypeLookup = await fetchHRRRPTypeLookup(map);
        radarData = applyPTypeEncodingToRadarData(radarData, ptypeLookup);
      } catch (ptypeError) {
        console.warn(
          "Failed to apply precip-type color encoding to radar:",
          ptypeError,
        );
      }
    }

    console.timeEnd("FETCH-TOTAL");
    console.log(
      `Received ${radarData.vertices.length / 2} vertices for WebGL rendering.`,
    );

    console.time("UPDATE-radar-layer");
    if (customRadarLayerInstance && customRadarLayerInstance.updateColorRamp) {
      customRadarLayerInstance.updateColorRamp(currentRenderProductCode);
    }
    createColorScaleLegend(currentRenderProductCode);
    updateRadarLayer(map, radarData);
    console.timeEnd("UPDATE-radar-layer");

    updateAllProbes();

    const didRenderData =
      radarData && radarData.vertices && radarData.vertices.length > 0;
    if (
      radarSource === "level2" &&
      refreshToken &&
      didRenderData &&
      refreshToken !== lastRenderedRadarToken &&
      customRadarLayerInstance
    ) {
      customRadarLayerInstance.triggerChunkFlash?.();
      lastRenderedRadarToken = refreshToken;
    } else if (radarSource !== "level2") {
      lastRenderedRadarToken = null;
    }

    updateRadarInfo(site, radarSource, arcSyncState || latestArcSyncState);
    document.getElementById("radarLegend").style.display = "block";
  } catch (error) {
    console.error("Error fetching or rendering WebGL radar data:", error);
    alert(`Error loading radar data: ${error.message}`);
  } finally {
    const statusDiv = document.getElementById("sidebarStatus");
    if (statusDiv) {
      statusDiv.style.display = "none";
    }
  }
}

function parseBinaryRadarData(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  let offset = 0;

  const vertexCount = view.getUint32(offset, true);
  offset += 4;

  const verticesLength = vertexCount * 2;
  const vertices = new Float32Array(arrayBuffer, offset, verticesLength);
  offset += verticesLength * 4;

  const values = new Float32Array(arrayBuffer, offset, vertexCount);

  return {
    vertices: vertices,
    values: values,
  };
}
function updateRadarLayer(map, data) {
  if (!customRadarLayerInstance) {
    const beforeLayerId = map
      .getStyle()
      .layers.find(
        (l) =>
          l.type === "line" &&
          (l.id.includes("Road") ||
            l.id.includes("Transit") ||
            l.id.includes("Path") ||
            l.id.includes("Railway")),
      )?.id;

    if (beforeLayerId) {
      map.addLayer(RadarWebGLLayer, beforeLayerId);
    } else {
      const symbolLayerId = map
        .getStyle()
        .layers.find((l) => l.type === "symbol")?.id;
      map.addLayer(RadarWebGLLayer, symbolLayerId);
    }

    ensureAlertOutlinesAboveRadar(undefined, map);

    // Add high dBZ flash layer on top of radar but below labels
    if (!map.getLayer("radar-high-dbz-flash")) {
      if (!map.getSource("radar-high-dbz-source")) {
        map.addSource("radar-high-dbz-source", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }

      // Find the anchor layer (labels/roads) to position flash layer before it
      const flashBeforeLayerId = map
        .getStyle()
        .layers.find(
          (l) =>
            l.type === "symbol" ||
            (l.type === "line" &&
              (l.id.includes("Road") ||
                l.id.includes("Transit") ||
                l.id.includes("Path") ||
                l.id.includes("Railway"))),
        )?.id;

      map.addLayer(
        {
          id: "radar-high-dbz-flash",
          type: "fill",
          source: "radar-high-dbz-source",
          paint: {
            "fill-color": "#ffffff",
            "fill-opacity": 0.5, // Will be toggled by flash animation
          },
        },
        flashBeforeLayerId,
      );
    }
  }

  if (
    customRadarLayerInstance &&
    typeof customRadarLayerInstance.updateData === "function"
  ) {
    customRadarLayerInstance.updateData(data);

    // Store radar data for flash processing
    currentRadarData = data;

    // TVS Detection
    if (tvsDetectionEnabled && data.vertices && data.values) {
      const tvsLocations = detectTVS(data);
      displayTVSMarkers(tvsLocations);
    }

    // Update high dBZ flash layer with actual high dBZ geometry
    // Only show flash for Base Reflectivity product (N0B/N0G) which has dBZ data
    if (selectedRadarSite && map.getSource("radar-high-dbz-source")) {
      const isReflectivityProduct =
        selectedRadarProduct === "N0B" || selectedRadarProduct === "N0G";
      if (isReflectivityProduct && data.vertices && data.values) {
        const highDBZGeometry = extractHighDBZGeometry(
          data.vertices,
          data.values,
          HIGH_DBZ_FLASH_THRESHOLD,
        );
        map.getSource("radar-high-dbz-source").setData(highDBZGeometry);
      } else {
        // Clear flash for non-reflectivity products
        map
          .getSource("radar-high-dbz-source")
          .setData({ type: "FeatureCollection", features: [] });
      }
    }
  } else {
    console.error(
      "Custom radar layer instance or its updateData method not available. This indicates an issue during layer initialization.",
    );
  }
}

function removeRadarLayer(map) {
  if (
    customRadarLayerInstance &&
    typeof customRadarLayerInstance.removeData === "function"
  ) {
    customRadarLayerInstance.removeData();
  }

  if (map.getLayer(radarLayerId)) {
    map.removeLayer(radarLayerId);
  }
  document.getElementById("radarLegend").style.display = "none";
  document.getElementById("toggleRadar").innerHTML =
    '<i class="fas fa-eye"></i>';
  document.getElementById("toggleRadar").title = "Show Radar";
}

function updateRadarInfo(
  site,
  source = selectedRadarDataSource,
  arcSyncState = null,
) {
  try {
    const infoDiv = document.querySelector(".radar-info");
    const now = new Date();
    const dateOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    };
    const formattedDate = now.toLocaleDateString("en-US", dateOptions);
    const productInfo = getRadarProductInfo(selectedRadarProduct);
    const productName = productInfo?.name || selectedRadarProduct;

    let html = `
            <strong>Radar Site:</strong> ${site.id} - ${site.name}<br>
            <strong>Rendered with:</strong> WebGL Custom Layer<br>
            <strong>Approx. Time:</strong> ${formattedDate}<br>
            <strong>Product:</strong> ${selectedRadarProduct} (${productName})<br>
        `;

    if (source === "level2") {
      const sync = arcSyncState || latestArcSyncState;
      const coverage = Number(sync?.sweepCoverageDeg || 0);
      const rays = Number(sync?.sweepRays || 0);
      const prodBytes = Number(sync?.prodBytes || 0);
      const prodLabel = formatBytesForArcSync(prodBytes);
      const vstLabel = sync?.sessionKey || "--";
      const liveStatus = sync?.sweepComplete ? "Complete" : "Live";
      const coverageLine =
        rays > 0 && coverage > 0
          ? `${coverage.toFixed(1)}° (${rays} rays)`
          : "--";

      // Format elevation
      const elevationStr = sync?.elevation ? `${sync.elevation}°` : "--";

      // Format sweep index
      const sweepIndexStr =
        sync?.sweepIndex !== undefined ? `Sweep ${sync.sweepIndex}` : "--";

      // Format timestamp
      let timestampStr = "--";
      if (sync?.timestamp) {
        try {
          const ts = new Date(sync.timestamp);
          timestampStr = ts.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
        } catch (e) {
          timestampStr = sync.timestamp;
        }
      }

      // Connection status indicator
      const connectionStatus = sync?.connectionStatus || "disconnected";
      const statusBadge =
        connectionStatus === "connected"
          ? '<span style="color: #4ade80; font-weight: bold;">● Connected</span>'
          : '<span style="color: #ef4444; font-weight: bold;">● Disconnected</span>';

      html += `
            <strong>Arc-Sync:</strong> ${liveStatus}<br>
            <strong>Connection:</strong> ${statusBadge}<br>
            <strong>VST:</strong> ${vstLabel}<br>
            <strong>Prod:</strong> ${prodLabel}<br>
            <strong>Coverage:</strong> ${coverageLine}<br>
            <strong>Elevation:</strong> ${elevationStr}<br>
            <strong>Sweep:</strong> ${sweepIndexStr}<br>
            <strong>Collection Time:</strong> ${timestampStr}<br>
      `;
    }

    infoDiv.innerHTML = html;
  } catch (error) {
    console.error("Error updating radar info:", error);
  }
}

function buildLegendMeta(productCode, productInfo) {
  const unitLabel = productInfo.unit || "";

  if (precipTypeModeEnabled && isReflectivityProductCode(productCode)) {
    return {
      subtitle:
        "Reflectivity recolored by precip type using HRRR CRAIN/CFRZR/CICEP/CSNOW classification",
      leftLabel: "Lower intensity",
      rightLabel: "Higher intensity",
      footnote:
        "Green/teal = rain, pink = freezing rain, orange = sleet, blue = snow.",
      badges: [
        {
          label: "Rain",
          range: unitLabel ? `0-95 ${unitLabel}` : "0-95 dBZ",
          description: "Liquid precipitation",
          color: "rgba(35,196,232,0.7)",
        },
        {
          label: "Freezing Rain",
          range: unitLabel ? `100-195 ${unitLabel}` : "100-195 encoded",
          description: "Surface icing risk",
          color: "rgba(245,82,178,0.7)",
        },
        {
          label: "Sleet",
          range: unitLabel ? `200-295 ${unitLabel}` : "200-295 encoded",
          description: "Ice pellets / mixed",
          color: "rgba(242,122,54,0.72)",
        },
        {
          label: "Snow",
          range: unitLabel ? `300-395 ${unitLabel}` : "300-395 encoded",
          description: "Frozen precipitation",
          color: "rgba(70,146,240,0.72)",
        },
      ],
    };
  }

  if (productInfo.isVelocity) {
    const strongThreshold = Math.round(20 * MS_TO_MPH);
    const calmThreshold = Math.round(10 * MS_TO_MPH);
    return {
      subtitle: "Radial wind speed relative to the radar beam",
      leftLabel: "Inbound - greens",
      rightLabel: "Outbound - reds",
      footnote:
        "Pair inbound/outbound couplets to spot rotation. Purple indicates range folding.",
      badges: [
        {
          label: "Inbound",
          range: unitLabel
            ? `<= -${strongThreshold} ${unitLabel}`
            : "Toward radar",
          description: "Air moving toward the radar (teals/greens)",
          color: "rgba(90, 220, 170, 0.6)",
        },
        {
          label: "Calm / shear",
          range: unitLabel
            ? `-${calmThreshold} to +${calmThreshold} ${unitLabel}`
            : "Near zero",
          description: "Weak winds or shear zone (grays)",
          color: "rgba(205, 210, 222, 0.65)",
        },
        {
          label: "Outbound",
          range: unitLabel
            ? `>= +${strongThreshold} ${unitLabel}`
            : "Away from radar",
          description: "Air moving away from the radar (reds/pinks)",
          color: "rgba(255, 140, 140, 0.65)",
        },
        {
          label: "Range fold",
          range: "RF flagged",
          description: "Purple = ambiguous velocity data",
          color: "rgba(185, 132, 255, 0.65)",
        },
      ],
    };
  }

  return {
    subtitle: "Intensity of precipitation cores and debris",
    leftLabel: "Light rain / snow",
    rightLabel: "Extreme hail / debris",
    footnote: "Reflectivity above 55 dBZ often signals severe hail or debris.",
    badges: [
      {
        label: "Light",
        range: unitLabel ? `< 25 ${unitLabel}` : "Light",
        description: "Sprinkles, flurries, virga",
        color: "rgba(99, 211, 255, 0.55)",
      },
      {
        label: "Moderate",
        range: unitLabel ? `25-40 ${unitLabel}` : "Moderate",
        description: "Steady rain or melting snow",
        color: "rgba(120, 214, 190, 0.6)",
      },
      {
        label: "Heavy",
        range: unitLabel ? `40-55 ${unitLabel}` : "Heavy",
        description: "Torrential rain, small hail",
        color: "rgba(255, 190, 120, 0.65)",
      },
      {
        label: "Extreme",
        range: unitLabel ? `> 55 ${unitLabel}` : "Extreme",
        description: "Giant hail, debris signatures",
        color: "rgba(255, 120, 120, 0.7)",
      },
    ],
  };
}

function createColorScaleLegend(productCode = selectedRadarProduct) {
  const legendDiv = document.getElementById("legendScale");
  if (!legendDiv) {
    return;
  }

  const productInfo = getRadarProductInfo(productCode);
  const expressionStops = productInfo.colorExpression.slice(3);
  const gradientStops = [];
  const values = [];

  // Filter function to remove sentinel/error values and absurd values
  const isValidLegendValue = (value) => {
    // Must be a finite number
    if (typeof value !== "number" || !isFinite(value)) return false;

    // Filter out known sentinel values (range folding, no data, etc.)
    if (Math.abs(value) === 9999 || Math.abs(value) === 999) return false;
    if (Math.abs(value) === 32768 || Math.abs(value) === 65535) return false;

    // Filter out absurdly high values (typical for error flags in radar data)
    if (value > 200) return false;

    return true;
  };

  for (let i = 0; i < expressionStops.length; i += 2) {
    const value = expressionStops[i];
    const color = expressionStops[i + 1];

    if (!isValidLegendValue(value)) {
      continue;
    }

    gradientStops.push({ value, color });
    values.push(value);
  }

  let gradientCSS = "linear-gradient(90deg, #0f172a, #020617)";
  if (gradientStops.length) {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue === 0 ? 1 : maxValue - minValue;

    const stopsString = gradientStops
      .map(({ value, color }) => {
        const pct = ((value - minValue) / range) * 100;
        const clamped = Math.max(0, Math.min(100, pct));
        return `${color} ${clamped.toFixed(2)}%`;
      })
      .join(", ");

    gradientCSS = `linear-gradient(90deg, ${stopsString})`;
  }

  const legendMeta = buildLegendMeta(productCode, productInfo);
  const badgesHtml = (legendMeta.badges || [])
    .map(
      (badge) => `
        <div class="legend-badge" style="--badge-color: ${badge.color};">
          <span class="legend-badge__label">${badge.label}</span>
          <span class="legend-badge__range">${badge.range}</span>
          <span class="legend-badge__description">${badge.description}</span>
        </div>`,
    )
    .join("");

  const subtitle = legendMeta.subtitle || "";
  const footnote = legendMeta.footnote || "";
  const leftLabel = legendMeta.leftLabel || "";
  const rightLabel = legendMeta.rightLabel || "";

  const html = `
    <div class="legend-card">
      <div class="legend-header">
        <div>
          <div class="legend-label">Radar Product</div>
          <h4 class="legend-title">${productCode} - ${productInfo.name}</h4>
          <p class="legend-subtitle">${subtitle}</p>
        </div>
        <span class="legend-pill">${productInfo.unit || ""}</span>
      </div>
      <div class="legend-gradient" style="position: relative;">
        <div class="legend-gradient__bar" style="background: ${gradientCSS}; cursor: crosshair;" data-min-value="${gradientStops.length ? Math.min(...values) : 0}" data-max-value="${gradientStops.length ? Math.max(...values) : 1}"></div>
        <div class="legend-gradient__hover-value" style="display: none; position: absolute; background: rgba(0,0,0,0.8); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; white-space: nowrap; pointer-events: none; z-index: 1000;"></div>
        <div class="legend-gradient__minmax">
          <span>${leftLabel}</span>
          <span>${rightLabel}</span>
        </div>
      </div>
      ${badgesHtml ? `<div class="legend-badges">${badgesHtml}</div>` : ""}
      ${footnote ? `<p class="legend-footnote">${footnote}</p>` : ""}
    </div>
  `;

  legendDiv.innerHTML = html;

  // Add hover value display functionality
  const gradientBar = legendDiv.querySelector(".legend-gradient__bar");
  const hoverValue = legendDiv.querySelector(".legend-gradient__hover-value");

  if (gradientBar && hoverValue && gradientStops.length > 0) {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue === 0 ? 1 : maxValue - minValue;
    const unit = productInfo.unit || "";

    gradientBar.addEventListener("mousemove", (e) => {
      const rect = gradientBar.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      const value = minValue + pct * range;

      hoverValue.textContent = `${value.toFixed(1)} ${unit}`;
      hoverValue.style.display = "block";
      hoverValue.style.left = `${x}px`;
      hoverValue.style.top = `-28px`;
    });

    gradientBar.addEventListener("mouseleave", () => {
      hoverValue.style.display = "none";
    });
  }
}

function startSweepAnimation(map, site) {
  stopSweepAnimation(map);

  // Check if sweep is disabled
  if (sweepMode === "disabled") {
    return;
  }

  const center = [site.longitude, site.latitude];

  // Create source if it doesn't exist
  if (!map.getSource(sweepSourceId)) {
    map.addSource(sweepSourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }

  // Add appropriate layer based on mode
  if (!map.getLayer(sweepLayerId)) {
    // Find the anchor layer (labels/roads) to position sweep before it
    const sweepBeforeLayerId = map
      .getStyle()
      .layers.find(
        (l) =>
          l.type === "symbol" ||
          (l.type === "line" &&
            (l.id.includes("Road") ||
              l.id.includes("Transit") ||
              l.id.includes("Path") ||
              l.id.includes("Railway"))),
      )?.id;

    if (sweepMode === "simple") {
      // Simple mode: Use line layer with gradient opacity
      map.addLayer(
        {
          id: sweepLayerId,
          type: "line",
          source: sweepSourceId,
          paint: {
            "line-color": SWEEP_COLOR,
            "line-width": 2,
            "line-opacity": ["get", "opacity"],
          },
        },
        sweepBeforeLayerId,
      );
    } else {
      // Full mode: Use fill layer with wedges
      map.addLayer(
        {
          id: sweepLayerId,
          type: "fill",
          source: sweepSourceId,
          paint: {
            "fill-color": SWEEP_COLOR,
            "fill-opacity": ["get", "opacity"],
            "fill-outline-color": "rgba(255, 255, 255, 0)",
          },
        },
        sweepBeforeLayerId,
      );
    }
  }

  const animateSweep = () => {
    // If arc-sync provides a sweep head azimuth for a partial scan, prefer that
    // to align the visual sweep with incoming data. Otherwise, advance normally.
    try {
      const s = latestArcSyncState;
      if (
        s &&
        typeof s.sweepAzimuth === "number" &&
        s.sweepCoverageDeg > 0 &&
        s.sweepCoverageDeg < 360
      ) {
        // Smoothly converge currentSweepAngle to reported sweepAzimuth to avoid jumps
        const target = Number(s.sweepAzimuth) % 360;
        let delta = ((target - currentSweepAngle + 540) % 360) - 180; // shortest signed delta
        // Limit per-frame step to avoid instant jumps
        const maxStep = Math.max(1.0, SWEEP_SPEED_DPS * 8);
        if (Math.abs(delta) > maxStep) delta = Math.sign(delta) * maxStep;
        currentSweepAngle = (currentSweepAngle + delta + 360) % 360;
      } else {
        // Increment angle clockwise
        currentSweepAngle = (currentSweepAngle + SWEEP_SPEED_DPS) % 360;
      }
    } catch (e) {
      currentSweepAngle = (currentSweepAngle + SWEEP_SPEED_DPS) % 360;
    }

    // Update pulse phase for simple mode
    sweepPulsePhase = (sweepPulsePhase + 0.03) % (Math.PI * 2);

    // Update flash cycle for high dBZ
    flashCycleTime += 16; // ~60fps
    if (flashCycleTime >= FLASH_INTERVAL) {
      flashCycleTime = 0;
      isFlashOn = !isFlashOn;
      updateHighDBZFlash(map);
    }

    const features = [];

    if (sweepMode === "simple") {
      // Simple mode: Single line with distance-based fade and pulse
      const numSegments = 60;
      const lineCoords = [];

      for (let i = 0; i <= numSegments; i++) {
        const ratio = i / numSegments;
        const distance = SWEEP_RADIUS_KM * ratio;

        const point = turf.destination(
          turf.point(center),
          distance,
          currentSweepAngle,
          { units: "kilometers" },
        );
        lineCoords.push(point.geometry.coordinates);
      }

      // Calculate pulsing opacity (0.6 to 1.0)
      const pulseValue = 0.7 + 0.3 * (Math.sin(sweepPulsePhase) * 0.5 + 0.5);

      // Create line segments with distance fade
      for (let i = 0; i < lineCoords.length - 1; i++) {
        const ratio = i / (lineCoords.length - 1);
        // Fade based on distance: stronger near center, fades at distance
        const distanceFade = Math.pow(1 - ratio, 1.5);
        const opacity = distanceFade * pulseValue;

        const line = turf.lineString([lineCoords[i], lineCoords[i + 1]]);
        line.properties = { opacity: opacity };
        features.push(line);
      }
    } else {
      // Full mode: Smooth gradient trail using many thin wedge segments
      for (let i = 0; i < SWEEP_TRAIL_SEGMENTS; i++) {
        const angleStep = SWEEP_TRAIL_LENGTH / SWEEP_TRAIL_SEGMENTS;
        const startAngle = currentSweepAngle - i * angleStep;
        const endAngle = currentSweepAngle - (i + 1) * angleStep;

        // Calculate opacity with smooth exponential falloff
        const t = i / SWEEP_TRAIL_SEGMENTS;
        const opacity = Math.pow(1 - t, 2.2) * 0.85;

        // Create wedge polygon from center
        const arcSteps = 40;
        const wedgeCoords = [center];

        // Add arc points from start to end angle with interpolation
        for (let step = 0; step <= arcSteps; step++) {
          const ratio = step / arcSteps;
          const angle = startAngle * (1 - ratio) + endAngle * ratio;
          const point = turf.destination(
            turf.point(center),
            SWEEP_RADIUS_KM,
            angle,
            { units: "kilometers" },
          );
          wedgeCoords.push(point.geometry.coordinates);
        }

        // Close the polygon back to center
        wedgeCoords.push(center);

        const wedge = turf.polygon([wedgeCoords]);
        wedge.properties = { opacity: opacity };
        features.push(wedge);
      }
    }

    map.getSource(sweepSourceId).setData({
      type: "FeatureCollection",
      features: features,
    });

    animationFrameId = requestAnimationFrame(animateSweep);
  };

  animationFrameId = requestAnimationFrame(animateSweep);
}

function stopSweepAnimation(map) {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (map && map.getLayer(sweepLayerId)) {
    map.removeLayer(sweepLayerId);
  }
  if (map && map.getSource(sweepSourceId)) {
    map.removeSource(sweepSourceId);
  }
  if (map && map.getLayer("radar-high-dbz-flash")) {
    map.removeLayer("radar-high-dbz-flash");
  }
  if (map && map.getSource("radar-high-dbz-source")) {
    map.removeSource("radar-high-dbz-source");
  }
}

/**
 * Extract geometry of high dBZ areas from radar data
 * Creates polygons for triangles where all vertices exceed the threshold
 */
function extractHighDBZGeometry(vertices, values, threshold) {
  const features = [];

  // Radar data is organized as triangles (every 6 floats in vertices = 3 points with lon,lat pairs)
  // Every 3 values = dBZ for the 3 triangle vertices
  const triangleCount = values.length / 3;

  for (let i = 0; i < triangleCount; i++) {
    const baseIdx = i * 3;

    // Get the 3 dBZ values for this triangle
    const val0 = values[baseIdx];
    const val1 = values[baseIdx + 1];
    const val2 = values[baseIdx + 2];

    // Check if this triangle has high dBZ (average or all points above threshold)
    const avgValue = (val0 + val1 + val2) / 3;
    if (avgValue >= threshold) {
      // Get the 3 coordinate pairs
      const vertexBase = i * 6; // 3 vertices * 2 coords each
      const coords = [
        [vertices[vertexBase], vertices[vertexBase + 1]],
        [vertices[vertexBase + 2], vertices[vertexBase + 3]],
        [vertices[vertexBase + 4], vertices[vertexBase + 5]],
        [vertices[vertexBase], vertices[vertexBase + 1]], // Close the polygon
      ];

      // Create a polygon feature for this high-dBZ triangle
      features.push({
        type: "Feature",
        properties: { dbz: avgValue },
        geometry: {
          type: "Polygon",
          coordinates: [coords],
        },
      });
    }
  }

  return {
    type: "FeatureCollection",
    features: features,
  };
}

/**
 * Toggle flash opacity for high dBZ areas
 */
function updateHighDBZFlash(map) {
  if (!map) return;

  try {
    if (map.getLayer("radar-high-dbz-flash")) {
      // Compute smooth opacity matching shader (so geojson layer blends smoothly)
      const nowMs = performance.now();
      const period = Math.max(50, Number(HIGH_DBZ_FLASH_PERIOD_MS) || 1400);
      const phase = ((nowMs % period) / period) * Math.PI * 2;
      const smoothOpacity = 0.12 + 0.38 * (0.5 * (1 + Math.sin(phase))); // ~0.12-0.5
      map.setPaintProperty(
        "radar-high-dbz-flash",
        "fill-opacity",
        smoothOpacity,
      );
    }
  } catch (e) {
    // Layer might not exist yet, skip
  }
}

let radarFrames = [];
let currentFrameIndex = 0;
let loopAnimationFrameId = null;
let isLooping = false;
let lastFrameTime = 0;
let endPauseDuration = 1000;
let isPaused = false;
let pauseStartTime = 0;

const MAX_PARALLEL_DOWNLOADS = 6;

/**
 * OPTIMIZED: Fetches list of available radar files for a given date
 * Uses streamlined XML parsing for faster results
 */
async function fetchAvailableRadarFiles(siteId, product, date = new Date()) {
  const radarProduct = product || selectedRadarProduct;
  const radarSource = selectedRadarDataSource || "level3";

  if (radarSource === "level2") {
    const level2Url = `https://radar-api-production-076b.up.railway.app/api/radar-level2-files/${siteId}?limit=500`;
    console.time("fetch-file-list");
    console.log(`📡 Fetching Level 2 radar file list from: ${level2Url}`);

    try {
      const response = await fetch(level2Url);
      if (!response.ok) {
        throw new Error(`Failed to fetch Level 2 list (${response.status})`);
      }
      const payload = await response.json();
      const files = (payload.files || []).map((entry) => ({
        key: entry.key,
        timestamp: new Date(entry.timestamp),
      }));
      files.sort((a, b) => a.timestamp - b.timestamp);
      console.timeEnd("fetch-file-list");
      console.log(`✅ Found ${files.length} Level 2 radar files`);
      return files;
    } catch (error) {
      console.error("❌ Error fetching Level 2 radar file list:", error);
      throw error;
    }
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const datePrefix = `${year}_${month}_${day}`;

  const prefix = `${siteId}_${radarProduct}_${datePrefix}`;
  const url = `${NEXRAD_BUCKET_URL}/?prefix=${prefix}`;

  console.time("fetch-file-list");
  console.log(`📡 Fetching radar file list from: ${url}`);

  try {
    const response = await fetch(url);
    const xmlText = await response.text();

    const keyRegex = /<Key>([^<]+)<\/Key>/g;
    const timestampRegex = /<LastModified>([^<]+)<\/LastModified>/g;

    const keys = [];
    const timestamps = [];

    let match;
    while ((match = keyRegex.exec(xmlText)) !== null) {
      keys.push(match[1]);
    }
    while ((match = timestampRegex.exec(xmlText)) !== null) {
      timestamps.push(new Date(match[1]));
    }

    const files = keys.map((key, i) => ({
      key: key,
      timestamp: timestamps[i],
      url: `${NEXRAD_BUCKET_URL}/${key}`,
    }));

    files.sort((a, b) => a.timestamp - b.timestamp);

    console.timeEnd("fetch-file-list");
    console.log(`✅ Found ${files.length} radar files`);
    return files;
  } catch (error) {
    console.error("❌ Error fetching radar file list:", error);
    throw error;
  }
}

/**
 * OPTIMIZED: Downloads a single frame with error handling
 * Returns null on failure instead of throwing
 */
async function downloadSingleFrame(site, file, index, total, product) {
  try {
    const radarProduct = product || selectedRadarProduct;
    const radarSource = selectedRadarDataSource || "level3";

    const response = await fetch(
      `https://radar-api-production-076b.up.railway.app/api/radar-webgl/${
        site.id
      }?product=${radarProduct}&source=${encodeURIComponent(
        radarSource,
      )}&format=binary&key=${encodeURIComponent(file.key)}`,
      {
        cache: "force-cache",
      },
    );

    if (!response.ok) {
      console.warn(
        `⚠️ Failed to load frame ${index + 1}/${total}: ${response.status}`,
      );
      return null;
    }

    const contentType = response.headers.get("content-type");
    let radarData;

    if (contentType && contentType.includes("application/octet-stream")) {
      const contentEncoding = response.headers.get("Content-Encoding");
      let arrayBuffer;
      if (contentEncoding === "gzip") {
        const blob = await response.blob();
        const decompressedStream = blob
          .stream()
          .pipeThrough(new DecompressionStream("gzip"));
        const decompressedBlob = await new Response(decompressedStream).blob();
        arrayBuffer = await decompressedBlob.arrayBuffer();
      } else {
        arrayBuffer = await response.arrayBuffer();
      }

      radarData = parseBinaryRadarData(arrayBuffer);
    } else {
      radarData = await response.json();
    }

    return {
      data: radarData,
      timestamp: file.timestamp,
      key: file.key,
    };
  } catch (error) {
    console.error(`❌ Error loading frame ${index + 1}/${total}:`, error);
    return null;
  }
}

/**
 * OPTIMIZED: Downloads frames in parallel batches for maximum speed
 * Uses Promise.allSettled for resilient parallel downloads
 */
async function downloadFramesBatch(
  site,
  files,
  progressCallback = null,
  product = null,
) {
  const batches = [];

  const radarProduct = product || selectedRadarProduct;

  for (let i = 0; i < files.length; i += MAX_PARALLEL_DOWNLOADS) {
    batches.push(files.slice(i, i + MAX_PARALLEL_DOWNLOADS));
  }

  const allFrames = [];
  let loadedCount = 0;

  console.log(
    `📦 Downloading ${files.length} frames in ${batches.length} parallel batches (${MAX_PARALLEL_DOWNLOADS} at a time)`,
  );

  for (const batch of batches) {
    const promises = batch.map((file, batchIndex) => {
      const globalIndex = loadedCount + batchIndex;
      return downloadSingleFrame(
        site,
        file,
        globalIndex,
        files.length,
        radarProduct,
      );
    });

    const results = await Promise.allSettled(promises);

    const successfulFrames = results
      .filter((r) => r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value);

    allFrames.push(...successfulFrames);
    loadedCount += batch.length;

    if (progressCallback) {
      progressCallback(loadedCount, files.length);
    }

    console.log(
      `✅ Batch complete: ${successfulFrames.length}/${batch.length} frames loaded (${allFrames.length}/${files.length} total)`,
    );
  }

  return allFrames;
}

/**
 * OPTIMIZED: Loads multiple radar frames with parallel downloads and pre-processing
 * Significantly faster than sequential loading
 */
async function loadRadarFrames(
  site,
  frameCount = 10,
  progressCallback = null,
  product = null,
) {
  console.time("TOTAL-LOAD-TIME");

  try {
    const statusDiv = document.getElementById("sidebarStatus");
    if (statusDiv) {
      statusDiv.style.display = "block";
      document.getElementById("statusText").textContent =
        "Loading animation frames...";
    }

    const radarProduct = product || selectedRadarProduct;

    const availableFiles = await fetchAvailableRadarFiles(
      site.id,
      radarProduct,
    );

    if (availableFiles.length === 0) {
      alert("No radar data available for this site and date.");
      return;
    }

    const filesToLoad = availableFiles.slice(-frameCount);
    console.log(
      `� Starting parallel download of ${filesToLoad.length} frames...`,
    );

    radarFrames = [];

    console.time("parallel-download");
    const downloadedFrames = await downloadFramesBatch(
      site,
      filesToLoad,
      progressCallback,
      radarProduct,
    );
    console.timeEnd("parallel-download");

    if (downloadedFrames.length === 0) {
      alert("Failed to load any radar frames. Please try again.");
      return;
    }

    console.time("pre-process-frames");
    radarFrames = downloadedFrames.map((frame) => {
      const rawVertices = new Float32Array(frame.data.vertices);
      const rawValues = new Float32Array(frame.data.values);
      const smoothedValues = computeBilinearCornerValues(
        rawVertices,
        rawValues,
      );
      const mercatorCoords = new Float32Array(rawVertices.length);

      const DEG_TO_RAD = Math.PI / 180;
      const RAD_TO_DEG = 180 / Math.PI;
      const PI_4 = Math.PI / 4;
      const MIN_LAT = -85.0511 * DEG_TO_RAD;
      const MAX_LAT = 85.0511 * DEG_TO_RAD;

      for (let i = 0; i < rawVertices.length; i += 2) {
        const lng = rawVertices[i];
        const lat = rawVertices[i + 1];

        mercatorCoords[i] = (lng + 180) / 360;
        const latRad = Math.max(MIN_LAT, Math.min(MAX_LAT, lat * DEG_TO_RAD));
        mercatorCoords[i + 1] =
          (180 - RAD_TO_DEG * Math.log(Math.tan(PI_4 + latRad / 2))) / 360;
      }

      return {
        mercatorPositions: mercatorCoords,
        rawVertices,
        rawValues,
        smoothedValues,
        timestamp: frame.timestamp,
        key: frame.key,
        vertexCount: rawVertices.length / 2,
      };
    });
    console.timeEnd("pre-process-frames");

    console.log(
      `✅ Successfully loaded and pre-processed ${radarFrames.length} frames`,
    );
    console.timeEnd("TOTAL-LOAD-TIME");

    console.log("Updating UI with frame count:", radarFrames.length);

    document.getElementById("totalFrames").textContent = radarFrames.length;
    const loopControlsContainer = document.getElementById(
      "loopControlsContainer",
    );
    loopControlsContainer.style.display = "flex";

    console.log("loopControlsContainer display set to flex");

    currentFrameIndex = 0;
    displayFrameFast(currentFrameIndex);

    console.log("Loop is ready! Click play button to start animation.");
  } catch (error) {
    console.error("❌ Error loading radar frames:", error);
    alert(`Error loading radar frames: ${error.message}`);
  } finally {
    const statusDiv = document.getElementById("sidebarStatus");
    if (statusDiv) {
      statusDiv.style.display = "none";
    }
    if (progressCallback) {
      progressCallback(0, 0);
    }
  }
}

/**
 * OPTIMIZED: Ultra-fast frame display using pre-computed mercator coords
 * Bypasses expensive coordinate conversion - just updates GPU buffers
 */
function displayFrameFast(frameIndex) {
  if (frameIndex < 0 || frameIndex >= radarFrames.length) {
    return;
  }

  currentFrameIndex = frameIndex;
  const frame = radarFrames[frameIndex];
  const smoothingActive =
    (customRadarLayerInstance && customRadarLayerInstance.enableSmoothing) ||
    enableSmoothing;
  const frameValues =
    smoothingActive && frame.smoothedValues
      ? frame.smoothedValues
      : frame.rawValues;

  if (customRadarLayerInstance && customRadarLayerInstance.gl) {
    const gl = customRadarLayerInstance.gl;

    if (customRadarLayerInstance.useVAO && customRadarLayerInstance.vao) {
      customRadarLayerInstance.vaoExt.bindVertexArrayOES(
        customRadarLayerInstance.vao,
      );

      gl.bindBuffer(gl.ARRAY_BUFFER, customRadarLayerInstance.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frame.mercatorPositions, gl.STATIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, customRadarLayerInstance.dbzBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frameValues, gl.STATIC_DRAW);

      customRadarLayerInstance.vaoExt.bindVertexArrayOES(null);
    } else {
      gl.bindBuffer(gl.ARRAY_BUFFER, customRadarLayerInstance.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frame.mercatorPositions, gl.STATIC_DRAW);

      gl.bindBuffer(gl.ARRAY_BUFFER, customRadarLayerInstance.dbzBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, frameValues, gl.STATIC_DRAW);
    }

    customRadarLayerInstance.vertexCount = frame.vertexCount;
    customRadarLayerInstance.mercatorPositions = frame.mercatorPositions;
    customRadarLayerInstance.rawVertexLonLat = frame.rawVertices;
    customRadarLayerInstance.rawValues = frame.rawValues;
    customRadarLayerInstance.smoothedValues = frame.smoothedValues;
    customRadarLayerInstance.rawData = {
      vertices: frame.rawVertices,
      values: frameValues,
    };

    if (mapInstance) {
      mapInstance.triggerRepaint();
    }
  }

  updateAllProbesThrottled();

  document.getElementById("currentFrame").textContent = frameIndex + 1;

  if (dataMode === "hrrr") {
    if (frame.meta) {
      currentHRRRMeta = frame.meta;
      if (typeof frame.meta.forecastHour === "number") {
        selectedHRRRForecastHour = frame.meta.forecastHour;
      }
    }
    updateHRRRTimeCard(currentHRRRMeta);
  } else {
    updateRadarInfoWithTimestamp(selectedRadarSite, frame.timestamp);
  }
}

/**
 * OPTIMIZED: requestAnimationFrame-based loop for smooth 60fps animation
 * Much smoother than setInterval
 */
function startLoop() {
  console.log(
    "startLoop called. radarFrames.length:",
    radarFrames.length,
    "isLooping:",
    isLooping,
  );

  if (radarFrames.length === 0) {
    console.warn("Cannot start loop: no frames loaded");
    alert('Please load frames first by clicking "Load Animation Loop"');
    return;
  }

  if (isLooping) {
    console.warn("Loop already running");
    return;
  }

  isLooping = true;
  isPaused = false;
  setPlayPauseButtonState(true);

  console.log("Loop started successfully");

  const loopSpeed = parseInt(document.getElementById("loopSpeed").value);
  lastFrameTime = performance.now();

  const animate = (currentTime) => {
    if (!isLooping) return;

    if (isPaused) {
      const pauseElapsed = currentTime - pauseStartTime;
      if (pauseElapsed >= endPauseDuration) {
        isPaused = false;
        lastFrameTime = currentTime;
      } else {
        loopAnimationFrameId = requestAnimationFrame(animate);
        return;
      }
    }

    const elapsed = currentTime - lastFrameTime;

    if (elapsed >= loopSpeed) {
      currentFrameIndex = (currentFrameIndex + 1) % radarFrames.length;
      displayFrameFast(currentFrameIndex);
      lastFrameTime = currentTime - (elapsed % loopSpeed);

      if (
        currentFrameIndex === radarFrames.length - 1 &&
        endPauseDuration > 0
      ) {
        isPaused = true;
        pauseStartTime = currentTime;
      }
    }

    loopAnimationFrameId = requestAnimationFrame(animate);
  };

  loopAnimationFrameId = requestAnimationFrame(animate);
}

/**
 * OPTIMIZED: Stops the animation loop
 */
function stopLoop() {
  if (!isLooping) {
    return;
  }

  isLooping = false;
  setPlayPauseButtonState(false);

  if (loopAnimationFrameId) {
    cancelAnimationFrame(loopAnimationFrameId);
    loopAnimationFrameId = null;
  }
}

function setPlayPauseButtonState(isPlaying) {
  const playPauseBtn = document.getElementById("playPauseBtn");
  const modelPlayPauseBtn = document.getElementById("hrrrToggleLoopBtn");

  const iconName = isPlaying ? "pause" : "play";
  const label = isPlaying ? "Pause" : "Play";

  if (playPauseBtn) {
    playPauseBtn.innerHTML = `<i data-lucide="${iconName}"></i>`;
    playPauseBtn.title = label;
    playPauseBtn.setAttribute("aria-label", label);
  }

  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }

  if (modelPlayPauseBtn) {
    modelPlayPauseBtn.textContent = isPlaying ? "Pause" : "Play";
  }
}

/**
 * Toggles play/pause for the animation loop
 */
function toggleLoop() {
  console.log(
    "toggleLoop called. isLooping:",
    isLooping,
    "radarFrames.length:",
    radarFrames.length,
  );
  if (isLooping) {
    stopLoop();
  } else {
    startLoop();
  }
}

/**
 * Updates radar info with specific timestamp
 */
function updateRadarInfoWithTimestamp(site, timestamp) {
  try {
    const infoDiv = document.querySelector(".radar-info");
    const dateOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    const formattedDate = timestamp.toLocaleDateString("en-US", dateOptions);

    const productInfo = getRadarProductInfo(selectedRadarProduct);

    let html = `
      <strong>Radar Site:</strong> ${site.id} - ${site.name}<br>
      <strong>Rendered with:</strong> WebGL Custom Layer<br>
      <strong>Time:</strong> ${formattedDate}<br>
      <strong>Product:</strong> ${selectedRadarProduct} (${productInfo.name})<br>
    `;
    infoDiv.innerHTML = html;
  } catch (error) {
    console.error("Error updating radar info:", error);
  }
}

/**
 * Toggle the inspector tool on/off
 */
function toggleInspector() {
  inspectorEnabled = !inspectorEnabled;

  const toggleBtn = document.getElementById("inspectorToggle");
  const display = document.getElementById("inspectorDisplay");

  if (inspectorEnabled) {
    toggleBtn.classList.add("active");
    mapInstance.getCanvas().style.cursor = "crosshair";

    inspectorMouseHandler = (e) => scheduleInspectorMove(e);
    mapInstance.on("mousemove", inspectorMouseHandler);
  } else {
    toggleBtn.classList.remove("active");
    display.classList.remove("active");
    mapInstance.getCanvas().style.cursor = "";

    pendingInspectorEvent = null;
    if (inspectorMoveRaf) {
      cancelAnimationFrame(inspectorMoveRaf);
      inspectorMoveRaf = null;
    }

    if (inspectorMouseHandler) {
      mapInstance.off("mousemove", inspectorMouseHandler);
      inspectorMouseHandler = null;
    }
  }
}

function scheduleInspectorMove(e) {
  pendingInspectorEvent = e;
  if (inspectorMoveRaf) return;

  inspectorMoveRaf = requestAnimationFrame(() => {
    inspectorMoveRaf = null;
    if (!pendingInspectorEvent) return;
    const eventToProcess = pendingInspectorEvent;
    pendingInspectorEvent = null;
    handleInspectorMove(eventToProcess);
  });
}

/**
 * Handle mouse movement for inspector tool
 */
function handleInspectorMove(e) {
  if (
    !inspectorEnabled ||
    !customRadarLayerInstance ||
    !customRadarLayerInstance.rawData
  ) {
    return;
  }

  const display = document.getElementById("inspectorDisplay");

  const lngLat = e.lngLat;

  const radarValue = sampleRadarAtPoint(lngLat.lng, lngLat.lat);

  updateInspectorDisplay(radarValue, lngLat, e.point);

  display.classList.add("active");
}

/**
 * Sample radar data at a specific lat/lng point
 */
function sampleRadarAtPoint(lng, lat) {
  if (!customRadarLayerInstance || !customRadarLayerInstance.rawData) {
    return null;
  }

  const data = customRadarLayerInstance.rawData;
  const vertices = data.vertices;
  const values = data.values;

  if (!vertices || !values || vertices.length === 0) {
    return null;
  }

  let minDist = Infinity;
  let closestValue = null;

  const pointCount = values.length;
  const stride =
    pointCount > 200000
      ? 16
      : pointCount > 100000
        ? 8
        : pointCount > 40000
          ? 4
          : 1;

  for (let i = 0; i < vertices.length; i += 2 * stride) {
    const vLng = vertices[i];
    const vLat = vertices[i + 1];

    const dx = vLng - lng;
    const dy = vLat - lat;
    const dist = dx * dx + dy * dy;

    if (dist < minDist) {
      minDist = dist;
      closestValue = values[i / 2];
    }
  }

  if (minDist < 0.0025) {
    return closestValue;
  }

  return null;
}

/**
 * Update inspector display panel
 */
function updateInspectorDisplay(value, lngLat, screenPoint) {
  const display = document.getElementById("inspectorDisplay");
  const valueEl = document.getElementById("inspectorValue");
  const unitEl = document.getElementById("inspectorUnit");
  const coordsEl = document.getElementById("inspectorCoords");

  const productInfo = getRadarProductInfo(selectedRadarProduct);

  if (value !== null && !isNaN(value)) {
    let displayValue = value.toFixed(1);
    let interpretation = "";

    if (productInfo.isVelocity) {
      const velocityMph = value * MS_TO_MPH;
      displayValue = velocityMph.toFixed(1);
      const strongThreshold = 20 * MS_TO_MPH;
      const moderateThreshold = 5 * MS_TO_MPH;

      if (velocityMph < -strongThreshold) {
        interpretation = "Strong inbound";
      } else if (velocityMph < -moderateThreshold) {
        interpretation = "Moderate inbound";
      } else if (velocityMph < moderateThreshold) {
        interpretation = "Calm/Near zero";
      } else if (velocityMph < strongThreshold) {
        interpretation = "Moderate outbound";
      } else {
        interpretation = "Strong outbound";
      }
    } else {
      if (value < 20) {
        interpretation = "Light";
      } else if (value < 35) {
        interpretation = "Moderate";
      } else if (value < 50) {
        interpretation = "Heavy";
      } else {
        interpretation = "Extreme";
      }
    }

    valueEl.innerHTML = `${displayValue}<span style="font-size: 0.6em; margin-left: 4px; opacity: 0.7;">${interpretation}</span>`;
    unitEl.textContent = productInfo.unit;
  } else {
    valueEl.innerHTML = '<span class="inspector-no-data">No data</span>';
    unitEl.textContent = "";
  }

  coordsEl.innerHTML = `
    Lat: ${lngLat.lat.toFixed(4)}°<br>
    Lon: ${lngLat.lng.toFixed(4)}°
  `;

  const offset = 20;
  let left = screenPoint.x + offset;
  let top = screenPoint.y + offset;

  const displayRect = display.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  if (left + displayRect.width > viewportWidth - 20) {
    left = screenPoint.x - displayRect.width - offset;
  }

  if (top + displayRect.height > viewportHeight - 20) {
    top = screenPoint.y - displayRect.height - offset;
  }

  display.style.left = left + "px";
  display.style.top = top + "px";
}

function displayFrame(frameIndex) {
  displayFrameFast(frameIndex);
}

/**
 * Toggle the probe tool on/off
 */
function toggleProbeTool() {
  probeToolEnabled = !probeToolEnabled;

  const toggleBtn = document.getElementById("probeToggle");

  if (probeToolEnabled) {
    toggleBtn.classList.add("active");
    mapInstance.getCanvas().style.cursor = "crosshair";

    mapInstance.on("click", handleProbeClick);
  } else {
    toggleBtn.classList.remove("active");
    mapInstance.getCanvas().style.cursor = "";

    mapInstance.off("click", handleProbeClick);
  }
}

function _emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

function _activeElementIsTypingField() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  return tag === "input" || tag === "textarea" || tag === "select";
}

function ensureDrawLayersOnTop(map) {
  const orderedLayerIds = [
    DRAW_LAYER_FILL_ID,
    DRAW_LAYER_LINE_OUTLINE_ID,
    DRAW_LAYER_LINE_ID,
    DRAW_LAYER_PREVIEW_OUTLINE_ID,
    DRAW_LAYER_PREVIEW_ID,
    DRAW_LAYER_PREVIEW_SOLID_OUTLINE_ID,
    DRAW_LAYER_PREVIEW_SOLID_ID,
    DRAW_LAYER_POINTS_ID,
  ];

  for (const layerId of orderedLayerIds) {
    try {
      if (map.getLayer(layerId)) {
        map.moveLayer(layerId);
      }
    } catch (e) {
      // Ignore move failures (e.g. style reload)
    }
  }
}

function updateDrawSources(map) {
  if (!map) return;
  const drawSource = map.getSource(DRAW_SOURCE_ID);
  const previewSource = map.getSource(DRAW_PREVIEW_SOURCE_ID);
  const pointsSource = map.getSource(DRAW_POINTS_SOURCE_ID);

  if (drawSource) {
    drawSource.setData({
      type: "FeatureCollection",
      features: drawnFeatures,
    });
  }

  if (pointsSource) {
    if (drawMode === "pen") {
      pointsSource.setData(_emptyFeatureCollection());
    } else {
      let coordsToRender = drawPoints;
      if (drawMode === "pen" && drawPoints.length > 350) {
        const step = Math.ceil(drawPoints.length / 300);
        coordsToRender = drawPoints.filter((_, idx) => idx % step === 0);
      }

      const pointFeatures = coordsToRender.map((coord, idx) => ({
        type: "Feature",
        properties: {
          idx,
          color: drawColor,
        },
        geometry: {
          type: "Point",
          coordinates: coord,
        },
      }));

      pointsSource.setData({
        type: "FeatureCollection",
        features: pointFeatures,
      });
    }
  }

  if (previewSource) {
    let preview = _emptyFeatureCollection();

    if (drawToolEnabled && drawMode === "pen" && drawPoints.length > 1) {
      preview = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              color: drawColor,
              lineWidth: drawLineWidth,
              dashed: false,
              outlineEnabled: drawOutlineEnabled,
              outlineColor: drawOutlineColor,
              outlineWidth: drawOutlineWidth,
            },
            geometry: {
              type: "LineString",
              coordinates: [...drawPoints],
            },
          },
        ],
      };
    }

    if (
      drawToolEnabled &&
      drawMode !== "pen" &&
      drawPoints.length > 0 &&
      drawCursorPoint
    ) {
      preview = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              color: drawColor,
              lineWidth: drawLineWidth,
              dashed: true,
              outlineEnabled: drawOutlineEnabled,
              outlineColor: drawOutlineColor,
              outlineWidth: drawOutlineWidth,
            },
            geometry: {
              type: "LineString",
              coordinates: [...drawPoints, drawCursorPoint],
            },
          },
        ],
      };
    }

    previewSource.setData(preview);
  }
}

function undoDrawPoint() {
  if (drawPoints.length === 0) return;
  drawPoints.pop();
  updateDrawSources(mapInstance);
}

function cancelCurrentDraw() {
  drawPoints = [];
  drawCursorPoint = null;
  updateDrawSources(mapInstance);
}

function clearAllDrawings() {
  drawnFeatures = [];
  cancelCurrentDraw();
  updateDrawSources(mapInstance);
}

function finishDrawGeometry() {
  if (!drawToolEnabled) return;

  const nowIso = new Date().toISOString();
  const baseProperties = {
    color: drawColor,
    lineWidth: drawLineWidth,
    fillOpacity: drawFillOpacity,
    mode: drawMode,
    outlineEnabled: drawOutlineEnabled,
    outlineColor: drawOutlineColor,
    outlineWidth: drawOutlineWidth,
    createdAt: nowIso,
  };

  if (drawMode === "line" || drawMode === "pen") {
    if (drawPoints.length < 2) return;

    drawnFeatures.push({
      type: "Feature",
      properties: baseProperties,
      geometry: {
        type: "LineString",
        coordinates: [...drawPoints],
      },
    });
  } else {
    if (drawPoints.length < 3) return;

    const ring = [...drawPoints, drawPoints[0]];

    drawnFeatures.push({
      type: "Feature",
      properties: baseProperties,
      geometry: {
        type: "Polygon",
        coordinates: [ring],
      },
    });
  }

  drawPoints = [];
  drawCursorPoint = null;
  updateDrawSources(mapInstance);
  ensureDrawLayersOnTop(mapInstance);
}

async function copyDrawingsToClipboard() {
  const fc = { type: "FeatureCollection", features: drawnFeatures };
  const text = JSON.stringify(fc, null, 2);

  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Fallback: prompt-based copy
    window.prompt("Copy GeoJSON:", text);
  }
}

function downloadDrawings() {
  const fc = { type: "FeatureCollection", features: drawnFeatures };
  const text = JSON.stringify(fc, null, 2);

  const blob = new Blob([text], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `drawings_${Date.now()}.geojson`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function setDrawToolEnabled(enabled) {
  drawToolEnabled = enabled;

  const toggleBtn = document.getElementById("drawToggle");
  const panel = document.getElementById("drawPanel");

  if (!mapInstance) return;

  if (drawToolEnabled) {
    if (inspectorEnabled) toggleInspector();
    if (probeToolEnabled) toggleProbeTool();

    toggleBtn?.classList.add("active");
    panel?.classList.add("active");
    setDrawCursor();

    drawWasDoubleClickZoomEnabled = mapInstance.doubleClickZoom.isEnabled();
    mapInstance.doubleClickZoom.disable();

    ensureDrawLayersOnTop(mapInstance);
  } else {
    toggleBtn?.classList.remove("active");
    panel?.classList.remove("active");
    setDrawCursor();

    isPenDrawing = false;
    if (drawWasDragPanEnabled) {
      mapInstance.dragPan.enable();
    }

    cancelCurrentDraw();

    if (drawWasDoubleClickZoomEnabled) {
      mapInstance.doubleClickZoom.enable();
    }
  }
}

function initDrawTool(map) {
  if (!map) return;

  const toggleBtn = document.getElementById("drawToggle");
  const panel = document.getElementById("drawPanel");

  if (!toggleBtn || !panel) {
    console.warn("Draw tool UI not found (drawToggle/drawPanel)");
    return;
  }

  // Sources/layers
  if (!map.getSource(DRAW_SOURCE_ID)) {
    map.addSource(DRAW_SOURCE_ID, {
      type: "geojson",
      data: _emptyFeatureCollection(),
    });
  }
  if (!map.getSource(DRAW_PREVIEW_SOURCE_ID)) {
    map.addSource(DRAW_PREVIEW_SOURCE_ID, {
      type: "geojson",
      data: _emptyFeatureCollection(),
    });
  }
  if (!map.getSource(DRAW_POINTS_SOURCE_ID)) {
    map.addSource(DRAW_POINTS_SOURCE_ID, {
      type: "geojson",
      data: _emptyFeatureCollection(),
    });
  }

  if (!map.getLayer(DRAW_LAYER_FILL_ID)) {
    map.addLayer({
      id: DRAW_LAYER_FILL_ID,
      type: "fill",
      source: DRAW_SOURCE_ID,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["coalesce", ["get", "fillOpacity"], 0.2],
      },
    });
  }

  if (!map.getLayer(DRAW_LAYER_LINE_ID)) {
    if (!map.getLayer(DRAW_LAYER_LINE_OUTLINE_ID)) {
      map.addLayer({
        id: DRAW_LAYER_LINE_OUTLINE_ID,
        type: "line",
        source: DRAW_SOURCE_ID,
        filter: [
          "in",
          ["geometry-type"],
          ["literal", ["LineString", "Polygon"]],
        ],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["coalesce", ["get", "outlineColor"], "#000000"],
          "line-width": [
            "case",
            ["boolean", ["get", "outlineEnabled"], true],
            [
              "+",
              ["coalesce", ["get", "lineWidth"], 4],
              ["coalesce", ["get", "outlineWidth"], 2],
            ],
            0,
          ],
          "line-opacity": [
            "case",
            ["boolean", ["get", "outlineEnabled"], true],
            0.9,
            0,
          ],
        },
      });
    }

    map.addLayer({
      id: DRAW_LAYER_LINE_ID,
      type: "line",
      source: DRAW_SOURCE_ID,
      filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["coalesce", ["get", "lineWidth"], 4],
        "line-opacity": 0.95,
      },
    });
  }

  if (!map.getLayer(DRAW_LAYER_PREVIEW_ID)) {
    if (!map.getLayer(DRAW_LAYER_PREVIEW_OUTLINE_ID)) {
      map.addLayer({
        id: DRAW_LAYER_PREVIEW_OUTLINE_ID,
        type: "line",
        source: DRAW_PREVIEW_SOURCE_ID,
        filter: ["==", ["get", "dashed"], true],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["coalesce", ["get", "outlineColor"], "#000000"],
          "line-width": [
            "case",
            ["boolean", ["get", "outlineEnabled"], true],
            [
              "+",
              ["coalesce", ["get", "lineWidth"], 4],
              ["coalesce", ["get", "outlineWidth"], 2],
            ],
            0,
          ],
          "line-opacity": [
            "case",
            ["boolean", ["get", "outlineEnabled"], true],
            0.8,
            0,
          ],
          "line-dasharray": [2, 2],
        },
      });
    }

    map.addLayer({
      id: DRAW_LAYER_PREVIEW_ID,
      type: "line",
      source: DRAW_PREVIEW_SOURCE_ID,
      filter: ["==", ["get", "dashed"], true],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["coalesce", ["get", "lineWidth"], 4],
        "line-opacity": 0.8,
        "line-dasharray": [2, 2],
      },
    });
  }

  if (!map.getLayer(DRAW_LAYER_PREVIEW_SOLID_ID)) {
    if (!map.getLayer(DRAW_LAYER_PREVIEW_SOLID_OUTLINE_ID)) {
      map.addLayer({
        id: DRAW_LAYER_PREVIEW_SOLID_OUTLINE_ID,
        type: "line",
        source: DRAW_PREVIEW_SOURCE_ID,
        filter: ["==", ["get", "dashed"], false],
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-color": ["coalesce", ["get", "outlineColor"], "#000000"],
          "line-width": [
            "case",
            ["boolean", ["get", "outlineEnabled"], true],
            [
              "+",
              ["coalesce", ["get", "lineWidth"], 4],
              ["coalesce", ["get", "outlineWidth"], 2],
            ],
            0,
          ],
          "line-opacity": [
            "case",
            ["boolean", ["get", "outlineEnabled"], true],
            0.85,
            0,
          ],
        },
      });
    }

    map.addLayer({
      id: DRAW_LAYER_PREVIEW_SOLID_ID,
      type: "line",
      source: DRAW_PREVIEW_SOURCE_ID,
      filter: ["==", ["get", "dashed"], false],
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["coalesce", ["get", "lineWidth"], 4],
        "line-opacity": 0.9,
      },
    });
  }

  if (!map.getLayer(DRAW_LAYER_POINTS_ID)) {
    map.addLayer({
      id: DRAW_LAYER_POINTS_ID,
      type: "circle",
      source: DRAW_POINTS_SOURCE_ID,
      paint: {
        "circle-radius": 5,
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#000000",
        "circle-stroke-width": 1.5,
        "circle-opacity": 0.95,
      },
    });
  }

  ensureDrawLayersOnTop(map);
  updateDrawSources(map);

  // UI wiring
  toggleBtn.addEventListener("click", () => {
    setDrawToolEnabled(!drawToolEnabled);
  });

  document.getElementById("drawCloseBtn")?.addEventListener("click", () => {
    setDrawToolEnabled(false);
  });
  document
    .getElementById("drawUndoBtn")
    ?.addEventListener("click", undoDrawPoint);
  document
    .getElementById("drawFinishBtn")
    ?.addEventListener("click", finishDrawGeometry);
  document
    .getElementById("drawClearBtn")
    ?.addEventListener("click", clearAllDrawings);
  document
    .getElementById("drawCopyBtn")
    ?.addEventListener("click", copyDrawingsToClipboard);
  document
    .getElementById("drawDownloadBtn")
    ?.addEventListener("click", downloadDrawings);

  const modeSel = document.getElementById("drawModeSelect");
  const colorInp = document.getElementById("drawColor");
  const lineInp = document.getElementById("drawLineWidth");
  const fillInp = document.getElementById("drawFillOpacity");
  const outlineEnabledInp = document.getElementById("drawOutlineEnabled");
  const outlineColorInp = document.getElementById("drawOutlineColor");
  const outlineWidthInp = document.getElementById("drawOutlineWidth");

  if (modeSel) {
    modeSel.value = drawMode;
    modeSel.addEventListener("change", () => {
      drawMode = modeSel.value;
      isPenDrawing = false;
      if (drawWasDragPanEnabled) {
        mapInstance.dragPan.enable();
      }
      cancelCurrentDraw();
      setDrawCursor();
    });
  }
  if (colorInp) {
    colorInp.value = drawColor;
    colorInp.addEventListener("input", () => {
      drawColor = colorInp.value;
      updateDrawSources(mapInstance);
    });
  }
  if (lineInp) {
    lineInp.value = String(drawLineWidth);
    lineInp.addEventListener("input", () => {
      drawLineWidth = Number(lineInp.value);
      updateDrawSources(mapInstance);
    });
  }
  if (fillInp) {
    fillInp.value = String(drawFillOpacity);
    fillInp.addEventListener("input", () => {
      drawFillOpacity = Number(fillInp.value);
      updateDrawSources(mapInstance);
    });
  }

  if (outlineEnabledInp) {
    outlineEnabledInp.checked = !!drawOutlineEnabled;
    outlineEnabledInp.addEventListener("change", () => {
      drawOutlineEnabled = outlineEnabledInp.checked;
      updateDrawSources(mapInstance);
    });
  }

  if (outlineColorInp) {
    outlineColorInp.value = drawOutlineColor;
    outlineColorInp.addEventListener("input", () => {
      drawOutlineColor = outlineColorInp.value;
      updateDrawSources(mapInstance);
    });
  }

  if (outlineWidthInp) {
    outlineWidthInp.value = String(drawOutlineWidth);
    outlineWidthInp.addEventListener("input", () => {
      drawOutlineWidth = Number(outlineWidthInp.value);
      updateDrawSources(mapInstance);
    });
  }

  if (!drawHandlersInstalled) {
    drawHandlersInstalled = true;

    map.on("click", (e) => {
      if (!drawToolEnabled) return;
      if (drawMode === "pen") return;
      drawPoints.push([e.lngLat.lng, e.lngLat.lat]);
      updateDrawSources(mapInstance);
    });

    map.on("mousedown", (e) => {
      if (!drawToolEnabled) return;
      if (drawMode !== "pen") return;

      isPenDrawing = true;
      drawCursorPoint = null;
      drawPoints = [[e.lngLat.lng, e.lngLat.lat]];

      drawWasDragPanEnabled = mapInstance.dragPan.isEnabled();
      mapInstance.dragPan.disable();

      setDrawCursor();

      updateDrawSources(mapInstance);
    });

    map.on("mouseup", () => {
      if (!drawToolEnabled) return;
      if (drawMode !== "pen") return;
      if (!isPenDrawing) return;

      isPenDrawing = false;
      if (drawWasDragPanEnabled) {
        mapInstance.dragPan.enable();
      }

      setDrawCursor();

      finishDrawGeometry();
    });

    map.on("mousemove", (e) => {
      if (!drawToolEnabled) return;

      if (drawMode === "pen") {
        if (!isPenDrawing) return;

        const next = [e.lngLat.lng, e.lngLat.lat];
        const last = drawPoints[drawPoints.length - 1];
        if (!last) {
          drawPoints.push(next);
          updateDrawSources(mapInstance);
          return;
        }

        const dx = next[0] - last[0];
        const dy = next[1] - last[1];
        const d2 = dx * dx + dy * dy;
        if (d2 < PEN_MIN_POINT_DIST_SQ_DEG) return;

        drawPoints.push(next);
        updateDrawSources(mapInstance);
        return;
      }

      drawCursorPoint = [e.lngLat.lng, e.lngLat.lat];
      updateDrawSources(mapInstance);
    });

    map.on("dblclick", (e) => {
      if (!drawToolEnabled) return;
      if (drawMode === "pen") return;
      e.preventDefault();
      finishDrawGeometry();
    });

    window.addEventListener("keydown", (e) => {
      if (!drawToolEnabled) return;
      if (_activeElementIsTypingField()) return;

      if (e.key === "Escape") {
        cancelCurrentDraw();
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        undoDrawPoint();
      } else if (e.key === "Enter") {
        finishDrawGeometry();
      }
    });
  }
}

/**
 * Handle map click to place a probe marker
 */
function handleProbeClick(e) {
  if (!probeToolEnabled) return;

  const lngLat = e.lngLat;
  const probeId = ++probeIdCounter;

  const radarValue = sampleRadarAtPoint(lngLat.lng, lngLat.lat);

  const el = document.createElement("div");
  el.className = "probe-marker";
  el.innerHTML = `
    <div class="probe-marker__pin">📍</div>
    <div class="probe-marker__label">Probe ${probeId}</div>
  `;
  el.style.cursor = "move";

  const marker = new maplibregl.Marker({
    element: el,
    draggable: true,
  })
    .setLngLat([lngLat.lng, lngLat.lat])
    .addTo(mapInstance);

  const popup = createProbePopup(probeId, radarValue, lngLat);
  marker.setPopup(popup);
  popup.addTo(mapInstance);

  const probe = {
    id: probeId,
    marker: marker,
    popup: popup,
    lngLat: { lng: lngLat.lng, lat: lngLat.lat },
    lastValue: typeof radarValue === "number" ? radarValue : null,
  };
  probeMarkers.push(probe);

  marker.on("drag", () => {
    const newLngLat = marker.getLngLat();
    probe.lngLat = newLngLat;
    const newValue = sampleRadarAtPoint(newLngLat.lng, newLngLat.lat);
    updateProbePopup(probe, newValue);
  });

  setTimeout(() => {
    const closeBtn = document.querySelector(
      `.probe-popup-${probeId} .probe-popup__close`,
    );
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        removeProbe(probeId);
      });
    }
  }, 100);

  console.log(`Placed probe ${probeId} at`, lngLat);
}

/**
 * Create a popup for a probe with radar data
 */
function createProbePopup(probeId, radarValue, lngLat) {
  const productInfo = getRadarProductInfo(selectedRadarProduct);

  let valueDisplay, interpretation;
  if (radarValue !== null) {
    valueDisplay = radarValue.toFixed(1);

    if (
      selectedRadarProduct.includes("G") ||
      selectedRadarProduct.includes("S")
    ) {
      const velocityMph = radarValue * MS_TO_MPH;
      interpretation =
        velocityMph < -20
          ? "Strong inbound"
          : velocityMph < -5
            ? "Moderate inbound"
            : velocityMph < 5
              ? "Calm"
              : velocityMph < 20
                ? "Moderate outbound"
                : "Strong outbound";
    } else {
      interpretation =
        radarValue < 20
          ? "Light"
          : radarValue < 35
            ? "Moderate"
            : radarValue < 50
              ? "Heavy"
              : "Extreme";
    }
  } else {
    valueDisplay = "--";
    interpretation = "No data";
  }

  const content = `
    <div class="probe-popup probe-popup-${probeId}">
      <div class="probe-popup__header">
        <span class="probe-popup__title">Probe ${probeId}</span>
        <button class="probe-popup__close">×</button>
      </div>
      <div class="probe-popup__body">
        <div class="probe-popup__value">${valueDisplay} <span class="probe-popup__unit">${
          productInfo.unit
        }</span></div>
        <div class="probe-popup__interpretation">${interpretation}</div>
        <div class="probe-popup__coords">
          ${lngLat.lat.toFixed(4)}°, ${lngLat.lng.toFixed(4)}°
        </div>
      </div>
    </div>
  `;

  return new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    offset: 25,
    className: "probe-popup-container",
  }).setHTML(content);
}

const PROBE_SMOOTHING_ALPHA = 0.35;

function smoothProbeValue(previousValue, nextValue) {
  if (typeof nextValue !== "number" || !isFinite(nextValue)) {
    return null;
  }
  if (typeof previousValue !== "number" || !isFinite(previousValue)) {
    return nextValue;
  }
  return previousValue + (nextValue - previousValue) * PROBE_SMOOTHING_ALPHA;
}

/**
 * Update probe popup with new radar value
 */
function updateProbePopup(probe, radarValue) {
  const productInfo = getRadarProductInfo(selectedRadarProduct);

  const numericValue =
    typeof radarValue === "number" && isFinite(radarValue) ? radarValue : null;
  const smoothedValue = smoothProbeValue(probe.lastValue, numericValue);
  let valueDisplay;
  let interpretation;

  if (smoothedValue !== null) {
    probe.lastValue = smoothedValue;
    valueDisplay = smoothedValue.toFixed(1);

    if (
      selectedRadarProduct.includes("G") ||
      selectedRadarProduct.includes("S")
    ) {
      const velocityMph = smoothedValue * MS_TO_MPH;
      interpretation =
        velocityMph < -20
          ? "Strong inbound"
          : velocityMph < -5
            ? "Moderate inbound"
            : velocityMph < 5
              ? "Calm"
              : velocityMph < 20
                ? "Moderate outbound"
                : "Strong outbound";
    } else {
      interpretation =
        smoothedValue < 20
          ? "Light"
          : smoothedValue < 35
            ? "Moderate"
            : smoothedValue < 50
              ? "Heavy"
              : "Extreme";
    }
  } else {
    valueDisplay = "--";
    interpretation = "No data";
  }

  const valueEl = document.querySelector(
    `.probe-popup-${probe.id} .probe-popup__value`,
  );
  const interpEl = document.querySelector(
    `.probe-popup-${probe.id} .probe-popup__interpretation`,
  );
  const coordsEl = document.querySelector(
    `.probe-popup-${probe.id} .probe-popup__coords`,
  );

  if (valueEl) {
    valueEl.innerHTML = `${valueDisplay} <span class="probe-popup__unit">${productInfo.unit}</span>`;
  }
  if (interpEl) {
    interpEl.textContent = interpretation;
  }
  if (coordsEl) {
    coordsEl.textContent = `${probe.lngLat.lat.toFixed(
      4,
    )}°, ${probe.lngLat.lng.toFixed(4)}°`;
  }
}

/**
 * Remove a probe by ID
 */
function removeProbe(probeId) {
  const index = probeMarkers.findIndex((p) => p.id === probeId);
  if (index !== -1) {
    const probe = probeMarkers[index];
    probe.marker.remove();
    if (probe.popup) probe.popup.remove();
    probeMarkers.splice(index, 1);
    console.log(`Removed probe ${probeId}`);
  }
}

/**
 * Update all probe values (called when radar data changes)
 */
function updateAllProbes() {
  if (!probeMarkers || probeMarkers.length === 0) {
    return;
  }
  probeMarkers.forEach((probe) => {
    const newValue = sampleRadarAtPoint(probe.lngLat.lng, probe.lngLat.lat);
    updateProbePopup(probe, newValue);
  });
}

function updateAllProbesThrottled(force = false) {
  if (force) {
    lastProbeUpdateTs = performance.now();
    updateAllProbes();
    return;
  }

  const now = performance.now();
  if (now - lastProbeUpdateTs < PROBE_UPDATE_MIN_INTERVAL_MS) {
    return;
  }

  lastProbeUpdateTs = now;
  updateAllProbes();
}

document.getElementById("enable3DTilt").addEventListener("change", (e) => {
  enable3DTilt = e.target.checked;

  const controlsDiv = document.getElementById("tilt3DControls");
  controlsDiv.style.display = enable3DTilt ? "block" : "none";

  if (mapInstance) {
    mapInstance.triggerRepaint();
  }

  console.log(`3D Tilt Mode: ${enable3DTilt ? "ENABLED" : "DISABLED"}`);
  saveUserSettings();
});

// Load persisted user settings and apply to controls
try {
  loadUserSettings();
  const enableFlashEl = document.getElementById("enableAlertFlashing");
  if (enableFlashEl) enableFlashEl.checked = !!enableAlertFlashing;
  const sweepModeEl = document.getElementById("sweepMode");
  if (sweepModeEl) sweepModeEl.value = sweepMode;
  const tiltEl = document.getElementById("tiltExaggeration");
  if (tiltEl) tiltEl.value = tiltExaggeration;
  const beamEl = document.getElementById("beamElevation");
  if (beamEl) beamEl.value = beamElevationAngle;
  const shadowsEl = document.getElementById("enableShadows");
  if (shadowsEl) shadowsEl.checked = !!enableShadows;
  const shadowOpacityEl = document.getElementById("shadowOpacity");
  if (shadowOpacityEl)
    shadowOpacityEl.value = Math.round((shadowOpacity || 0) * 100);
  syncToolToggleVisualState();
} catch (e) {
  console.warn("Error applying saved settings:", e);
}

document.getElementById("beamElevation").addEventListener("input", (e) => {
  beamElevationAngle = parseFloat(e.target.value);
  document.getElementById("beamElevationValue").textContent =
    `${beamElevationAngle}°`;

  if (mapInstance) {
    mapInstance.triggerRepaint();
  }
  saveUserSettings();
});

document.getElementById("tiltExaggeration").addEventListener("input", (e) => {
  tiltExaggeration = parseInt(e.target.value);
  document.getElementById("tiltExaggerationValue").textContent =
    `${tiltExaggeration}x`;

  if (mapInstance) {
    mapInstance.triggerRepaint();
  }
  saveUserSettings();
});

document.getElementById("enableShadows").addEventListener("change", (e) => {
  enableShadows = e.target.checked;

  if (mapInstance) {
    mapInstance.triggerRepaint();
  }

  console.log(`Shadows: ${enableShadows ? "ENABLED" : "DISABLED"}`);
  saveUserSettings();
});

document.getElementById("shadowOpacity").addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  shadowOpacity = value / 100.0;
  document.getElementById("shadowOpacityValue").textContent = `${value}%`;

  if (mapInstance) {
    mapInstance.triggerRepaint();
  }
  saveUserSettings();
});

document.getElementById("sweepMode").addEventListener("change", (e) => {
  sweepMode = e.target.value;
  console.log(`Sweep Mode: ${sweepMode}`);

  // Restart sweep animation with new mode
  if (mapInstance && selectedRadarSite && dataMode === "radar") {
    if (sweepMode === "disabled") {
      stopSweepAnimation(mapInstance);
    } else {
      startSweepAnimation(mapInstance, selectedRadarSite);
    }
  }
  saveUserSettings();
});

document
  .getElementById("enableAlertFlashing")
  .addEventListener("change", (e) => {
    enableAlertFlashing = e.target.checked;

    if (enableAlertFlashing) {
      startAlertFlashing();
      console.log("Alert flashing: ENABLED");
    } else {
      stopAlertFlashing();
      activeAlerts.forEach((alert) => {
        if (!mapInstance || !alert.mapLayerId) return;
        const fillLayerId = `${alert.mapLayerId}-fill`;
        if (mapInstance.getLayer(fillLayerId)) {
          mapInstance.setPaintProperty(fillLayerId, "fill-opacity", 0.25);
        }
      });
      console.log("Alert flashing: DISABLED");
    }
    saveUserSettings();
  });

console.log("Setting up playPauseBtn event listener");
const playPauseBtn = document.getElementById("playPauseBtn");
if (playPauseBtn) {
  console.log("playPauseBtn found, adding click listener");
  playPauseBtn.addEventListener("click", () => {
    console.log("playPauseBtn clicked!");
    toggleLoop();
  });
} else {
  console.error("playPauseBtn not found!");
}

document.getElementById("loopSpeed").addEventListener("input", (e) => {
  const speed = parseInt(e.target.value);
  document.getElementById("loopSpeedValue").textContent = `${speed}ms`;

  if (isLooping) {
    stopLoop();
    startLoop();
  }
});

document.getElementById("endPauseDuration").addEventListener("input", (e) => {
  endPauseDuration = parseInt(e.target.value);
  document.getElementById("endPauseDurationValue").textContent =
    `${endPauseDuration}ms`;
});

document.getElementById("frameCount").addEventListener("change", async (e) => {
  const newCount = parseInt(e.target.value);
  if (newCount < 2 || newCount > 30) {
    alert("Frame count must be between 2 and 30");
    e.target.value = 10;
    return;
  }

  if (selectedRadarSite) {
    await loadRadarFrames(selectedRadarSite, newCount);
  }
});

const inspectorToggleBtn = document.getElementById("inspector-toggle");
if (inspectorToggleBtn) {
  inspectorToggleBtn.addEventListener("click", toggleInspector);
  console.log("Inspector toggle event listener added");
} else {
  console.warn("Inspector toggle button not found");
}

const probeToggleBtn = document.getElementById("probeToggle");
if (probeToggleBtn) {
  probeToggleBtn.addEventListener("click", toggleProbeTool);
  console.log("Probe tool toggle event listener added");
} else {
  console.warn("Probe tool toggle button not found");
}

const smoothingToggle = document.getElementById("enableSmoothing");
if (smoothingToggle) {
  radarSmoothingPreference = smoothingToggle.checked;
  smoothingToggle.addEventListener("change", (e) => {
    if (dataMode === "hrrr") {
      e.target.checked = true;
      return;
    }

    radarSmoothingPreference = e.target.checked;
    enableSmoothing = radarSmoothingPreference;
    console.log(`Smoothing: ${enableSmoothing ? "ENABLED" : "DISABLED"}`);

    if (
      customRadarLayerInstance &&
      typeof customRadarLayerInstance.setSmoothingEnabled === "function"
    ) {
      customRadarLayerInstance.setSmoothingEnabled(enableSmoothing);
    } else if (mapInstance) {
      mapInstance.triggerRepaint();
    }
  });
  console.log("Smoothing toggle event listener added");
} else {
  console.warn("Smoothing toggle not found");
}

const arcSyncToggle = document.getElementById("arcSyncToggle");
if (arcSyncToggle) {
  arcSyncToggle.checked = arcSyncEnabled;
  updateArcSyncToggleState();
  arcSyncToggle.addEventListener("change", (e) => {
    arcSyncEnabled = Boolean(e.target.checked);
    stopArcSyncStream();
    updateArcSyncToggleState();
    if (!arcSyncEnabled) {
      lastRadarKey = null;
    }

    if (dataMode === "radar" && selectedRadarSite && !isArchiveMode) {
      startRadarPolling(
        mapInstance,
        selectedRadarSite,
        selectedRadarProduct,
        selectedRadarDataSource,
      );
    }
  });
  console.log("Arc-Sync toggle event listener added");
} else {
  console.warn("Arc-Sync toggle not found");
}
