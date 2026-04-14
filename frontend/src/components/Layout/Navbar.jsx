import { Link } from 'react-router-dom';
import { LogOut, Truck } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';

export default function Navbar() {
  const { user, logout, accessToken } = useUser();

  return (
    <nav className="bg-indigo-700 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          
          <div className="flex items-center space-x-3">
            <Truck size={28} />
            <Link to="/" className="font-bold text-xl tracking-tight">
              Smart Supply Chain
            </Link>
          </div>

          <div className="flex items-center space-x-6">
            {accessToken ? (
              <>
                <Link to="/dashboard" className="hover:text-indigo-200 transition">
                  Dashboard
                </Link>
                <Link to="/create" className="hover:text-indigo-200 transition">
                  New Shipment
                </Link>
                <button
                  onClick={logout}
                  className="flex items-center space-x-1 hover:text-red-200 transition"
                >
                  <LogOut size={18} />
                  <span>Logout</span>
                </button>
              </>
            ) : (
              <Link to="/login" className="hover:text-indigo-200 transition">
                Login
              </Link>
            )}
          </div>

        </div>
      </div>
    </nav>
  );
}