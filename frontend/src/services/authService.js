import axios from 'axios';
import api from './api';

// Since we built a real backend, USE_MOCK is false for Auth
const API_URL = 'http://localhost:5000/api/auth';

// Keeps the server's message and, when there is one, its code (e.g. EMAIL_NOT_VERIFIED) and e-mail
const serverError = (error, fallback) => Object.assign(new Error(error.response?.data?.message || fallback), {
  code: error.response?.data?.code, email: error.response?.data?.email,
});

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
    throw serverError(error, 'Invalid credentials');
  }
};

export const loginAdmin = async (email, password) => {
  try {
    const response = await axios.post(`${API_URL}/login`, { email, password, isAdminLogin: true });
    return response.data; // Should return requires2FA flag
  } catch (error) {
    throw serverError(error, 'Invalid admin credentials');
  }
};

// ticket: returned by the login / register / Google step; proves that step was passed
export const verify2FA = async (email, token, isAdminLogin = false, ticket = null) => {
  try {
    const response = await axios.post(`${API_URL}/verify-2fa`, { email, token, isAdminLogin, ticket });
    return response.data; // Returns token and user
  } catch (error) {
    throw serverError(error, 'Invalid 2FA code');
  }
};

// ---- Google sign-in and password reset
const authError = (error, fallback) => new Error(error.response?.data?.message || fallback);
let configPromise = null;
export const fetchAuthConfig = () => {                     // { googleClientId }, asked once per page load
  configPromise = configPromise || axios.get(`${API_URL}/config`).then((r) => r.data).catch(() => { configPromise = null; return { googleClientId: null }; });
  return configPromise;
};
// -> readers: { token, user }; admins: { requires2FA, email, ticket }
export const googleSignIn = async (credential, isAdminLogin = false) => {
  try { return (await axios.post(`${API_URL}/google`, { credential, isAdminLogin })).data; } catch (e) { throw authError(e, 'Google sign-in failed'); }
};
export const requestPasswordReset = async (email) => {
  try { return (await axios.post(`${API_URL}/forgot-password`, { email })).data; } catch (e) { throw authError(e, 'Could not send the reset link'); }
};
export const checkResetToken = async (token) => {
  try { return (await axios.get(`${API_URL}/reset-password`, { params: { token } })).data; } catch { return { valid: false }; }
};
export const resetPassword = async (token, password) => {
  try { return (await axios.post(`${API_URL}/reset-password`, { token, password })).data; } catch (e) { throw authError(e, 'Could not reset the password'); }
};

// ---- e-mail verification (link sent after sign-up)
export const verifyEmail = async (token) => {
  try { return (await axios.post(`${API_URL}/verify-email`, { token })).data; } catch (e) { throw authError(e, 'Could not verify the e-mail'); }
};
export const resendVerification = async (email) => {
  try { return (await axios.post(`${API_URL}/resend-verification`, { email })).data; } catch (e) { throw authError(e, 'Could not send a new link'); }
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
