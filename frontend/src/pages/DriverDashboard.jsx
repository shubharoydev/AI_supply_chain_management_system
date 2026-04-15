import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useUser } from '../contexts/UserContext';
import useSocket from '../hooks/useSocket';
import LiveMap from '../components/map/LiveMap';
import LoadingSpinner from '../components/common/LoadingSpinner';

const API = import.meta.env.VITE_BACKEND_URL;

export default function DriverDashboard() {
  const { truckId } = useParams();
  const navigate = useNavigate();
  const { accessToken } = useUser();
  const socket = useSocket();

  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [locationWords, setLocationWords] = useState('Resolving location...');
  const [alertToast, setAlertToast] = useState(null);

  useEffect(() => {
    if (!accessToken) {
      navigate('/login');
    }
  }, [accessToken, navigate]);

  const fetchShipment = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axios.post(`${API}/api/deliveries/driver/truck`, { truckId });
      setShipment(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load dashboard. Ensure truck is active.');
    } finally {
      setLoading(false);
    }
  }, [truckId]);

  useEffect(() => {
    fetchShipment();
    // Poll every 30s as backup
    const interval = setInterval(fetchShipment, 30000);
    return () => clearInterval(interval);
  }, [fetchShipment]);

  // Translate coordinates to words using Nominatim (heavily throttled + cached)
  useEffect(() => {
    if (!shipment?.currentLocation?.lat || !shipment?.currentLocation?.lng) return;
    
    const resolveLocation = async () => {
        try {
            const { lat, lng } = shipment.currentLocation;
            const key = `${lat.toFixed(3)},${lng.toFixed(3)}`; // ~110m buckets
            const cacheKey = `revgeo:${key}`;
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
              setLocationWords(cached);
              return;
            }

            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
            const res = await fetch(url);
            const data = await res.json();
            const words = data.display_name?.split(',')?.slice(0, 3)?.join(', ') || '—';
            setLocationWords(words);
            try {
              sessionStorage.setItem(cacheKey, words);
            } catch {
              // ignore storage quota errors
            }
        } catch (e) {
            console.error('Reverse geocode failed', e);
        }
    };

    const timer = setTimeout(resolveLocation, 30000); // 30s debounce to prevent API spam
    return () => clearTimeout(timer);
  }, [shipment?.currentLocation?.lat, shipment?.currentLocation?.lng]);

  useEffect(() => {
    if (!socket || !shipment?._id) return;

    const onLocation = (data) => {
      if (String(data.deliveryId) === String(shipment._id)) {
        setShipment(prev => ({
          ...prev,
          currentLocation: data.currentLocation,
          routeProgressIndex: data.routeProgressIndex,
          ETA: data.ETA,
          delayPrediction: data.delayPrediction,
          status: data.status,
          riskScore: data.riskScore ?? prev.riskScore,
          rerouteRoute: data.rerouteRoute ?? prev.rerouteRoute,
          rerouteSwitchIndex: Number.isFinite(data.rerouteSwitchIndex) ? data.rerouteSwitchIndex : prev.rerouteSwitchIndex,
          originalRoute: data.originalRoute ?? prev.originalRoute,
        }));
      }
    };

    const onRouteUpdated = (data) => {
      if (String(data.deliveryId) === String(shipment._id)) {
        setShipment(prev => ({
          ...prev,
          optimizedRoute: data.optimizedRoute ?? prev.optimizedRoute,
          rerouteRoute: data.rerouteRoute ?? prev.rerouteRoute,
          rerouteSwitchIndex: Number.isFinite(data.rerouteSwitchIndex) ? data.rerouteSwitchIndex : prev.rerouteSwitchIndex,
          originalRoute: data.originalRoute ?? prev.originalRoute,
          currentLocation:
            prev.currentLocation ||
            (data.optimizedRoute ? data.optimizedRoute?.[prev.routeProgressIndex ?? 0] : undefined) ||
            data.optimizedRoute?.[0],
          routeProgressIndex: Math.max(
            0,
            Math.min(prev.routeProgressIndex ?? 0, ((data.optimizedRoute ?? prev.optimizedRoute)?.length || 1) - 1)
          ),
        }));

        if (data.reRouted) {
          // Play a native browser beep sound
          try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gainNode = ctx.createGain();
            osc.connect(gainNode);
            gainNode.connect(ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.5);
          } catch (e) {
            console.error('Audio failed', e);
          }
          
          setAlertToast(data.alert || "Heavy traffic detected. Map Rerouting.");
          setTimeout(() => setAlertToast(null), 8000);
        }
      }
    };

    socket.on('location-update', onLocation);
    socket.on('route-updated', onRouteUpdated);

    return () => {
      socket.off('location-update', onLocation);
      socket.off('route-updated', onRouteUpdated);
    };
  }, [socket, shipment?._id]);

  if (loading && !shipment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !shipment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-xl shadow text-center max-w-md">
           <h2 className="text-xl text-red-600 font-bold mb-4">Access Issue</h2>
           <p className="text-gray-700 mb-6">{error || 'Truck not found'}</p>
           <button onClick={() => navigate('/driver/truck-entry')} className="bg-indigo-600 text-white px-4 py-2 rounded">Go Back</button>
        </div>
      </div>
    );
  }

  const { delayPrediction } = shipment;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pt-10 relative">
      
      {/* REROUTE ALERT TOAST */}
      {alertToast && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3 border-2 border-red-400">
            <span className="text-2xl animate-pulse">🚨</span>
            <div className="font-bold">
              <p className="text-xl">{alertToast}</p>
              <p className="text-sm font-medium opacity-90 tracking-wider uppercase mt-1">Please follow the new highlighted route</p>
            </div>
          </div>
        </div>
      )}
      <main className="max-w-4xl mx-auto px-4 w-full flex-grow pb-12">
        <div className="mb-6 flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Driving: {shipment.truckId}</h1>
              <p className="mt-1 text-gray-600 text-lg">Destination: {shipment.destinations[0]}</p>
            </div>
            <button onClick={() => navigate('/driver/truck-entry')} className="text-sm underline text-red-600">Switch Truck</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase">Weather</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{delayPrediction?.weatherDesc || 'Clear'}</p>
            <p className="text-md text-gray-500">{delayPrediction?.weatherTemp ? `${delayPrediction.weatherTemp}°C` : '--'}</p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase">Traffic</p>
            <p className="text-xl font-bold text-amber-700 mt-1">{delayPrediction?.trafficDesc || 'Free Flow'}</p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase">Risk Status</p>
            <p className={`text-xl font-bold mt-1 ${(shipment.riskScore || 0) > 70 ? 'text-red-600' : 'text-green-600'}`}>
                {(shipment.riskScore || 0) > 70 ? 'High Risk' : 'Normal'}
            </p>
          </div>
          <div className="bg-white rounded-xl border shadow-sm p-4 text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase">Status</p>
            <p className="text-xl font-bold text-blue-600 mt-1 capitalize">{shipment.status}</p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 shadow-sm">
            <p className="text-sm font-semibold text-blue-800 uppercase mb-2">My Live Location (Updates every 2 min)</p>
            <p className="text-lg font-medium text-blue-900">{locationWords}</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-5 mb-6 shadow-sm">
            <div className="mb-4">
               <span className="font-bold text-red-800 uppercase tracking-widest text-sm">Emergency Helplines</span>
            </div>
            <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 bg-white p-3 rounded-lg border border-red-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-800">Police</span>
                    <span className="font-mono text-red-600 font-bold text-xl">100</span>
                </div>
                <div className="flex-1 bg-white p-3 rounded-lg border border-red-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-800">Ambulance</span>
                    <span className="font-mono text-red-600 font-bold text-xl">108</span>
                </div>
                <div className="flex-1 bg-white p-3 rounded-lg border border-red-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-800">Highway Assist</span>
                    <span className="font-mono text-red-600 font-bold text-xl">1033</span>
                </div>
            </div>
            {delayPrediction?.weatherDesc === 'Thunderstorm' || delayPrediction?.weatherDesc === 'Extreme' ? (
                <div className="mt-4 p-3 bg-red-100 text-red-900 rounded-lg text-sm font-bold">
                    ⚠️ SEVERE WEATHER WARNING IN YOUR AREA. Drive carefully or halt if visibility is compromised.
                </div>
            ) : null}
        </div>

        <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
            <div className="px-6 py-5 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Map View</h2>
            </div>
            <div className="h-[400px]">
               <LiveMap shipments={[shipment]} />
            </div>
        </div>
      </main>
    </div>
  );
}
