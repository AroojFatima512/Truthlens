import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, KeyRound, MailCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthCard, { useAuthTheme } from '../components/auth/AuthCard';
import { requestPasswordReset } from '../services/authService';

// /forgot-password and /admin/forgot-password: e-mails a one-time link to choose a new password.
// The answer is the same whether or not the e-mail has an account, so nobody can find out who is registered.
const ForgotPasswordPage = () => {
  const t = useAuthTheme();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthCard icon={MailCheck} title="Check your e-mail" subtitle={`If ${email.trim()} has a TruthLens account, we've sent it a link to choose a new password.`}>
        <ul className="text-sm text-gray-400 space-y-1.5 list-disc pl-5 mb-6">
          <li>The link works once, for 30 minutes.</li>
          <li>Not there? Look in Spam or Promotions.</li>
          <li>Signed up with Google? This sets a password you can use as well.</li>
        </ul>
        <button type="button" onClick={() => setSent(false)} className={`w-full py-2.5 rounded-xl border border-[#2a2a2a] text-sm font-medium hover:bg-white/5 transition`}>
          Use a different e-mail
        </button>
        <p className="text-center text-sm text-gray-400 mt-4">
          Remembered it? <Link to={t.loginPath} className={`font-semibold ${t.link}`}>Log in</Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard icon={KeyRound} title="Forgot your password?" subtitle="Enter your account's e-mail and we'll send you a link to choose a new one.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="block text-xs font-medium text-gray-300 mb-1.5">E-mail address</span>
          <span className="relative block">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" strokeWidth={1.5} />
            <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={t.admin ? 'admin@truthlens.com' : 'youremail@example.com'}
              className={`block w-full pl-10 pr-3.5 py-2.5 border border-[#222] rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:ring-1 transition text-sm ${t.ring}`} />
          </span>
        </label>
        <button type="submit" disabled={loading} className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm transition disabled:opacity-60 ${t.button}`}>
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="text-center text-sm text-gray-400 mt-5">
        Remembered it? <Link to={t.loginPath} className={`font-semibold ${t.link}`}>Log in</Link>
      </p>
    </AuthCard>
  );
};

export default ForgotPasswordPage;
