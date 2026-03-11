/**
 * JourneyMapView — WebView-based Leaflet map showing only this journey's places.
 *
 * - Auto-fits bounds to all markers
 * - Tappable markers post a message via postMessage → onPlaceSelect callback
 * - Place name popup on marker tap
 */
import { useRef, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import type { WebViewMessageEvent } from 'react-native-webview';
import { useTheme } from '@/app/providers';
import { tokens } from '@/lib/theme';

interface JourneyPlace {
  place_code: string;
  name: string;
  latitude: number;
  longitude: number;
  /** Optional: whether the current user has checked in */
  user_checked_in?: boolean;
}

interface Props {
  places: JourneyPlace[];
  onPlaceSelect?: (placeCode: string) => void;
  height?: number;
}

function buildJourneyMapHtml(places: JourneyPlace[], isDark: boolean): string {
  const markers = places.map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    name: p.name,
    placeCode: p.place_code,
    checked: p.user_checked_in ?? false,
  }));

  const bgColor = isDark ? '#1A1A1A' : '#F5F0E9';
  const primaryColor = tokens.colors.primary; // '#B0563D'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: ${bgColor}; }
    .custom-marker {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 2px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      cursor: pointer;
    }
    .custom-marker.visited {
      background: #16a34a;
    }
    .custom-marker.unvisited {
      background: ${primaryColor};
    }
    .custom-marker-inner {
      transform: rotate(45deg);
      color: white;
      font-size: 13px;
      font-weight: 700;
      font-family: sans-serif;
    }
    .leaflet-popup-content-wrapper {
      border-radius: 10px;
      box-shadow: 0 3px 12px rgba(0,0,0,0.15);
    }
    .leaflet-popup-content {
      font-family: sans-serif;
      font-size: 13px;
      font-weight: 600;
      color: #2D3E3B;
      margin: 8px 12px;
    }
    .place-tap-btn {
      display: block;
      margin-top: 6px;
      padding: 4px 8px;
      background: ${primaryColor};
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var markersData = ${JSON.stringify(markers)};

    var map = L.map('map', {
      zoomControl: true,
      attributionControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);

    var bounds = [];
    var leafletMarkers = [];

    markersData.forEach(function(m, idx) {
      var iconHtml = '<div class="custom-marker ' + (m.checked ? 'visited' : 'unvisited') + '"><span class="custom-marker-inner">' + (idx + 1) + '</span></div>';
      var icon = L.divIcon({
        html: iconHtml,
        className: '',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
      var marker = L.marker([m.lat, m.lng], { icon: icon }).addTo(map);
      marker.bindPopup(
        '<div><strong>' + m.name + '</strong>' +
        (m.checked ? '<br><span style="color:#16a34a;font-size:11px;">&#10003; Checked in</span>' : '') +
        '<br><button class="place-tap-btn" onclick="selectPlace(' + JSON.stringify(m.placeCode) + ')">View in list</button></div>'
      );
      bounds.push([m.lat, m.lng]);
      leafletMarkers.push(marker);
    });

    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 14);
      } else {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    }

    function selectPlace(placeCode) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'placeSelect', placeCode: placeCode }));
      }
    }
  </script>
</body>
</html>`;
}

export default function JourneyMapView({ places, onPlaceSelect, height = 280 }: Props) {
  const webviewRef = useRef<InstanceType<typeof WebView>>(null);
  const { isDark } = useTheme();

  const html = useMemo(() => buildJourneyMapHtml(places, isDark), [places, isDark]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data) as { type: string; placeCode: string };
      if (msg.type === 'placeSelect' && msg.placeCode && onPlaceSelect) {
        onPlaceSelect(msg.placeCode);
      }
    } catch {
      // ignore
    }
  };

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        ref={webviewRef}
        source={{ html }}
        style={styles.webview}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit={false}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        originWhitelist={['*']}
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    width: '100%',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
