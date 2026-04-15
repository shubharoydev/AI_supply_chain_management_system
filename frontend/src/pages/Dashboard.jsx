import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import LiveMap from '../components/map/LiveMap';
import DeliveryList from '../components/delivery/DeliveryList';
import CreateShipmentForm from '../components/delivery/CreateShipmentForm';
import AIAdvisor from '../components/dashboard/AIAdvisor';
import { useUser } from '../contexts/UserContext';
import Navbar from '../components/Layout/Navbar';
import LoadingSpinner from '../components/common/LoadingSpinner';
import useSocket from '../hooks/useSocket';

const API = import.meta.env.VITE_BACKEND_URL;

export default function Dashboard() {
  const { accessToken } = useUser();
  const socket = useSocket();

  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveBanner, setLiveBanner] = useState(null);
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [routePreference, setRoutePreference] = useState('balanced');
  const [operationsLog, setOperationsLog] = useState([]);
  const simTimersRef = useRef({});

  const pushOpLog = useCallback((entry) => {
    setOperationsLog((prev) =>
      [{ ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }, ...prev].slice(0, 35)
    );
  }, []);

  const fetchShipments = useCallback(async (isInitial = true) => {
    try {
      if (isInitial) setLoading(true);
      setError(null);
      const res = await axios.get(`${API}/api/deliveries`);
      const incoming = Array.isArray(res.data) ? res.data : [];
      setShipments((prev) => {
        const prevById = new Map(prev.map((s) => [String(s._id), s]));
        return incoming.map((next) => {
          const id = String(next?._id);
          const cur = prevById.get(id);
          if (!cur) return next;

          // Preserve socket/reroute updates that aren't persisted in DB yet.
          const curRerouteAt = cur.lastReroutedAt ? new Date(cur.lastReroutedAt).getTime() : 0;
          const nextRerouteAt = next.lastReroutedAt ? new Date(next.lastReroutedAt).getTime() : 0;
          const keepCurRoute = Boolean(
            Array.isArray(cur.optimizedRoute) && 
            cur.optimizedRoute.length > 1 && 
            curRerouteAt >= nextRerouteAt
          );

          return {
            ...next,
            optimizedRoute: keepCurRoute ? cur.optimizedRoute : next.optimizedRoute,
            originalRoute: keepCurRoute ? cur.originalRoute : next.originalRoute,
            lastReroutedAt: keepCurRoute ? cur.lastReroutedAt : next.lastReroutedAt,
            // Preserve live movement fields (socket/sim) over slower polling.
            currentLocation: cur.currentLocation || next.currentLocation,
            routeProgressIndex: keepCurRoute ? (Number.isFinite(cur.routeProgressIndex) ? cur.routeProgressIndex : next.routeProgressIndex) : next.routeProgressIndex,
            riskScore: Number.isFinite(cur.riskScore) ? cur.riskScore : next.riskScore,
            delayPrediction: {
              ...(next.delayPrediction || {}),
              ...(cur.delayPrediction || {}),
            },
            ETA: cur.ETA || next.ETA,
            __sim: cur.__sim,
          };
        });
      });
    } catch (err) {
      console.error('Failed to load shipments:', err);
      setError('Could not load active shipments. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShipments(true);
  }, [accessToken, fetchShipments]);

  const hasActiveSimulation = useMemo(
    () =>
      shipments.some((s) =>
        ['in-transit', 'at-risk', 'delayed'].includes(s.status)
      ),
    [shipments]
  );

  useEffect(() => {
    const pollMs = hasActiveSimulation ? 8000 : 30000;
    const interval = setInterval(() => fetchShipments(false), pollMs);
    return () => clearInterval(interval);
  }, [fetchShipments, hasActiveSimulation]);

  useEffect(() => {
    // On unmount, clear all timers.
    return () => {
      for (const timer of Object.values(simTimersRef.current)) {
        window.clearInterval(timer);
      }
      simTimersRef.current = {};
    };
  }, []);

  // Frontend-only movement simulation for demo reliability:
  // When a shipment is "active", animate its marker along optimizedRoute and mark delivered at the end.
  // Backend/socket updates (if present) can still overwrite these fields; we keep it lightweight and self-cleaning.
  useEffect(() => {
    const isActive = (s) => ['in-transit', 'at-risk', 'delayed'].includes(s.status);

    // Start simulators for active shipments with a route.
    for (const s of shipments) {
      const id = s?._id;
      const route = s?.optimizedRoute;
      if (!id || !isActive(s) || !Array.isArray(route) || route.length < 2) continue;
      if (simTimersRef.current[id]) continue;

      // Initialize progress state if missing.
      setShipments((prev) =>
        prev.map((x) => {
          if (String(x._id) !== String(id)) return x;
          const safeRoute = Array.isArray(x.optimizedRoute) ? x.optimizedRoute : [];
          const start = x.currentLocation || safeRoute[0];
          if (!start?.lat || !start?.lng) return x;
          return {
            ...x,
            currentLocation: start,
            routeProgressIndex: Number.isFinite(x.routeProgressIndex) ? x.routeProgressIndex : 0,
            __sim: {
              seg: 0,
              t0: Date.now(),
            },
          };
        })
      );

      const tickMs = 250;
      const speedMps = 18; // ~65 km/h (demo-friendly)
      simTimersRef.current[id] = window.setInterval(() => {
        setShipments((prev) =>
          prev.map((x) => {
            if (String(x._id) !== String(id)) return x;
            if (!isActive(x)) return x;

            const r = Array.isArray(x.optimizedRoute) ? x.optimizedRoute : [];
            if (r.length < 2) return x;

            let idx = Number.isFinite(x.routeProgressIndex) ? x.routeProgressIndex : 0;
            idx = Math.max(0, Math.min(idx, r.length - 1));

            const a = r[idx];
            const b = r[Math.min(idx + 1, r.length - 1)];
            if (!a || !b || typeof a.lat !== 'number' || typeof a.lng !== 'number') return x;

            const toRad = (d) => (d * Math.PI) / 180;
            const R = 6371000;
            const dLat = toRad(b.lat - a.lat);
            const dLng = toRad(b.lng - a.lng);
            const φ1 = toRad(a.lat);
            const φ2 = toRad(b.lat);
            const h =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(φ1) * Math.cos(φ2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
            const segMeters = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));

            const sim = x.__sim || { seg: 0 };
            const segProgress = Number.isFinite(sim.seg) ? sim.seg : 0;
            const advance = (speedMps * tickMs) / 1000;
            const nextSegProgress = segMeters > 1 ? segProgress + advance / segMeters : 1;

            // Move to next segment(s) if needed.
            if (nextSegProgress >= 1) {
              const nextIdx = idx + 1;
              if (nextIdx >= r.length - 1) {
                const last = r[r.length - 1];
                return {
                  ...x,
                  currentLocation: { lat: last.lat, lng: last.lng },
                  routeProgressIndex: r.length - 1,
                  status: 'delivered',
                  __sim: undefined,
                };
              }
              const newA = r[nextIdx];
              return {
                ...x,
                currentLocation: { lat: newA.lat, lng: newA.lng },
                routeProgressIndex: nextIdx,
                __sim: { ...(x.__sim || {}), seg: 0 },
              };
            }

            const t = Math.max(0, Math.min(1, nextSegProgress));
            const lat = a.lat + (b.lat - a.lat) * t;
            const lng = a.lng + (b.lng - a.lng) * t;
            return {
              ...x,
              currentLocation: { lat, lng },
              routeProgressIndex: idx,
              __sim: { ...(x.__sim || {}), seg: t },
            };
          })
        );
      }, tickMs);
    }

    // Stop/cleanup simulators for shipments no longer active.
    for (const [id, timer] of Object.entries(simTimersRef.current)) {
      const stillActive = shipments.some(
        (s) => String(s?._id) === String(id) && isActive(s) && Array.isArray(s.optimizedRoute) && s.optimizedRoute.length >= 2
      );
      if (!stillActive) {
        window.clearInterval(timer);
        delete simTimersRef.current[id];
      }
    }
  }, [shipments]);

  const kpi = useMemo(() => {
    const active = shipments.filter((s) =>
      ['in-transit', 'at-risk', 'delayed'].includes(s.status)
    );
    const delayed = shipments.filter((s) => s.status === 'delayed' || s.status === 'at-risk');
    const delivered = shipments.filter((s) => s.status === 'delivered').length;
    let costInr = 0;
    for (const s of active) {
      const min = Number(s.delayPrediction?.minutes) || 0;
      const value = s.cargoValue || 50000;
      const delayedHourCost = value * 0.001; // 0.1% of item's value per hour delayed
      costInr += (min / 60) * delayedHourCost * ((s.riskScore || 0) / 100 + 0.35);
    }
    const denom = shipments.length || 1;
    const completionShare = Math.round((delivered / denom) * 100);
    return {
      active: active.length,
      delayedShipments: delayed.length,
      costInr: Math.round(costInr),
      completionOrOntimePct: Math.max(0, Math.min(100, completionShare)),
    };
  }, [shipments]);

  const routeDemo = useMemo(() => {
    const mult =
      routePreference === 'cheapest' ? { cost: 0.82, time: 1.18 } : routePreference === 'fastest' ? { cost: 1.22, time: 0.78 } : { cost: 1, time: 1 };
    const baseCost = 11000;
    const baseHrs = 18;
    return [
      { label: 'Option A (system pick)', cost: Math.round(baseCost * mult.cost), hrs: Math.round(baseHrs * mult.time * 10) / 10 },
      { label: 'Option B (alternate)', cost: Math.round(baseCost * 0.92 * mult.cost), hrs: Math.round(baseHrs * 1.08 * mult.time * 10) / 10 },
    ];
  }, [routePreference]);

  useEffect(() => {
    if (!socket) return undefined;

    const onLocation = (data) => {
      const id = data.deliveryId;
      if (!id) return;
      setShipments((prev) =>
        prev.map((s) =>
          String(s._id) === String(id)
            ? {
              ...s,
              currentLocation: data.currentLocation,
              routeProgressIndex: data.routeProgressIndex,
              ETA: data.ETA,
              delayPrediction: data.delayPrediction,
              riskScore: data.riskScore,
              status: data.status,
              optimizedRoute: data.optimizedRoute ?? s.optimizedRoute,
              rerouteRoute: data.rerouteRoute ?? s.rerouteRoute,
              rerouteSwitchIndex: Number.isFinite(data.rerouteSwitchIndex)
                ? data.rerouteSwitchIndex
                : s.rerouteSwitchIndex,
              originalRoute: data.originalRoute ?? s.originalRoute,
              __sim: undefined,
            }
            : s
        )
      );
    };

    const onRouteUpdated = (data) => {
      const id = data.deliveryId;
      if (!id) return;

      // Show re-route notification
      if (data.reRouted) {
        setLiveBanner({
          level: 'info',
          message: `🔄 Route re-optimized for ${data.truckId} - avoiding: ${data.obstacles?.join(', ') || 'traffic'}`,
          truckId: data.truckId,
          at: Date.now(),
        });
        const estSaved = 8000 + Math.round(Math.random() * 12000);
        pushOpLog({
          type: 'auto',
          title: 'Autonomous logistics',
          text: `${data.truckId} auto-rerouted to reduce congestion exposure. Est. delay cost avoided ~₹${estSaved.toLocaleString('en-IN')} (demo).`,
        });
      }

      setShipments((prev) =>
        prev.map((s) =>
          String(s._id) === String(id)
            ? {
              ...s,
              optimizedRoute: data.optimizedRoute ?? s.optimizedRoute,
              rerouteRoute: data.rerouteRoute ?? s.rerouteRoute,
              rerouteSwitchIndex: Number.isFinite(data.rerouteSwitchIndex)
                ? data.rerouteSwitchIndex
                : s.rerouteSwitchIndex,
              originalRoute: data.originalRoute || s.originalRoute,
              // Ensure the marker stays "on" the active route for demo purposes.
              currentLocation:
                s.currentLocation ||
                (data.optimizedRoute ? data.optimizedRoute?.[data.applied ? 0 : (s.routeProgressIndex ?? 0)] : undefined) ||
                data.optimizedRoute?.[0],
              routeProgressIndex: data.applied ? 0 : Math.max(
                0,
                Math.min(s.routeProgressIndex ?? 0, ((data.optimizedRoute ?? s.optimizedRoute)?.length || 1) - 1)
              ),
              __sim: s.__sim ? { ...s.__sim, seg: 0 } : s.__sim,
              lastReroutedAt: data.applied ? data.timestamp : s.lastReroutedAt,
            }
            : s
        )
      );
    };

    const onDelayAlert = (payload) => {
      setLiveBanner({
        level: 'risk',
        message: payload?.message || 'Risk threshold exceeded',
        truckId: payload?.truckId,
        at: Date.now(),
      });
      pushOpLog({
        type: 'alert',
        title: 'Risk alert',
        text: payload?.message || 'Threshold exceeded — auto re-route triggered when not in cooldown.',
      });
    };

    const onDeliveryStarted = () => {
      fetchShipments(false);
    };

    const onDeliveryCompleted = (data) => {
      const id = data.deliveryId;
      if (!id) return;
      setShipments((prev) =>
        prev.map((s) =>
          String(s._id) === String(id) ? { ...s, status: 'delivered' } : s
        )
      );
    };

    const onCascade = (data) => {
      setLiveBanner({
        level: 'info',
        message: `Cascade mitigation: ${data?.adjustedDeliveries ?? 0} corridor load(s) adjusted`,
        at: Date.now(),
      });
    };

    const onAdvisory = (data) => {
      setLiveBanner({
        level: 'info',
        message: `🤖 AI Advisor for ${data.truckId}: ${data.message}`,
        at: Date.now(),
      });
      pushOpLog({
        type: 'ai',
        title: 'Gemini advisory',
        text: typeof data.message === 'string' ? data.message.slice(0, 280) + (data.message.length > 280 ? '…' : '') : 'Insight received.',
      });
    };

    socket.on('location-update', onLocation);
    socket.on('route-updated', onRouteUpdated);
    socket.on('delay-alert', onDelayAlert);
    socket.on('delivery-started', onDeliveryStarted);
    socket.on('delivery-completed', onDeliveryCompleted);
    socket.on('cascade-mitigation', onCascade);
    socket.on('ai-advisory', onAdvisory);

    return () => {
      socket.off('location-update', onLocation);
      socket.off('route-updated', onRouteUpdated);
      socket.off('delay-alert', onDelayAlert);
      socket.off('delivery-started', onDeliveryStarted);
      socket.off('delivery-completed', onDeliveryCompleted);
      socket.off('cascade-mitigation', onCascade);
      socket.off('ai-advisory', onAdvisory);
    };
  }, [socket, fetchShipments, pushOpLog]);

  const handleNewShipment = (newShipment) => {
    setShipments((prev) => {
      const exists = prev.some((s) => String(s._id) === String(newShipment._id));
      if (exists) {
        return prev.map((s) =>
          String(s._id) === String(newShipment._id) ? { ...s, ...newShipment } : s
        );
      }
      return [newShipment, ...prev];
    });
  };

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h2 className="text-3xl font-bold text-gray-800 mb-6">Authentication Required</h2>
          <p className="text-gray-600 mb-8">
            Please sign in to access the Smart Supply Chain Dashboard
          </p>
          <a
            href="/login"
            className="inline-block px-8 py-4 bg-indigo-600 text-white rounded-xl text-lg font-medium hover:bg-indigo-700 shadow-lg transition"
          >
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Smart Supply Chain Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Monitor live shipments, AI risk, and route re-optimization in real time
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Trucks active</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{kpi.active}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Delayed / at-risk</p>
            <p className="text-2xl font-bold text-amber-700 mt-1">{kpi.delayedShipments}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Est. cost impact</p>
            <p className="text-2xl font-bold text-indigo-700 mt-1">₹{kpi.costInr.toLocaleString('en-IN')}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">From delay exposure (demo formula)</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Delivered share</p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">{kpi.completionOrOntimePct}%</p>
            <p className="text-[11px] text-gray-400 mt-0.5">Delivered ÷ all shipments</p>
          </div>
        </div>

        {liveBanner && (
          <div
            className={`mb-6 p-4 rounded-lg border flex justify-between items-start gap-4 ${liveBanner.level === 'risk'
                ? 'bg-red-50 border-red-200 text-red-900'
                : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            role="status"
            aria-live="polite"
          >
            <div>
              <p className="font-semibold">
                {liveBanner.level === 'risk' ? 'Risk alert' : 'System notice'}
              </p>
              <p className="text-sm mt-1">{liveBanner.message}</p>
              {liveBanner.truckId && (
                <p className="text-xs mt-1 font-mono text-gray-600">{liveBanner.truckId}</p>
              )}
            </div>
            <button
              type="button"
              className="text-sm underline shrink-0"
              onClick={() => setLiveBanner(null)}
            >
              Dismiss
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <div className="mb-8">
          <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
            <div className="px-6 py-5 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Strategic AI Logistics Advisor</h2>
            </div>
            <div className="p-6">
              <AIAdvisor />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
              <div className="px-6 py-5 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Create New Shipment</h2>
              </div>
              <div className="p-6">
                <CreateShipmentForm onSuccess={handleNewShipment} />
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
              <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">Live Shipments Map</h2>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${socket ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                    }`}
                >
                  {socket ? 'Socket connected' : 'Connecting…'}
                </span>
              </div>
              <div className="h-[500px]">
                {loading ? (
                  <div className="h-full flex items-center justify-center">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : (
                  <LiveMap shipments={shipments} />
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden border border-gray-100">
              <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">Active Shipments</h2>
                <span className="text-sm text-gray-500">{shipments.length} total</span>
              </div>
              <div className="p-6">
                {loading ? (
                  <div className="flex justify-center py-12">
                    <LoadingSpinner />
                  </div>
                ) : (
                  <DeliveryList
                    shipments={shipments}
                    onRefresh={() => fetchShipments(false)}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
