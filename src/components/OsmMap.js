import React, { useEffect, useRef, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

export default function OsmMap({
  center = { lat: 10.3157, lng: 123.8854 },
  zoom = 14,
  markers = [],
  route = [], // 🌟 NEW: Array of coordinates for the route line
  style,
  onRegionChange,
}) {
  const webViewRef = useRef(null);
  const isLoadedRef = useRef(false);

  const safeMarkers = (markers || []).filter(
    (m) => m && typeof m.lat === 'number' && typeof m.lng === 'number'
  );

  const initialCenterRef = useRef({
    lat: center?.lat ?? 10.3157,
    lng: center?.lng ?? 123.8854,
  });
  const initialZoomRef = useRef(zoom);
  const initialMarkersRef = useRef(safeMarkers);

  const initialHtml = useMemo(() => {
    const c = initialCenterRef.current;
    const z = initialZoomRef.current;
    const m = initialMarkersRef.current;
    return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
        <style>
          * { -webkit-tap-highlight-color: transparent; }
          body, html, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: #f3f4f6; }
          .leaflet-control-attribution { display: none !important; }
          .leaflet-div-icon { background: transparent !important; border: none !important; }
          .pin-label {
            background: #111827; color: #FFFFFF; font-size: 11px; font-weight: 700;
            padding: 2px 6px; border-radius: 4px; white-space: nowrap;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2); margin-bottom: 2px;
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map', {
            zoomControl: false, dragging: true, tap: true, touchZoom: true, inertia: true
          }).setView([${c.lat}, ${c.lng}], ${z});

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

          var activeMarkers = {};
          var activeRouteLayer = null;

          function getPinSvg(hexColor) {
            return '<svg width="30" height="38" viewBox="0 0 24 32"><path d="M12 0C5.37 0 0 5.37 0 12C0 21 12 32 12 32C12 32 24 21 24 12C24 5.37 18.63 0 12 0Z" fill="' + hexColor + '"/><circle cx="12" cy="11" r="5" fill="#FFFFFF"/></svg>';
          }

          function updateMarkers(markerList) {
            for (var id in activeMarkers) { map.removeLayer(activeMarkers[id]); }
            activeMarkers = {};
            var boundsPoints = [];

            markerList.forEach(function(m, idx) {
              if (!m || typeof m.lat !== 'number' || typeof m.lng !== 'number') return;
              var pinColor = m.color || '#EF4444'; 
              var labelLower = (m.label || '').toLowerCase();
              if (!m.color) {
                if (labelLower.includes('you') || labelLower.includes('driver')) pinColor = '#2563EB';
                else if (labelLower.includes('pickup')) pinColor = '#059669';
              }

              var svgContent = getPinSvg(pinColor);
              var icon = L.divIcon({
                className: 'custom-pin-icon',
                html: '<div style="display:flex; flex-direction:column; align-items:center;"><div class="pin-label">' + (m.label || 'Location') + '</div>' + svgContent + '</div>',
                iconSize: [80, 60], iconAnchor: [40, 60]
              });

              var marker = L.marker([m.lat, m.lng], { icon: icon }).addTo(map);
              activeMarkers[idx] = marker;
              boundsPoints.push([m.lat, m.lng]);
            });

            // Auto-pan only if there's no active route
            if (!activeRouteLayer) {
               setTimeout(function() {
                 if (boundsPoints.length > 1) {
                   map.fitBounds(L.latLngBounds(boundsPoints), { padding: [50, 50] });
                 } else if (boundsPoints.length === 1) {
                   map.panTo(boundsPoints[0]);
                 }
               }, 100);
            }
          }

          // 🌟 NEW: Draw the route polyline
          function updateRoute(routeCoords) {
            if (activeRouteLayer) {
              map.removeLayer(activeRouteLayer);
              activeRouteLayer = null;
            }
            if (routeCoords && routeCoords.length > 1) {
              activeRouteLayer = L.polyline(routeCoords, {
                color: '#3B82F6', weight: 5, opacity: 0.8, lineJoin: 'round'
              }).addTo(map);
              map.fitBounds(activeRouteLayer.getBounds(), { padding: [50, 50] });
            }
          }

          updateMarkers(${JSON.stringify(m)});

          var regionTimeout;
          function reportCenter() {
            clearTimeout(regionTimeout);
            regionTimeout = setTimeout(function() {
              var c = map.getCenter();
              if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'centerChanged', lat: c.lat, lng: c.lng }));
              }
            }, 100);
          }
          map.on('move', reportCenter);
          map.on('moveend', reportCenter);

          if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
          }
        </script>
      </body>
    </html>
  `;
  }, []);

  useEffect(() => {
    if (isLoadedRef.current && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (typeof updateMarkers === 'function') { updateMarkers(${JSON.stringify(safeMarkers)}); } true;
      `);
    }
  }, [JSON.stringify(safeMarkers)]);

  // 🌟 NEW: Trigger route update
  useEffect(() => {
    if (isLoadedRef.current && webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (typeof updateRoute === 'function') { updateRoute(${JSON.stringify(route)}); } true;
      `);
    }
  }, [JSON.stringify(route)]);

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === 'centerChanged' && typeof onRegionChange === 'function') {
        onRegionChange({ lat: data.lat, lng: data.lng });
      }
    } catch (e) {}
  };

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: initialHtml }}
        style={styles.webview}
        scrollEnabled={false}
        nestedScrollEnabled={true}
        onLoadEnd={() => { isLoadedRef.current = true; }}
        onMessage={handleMessage}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#059669" />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden', backgroundColor: '#E5E7EB' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  loadingContainer: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
});