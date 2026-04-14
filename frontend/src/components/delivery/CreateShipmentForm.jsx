import { useState } from 'react';
import axios from 'axios';
import { useUser } from '../../contexts/UserContext';

export default function CreateShipmentForm({ onSuccess }) {
  const { accessToken } = useUser();
  const [form, setForm] = useState({
    origin: '',
    destination: '',
    cargoType: 'general',
    cargoValue: 50000,
    truckId: `TRK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  });
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!accessToken) {
      window.alert('Please login to create shipments');
      return;
    }

    setLoading(true);
    setNotice(null);
    try {
      const payload = {
        origin: form.origin,
        destinations: [form.destination],
        truckId: form.truckId,
        cargoType: form.cargoType,
        cargoValue: Number(form.cargoValue),
      };

      const res = await axios.post('/api/deliveries', payload);
      const delivery = res.data.delivery;
      onSuccess(delivery);
      setNotice({
        type: 'success',
        text: 'Route optimized. Use “Start live tracking” on the shipment below.',
      });
      setForm({ ...form, origin: '', destination: '', cargoType: 'general', cargoValue: 50000 });
    } catch (err) {
      setNotice({
        type: 'error',
        text:
          err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to create shipment',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-6 max-w-lg mx-auto p-6 bg-white rounded-xl shadow-lg border border-gray-100"
      aria-label="Create shipment"
    >
      <div className="flex flex-col gap-1 mb-4">
        <h2 className="text-2xl font-extrabold text-gray-800">Dispatch Shipment</h2>
        <p className="text-sm text-gray-500">Create a delivery, then start simulation from the list</p>
      </div>

      {notice && (
        <div
          role="status"
          className={`p-3 rounded-lg text-sm ${
            notice.type === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-green-50 text-green-800 border border-green-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="grid gap-5">
        <div>
          <label htmlFor="origin" className="block text-sm font-semibold text-gray-700 mb-1">
            Origin City/Hub
          </label>
          <input
            id="origin"
            type="text"
            value={form.origin}
            onChange={(e) => setForm({ ...form, origin: e.target.value })}
            className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-medium text-gray-800"
            placeholder="e.g. Siliguri, West Bengal"
            required
            autoComplete="address-level2"
          />
        </div>

        <div>
          <label htmlFor="cargoType" className="block text-sm font-semibold text-gray-700 mb-1">
            Cargo priority
          </label>
          <select
            id="cargoType"
            value={form.cargoType}
            onChange={(e) => setForm({ ...form, cargoType: e.target.value })}
            className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 font-medium text-gray-800"
          >
            <option value="general">General freight</option>
            <option value="essential">Essential / relief</option>
            <option value="pharma">Pharma / cold chain</option>
          </select>
        </div>

        <div>
          <label htmlFor="destination" className="block text-sm font-semibold text-gray-700 mb-1">
            Destination City
          </label>
          <input
            id="destination"
            type="text"
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
            className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-medium text-gray-800"
            placeholder="e.g. Kolkata, West Bengal"
            required
            autoComplete="address-level2"
          />
        </div>

        <div>
          <label htmlFor="cargoValue" className="block text-sm font-semibold text-gray-700 mb-1">
            Cargo Value (₹)
          </label>
          <input
            id="cargoValue"
            type="number"
            min="1000"
            value={form.cargoValue}
            onChange={(e) => setForm({ ...form, cargoValue: e.target.value })}
            className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all font-medium text-gray-800"
            placeholder="e.g. 50000"
            required
          />
        </div>

        <div>
          <label htmlFor="truckId" className="block text-sm font-semibold text-gray-700 mb-1">
            Assigned Truck ID
          </label>
          <input
            id="truckId"
            type="text"
            value={form.truckId}
            readOnly
            aria-readonly="true"
            className="block w-full px-4 py-3 bg-gray-100 border border-gray-200 rounded-lg text-gray-600 font-mono"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 text-center mt-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold tracking-wide transition-colors shadow-md disabled:bg-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        {loading ? 'Processing Dispatch...' : 'Dispatch Truck'}
      </button>
    </form>
  );
}
