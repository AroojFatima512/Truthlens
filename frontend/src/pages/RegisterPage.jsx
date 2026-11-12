import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { ShieldCheck, Mail, Lock, User, Key, ArrowLeft, Eye, EyeOff, UserPlus, BrainCircuit, BarChart, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import GoogleButton from '../components/auth/GoogleButton';
import VerifyEmailNotice from '../components/auth/VerifyEmailNotice';
import PasswordChecklist, { passwordReady } from '../components/auth/PasswordChecklist';
import EmailHint from '../components/auth/EmailHint';
import { nameProblem, emailProblem, isDisposable, normEmail, cleanName } from '../utils/validation';
import { motion } from 'framer-motion';

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [step, setStep] = useState(1);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [twoFACode, setTwoFACode] = useState('');
  const [loading, setLoading] = useState(false);
  const [ticket, setTicket] = useState(null);
  
  const { register, confirmRegistration2FA, loginWithGoogle } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [touched, setTouched] = useState({});
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  const touch = (e) => setTouched((t) => ({ ...t, [e.target.name]: true }));
  const ctx = { email: formData.email, name: formData.name };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();

    setTouched({ name: true, email: true, password: true });
    const problem = nameProblem(formData.name) || emailProblem(formData.email)
      || (isDisposable(formData.email) ? 'Temporary (throw-away) e-mail addresses are not accepted. Use your own e-mail.' : null)
      || (!passwordReady(formData.password, ctx) ? 'Your password does not meet all the rules shown under it yet.' : null)
      || (formData.password !== formData.confirmPassword ? 'Passwords do not match' : null);
    if (problem) {
      toast.error(problem);
      return;
    }

    setLoading(true);

    try {
      const res = await register({
        name: cleanName(formData.name),
        email: normEmail(formData.email),
        password: formData.password
      });
      
      setQrCodeUrl(res.qrCodeUrl);
      setTicket(res.ticket);
      setStep(2);
      toast.success('Account created! Please set up 2FA.');
    } catch (err) {
      toast.error(err.message || 'Registration failed. Please try again.');
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
      try {
        await confirmRegistration2FA(formData.email, twoFACode, ticket);
      } catch (err) {
        // The code is right; the account starts working once the e-mailed link is opened
        if (err.code === 'EMAIL_NOT_VERIFIED') { setStep(3); toast.success('Authenticator linked. Now verify your e-mail.'); return; }
        throw err;
      }
      setTimeout(() => {
        const redirectPath = settings.defaultLandingPage === 'Dashboard' ? '/dashboard' : 
                             settings.defaultLandingPage === 'Trending Topics' ? '/dashboard?tab=Trending Topics' : 
                             '/feed';
        navigate(redirectPath);
      }, 1000);
    } catch (err) {
      toast.error(err.message || 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Sign up with Google: the account is created and signed in at once (no password, no 2FA setup)
  const handleGoogle = async (credential) => {
    setLoading(true);
    try {
      const res = await loginWithGoogle(credential, false);
      if (res.token) navigate(settings.defaultLandingPage === 'Dashboard' ? '/dashboard' : settings.defaultLandingPage === 'Trending Topics' ? '/dashboard?tab=Trending Topics' : '/feed');
    } catch (err) {
      toast.error(err.message || 'Google sign-up failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-[100dvh] w-full flex flex-col lg:flex-row bg-[#060a14] text-white font-sans overflow-hidden transition-colors duration-500">
      
      {/* Back to Home Button */}
      <Link to="/" className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2 text-gray-500 hover:text-white transition-colors z-30 font-medium text-[13px] lg:text-[14px]">
        <ArrowLeft size={16} />
        <span className="hidden sm:inline">Back to Home</span>
      </Link>

      {/* Right Side - Branding & Graphic */}
      <div className="w-full lg:w-1/2 order-1 lg:order-2 relative bg-[#0b1120] flex flex-col items-center justify-center p-4 lg:p-8 overflow-hidden border-l border-gray-800/60 h-[40%] lg:h-full z-10">
          
          {/* Network constellation background (Subtle dots) */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-[#0b1120] to-[#0b1120] pointer-events-none"></div>
          
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

          {/* High-quality 3D Floating Illustration with Badges */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.5, type: "spring", bounce: 0.3 }} 
            className="hidden sm:flex relative z-10 flex-col items-center justify-center mt-auto w-[90%] max-w-[240px] lg:max-w-[280px] aspect-[3/4]"
          >
            
            {/* Floating Badges */}
            <motion.div 
              animate={{ y: [-5, 5, -5] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 0.5 }}
              className="absolute top-2 left-0 z-20 bg-[#060a14]/80 backdrop-blur-md border border-gray-700/50 rounded-xl lg:rounded-2xl p-2 flex flex-col items-center gap-1 shadow-xl scale-75 origin-top-left"
            >
              <BrainCircuit className="text-purple-400" size={16} />
              <span className="text-[9px] text-gray-300 font-medium text-center leading-tight">AI<br/>Analysis</span>
            </motion.div>

            <motion.div 
              animate={{ y: [5, -5, 5] }}
              transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
              className="absolute bottom-2 left-0 z-20 bg-[#060a14]/80 backdrop-blur-md border border-gray-700/50 rounded-xl lg:rounded-2xl p-2 flex flex-col items-center gap-1 shadow-xl scale-75 origin-bottom-left"
            >
              <BarChart className="text-blue-400" size={16} />
              <span className="text-[9px] text-gray-300 font-medium text-center leading-tight">Cross-Source<br/>Comparison</span>
            </motion.div>

            <motion.div 
              animate={{ y: [-8, 8, -8] }}
              transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 0 }}
              className="absolute top-1/2 right-0 -translate-y-1/2 z-20 bg-[#060a14]/80 backdrop-blur-md border border-gray-700/50 rounded-xl lg:rounded-2xl p-2 flex flex-col items-center gap-1 shadow-xl scale-75 origin-right"
            >
              <Search className="text-emerald-400" size={16} />
              <span className="text-[9px] text-gray-300 font-medium text-center leading-tight">Bias<br/>Detection</span>
            </motion.div>

            {/* Pure CSS/Framer Motion Animation - AI Document Scanner */}
            <div className="relative w-full h-full flex items-center justify-center my-4 perspective-1000 z-10">
              <motion.div
                animate={{ 
                  rotateX: [15, 25, 15], 
                  rotateY: [-10, -5, -10],
                  rotateZ: [2, -2, 2]
                }}
                transition={{ repeat: Infinity, duration: 8, ease: "easeInOut" }}
                className="w-[85%] h-[90%] bg-[#0b1120]/80 backdrop-blur-xl rounded-2xl border border-blue-500/40 shadow-[0_0_50px_rgba(59,130,246,0.3)] p-4 flex flex-col gap-3 overflow-hidden relative"
                style={{ transformStyle: 'preserve-3d' }}
              >
                {/* Document Header */}
                <div className="flex items-center gap-3 border-b border-blue-500/30 pb-4">
                  <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center border border-blue-500/30">
                    <div className="w-3 h-3 bg-cyan-400 rounded-sm shadow-[0_0_10px_#22d3ee]"></div>
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    <div className="w-full h-2 bg-blue-400/40 rounded-full"></div>
                    <div className="w-2/3 h-1.5 bg-blue-400/20 rounded-full"></div>
                  </div>
                </div>
                
                {/* Animated Text Lines */}
                <div className="space-y-3 mt-1 flex-1">
                  <motion.div animate={{ width: ['100%', '85%', '100%'] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} className="h-1.5 bg-gray-400/30 rounded-full"></motion.div>
                  <motion.div animate={{ width: ['80%', '95%', '80%'] }} transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", delay: 0.5 }} className="h-1.5 bg-gray-400/30 rounded-full"></motion.div>
                  <motion.div animate={{ width: ['90%', '70%', '90%'] }} transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", delay: 1 }} className="h-1.5 bg-gray-400/30 rounded-full"></motion.div>
                  <motion.div animate={{ width: ['60%', '100%', '60%'] }} transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 1.5 }} className="h-1.5 bg-gray-400/30 rounded-full"></motion.div>
                  <motion.div animate={{ width: ['95%', '75%', '95%'] }} transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut", delay: 2 }} className="h-1.5 bg-gray-400/30 rounded-full"></motion.div>
                </div>

                {/* Glowing Data Blocks at bottom */}
                <div className="flex items-end gap-1.5 h-10 mt-auto border-t border-blue-500/30 pt-3">
                  <motion.div animate={{ height: ['40%', '100%', '40%'] }} transition={{ repeat: Infinity, duration: 2 }} className="flex-1 bg-blue-500/50 rounded-t-sm"></motion.div>
                  <motion.div animate={{ height: ['80%', '30%', '80%'] }} transition={{ repeat: Infinity, duration: 2.5 }} className="flex-1 bg-cyan-500/60 shadow-[0_0_10px_#06b6d4] rounded-t-sm"></motion.div>
                  <motion.div animate={{ height: ['60%', '90%', '60%'] }} transition={{ repeat: Infinity, duration: 1.8 }} className="flex-1 bg-blue-500/50 rounded-t-sm"></motion.div>
                  <motion.div animate={{ height: ['100%', '50%', '100%'] }} transition={{ repeat: Infinity, duration: 3 }} className="flex-1 bg-blue-500/50 rounded-t-sm"></motion.div>
                </div>

                {/* Laser Scanner Line */}
                <motion.div
                  animate={{ top: ['0%', '100%', '0%'] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                  className="absolute left-0 w-full h-[1px] bg-cyan-400 shadow-[0_0_15px_3px_#22d3ee] z-20"
                ></motion.div>

                {/* Scanning Overlay Glow */}
                <motion.div
                  animate={{ top: ['-30%', '70%', '-30%'] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                  className="absolute left-0 w-full h-32 bg-gradient-to-b from-transparent via-cyan-400/20 to-transparent z-10 pointer-events-none"
                ></motion.div>
              </motion.div>
            </div>
          </motion.div>
      </div>

      {/* Left Side - Form */}
      <div className="w-full lg:w-1/2 order-2 lg:order-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-[#0a0a0a] h-[60%] lg:h-full overflow-y-auto hide-scrollbar">
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
                  <UserPlus size={20} className="lg:w-5 lg:h-5" strokeWidth={1.5} />
                </motion.div>
                <h2 className="text-[20px] lg:text-[22px] font-semibold text-white mb-0.5 tracking-tight">Create Account</h2>
                <p className="text-gray-400 text-[12px] lg:text-[13px] text-center max-w-[240px] leading-snug">
                  Join TruthLens and see beyond the headlines.
                </p>
              </div>

              <form onSubmit={handleRegisterSubmit}>
                <div className="mb-2 lg:mb-2.5">
                  <label className="block text-[11px] lg:text-[12px] font-medium text-gray-300 mb-1">Full Name</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-[15px] w-[15px] lg:h-[16px] lg:w-[16px] text-gray-500" strokeWidth={1.5} />
                    </div>
                    <input
                      type="text"
                      name="name"
                      required
                      maxLength={60}
                      autoComplete="name"
                      value={formData.name}
                      onChange={handleChange}
                      onBlur={touch}
                      className="block w-full pl-9 lg:pl-10 pr-3.5 py-1.5 lg:py-2 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-[12px] lg:text-[13px]"
                      placeholder="Enter your full name"
                    />
                  </div>
                  {touched.name && nameProblem(formData.name) && <p className="mt-1 text-[11px] text-red-400">{nameProblem(formData.name)}</p>}
                </div>

                <div className="mb-2 lg:mb-2.5">
                  <label className="block text-[11px] lg:text-[12px] font-medium text-gray-300 mb-1">Email Address</label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Mail className="h-[15px] w-[15px] lg:h-[16px] lg:w-[16px] text-gray-500" strokeWidth={1.5} />
                    </div>
                    <input
                      type="email"
                      name="email"
                      required
                      maxLength={254}
                      autoComplete="email"
                      value={formData.email}
                      onChange={handleChange}
                      onBlur={touch}
                      className="block w-full pl-9 lg:pl-10 pr-3.5 py-1.5 lg:py-2 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-[12px] lg:text-[13px]"
                      placeholder="youremail@example.com"
                    />
                  </div>
                  <EmailHint email={formData.email} touched={touched.email} onFix={(fixed) => setFormData({ ...formData, email: fixed })} />
                  {isDisposable(formData.email) && <p className="mt-1 text-[11px] text-red-400">Temporary (throw-away) e-mail addresses are not accepted.</p>}
                </div>

                <div className="grid grid-cols-2 gap-3 lg:gap-4 mb-2 lg:mb-2.5">
                  <div>
                    <label className="block text-[11px] lg:text-[12px] font-medium text-gray-300 mb-1">Password</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="h-[15px] w-[15px] text-gray-500" strokeWidth={1.5} />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        required
                        maxLength={64}
                        autoComplete="new-password"
                        value={formData.password}
                        onChange={handleChange}
                        className="block w-full pl-9 lg:pl-10 pr-10 py-1.5 lg:py-2 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-[12px] lg:text-[13px] font-mono tracking-wider"
                        placeholder="••••••••"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] lg:text-[12px] font-medium text-gray-300 mb-1">Confirm</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <Lock className="h-[15px] w-[15px] text-gray-500" strokeWidth={1.5} />
                      </div>
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        name="confirmPassword"
                        required
                        maxLength={64}
                        autoComplete="new-password"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className="block w-full pl-9 lg:pl-10 pr-10 py-1.5 lg:py-2 border border-[#222] rounded-lg lg:rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition text-[12px] lg:text-[13px] font-mono tracking-wider"
                        placeholder="••••••••"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-500 hover:text-gray-300 transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
                {(formData.password || touched.password) && (
                  <div className="mb-2 lg:mb-2.5">
                    <PasswordChecklist password={formData.password} email={formData.email} name={formData.name} confirm={formData.confirmPassword ? formData.confirmPassword : undefined} />
                  </div>
                )}

                <div className="py-1 mb-2 lg:mb-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="terms"
                      required
                      className="w-3.5 h-3.5 rounded border-[#222] bg-transparent text-blue-600 focus:ring-blue-500"
                    />
                    <label htmlFor="terms" className="text-[11px] lg:text-[12px] text-gray-400">
                      I understand my name, email and feedback are stored to run TruthLens
                    </label>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center gap-1.5 py-2 lg:py-2.5 px-4 border border-transparent rounded-lg lg:rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-[#0a0a0a] font-semibold text-[13px] lg:text-[14px] transition shadow-[0_0_15px_rgba(59,130,246,0.25)] disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  <UserPlus size={16} className="lg:w-4 lg:h-4" strokeWidth={2} />
                  {loading ? 'Creating account...' : 'Sign Up'}
                </motion.button>
              </form>

              {/* Social Login Options */}
              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#222]"></div></div>
                <div className="relative flex justify-center text-[9px] lg:text-[11px]">
                  <span className="px-3 bg-[#0a0a0a] text-gray-500 uppercase tracking-widest font-medium">or</span>
                </div>
              </div>
              <GoogleButton onCredential={handleGoogle} text="signup_with" disabled={loading} />
              <div className="mt-3 lg:mt-4 text-center text-[12px] lg:text-[13px] text-gray-400">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-blue-500 hover:text-blue-400 transition">Log in</Link>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="text-center relative z-10">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.1, type: "spring", bounce: 0.5 }} className="mx-auto w-[55px] h-[55px] rounded-full border border-blue-600/80 flex items-center justify-center mb-4 text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
                <Key className="w-6 h-6" strokeWidth={1.5} />
              </motion.div>
              <h2 className="text-[22px] lg:text-[26px] font-semibold text-white mb-2 tracking-tight">Setup Two-Factor Auth</h2>
              <p className="text-[13px] lg:text-[14px] text-gray-400 mb-6 max-w-[240px] mx-auto leading-snug">
                Scan the QR code below with Google Authenticator or Authy to secure your account.
              </p>

              <div className="bg-white p-3 lg:p-4 rounded-xl inline-block mb-4 lg:mb-6 shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                <img src={qrCodeUrl} alt="2FA QR Code" className="w-32 h-32 lg:w-40 lg:h-40" />
              </div>

              <form onSubmit={handle2FASubmit} className="space-y-4">
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
                  className="w-full flex justify-center py-2.5 lg:py-3 px-4 border border-transparent rounded-lg lg:rounded-xl text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 focus:ring-offset-[#0a0a0a] font-semibold text-[13px] lg:text-[14px] transition shadow-[0_0_15px_rgba(59,130,246,0.25)]"
                >
                  {loading ? 'Verifying...' : 'Verify & Complete'}
                </motion.button>
              </form>
            </div>
          )}

          {step === 3 && (
            <div className="relative z-10">
              <VerifyEmailNotice email={formData.email} />
              <Link to="/login" className="mt-4 block text-center text-[12px] lg:text-[13px] font-semibold text-blue-500 hover:text-blue-400 transition">Already verified? Log in</Link>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;
