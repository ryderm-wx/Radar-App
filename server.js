const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();

// Serve static files from the project root directory
app.use(express.static(path.join(__dirname)));

// Simple API to return merged cameras from local cameras folder
app.get("/api/cameras", (req, res) => {
  try {
    const camerasRoot = path.join(__dirname, "cameras");
    const states = fs.existsSync(camerasRoot)
      ? fs
          .readdirSync(camerasRoot, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => d.name)
      : [];

    const merged = { type: "FeatureCollection", features: [] };

    states.forEach((stateName) => {
      const stateDir = path.join(camerasRoot, stateName);
      let files = [];
      try {
        files = fs
          .readdirSync(stateDir)
          .filter((f) => f.toLowerCase().endsWith(".geojson"));
      } catch (err) {
        // ignore
      }

      files.forEach((file) => {
        try {
          const filePath = path.join(stateDir, file);
          const raw = fs.readFileSync(filePath, "utf8");
          const data = JSON.parse(raw);
          if (data && Array.isArray(data.features)) {
            data.features.forEach((feat) => {
              // Normalize properties to include `image_url` and `video_url`
              feat.properties = feat.properties || {};

              // If already normalized, keep
              if (!feat.properties.image_url || !feat.properties.video_url) {
                // scan properties for URLs and guess type
                Object.keys(feat.properties).forEach((k) => {
                  const v = feat.properties[k];
                  if (!v || typeof v !== "string") return;
                  // find http(s)
                  const m = v.match(/https?:\/\/[^\s\"]+/);
                  const candidate = m ? m[0] : v;
                  if (!candidate || !candidate.startsWith("http")) return;

                  const lower = candidate.split("?")[0].toLowerCase();
                  if (
                    !feat.properties.image_url &&
                    (lower.endsWith(".jpg") ||
                      lower.endsWith(".jpeg") ||
                      lower.endsWith(".png") ||
                      lower.endsWith(".gif") ||
                      lower.includes(".jpg") ||
                      lower.includes(".jpeg") ||
                      lower.includes(".png") ||
                      lower.includes("thumbs") ||
                      /image/.test(k.toLowerCase()))
                  ) {
                    feat.properties.image_url = candidate;
                  }

                  if (
                    !feat.properties.video_url &&
                    (lower.endsWith(".mp4") ||
                      lower.endsWith(".webm") ||
                      lower.endsWith(".m3u8") ||
                      lower.endsWith(".flv") ||
                      lower.endsWith(".mov") ||
                      lower.endsWith(".avi") ||
                      lower.includes("stream") ||
                      /video/i.test(k))
                  ) {
                    feat.properties.video_url = candidate;
                  }

                  // Some properties use camelCase names like currentImageURL / streamingVideoURL
                  if (!feat.properties.image_url && /image.*url/i.test(k)) {
                    feat.properties.image_url = candidate;
                  }
                  if (
                    !feat.properties.video_url &&
                    /stream|video|streaming/i.test(k)
                  ) {
                    feat.properties.video_url = candidate;
                  }
                });
              }

              // Add a normalized state property
              feat.properties.state = feat.properties.state || stateName;

              merged.features.push(feat);
            });
          }
        } catch (err) {
          // ignore malformed files
          console.warn("Skipping cameras file", file, err && err.message);
        }
      });
    });

    res.json(merged);
  } catch (err) {
    console.error("/api/cameras error", err);
    res.status(500).json({ type: "FeatureCollection", features: [] });
  }
});

// Define a route for the root URL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
