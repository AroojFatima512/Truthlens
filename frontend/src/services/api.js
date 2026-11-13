// Shared axios instance: base URL from .env (VITE_API_URL) and the login token on every request.
import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('truthlens_token');      // AuthContext saves it after 2FA
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A logged-in request answered 401 = the login token expired or is no longer valid. SessionWatcher
// (components/common/SessionWatcher.jsx) logs the user out cleanly and sends them to the login page.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && error.config?.headers?.Authorization) {
      window.dispatchEvent(new CustomEvent('truthlens:session-expired'));
    }
    // no answer at all: the backend is down or restarting (ConnectionBanner shows it and waits)
    if (!error.response && error.code !== 'ERR_CANCELED') {
      window.dispatchEvent(new CustomEvent('truthlens:server-unreachable'));
    }
    return Promise.reject(error);
  },
);

export default api;
