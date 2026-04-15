import { useState } from 'react';
import axios from 'axios';
import { Truck, Clock, AlertTriangle, CheckCircle, Play } from 'lucide-react';

const API = import.meta.env.VITE_BACKEND_URL;

const statusLabel = (s) => {
  switch (s) {
    case 'pending':
      return 'Pending';
    case 'in-transit':
      return 'In transit';
    case 'at-risk':
      return 'At risk';
    case 'delayed':
      return 'Delayed';
    case 'delivered':
      return 'Delivered';
    default:
      return s || 'Unknown';
  }
};

const statusBadgeClass = (s) => {
  if (s === 'delivered') return 'bg-green-100 text-green-800';
  if (s === 'delayed' || s === 'at-risk') return 'bg-red-100 text-red-800';
  if (s === 'pending') return 'bg-gray-100 text-gray-700';
  return 'bg-blue-100 text-blue-800';
};

export default function DeliveryList({ shipments = [], onSelect, onRefresh }) {
  const [starting, setStarting] = useState({});

  const handleStart = async (e, id) => {
    e?.stopPropagation();
    setStarting((s) => ({ ...s, [id]: true }));
    try {
      await axios.post(`${API}/api/deliveries/${id}/start`);
      await onRefresh?.();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to start delivery');
    } finally {
      setStarting((s) => ({ ...s, [id]: false }));
    }
  };

  if (!shipments?.length) {
    return (
      <div className="text-center py-12 text-gray-500" role="status">
        No shipments found. Create your first delivery above.
      </div>
    );
  }

  const getStatusIcon = (shipment) => {
    if (shipment.status === 'delivered') {
      return <CheckCircle className="text-green-500" size={20} aria-hidden />;
    }
    if (shipment.status === 'delayed' || shipment.status === 'at-risk') {
      return <AlertTriangle className="text-red-500" size={20} aria-hidden />;
    }
    if ((shipment.riskScore || 0) > 70) {
      return <AlertTriangle className="text-amber-500" size={20} aria-hidden />;
    }
    if (shipment.status === 'pending') {
      return <Truck className="text-gray-400" size={20} aria-hidden />;
    }
    return <Clock className="text-blue-500" size={20} aria-hidden />;
  };

  const getRiskColor = (risk) => {
    if (risk > 70) return 'text-red-600 bg-red-50';
    if (risk > 40) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  return (
    <ul className="space-y-4" aria-label="Shipments list">
      {shipments.map((shipment) => (
        <li
          key={shipment._id || shipment.truckId}
          className="list-none"
        >
          <div
            onClick={() => onSelect?.(shipment)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect?.(shipment);
              }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Shipment ${shipment.truckId}, status ${statusLabel(shipment.status)}`}
            className="p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer bg-white flex items-start gap-4"
          >
            <div className="mt-1">{getStatusIcon(shipment)}</div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-medium text-gray-900 truncate">
                  {shipment.truckId || 'Unnamed Truck'}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(
                      shipment.status
                    )}`}
                  >
                    {statusLabel(shipment.status)}
                  </span>
                  <span
                    className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskColor(
                      shipment.riskScore || 0
                    )}`}
                  >
                    Risk {shipment.riskScore ?? 0}%
                  </span>
                </div>
              </div>

              <p className="text-sm text-gray-600 mt-1 truncate">
                {shipment.origin} → {shipment.destinations?.join(' → ') || 'Unknown'}
              </p>

              {shipment.cargoType && shipment.cargoType !== 'general' && (
                <p className="text-xs mt-1">
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-violet-100 text-violet-800 font-medium capitalize">
                    {shipment.cargoType === 'pharma' ? 'Pharma / cold' : 'Essential cargo'}
                  </span>
                </p>
              )}

              {(shipment.delayPrediction?.minutes != null ||
                shipment.delayPrediction?.probability != null) && (
                <p className="text-xs text-amber-800 mt-2">
                  AI: delay ~{Number(shipment.delayPrediction.minutes ?? 0).toFixed(1)} min
                  {shipment.delayPrediction.probability != null && (
                    <span className="ml-2">
                      (p={Number(shipment.delayPrediction.probability).toFixed(2)})
                    </span>
                  )}
                </p>
              )}

              {shipment.delayPrediction?.riskBreakdown && (
                <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
                  <span className="font-medium text-gray-700">Risk impact breakdown: </span>
                  traffic {shipment.delayPrediction.riskBreakdown.trafficPct}% · weather{' '}
                  {shipment.delayPrediction.riskBreakdown.weatherPct}% · ops / history{' '}
                  {shipment.delayPrediction.riskBreakdown.operationsPct}%
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                {shipment.ETA && (
                  <span>ETA: {new Date(shipment.ETA).toLocaleString()}</span>
                )}
                {shipment.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleStart(e, shipment._id)}
                      disabled={starting[shipment._id]}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                      aria-label={`Start live tracking for ${shipment.truckId}`}
                    >
                      <Play size={14} aria-hidden />
                      {starting[shipment._id] ? 'Starting…' : 'Start tracking'}
                    </button>
                  </div>
                )}
                {(shipment.status === 'in-transit' || shipment.status === 'at-risk' || shipment.status === 'delayed') && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await axios.post(`${API}/api/deliveries/${shipment._id}/stop`);
                          onRefresh?.();
                        } catch (err) {
                           console.error('Failed to stop simulation:', err);
                        }
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-gray-600 text-white hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-1"
                    >
                      Stop simulation
                    </button>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm('Delete this shipment?')) {
                        try {
                          await axios.delete(`${API}/api/deliveries/${shipment._id}`);
                          onRefresh?.();
                        } catch (err) {
                          console.error('Failed to delete shipment:', err);
                        }
                      }
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
