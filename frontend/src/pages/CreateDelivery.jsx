import Navbar from '../components/Layout/Navbar';
import CreateShipmentForm from '../components/delivery/CreateShipmentForm';
import { useNavigate } from 'react-router-dom';

export default function CreateDelivery() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Create New Delivery</h1>
          <p className="mt-2 text-gray-600">
            Fill in the details below to plan and start tracking your shipment.
          </p>
        </div>

        <CreateShipmentForm
          onSuccess={() => {
            // Optional: show toast or navigate back
            navigate('/dashboard');
          }}
        />
      </main>
    </div>
  );
}