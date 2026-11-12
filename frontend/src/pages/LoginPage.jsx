import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { ShieldCheck, Mail, Lock, Key, ArrowLeft, LogIn, Eye, EyeOff, Layers, FileText, BarChart2, Image as ImageIcon, BrainCircuit, Search, Shield, User } from 'lucide-react';
import toast from 'react-hot-toast';
import GoogleButton from '../components/auth/GoogleButton';
import VerifyEmailNotice from '../components/auth/VerifyEmailNotice';
import EmailHint from '../components/auth/EmailHint';
import { emailProblem } from '../utils/validation';
import { motion } from 'framer-motion';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  const [step, setStep] = useState(1);
  const [twoFACode, setTwoFACode] = useState('');
  const [ticket, setTicket] = useState(null);   // proof that step 1 passed, sent with the 2FA code
  const [unverified, setUnverified] = useState(null);   // e-mail that still has to be verified
  const [emailTouched, setEmailTouched] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const { login, verifyLogin2FA, loginWithGoogle } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setEmailTouched(true);
    if (emailProblem(email)) return;
    setLoading(true);
    setUnverified(null);

    try {
      const res = await login(email, password, false);
      if (res.requires2FA) {
        setTicket(res.ticket);
        setStep(2);
        toast.success('Credentials valid! Enter 2FA code.');
      } else {
        const redirectPath = settings.defaultLandingPage === 'Dashboard' ? '/dashboard' : 
                             settings.defaultLandingPage === 'Trending Topics' ? '/dashboard?tab=Trending Topics' : 
                             '/feed';
        navigate(redirectPath);
      }
    } catch (err) {
      if (err.code === 'EMAIL_NOT_VERIFIED') setUnverified(err.email || email);
      else toast.error(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();
    if (twoFACode.length !== 6) {
      toast.error('Code must be 6 digits');
      return;
    }

    setLoading(true);
    try {
      await verifyLogin2FA(email, twoFACode, false, ticket);
      
      const redirectPath = settings.defaultLandingPage === 'Dashboard' ? '/dashboard' : 
                           settings.defaultLandingPage === 'Trending Topics' ? '/dashboard?tab=Trending Topics' : 
                           '/feed';
      navigate(redirectPath);
    } catch (err) {
      toast.error(err.message || 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const landingPath = () => (settings.defaultLandingPage === 'Dashboard' ? '/dashboard'
    : settings.defaultLandingPage === 'Trending Topics' ? '/dashboard?tab=Trending Topics' : '/feed');

  const handleGoogle = async (credential) => {
    setLoading(true);
    try {
      const res = await loginWithGoogle(credential, false);
      if (res.token) navigate(landingPath());
    } catch (err) {
      toast.error(err.message || 'Google sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col lg:flex-row bg-white dark:bg-[#060a14] relative transition-colors duration-500 overflow-hidden">
      
      {/* Back to Home Button */}
      <Link to="/" className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors z-30 font-medium">
        <ArrowLeft size={20} />
        <span className="hidden sm:inline">Back to Home</span>
      </Link>

      {/* Left Side - Branding & Graphic */}
      <div className="w-full lg:w-1/2 relative bg-[#0b1120] flex flex-col items-center justify-center p-4 lg:p-8 overflow-hidden border-r border-gray-800/60 h-[40%] lg:h-full z-10">
          
          {/* Network constellation background (Subtle dots) */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0b1120] to-[#0b1120] pointer-events-none"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full max-w-[320px] max-h-[320px] bg-blue-600/10 blur-[80px] rounded-full pointer-events-none"></div>
          
          <div className="relative z-10 w-full flex flex-col items-center text-center mt-2">
            <div className="flex items-center gap-2 mb-6">
              <ShieldCheck className="text-blue-500" size={28} />
              <span className="text-xl font-bold tracking-tight text-white">Truth<span className="text-blue-500">Lens</span></span>
            </div>
            
            <h2 className="text-[18px] lg:text-[22px] font-bold text-white mb-1 leading-tight tracking-tight">
              AI is analyzing the news for you
            </h2>
            <p className="hidden sm:block text-gray-400 text-[13px] lg:text-[14px] max-w-[280px] mx-auto leading-relaxed">
              Uncover hidden bias. See the full picture.
            </p>
          </div>

          {/* High-quality 3D Floating Illustration */}
          <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.5, type: "spring", bounce: 0.3 }} 
              className="hidden sm:flex relative z-10 flex-col items-center justify-center mt-auto w-[90%] max-w-[240px] lg:max-w-[280px] aspect-square"
          >
            <motion.div
              animate={{ y: [-8, 8, -8] }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
              className="relative w-full h-full flex items-center justify-center drop-shadow-[0_0_40px_rgba(59,130,246,0.3)]"
            >
              {/* Subtle pulsing glow behind the image */}
              <motion.div 
                animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                className="absolute inset-0 bg-blue-500/20 rounded-full blur-[60px] -z-10"
              ></motion.div>
              
              <img 
                src="/login_3d_ai_news.png" 
                alt="AI News Analysis" 
                className="w-full h-full object-contain filter drop-shadow-2xl"
              />
            </motion.div>
          </motion.div>
          
      </div>

      {/* Right Side - Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#0a0a0a] h-[60%] lg:h-full overflow-y-auto hide-scrollbar">
        <motion.div 
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="w-full max-w-[360px] lg:max-w-[380px] my-auto"
        >

          {step === 1 && (
            <>
              <div className="flex flex-col items-center mb-2 lg:mb-4">
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.6, type: "spring", bounce: 0.5 }}
                  className="w-[38px] h-[38px] lg:w-[46px] lg:h-[46px] rounded-full border border-blue-600/80 flex items-center justify-center mb-1.5 lg:mb-2 text-blue-500 bg-transparent shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                >
                  <User size={20} className="lg:w-5 lg:h-5" strokeWidth={1.5} />
                </motion.div>
                <h2 className="text-[20px] lg:text-[22px] font-semibold text-white mb-0.5 tracking-tight">Welcome Back!</h2>
                <p className="text-gray-400 text-[12px] lg:text-[13px] text-center max-w-[240px] leading-snug">
                  Login to continue to TruthLens.
                </p>
              </div>

              <form onSubmit={handleLoginSubmit}>
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
                      maxLength={254}
                      autoComplete="email"
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      className="block w-full pl-9 lg:pl-10 pr-3.5 py-1.5 lg:py-2 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-[12px] lg:text-[13px]"
                      placeholder="youremail@example.com"
                    />
                  </div>
                  <EmailHint email={email} touched={emailTouched} onFix={setEmail} />
                </div>

                <div className="mb-1.5 lg:mb-2">
                  <label className="block text-[11px] lg:text-[12px] font-medium text-gray-300 mb-1">Password</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-[15px] w-[15px] lg:h-[16px] lg:w-[16px] text-gray-500" strokeWidth={1.5} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full pl-9 lg:pl-10 pr-10 py-1.5 lg:py-2 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-[12px] lg:text-[13px] tracking-widest font-mono"
                      placeholder="••••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="h-[15px] w-[15px] lg:h-[16px] lg:w-[16px]" strokeWidth={1.5} /> : <Eye className="h-[15px] w-[15px] lg:h-[16px] lg:w-[16px]" strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end mb-3 lg:mb-4">
                  <Link to="/forgot-password" className="text-[11px] lg:text-[12px] text-blue-500 hover:text-blue-400 transition font-medium">Forgot password?</Link>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-1.5 py-2 lg:py-2.5 px-4 border border-transparent rounded-lg lg:rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-[#0a0a0a] font-semibold text-[13px] lg:text-[14px] transition shadow-[0_0_15px_rgba(59,130,246,0.25)] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <LogIn size={16} className="lg:w-4 lg:h-4" strokeWidth={2} />
                  {loading ? 'Logging in...' : 'Log In'}
                </motion.button>
                {unverified && <VerifyEmailNotice email={unverified} compact />}
              </form>

              {/* Social Login Options */}
              <div className="relative my-3 lg:my-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#222]"></div></div>
                <div className="relative flex justify-center text-[9px] lg:text-[11px]">
                  <span className="px-3 bg-[#0a0a0a] text-gray-500 uppercase tracking-widest font-medium">or</span>
                </div>
              </div>
              <GoogleButton onCredential={handleGoogle} disabled={loading} />

              <div className="mt-3 lg:mt-4 text-center text-[12px] lg:text-[13px] text-gray-400">
                Don't have an account?{' '}
                <Link to="/register" className="font-semibold text-blue-500 hover:text-blue-400 transition">Sign up</Link>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="text-center">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring", bounce: 0.5 }} className="mx-auto w-[55px] h-[55px] rounded-full border border-blue-600/80 flex items-center justify-center mb-4 text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                <Key className="w-6 h-6" strokeWidth={1.5} />
              </motion.div>
              <h2 className="text-[22px] lg:text-[26px] font-semibold text-white mb-2 tracking-tight">Two-Factor Auth</h2>
              <p className="text-[13px] lg:text-[14px] text-gray-400 mb-6 max-w-[240px] mx-auto">
                Enter the 6-digit code from your authenticator app.
              </p>

              <form onSubmit={handle2FASubmit} className="space-y-4 lg:space-y-6">
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
                  <input
                    type="text"
                    maxLength="6"
                    required
                    value={twoFACode}
                    onChange={(e) => setTwoFACode(e.target.value.replace(/\D/g, ''))}
                    className="block w-full px-4 py-3 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition font-mono tracking-[0.4em] text-center text-sm lg:text-base"
                    placeholder="000000"
                    autoFocus
                  />
                </motion.div>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center py-2.5 lg:py-3 px-4 border border-transparent rounded-lg lg:rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-[#0a0a0a] font-semibold text-[13px] lg:text-[14px] transition shadow-[0_0_15px_rgba(59,130,246,0.25)]"
                >
                  {loading ? 'Verifying...' : 'Verify Login'}
                </motion.button>
                <button 
                  type="button" 
                  onClick={() => setStep(1)}
                  className="text-[11px] lg:text-[12px] text-gray-400 hover:text-white transition w-full mt-3"
                >
                  &larr; Back to Email/Password
                </button>
              </form>
            </div>
          )}

          {step === 1 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.5 }} className="mt-4 lg:mt-6 text-center border-t border-[#222] pt-3">
              <Link to="/admin/login" className="flex items-center justify-center gap-1.5 text-[11px] lg:text-[12px] text-gray-500 hover:text-white transition">
                <Shield size={12} /> Admin? Login here
              </Link>
            </motion.div>
          )}

        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;
