import React, { createContext, useState, useContext, useEffect } from 'react';
import { loginUser, loginAdmin, registerUser, verify2FA, logoutUser, googleSignIn } from '../services/authService';
import toast from 'react-hot-toast';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('truthlens_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  // Step 1: Login
  // Returns { requires2FA, email, ticket }, or { token, user } for an account without an authenticator
  // app (made with Google, password added later): then the session starts straight away.
  const login = async (email, password, isAdmin = false) => {
    const response = isAdmin ? await loginAdmin(email, password) : await loginUser(email, password);
    if (response?.token) { startSession(response); toast.success('Login successful!'); }
    return response;
  };

  const startSession = (response) => {
    setUser(response.user);
    localStorage.setItem('truthlens_user', JSON.stringify(response.user));
    localStorage.setItem('truthlens_token', response.token);
  };

  // Step 2: Verify 2FA (isAdmin = true when it comes from the Admin Login page; ticket from step 1)
  const verifyLogin2FA = async (email, token, isAdmin = false, ticket = null) => {
    const response = await verify2FA(email, token, isAdmin, ticket);
    startSession(response);
    toast.success('Login successful!');
    return response.user;
  };

  // "Continue with Google": readers are signed in at once; admins get { requires2FA, email, ticket }
  const loginWithGoogle = async (credential, isAdmin = false) => {
    const response = await googleSignIn(credential, isAdmin);
    if (response.token) {
      startSession(response);
      toast.success(response.created ? `Welcome to TruthLens, ${response.user.name}!` : 'Login successful!');
    }
    return response;
  };

  const register = async (userData) => {
    try {
      const response = await registerUser(userData);
      // We don't set user yet, registration returns QR code for 2FA setup
      return response;
    } catch (error) {
      throw error;
    }
  };

  // Step 2 of registration (verify the first code to confirm 2FA setup)
  const confirmRegistration2FA = async (email, token, ticket = null) => {
    try {
      const response = await verify2FA(email, token, false, ticket);
      setUser(response.user);
      localStorage.setItem('truthlens_user', JSON.stringify(response.user));
      localStorage.setItem('truthlens_token', response.token);
      toast.success('Registration and 2FA setup complete!');
      return response.user;
    } catch (error) {
      throw error;
    }
  };

  // After the profile changes (e.g. new name), keep the stored copy in step
  const updateUser = (profile) => {
    setUser(profile);
    localStorage.setItem('truthlens_user', JSON.stringify(profile));
  };

  // message: shown instead of "Logged out successfully" (e.g. after inactivity); null = no message
  const logout = (message = 'Logged out successfully') => {
    setUser(null);
    localStorage.removeItem('truthlens_user');
    localStorage.removeItem('truthlens_token');
    localStorage.removeItem('truthlens_last_active');
    logoutUser();
    if (message) toast.success(message, { id: 'logout' });
  };

  const value = {
    user,
    loading,
    login,
    verifyLogin2FA,
    loginWithGoogle,
    register,
    confirmRegistration2FA,
    updateUser,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
