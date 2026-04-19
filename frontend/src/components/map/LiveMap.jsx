import { Fragment, useMemo, useState } from 'react';
import Map, { Source, Layer, Marker, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import MapFitBounds from './MapFitBounds';

/** Bearing from point a → b (degrees, 0 = north) */
function bearingDeg(a, b) {
  if (!a || !b || a.lat == null || b.lat == null) return 0;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

function getTruckColors(riskScore, status) {
  let stroke = '#2563eb';
  let fill = '#1d4ed8';
  if (status === 'delayed' || status === 'at-risk') {
    stroke = '#dc2626';
    fill = '#b91c1c';
  } else if ((riskScore || 0) >= 70) {
    stroke = '#ea580c';
    fill = '#c2410c';
  } else if ((riskScore || 0) >= 40) {
    stroke = '#ca8a04';
    fill = '#a16207';
  } else if (status === 'delivered') {
    stroke = '#16a34a';
    fill = '#15803d';
  }
  return { stroke, fill };
}

function routeToMapLibre(optimizedRoute) {
  if (!Array.isArray(optimizedRoute) || !optimizedRoute.length) return [];
  return optimizedRoute
    .filter((p) => p && typeof p.lat === 'number' && typeof p.lng === 'number')
    .map((p) => [p.lng, p.lat]); // Maplibre uses [lng, lat] format
}

function polylineColor(s) {
  // If truck adopted a re-route, persistently show its active route in purple so it doesn't look like it reverted!
  if (s.originalRoute && s.originalRoute.length > 1) return '#9333ea';
  
  if (s.status === 'delayed' || s.status === 'at-risk') return '#dc2626';
  if ((s.riskScore || 0) >= 70) return '#f97316';
  if ((s.riskScore || 0) >= 40) return '#eab308';
  if (s.status === 'delivered') return '#22c55e';
  return '#2563eb';
}

export default function LiveMap({ shipments = [] }) {
  const [popupInfo, setPopupInfo] = useState(null);

  // Only re-fit bounds when shipment IDs or their route lengths change, NOT on every movement update.
  const allBoundsPositions = useMemo(() => {
    const pts = [];
    for (const s of shipments) {
      const line = routeToMapLibre(s.optimizedRoute);
      line.forEach((p) => pts.push(p));
      // Use endpoints if no route yet
      if (!line.length) {
        pts.push([88.363, 22.567]); // fallback [lng, lat]
      }
    }
    return pts.length ? pts : [[88.363, 22.567]];
  }, [shipments.length]);

  const hasShipments = shipments.length > 0;

  return (
    <div
      className="map-wrapper relative h-full w-full min-h-[420px] rounded-xl overflow-hidden border border-gray-100"
      role="application"
      aria-label="Live shipments map"
    >
      {!hasShipments && (
        <div
          className="absolute inset-0 z-[500] flex items-center justify-center bg-white/80 pointer-events-none"
          role="status"
        >
          <p className="text-gray-600 text-sm font-medium px-4 text-center">
            No shipments yet. Create one and start live tracking to see movement here.
          </p>
        </div>
      )}
      <Map
        initialViewState={{
          longitude: 88.363,
          latitude: 22.567,
          zoom: 13,
          pitch: 45 // 3D Perspective!
        }}
        mapStyle={`https://api.maptiler.com/maps/dataviz/style.json?key=${import.meta.env.VITE_MAPTILER_KEY}`}
      >
        <MapFitBounds positions={allBoundsPositions} />

        {shipments.map((s) => {
          const path = routeToMapLibre(s.optimizedRoute);
          const reroutePath = routeToMapLibre(s.rerouteRoute);
          const originalPath = routeToMapLibre(s.originalRoute);
          
          const route = s.optimizedRoute || [];
          const idx = s.routeProgressIndex ?? 0;
          const raw = s.currentLocation || route[0];
          if (raw?.lat == null || raw?.lng == null) return null;

          const nextPt = route[idx + 1];
          const prevPt = route[Math.max(0, idx - 1)];
          const heading = nextPt ? bearingDeg(raw, nextPt) : prevPt ? bearingDeg(prevPt, raw) : 0;
          const color = polylineColor(s);
          const truckColor = getTruckColors(s.riskScore, s.status);
          const shipmentId = String(s._id || s.truckId);

          // GeoJSON geometries for React Map GL LineString layers
          const lineGeoJson = {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: path }
          };
          const rerouteGeoJson = {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: reroutePath }
          };
          const originalGeoJson = {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: originalPath }
          };

          return (
            <Fragment key={shipmentId}>
              {/* Candidate reroute (purple) */}
              {reroutePath.length > 1 && (
                <Source id={`reroute-${shipmentId}`} type="geojson" data={rerouteGeoJson}>
                  <Layer
                    id={`layer-reroute-${shipmentId}`}
                    type="line"
                    paint={{
                      'line-color': '#a855f7',
                      'line-width': 6,
                      'line-opacity': 0.5,
                      'line-dasharray': [2, 2]
                    }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  />
                </Source>
              )}

              {/* Previous route (grey dashed) - only show if reroute not yet applied */}
              {originalPath.length > 1 && !s.rerouteIsApplied && (
                <Source id={`orig-${shipmentId}`} type="geojson" data={originalGeoJson}>
                  <Layer
                    id={`layer-orig-${shipmentId}`}
                    type="line"
                    paint={{
                      'line-color': '#9ca3af',
                      'line-width': 5,
                      'line-opacity': 0.6,
                      'line-dasharray': [2, 2]
                    }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  />
                </Source>
              )}

              {/* Main path */}
              {path.length > 1 && (
                <Source id={`path-${shipmentId}`} type="geojson" data={lineGeoJson}>
                  <Layer
                    id={`layer-path-${shipmentId}`}
                    type="line"
                    paint={{
                      'line-color': color,
                      'line-width': 6,
                      'line-opacity': 0.9,
                    }}
                    layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  />
                </Source>
              )}

              <Marker
                longitude={raw.lng}
                latitude={raw.lat}
                anchor="center"
                rotation={heading}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setPopupInfo(s);
                }}
              >
                <div style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.35))', cursor: 'pointer' }}>
                  <svg width="44" height="44" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <rect x="6" y="22" width="30" height="14" rx="3" fill={truckColor.fill} stroke={truckColor.stroke} strokeWidth="2"/>
                    <rect x="28" y="14" width="12" height="12" rx="2" fill="#e5e7eb" stroke={truckColor.stroke} strokeWidth="2"/>
                    <rect x="10" y="26" width="8" height="6" rx="1" fill="#93c5fd" opacity=".9"/>
                    <circle cx="14" cy="38" r="4" fill="#111827"/>
                    <circle cx="28" cy="38" r="4" fill="#111827"/>
                    <polygon points="24,4 28,14 20,14" fill={truckColor.stroke}/>
                  </svg>
                </div>
              </Marker>
            </Fragment>
          );
        })}

        {popupInfo && (
          <Popup
            longitude={popupInfo.currentLocation?.lng || popupInfo.optimizedRoute?.[0]?.lng}
            latitude={popupInfo.currentLocation?.lat || popupInfo.optimizedRoute?.[0]?.lat}
            anchor="bottom"
            onClose={() => setPopupInfo(null)}
            closeOnClick={false}
            offset={26}
          >
            <div className="font-sans text-sm min-w-[200px]" style={{ color: "black" }}>
              <p className="font-bold text-gray-900">{popupInfo.truckId}</p>
              <p className="mt-1">
                Status:{' '}
                <span className="font-semibold capitalize">{popupInfo.status || '—'}</span>
              </p>
              <p className="mt-1">Risk: {popupInfo.riskScore ?? 0}%</p>
              {popupInfo.delayPrediction?.minutes != null && (
                <p className="mt-1 text-amber-800">
                  Pred. delay: ~{Number(popupInfo.delayPrediction.minutes).toFixed(1)} min
                </p>
              )}
              {popupInfo.ETA && (
                <p className="mt-1 text-gray-600">
                  ETA: {new Date(popupInfo.ETA).toLocaleString()}
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                {popupInfo.origin} → {popupInfo.destinations?.join(' → ')}
              </p>
            </div>
          </Popup>
        )}
      </Map>
    </div>
  );
}
