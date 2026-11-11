import React, { createContext, useState, useContext, useEffect } from 'react';
import { loginUser, loginAdmin, registerUser, verify2FA, logoutUser } from '../services/authService';
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
  const login = async (email, password, isAdmin = false) => {
    try {
      if (isAdmin) {
        return await loginAdmin(email, password);
      } else {
        return await loginUser(email, password);
      }
    } catch (error) {
      throw error;
    }
  };

  // Step 2: Verify 2FA (isAdmin = true when it comes from the Admin Login page)
  const verifyLogin2FA = async (email, token, isAdmin = false) => {
    try {
      const response = await verify2FA(email, token, isAdmin);
      setUser(response.user);
      localStorage.setItem('truthlens_user', JSON.stringify(response.user));
      localStorage.setItem('truthlens_token', response.token);
      toast.success('Login successful!');
      return response.user;
    } catch (error) {
      throw error;
    }
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
  const confirmRegistration2FA = async (email, token) => {
    try {
      const response = await verify2FA(email, token);
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

  const logout = () => {
    setUser(null);
    localStorage.removeItem('truthlens_user');
    localStorage.removeItem('truthlens_token');
    logoutUser();
    toast.success('Logged out successfully');
  };

  const value = {
    user,
    loading,
    login,
    verifyLogin2FA,
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
