import { useEffect } from 'react';
import { useMap } from 'react-map-gl/maplibre';

/**
 * Fits the map to the given [lng, lat] positions when they change.
 */
export default function MapFitBounds({ positions }) {
  const { current: map } = useMap();

  useEffect(() => {
    if (!map || !positions?.length) return;
    
    let minLng = 180, maxLng = -180, minLat = 90, maxLat = -90;
    
    positions.forEach(([lng, lat]) => {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });

    if (positions.length === 1 || (minLng === maxLng && minLat === maxLat)) {
      map.flyTo({ center: [minLng, minLat], zoom: 11 });
      return;
    }

    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat]
      ],
      { padding: 48, maxZoom: 12, duration: 1000 }
    );
  }, [map, positions]);

  return null;
}
