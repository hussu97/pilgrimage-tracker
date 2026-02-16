import type { Place } from '@/lib/types';

interface MapMarker {
  lat: number;
  lng: number;
  name: string;
  placeCode: string;
  address: string;
}

export function buildMapHtml(places: Place[], centerLat: number, centerLng: number): string {
  const markers: MapMarker[] = places.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    name: p.name,
    placeCode: p.place_code,
    address: p.address || p.place_type || '',
  }));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true }).setView([${centerLat}, ${centerLng}], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(map);

    var blueIcon = L.divIcon({
      className: '',
      html: '<div style="background:#007AFF;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -36]
    });

    var markers = ${JSON.stringify(markers)};

    markers.forEach(function(m) {
      var marker = L.marker([m.lat, m.lng], { icon: blueIcon }).addTo(map);
      marker.bindPopup('<strong>' + m.name + '</strong><br/><small>' + m.address + '</small>');
      marker.on('click', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ placeCode: m.placeCode }));
        }
      });
    });

    L.circleMarker([${centerLat}, ${centerLng}], {
      radius: 8,
      fillColor: '#007AFF',
      color: '#fff',
      weight: 3,
      opacity: 1,
      fillOpacity: 1
    }).addTo(map).bindPopup('Your location');

    function postBounds() {
      if (!window.ReactNativeWebView) return;
      var b = map.getBounds();
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'boundsChanged',
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest()
      }));
    }
    map.on('moveend', postBounds);
    map.whenReady(function() { setTimeout(postBounds, 300); });
  </script>
</body>
</html>`;
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
