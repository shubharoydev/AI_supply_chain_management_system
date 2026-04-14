import { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken'));
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken'));
  const [loading, setLoading] = useState(true);

  // Set default headers synchronously during render so children effects see them immediately
  if (accessToken) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }

  // Setup axios interceptor for token refresh
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        if (accessToken) {
          config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config;

        // Only retry if it's a 401, not a refresh token request, and we have a valid refresh token
        if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/api/auth/refresh') && refreshToken && refreshToken !== 'null' && refreshToken !== 'undefined') {
          originalRequest._retry = true;

          try {
            const response = await axios.post('/api/auth/refresh', {
              refreshToken: refreshToken
            });

            const { accessToken: newAccessToken } = response.data;
            
            setAccessToken(newAccessToken);
            localStorage.setItem('accessToken', newAccessToken);

            // Retry the original request with new token
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return axios(originalRequest);
          } catch (refreshError) {
            // Refresh failed, logout user
            logout();
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [accessToken, refreshToken]);

  useEffect(() => {
    if (accessToken) {
      // Fetch user profile
      axios.get('/api/auth/me')
        .then(res => setUser(res.data))
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [accessToken]);

  const login = (newAccessToken, newRefreshToken, userData) => {
    setAccessToken(newAccessToken);
    setRefreshToken(newRefreshToken);
    setUser(userData);
    localStorage.setItem('accessToken', newAccessToken);
    localStorage.setItem('refreshToken', newRefreshToken);
  };

  const logout = () => {
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    
    // Call logout endpoint to invalidate refresh token
    if (refreshToken) {
      axios.post('/api/auth/logout', { refreshToken }).catch(() => {});
    }
  };

  return (
    <UserContext.Provider value={{ user, accessToken, login, logout, loading }}>
      {!loading ? children : (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      )}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);