import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Signup from './pages/Signup';
import CreateDelivery from './pages/CreateDelivery';
import NotFound from './pages/NotFound';
import Navbar from './components/Layout/Navbar';
import DriverTruckEntry from './pages/DriverTruckEntry';
import DriverDashboard from './pages/DriverDashboard';

function App() {
  return (
    <UserProvider>
      <Router>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/create" element={<CreateDelivery />} />
            <Route path="/driver/truck-entry" element={<DriverTruckEntry />} />
            <Route path="/driver/dashboard/:truckId" element={<DriverDashboard />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
      </Router>
    </UserProvider>
  );
}

export default App;