// Calculate route coordinates & ETA
export const getRouteAndEta = async (pickup, dropoff) => {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${dropoff.lng},${dropoff.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url);
    const json = await response.json();

    if (!json.routes || json.routes.length === 0) {
      throw new Error('No route found');
    }

    const route = json.routes[0];
    const distanceKm = route.distance / 1000;
    const etaMinutes = Math.round(route.duration / 60);
    const polyline = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));

    return {
      distanceKm,
      etaMinutes,
      polyline,
    };
  } catch (error) {
    console.error('ETA Calculation Error:', error);
    // Haversine fallback calculation
    const distanceKm = calculateHaversineDistance(pickup, dropoff);
    const etaMinutes = Math.round(distanceKm * 4); // ~4 minutes per km estimate
    return { distanceKm, etaMinutes, polyline: [] };
  }
};

// Pricing algorithm (PHP)
export const estimateDeliveryFee = (distanceKm) => {
  const baseFee = 40; 
  const perKmRate = 12; 
  const computedFee = baseFee + Math.max(0, distanceKm - 1) * perKmRate;
  return Math.round(computedFee);
};

function calculateHaversineDistance(coords1, coords2) {
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371; // Earth radius in KM

  const dLat = toRad(coords2.lat - coords1.lat);
  const dLon = toRad(coords2.lng - coords1.lng);
  const lat1 = toRad(coords1.lat);
  const lat2 = toRad(coords2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}