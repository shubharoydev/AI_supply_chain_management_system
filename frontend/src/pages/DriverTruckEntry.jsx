import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useUser } from '../contexts/UserContext';

export default function DriverTruckEntry() {
  const [truckId, setTruckId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { accessToken } = useUser();

  if (!accessToken) {
    navigate('/login');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await axios.post('/api/deliveries/driver/truck', { truckId });
      navigate(`/driver/dashboard/${truckId}`);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to access truck. Make sure it is active.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Driver Portal</h1>
            <p className="text-gray-600">Enter your assigned active Truck ID</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-center font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Truck ID</label>
              <input
                type="text"
                value={truckId}
                onChange={(e) => setTruckId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
                placeholder="e.g. TRK-ABC1234"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium transition-colors shadow-sm"
            >
              {loading ? 'Accessing...' : 'Enter Dashboard'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
