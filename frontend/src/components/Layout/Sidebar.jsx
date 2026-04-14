import { Link } from 'react-router-dom';
import { Home, PlusCircle, MapPin, AlertTriangle } from 'lucide-react';

export default function Sidebar() {
  return (
    <aside className="w-64 bg-gray-800 text-white h-screen fixed left-0 top-0 pt-20">
      <nav className="mt-6 px-4">
        <ul className="space-y-2">
          <li>
            <Link to="/dashboard" className="flex items-center px-4 py-3 rounded-lg hover:bg-gray-700">
              <Home className="mr-3" size={20} />
              Dashboard
            </Link>
          </li>
          <li>
            <Link to="/create" className="flex items-center px-4 py-3 rounded-lg hover:bg-gray-700">
              <PlusCircle className="mr-3" size={20} />
              Create Shipment
            </Link>
          </li>
          <li>
            <Link to="/map" className="flex items-center px-4 py-3 rounded-lg hover:bg-gray-700">
              <MapPin className="mr-3" size={20} />
              Live Map View
            </Link>
          </li>
          <li>
            <Link to="/alerts" className="flex items-center px-4 py-3 rounded-lg hover:bg-gray-700">
              <AlertTriangle className="mr-3" size={20} />
              Risk Alerts
            </Link>
          </li>
        </ul>
      </nav>
    </aside>
  );
}