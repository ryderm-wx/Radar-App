# Traffic Cameras

All of the traffic cameras in the U.S and Canada (Almost)

## Folder Structure

```
cameras/
  ├── michigan/
  │   └── cameras.geojson
  ├── new mexico/
  │   └── cameras.geojson
  └── [other states]/
      └── cameras.geojson
```

## GeoJSON Format

Each state folder should contain one or more `.geojson` files with the following structure:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "Point",
        "coordinates": [longitude, latitude]
      },
      "properties": {
        "name": "Camera Name (optional)",
        "image_url": "https://example.com/camera.jpg (optional)",
        "video_url": "https://example.com/camera.mp4 (optional)"
      }
    }
  ]
}
```

## Supported Properties

- **name** (optional): Display name for the camera (e.g., "I-75 at 8 Mile")
- **image_url** (optional): URL to a static camera image (JPG, PNG, etc.)
- **video_url** (optional): URL to a video stream (MP4, WebM, M3U8, FLV, etc.)
- **state** (auto-added): State name is automatically added by the backend

## Media Support

### Images 📸

- Supports: `.jpg`, `.jpeg`, `.png`, `.gif`
- Auto-refresh button
- Click to view full size

### Videos 🎥

- Supports: `.mp4`, `.webm`, `.ogg`, `.m3u8`, `.flv`, `.mov`, `.avi`
- Auto-play with loop and mute
- Play/Pause controls
- HLS streaming support (`.m3u8`)

### Both Image and Video

If a camera has **both** `image_url` and `video_url`, the popup shows toggle buttons to switch between formats!

## Example Camera Entry

```json
{
  "type": "Feature",
  "geometry": {
    "type": "Point",
    "coordinates": [-83.04671, 42.491267]
  },
  "properties": {
    "name": "I-696 at Dequindre",
    "image_url": "https://micamerasimages.net/thumbs/cam_253.jpg",
    "video_url": "https://micamerasimages.net/streams/cam_253.m3u8"
  }
}
```

## Usage

1. Create a folder for your state (lowercase, spaces allowed)
2. Create a `cameras.geojson` file in that folder
3. Add camera features with coordinates and media URLs
4. Restart the Flask backend
5. Toggle "Traffic Cameras" in the UI

## Camera Marker Colors

On the map, camera markers are color-coded to show media type:

- 🟢 **Green** - Camera has video_url (video stream available)
- 🔵 **Blue** - Camera has image_url (static image available)
- ⚪ **Grey** - Camera has no media URLs (placeholder/no media)

**Note:** If a camera has both image and video URLs, it will show as green (video takes priority).

This helps you quickly identify the type of media available before clicking.

## API Endpoint

```
GET http://localhost:5100/api/cameras
```

Returns a merged GeoJSON FeatureCollection of all cameras from all states.
