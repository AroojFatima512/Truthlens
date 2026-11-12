import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, Key, Eye, EyeOff, ShieldCheck, User, LogIn, Shield, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import GoogleButton from '../components/auth/GoogleButton';
import { motion } from 'framer-motion';

const AdminLoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1); // 1 = Login, 2 = 2FA
  const [ticket, setTicket] = useState(null);   // proof that step 1 (password or Google) passed
  const { login, verifyLogin2FA, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (step === 1) {
        // Step 1: Validate credentials
        const res = await login(email, password, true);
        if (res && res.requires2FA) {
           setTicket(res.ticket);
           setStep(2);
           toast.success('Credentials verified. Please enter 2FA code.');
        } else {
           navigate('/admin/dashboard');
        }
      } else {
        // Step 2: Validate 2FA immediately
        await verifyLogin2FA(email, twoFACode, true, ticket);
        navigate('/admin/dashboard');
      }
    } catch (err) {
      toast.error(err.message || 'Invalid admin credentials. Access denied.');
    } finally {
      setLoading(false);
    }
  };

  // Google proves who the admin is; the authenticator code is still asked afterwards
  const handleGoogle = async (credential) => {
    setLoading(true);
    try {
      const res = await loginWithGoogle(credential, true);
      if (res.requires2FA) {
        setEmail(res.email); setTicket(res.ticket); setStep(2);
        toast.success('Google account verified. Please enter 2FA code.');
      } else if (res.token) navigate('/admin/dashboard');
    } catch (err) {
      toast.error(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col lg:flex-row bg-[#080304] text-white font-sans overflow-hidden">
      
      {/* Back to Home Button */}
      <Link to="/" className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2 text-gray-500 hover:text-white transition-colors z-30 font-medium text-[13px] lg:text-[14px]">
        <ArrowLeft size={16} />
        <span className="hidden sm:inline">Back to Home</span>
      </Link>

      {/* Left Pane - Branding & Graphic */}
      <div className="w-full lg:w-1/2 relative bg-gradient-to-br from-[#3b060d] via-[#1a0507] to-[#0a0203] flex flex-col items-center justify-center p-4 lg:p-8 overflow-hidden border-r border-red-950/30 h-[40%] lg:h-full">
        
        {/* Subtle background overlay (world map / grid replacement) */}
        <div className="absolute inset-0 z-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5 mix-blend-overlay"></div>
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-600/10 via-transparent to-transparent"></div>
        
        {/* Concentric rings / ripple effect with animation */}
        <motion.div 
          animate={{ scale: [1, 1.05, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-[20%] -left-[10%] w-[120%] aspect-square rounded-full border border-red-900/10"
        ></motion.div>
        <motion.div 
          animate={{ scale: [1, 1.08, 1], opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear", delay: 1 }}
          className="absolute -bottom-[15%] -left-[5%] w-[110%] aspect-square rounded-full border border-red-900/10"
        ></motion.div>
        <motion.div 
          animate={{ scale: [1, 1.1, 1], opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 14, repeat: Infinity, ease: "linear", delay: 2 }}
          className="absolute -bottom-[10%] left-0 w-[100%] aspect-square rounded-full border border-red-900/10"
        ></motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="relative z-10 flex flex-col items-center text-center max-w-lg mx-auto w-full h-full justify-center"
        >
          
          <div className="mb-2 flex flex-col items-center">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5, type: "spring" }}
              className="mb-1 lg:mb-2 text-red-500"
            >
               <ShieldCheck size={36} className="lg:w-10 lg:h-10" strokeWidth={1.5} />
            </motion.div>
            <h1 className="text-[20px] lg:text-[28px] font-bold tracking-tight mb-0.5">
              Truth<span className="text-[#D32F2F]">Lens</span>
            </h1>
            <h2 className="text-[18px] lg:text-[22px] font-semibold text-white">Admin Portal</h2>
          </div>
          
          <p className="hidden lg:block text-gray-300/80 text-[13px] lg:text-[14px] mb-6 max-w-[280px] mx-auto leading-relaxed">
            Secure access to manage, monitor and protect the TruthLens platform.
          </p>

          {/* Detailed Laptop Mockup matching reference */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, rotateX: 15 }}
            animate={{ opacity: 1, scale: 1, rotateX: 0 }}
            transition={{ duration: 1, delay: 0.5, type: "spring", bounce: 0.3 }}
            className="hidden sm:block relative w-[90%] max-w-[320px] lg:max-w-[380px] mx-auto perspective-[1000px] group mt-auto"
          >
            
            {/* Screen border/lid */}
            <div className="w-full aspect-[16/10] bg-[#111] rounded-t-lg border-[3px] lg:border-[5px] border-[#222] shadow-2xl relative overflow-hidden flex flex-col transform-gpu transition-transform duration-500">
              
              {/* Webcam dot */}
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-gray-600 rounded-full"></div>
              
              {/* UI representation inside the screen */}
              <div className="flex-1 bg-[#0a0505] flex mt-2 border-t border-gray-800/50">
                 {/* Sidebar */}
                 <div className="w-[18%] border-r border-gray-800/50 p-1 lg:p-1.5 flex flex-col gap-1 lg:gap-1.5 bg-[#0d0707]">
                    <div className="w-3 h-3 lg:w-4 lg:h-4 rounded mx-auto bg-red-600/20 text-red-500 flex items-center justify-center mb-1"><Shield size={6} className="lg:w-2 lg:h-2" /></div>
                    <div className="w-3 h-3 lg:w-4 lg:h-4 rounded mx-auto bg-red-600 flex items-center justify-center"><User size={8} className="lg:w-2.5 lg:h-2.5 text-white"/></div>
                 </div>
                 
                 {/* Main Content Area */}
                 <div className="flex-1 p-1.5 lg:p-2 flex flex-col gap-1.5 lg:gap-2">
                    <div className="text-[7px] lg:text-[8px] font-bold text-gray-300 border-b border-gray-800/50 pb-1">Admin Dashboard</div>
                    
                    {/* Top Stats Cards */}
                    <div className="grid grid-cols-3 gap-1 lg:gap-1.5">
                       <div className="bg-[#120808] border border-red-900/20 rounded p-1 flex flex-col justify-between">
                         <div className="text-[4px] lg:text-[5px] text-gray-400">Total Users</div>
                         <div className="text-[7px] lg:text-[9px] font-bold text-white flex items-center gap-1">2,543</div>
                       </div>
                       <div className="bg-[#120808] border border-red-900/20 rounded p-1 flex flex-col justify-between">
                         <div className="text-[4px] lg:text-[5px] text-gray-400">Articles Scanned</div>
                         <div className="text-[7px] lg:text-[9px] font-bold text-white flex items-center gap-1">15,680</div>
                       </div>
                       <div className="bg-[#120808] border border-red-900/20 rounded p-1 flex flex-col justify-between">
                         <div className="text-[4px] lg:text-[5px] text-gray-400">Bias Detections</div>
                         <div className="text-[7px] lg:text-[9px] font-bold text-white flex items-center gap-1">8,320</div>
                       </div>
                    </div>
                    
                    {/* Bottom Area (Chart & List) */}
                    <div className="flex-1 flex gap-1 lg:gap-1.5">
                       {/* Chart Area */}
                       <div className="flex-[2] bg-[#120808] border border-red-900/20 rounded p-1 relative overflow-hidden flex flex-col">
                          <div className="text-[4px] lg:text-[5px] text-gray-400 mb-0.5">Bias Detection Trend</div>
                          <div className="flex-1 relative w-full h-full">
                            <motion.svg 
                              initial={{ opacity: 0, pathLength: 0 }}
                              animate={{ opacity: 0.9, pathLength: 1 }}
                              transition={{ duration: 2, delay: 1, ease: "easeOut" }}
                              className="absolute inset-0 w-full h-full text-[#D32F2F]" viewBox="0 0 100 40" preserveAspectRatio="none"
                            >
                               <path d="M0,40 L0,30 L10,25 L20,32 L30,15 L40,22 L50,10 L60,18 L70,5 L80,12 L90,2 L100,8 L100,40 Z" fill="url(#chartGrad)" stroke="currentColor" strokeWidth="1" />
                               <defs>
                                 <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                   <stop offset="0%" stopColor="#D32F2F" stopOpacity="0.4" />
                                   <stop offset="100%" stopColor="#D32F2F" stopOpacity="0" />
                                 </linearGradient>
                               </defs>
                            </motion.svg>
                          </div>
                       </div>
                       
                       {/* List Area */}
                       <div className="flex-1 bg-[#120808] border border-red-900/20 rounded p-1 flex flex-col gap-0.5 lg:gap-1">
                          <div className="text-[4px] lg:text-[5px] text-gray-400">Recent Activity</div>
                          <div className="flex items-center gap-1">
                             <div className="w-1 h-1 rounded-full bg-red-500"></div>
                             <div className="text-[3px] lg:text-[4px] text-white">New User</div>
                          </div>
                          <div className="flex items-center gap-1">
                             <div className="w-1 h-1 rounded-full bg-red-500"></div>
                             <div className="text-[3px] lg:text-[4px] text-white">Article Scanned</div>
                          </div>
                       </div>
                    </div>
                 </div>
              </div>
            </div>

            {/* Glowing Shield floating next to laptop */}
            <motion.div 
               animate={{ y: [0, -8, 0] }}
               transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
               className="absolute -right-2 lg:-right-6 top-[30%] lg:top-[40%] w-16 h-20 lg:w-20 lg:h-24 text-red-500 drop-shadow-[0_0_15px_rgba(211,47,47,0.6)] opacity-90 z-20"
            >
               <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full text-red-500/80">
                 <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" className="fill-red-900/20" />
                 <rect x="9" y="11" width="6" height="6" rx="1" strokeWidth="1.5" />
                 <path d="M12 11v-1a2 2 0 1 1 4 0v1" strokeWidth="1.5" />
               </svg>
            </motion.div>

            {/* Laptop Base */}
            <div className="w-[115%] h-2 lg:h-2.5 bg-gradient-to-b from-[#444] to-[#111] rounded-b-lg lg:rounded-b-xl shadow-2xl relative -left-[7.5%] z-20 flex justify-center">
               {/* Trackpad indentation */}
               <div className="w-[20%] h-[1px] lg:h-[1px] bg-gray-500 rounded-b-md mt-[1px]"></div>
            </div>
            {/* Glow under laptop */}
            <div className="absolute -bottom-4 lg:-bottom-6 left-1/2 -translate-x-1/2 w-[80%] h-2 lg:h-3 bg-red-600/20 blur-lg rounded-full"></div>
            
          </motion.div>
        </motion.div>
      </div>

      {/* Right Pane - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#0a0a0a] h-[60%] lg:h-full overflow-hidden hide-scrollbar">
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="w-full max-w-[360px] lg:max-w-[380px] my-auto"
        >
          
          <div className="flex flex-col items-center mb-2 lg:mb-4">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6, type: "spring", bounce: 0.5 }}
              className="w-[38px] h-[38px] lg:w-[46px] lg:h-[46px] rounded-full border border-red-600/80 flex items-center justify-center mb-1.5 lg:mb-2 text-[#D32F2F] bg-transparent shadow-[0_0_15px_rgba(211,47,47,0.2)]"
            >
              <User size={20} className="lg:w-5 lg:h-5" strokeWidth={1.5} />
            </motion.div>
            <h2 className="text-[20px] lg:text-[22px] font-semibold text-white mb-0.5 tracking-tight">Admin Login</h2>
            <p className="text-gray-400 text-[12px] lg:text-[13px] text-center max-w-[240px] leading-snug">
              Welcome back! Please login to your admin account.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            
            {step === 1 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <div className="mb-2 lg:mb-3">
                  <label className="block text-[11px] lg:text-[12px] font-medium text-gray-300 mb-1">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Mail className="h-[15px] w-[15px] lg:h-[16px] lg:w-[16px] text-gray-500" strokeWidth={1.5} />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full pl-9 lg:pl-10 pr-3.5 py-1.5 lg:py-2 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-[#D32F2F] focus:ring-1 focus:ring-[#D32F2F] transition text-[12px] lg:text-[13px]"
                      placeholder="admin@truthlens.com"
                    />
                  </div>
                </div>

                <div className="mb-1.5 lg:mb-2">
                  <label className="block text-[11px] lg:text-[12px] font-medium text-gray-300 mb-1 lg:mb-1.5">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-[15px] w-[15px] lg:h-[16px] lg:w-[16px] text-gray-500" strokeWidth={1.5} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-9 lg:pl-10 pr-10 py-1.5 lg:py-2 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-[#D32F2F] focus:ring-1 focus:ring-[#D32F2F] transition text-[12px] lg:text-[13px] tracking-widest font-mono"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300 focus:outline-none"
                    >
                      <Eye className="h-[15px] w-[15px] lg:h-[16px] lg:w-[16px]" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>

                <div className="flex justify-end mb-2 lg:mb-3">
                  <Link to="/admin/forgot-password" className="text-[11px] lg:text-[12px] text-[#D32F2F] hover:text-red-400 transition font-medium">Forgot Password?</Link>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }} className="mb-5 lg:mb-6">
                <label className="block text-[11px] lg:text-[12px] font-medium text-gray-300 mb-1 lg:mb-1.5">2FA Verification Code</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                    <Key className="h-[15px] w-[15px] lg:h-[16px] lg:w-[16px] text-gray-500" strokeWidth={1.5} />
                  </div>
                  <input
                    type="text"
                    maxLength="6"
                    required
                    autoFocus
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                    className="block w-full pl-9 lg:pl-10 pr-3.5 py-2.5 lg:py-3 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-[#D32F2F] focus:ring-1 focus:ring-[#D32F2F] transition font-mono tracking-[0.4em] text-center text-sm lg:text-base"
                    placeholder="000000"
                  />
                </div>
                <p className="text-[10px] lg:text-[11px] text-gray-600 mt-2 text-center">Enter the 6-digit code from your authenticator app.</p>
              </motion.div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="w-full flex justify-center items-center gap-1.5 py-2 lg:py-2.5 px-4 border border-transparent rounded-lg lg:rounded-xl text-white bg-[#D32F2F] hover:bg-[#B71C1C] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#D32F2F] focus:ring-offset-[#0a0a0a] font-semibold text-[13px] lg:text-[14px] transition shadow-[0_0_15px_rgba(211,47,47,0.25)] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? 'Authenticating...' : (
                <>
                  <LogIn size={16} className="lg:w-4 lg:h-4" strokeWidth={2} /> {step === 1 ? 'Login to Dashboard' : 'Verify & Login'}
                </>
              )}
            </motion.button>
            
            {step === 2 && (
               <button type="button" onClick={() => setStep(1)} className="w-full mt-3 text-[11px] lg:text-[12px] text-gray-400 hover:text-white transition text-center">
                 &larr; Back to Email/Password
               </button>
            )}
          </form>

          {step === 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.5 }}>
              <div className="relative my-3 lg:my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[#222]"></div>
                </div>
                <div className="relative flex justify-center text-[9px] lg:text-[11px]">
                  <span className="px-3 bg-[#0a0a0a] text-gray-500 uppercase tracking-widest font-medium">OR</span>
                </div>
              </div>

              <GoogleButton onCredential={handleGoogle} disabled={loading} />
              <Link to="/login"
                className="mt-2.5 w-full flex justify-center items-center gap-1.5 py-2 lg:py-2.5 px-4 border border-red-900/30 rounded-lg lg:rounded-xl text-white bg-transparent hover:bg-red-900/10 transition font-semibold text-[12px] lg:text-[13px]">
                <User size={16} className="lg:w-4 lg:h-4 text-[#D32F2F]" strokeWidth={2} /> Login as User
              </Link>
            </motion.div>
          )}

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="mt-2 lg:mt-4 text-center flex items-center justify-center gap-1 lg:gap-1.5 text-gray-500 text-[10px] lg:text-[11px]"
          >
            <Lock size={10} className="lg:w-3 lg:h-3" strokeWidth={2} />
            <span>Secure admin access. All activities are monitored.</span>
          </motion.div>
          
        </motion.div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
