import type { Place } from '@/lib/types';

interface MapMarker {
  lat: number;
  lng: number;
  name: string;
  placeCode: string;
  address: string;
  openStatus: string;
}

const OPEN_STATUS_COLORS: Record<string, string> = {
  open: 'rgba(22, 163, 74, 0.85)',
  closed: 'rgba(220, 38, 38, 0.85)',
  unknown: 'rgba(148, 163, 184, 0.85)',
};

export function buildMapHtml(places: Place[], centerLat: number, centerLng: number): string {
  const markers: MapMarker[] = places.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    name: p.name,
    placeCode: p.place_code,
    address: p.address || p.place_type || '',
    openStatus:
      p.open_status ??
      (p.is_open_now === true ? 'open' : p.is_open_now === false ? 'closed' : 'unknown'),
  }));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; }
    .place-cluster-icon {
      background: rgba(22,163,74,0.9);
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      border: 3px solid #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    }
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

    var openStatusColors = ${JSON.stringify(OPEN_STATUS_COLORS)};

    function createIcon(openStatus) {
      var color = openStatusColors[openStatus] || openStatusColors['unknown'];
      return L.divIcon({
        className: '',
        html: '<div style="background:' + color + ';width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div>',
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -36]
      });
    }

    var clusterGroup = L.markerClusterGroup({
      maxClusterRadius: 60,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      iconCreateFunction: function(cluster) {
        var count = cluster.getChildCount();
        var size = count < 10 ? 36 : count < 100 ? 44 : 52;
        return L.divIcon({
          className: 'place-cluster-icon',
          html: '<div style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:rgba(22,163,74,0.9);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:' + (count < 100 ? 13 : 11) + 'px;border:3px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.2);">' + count + '</div>',
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2]
        });
      }
    });

    var markers = ${JSON.stringify(markers)};

    markers.forEach(function(m) {
      var marker = L.marker([m.lat, m.lng], { icon: createIcon(m.openStatus) });
      marker.bindPopup('<strong>' + m.name + '</strong><br/><small>' + m.address + '</small>');
      marker.on('click', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ placeCode: m.placeCode }));
        }
      });
      clusterGroup.addLayer(marker);
    });

    map.addLayer(clusterGroup);

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
