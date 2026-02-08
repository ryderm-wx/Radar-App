# County-Based Alert Support

This radar application now supports displaying weather alerts that don't have polygon geometries. These alerts use UGC (Universal Geographic Code) or SAME (Specific Area Message Encoding) codes to identify affected counties.

## Features

### 1. **Automatic County Matching**

When an alert arrives without a `polygon` field, the system automatically:

- Checks for UGC codes in `alert.ugc[]`
- Checks for SAME codes in `alert.geocode.SAME[]`
- Matches these codes against the `counties.geojson` database
- Displays all matched counties on the map

### 2. **Visual Styling**

County-based alerts are displayed differently from polygon-based alerts:

- **Fill Only**: Semi-transparent fill in the alert's color
- **No Outline**: County-based alerts do NOT have outlines (as requested)
- **No Flashing**: The outline flashing animation is automatically disabled for county-based alerts

### 3. **Example Alert Format**

```json
{
  "id": "KOUN.TO.A.0189",
  "eventCode": "TO.A",
  "eventName": "Tornado Watch",
  "vtec": "/O.NEW.KOUN.TO.A.0189.240506T1905Z-260507T0400Z/",
  "action": "NEW",
  "office": "KOUN",
  "effective": "2024-05-06T19:05:00.000Z",
  "expires": "2026-05-07T04:00:00.000Z",
  "counties": ["Alfalfa, OK", "Beckham, OK", ...],
  "geocode": {
    "SAME": ["40003", "40009", "40011", ...],
    "UGC": ["OKC003", "OKC009", "OKC011", ...]
  },
  "ugc": ["OKC003", "OKC009", "OKC011", ...]
}
```

## How It Works

### 1. Data Loading

On application startup, `loadCountiesData()` fetches the `counties.geojson` file:

```javascript
async function loadCountiesData() {
  const response = await fetch("counties.geojson");
  countiesData = await response.json();
  console.log(`✅ Loaded ${countiesData.features.length} counties`);
}
```

### 2. Alert Processing

When an alert arrives in `addAlertToMap()`:

```javascript
if (alert.polygon) {
  addAlertPolygon(mapInstance, alert);
} else if (
  (alert.ugc && alert.ugc.length > 0) ||
  (alert.geocode && alert.geocode.SAME && alert.geocode.SAME.length > 0)
) {
  addAlertCounties(alert);
}
```

### 3. County Matching

The `addAlertCounties()` function:

1. Extracts UGC or SAME codes from the alert
2. Matches codes against county GEOID values in `counties.geojson`
3. Combines all matched county polygons into a single GeoJSON feature
4. Adds a fill layer (no outline layers)

### 4. Code Matching Logic

- **SAME Codes**: Direct match with county `GEOID` (e.g., "40003" matches Alfalfa County, OK)
- **UGC Codes**: Simplified matching by extracting the last 3 digits (e.g., "OKC003" → "003")

## Files Modified

### `app.js`

- **Line 851**: Added `countiesData` variable to store counties GeoJSON
- **Line 1021**: Added `loadCountiesData()` function to fetch counties.geojson
- **Line 1265**: Updated `addAlertToMap()` to check for UGC/SAME codes
- **Line 1343**: Updated `startAlertFlashing()` to skip county-based alerts
- **Line 1408**: Updated `stopAlertFlashing()` to skip county-based alerts
- **Line 2323**: Updated `showDetailedAlert()` to zoom to county-based alerts
- **Line 3063**: Implemented full `addAlertCounties()` function

### `counties.geojson`

- Contains all U.S. county boundaries with GEOID, name, state, and geometry
- GEOID format: 5-digit FIPS code (2-digit state + 3-digit county)

## Testing

To test county-based alerts:

1. Make sure `counties.geojson` is in the project root directory
2. Start the application
3. Wait for an alert without a polygon field (like a Tornado Watch with UGC codes)
4. The alert should appear on the map with a colored fill covering the affected counties
5. Click on a county to see alert details
6. Notice there's no outline and no flashing animation

## Troubleshooting

### Alert not displaying?

- Check browser console for county matching messages
- Verify the alert has `ugc` or `geocode.SAME` fields
- Ensure `counties.geojson` loaded successfully

### Counties not matching?

- Some UGC codes may not match if the FIPS mapping is incomplete
- Check console for "No matching counties found" warnings
- SAME codes (FIPS codes) have the most reliable matching

### Performance issues?

- The `counties.geojson` file contains ~3,000 counties
- Matching is done client-side and should be fast
- Consider caching matched county geometries if performance becomes an issue

## Future Enhancements

Possible improvements:

1. **Better UGC Matching**: Implement a complete UGC-to-FIPS mapping table
2. **Zone Support**: Add support for forecast zones (ZZZ codes) in addition to counties
3. **Caching**: Cache matched counties to improve performance for repeated alerts
4. **Marine Zones**: Support marine zone alerts with appropriate boundary data
