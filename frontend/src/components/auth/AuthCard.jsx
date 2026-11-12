import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { isAdminPath } from '../../utils/adminArea';

// A centred card for the small account pages (forgot / reset password), in blue for readers and in
// red on the admin side (/admin/...).
export const useAuthTheme = () => {
  const admin = isAdminPath(useLocation().pathname);
  return admin
    ? { admin, accent: 'text-[#D32F2F]', ring: 'focus:border-[#D32F2F] focus:ring-[#D32F2F]', button: 'bg-[#D32F2F] hover:bg-[#B71C1C] shadow-[0_0_15px_rgba(211,47,47,0.25)]', link: 'text-[#D32F2F] hover:text-red-400', loginPath: '/admin/login' }
    : { admin, accent: 'text-blue-500', ring: 'focus:border-blue-500 focus:ring-blue-500', button: 'bg-blue-600 hover:bg-blue-700 shadow-[0_0_15px_rgba(59,130,246,0.25)]', link: 'text-blue-500 hover:text-blue-400', loginPath: '/login' };
};

const AuthCard = ({ icon: Icon, title, subtitle, children }) => {
  const t = useAuthTheme();
  return (
    <div className={`min-h-[100dvh] w-full flex items-center justify-center p-4 text-white ${t.admin ? 'bg-gradient-to-br from-[#2a0509] via-[#0d0304] to-[#080304]' : 'bg-gradient-to-br from-[#0b1730] via-[#070b16] to-[#060a14]'}`}>
      <Link to={t.loginPath} className="absolute top-4 left-4 md:top-6 md:left-6 flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium">
        <ArrowLeft size={16} /> Back to {t.admin ? 'Admin Login' : 'Login'}
      </Link>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className={`w-full max-w-md rounded-2xl border p-6 sm:p-8 bg-[#0a0a0a]/90 backdrop-blur shadow-2xl ${t.admin ? 'border-red-900/30' : 'border-gray-800'}`}>
        <div className="flex items-center justify-center gap-2 mb-6">
          <ShieldCheck className={t.accent} size={24} />
          <span className="text-lg font-bold tracking-tight">Truth<span className={t.accent}>Lens</span>{t.admin && <span className="text-gray-400 font-medium"> Admin</span>}</span>
        </div>
        <div className={`mx-auto w-14 h-14 rounded-full border flex items-center justify-center mb-4 ${t.admin ? 'border-[#D32F2F]/70' : 'border-blue-600/70'}`}>
          <Icon className={t.accent} size={24} strokeWidth={1.6} />
        </div>
        <h1 className="text-2xl font-semibold text-center mb-1.5 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-gray-400 text-center mb-6">{subtitle}</p>}
        {children}
      </motion.div>
    </div>
  );
};

export default AuthCard;
