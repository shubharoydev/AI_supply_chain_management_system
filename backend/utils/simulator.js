// Very basic fake movement simulator — in prod you'd use real GPS or mock data stream
export const simulateMovement = (delivery, speedKmH = 60) => {
  let index = 0;
  const route = delivery.optimizedRoute;

  const interval = setInterval(() => {
    if (index >= route.length - 1) {
      clearInterval(interval);
      return;
    }

    const current = route[index];
    const next = route[index + 1];

    // Very naive linear interpolation
    delivery.currentLocation = {
      lat: current.lat + (next.lat - current.lat) * 0.1,
      lng: current.lng + (next.lng - current.lng) * 0.1
    };

    index += 0.1; // progress
  }, 2000); // fake 2-second "tick"

  return () => clearInterval(interval); // stop function
};