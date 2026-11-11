// Shared axios instance: base URL from .env (VITE_API_URL) and the login token on every request.
import axios from 'axios';

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('truthlens_token');      // AuthContext saves it after 2FA
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
