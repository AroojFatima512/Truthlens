import axios from 'axios';
import api from './api';

// Since we built a real backend, USE_MOCK is false for Auth
const API_URL = 'http://localhost:5000/api/auth';

export const registerUser = async (userData) => {
  try {
    const response = await axios.post(`${API_URL}/register`, userData);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Registration failed');
  }
};

export const loginUser = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/login`, { email, password, isAdminLogin: false });
    return response.data; // Should return requires2FA flag
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Invalid credentials');
  }
};

export const loginAdmin = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/login`, { email, password, isAdminLogin: true });
    return response.data; // Should return requires2FA flag
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Invalid admin credentials');
  }
};

export const verify2FA = async (email, token, isAdminLogin = false) => {
  try {
    const response = await axios.post(`${API_URL}/verify-2fa`, { email, token, isAdminLogin });
    return response.data; // Returns token and user
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Invalid 2FA code');
  }
};

export const logoutUser = () => {
  return Promise.resolve();
};

// ---- Account (logged in). These use the shared api client, which sends the login token.
const apiError = (error, fallback) => new Error(error.response?.data?.message || fallback);

export const updateProfile = async (name) => {
  try { return (await api.patch('/auth/me', { name })).data; } catch (e) { throw apiError(e, 'Could not update your profile'); }
};
export const changePassword = async (currentPassword, newPassword) => {
  try { return (await api.post('/auth/change-password', { currentPassword, newPassword })).data; } catch (e) { throw apiError(e, 'Could not change your password'); }
};
export const deleteAccount = async (password) => {
  try { return (await api.delete('/auth/me', { data: { password } })).data; } catch (e) { throw apiError(e, 'Could not delete your account'); }
};
