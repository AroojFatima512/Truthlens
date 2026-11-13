import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Eye, EyeOff, ShieldCheck, LinkIcon, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthCard, { useAuthTheme } from '../components/auth/AuthCard';
import { checkResetToken, resetPassword } from '../services/authService';
import PasswordChecklist, { passwordReady } from '../components/auth/PasswordChecklist';

// /reset-password?token=...  (and /admin/reset-password): the page the e-mailed link opens.
// It checks the link first, then lets the person choose a new password.

const ResetPasswordPage = () => {
  const t = useAuthTheme();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const invite = params.get('invite') === '1';          // UC-33: an admin added this account
  const [link, setLink] = useState(null);            // null = checking, { valid, email }
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { checkResetToken(token).then(setLink); }, [token]);
  const canSubmit = useMemo(() => passwordReady(password, {}, again), [password, again]);

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      await resetPassword(token, password);
      setDone(true);
      toast.success(invite ? 'Password set' : 'Password changed');
    } catch (err) {
      toast.error(err.message);
      setLink(await checkResetToken(token));
    } finally {
      setLoading(false);
    }
  };

  if (!link) {
    return <AuthCard icon={LinkIcon} title="Checking your link…"><div className="h-1 rounded bg-white/10 overflow-hidden"><div className="h-full w-1/3 bg-white/40 animate-pulse" /></div></AuthCard>;
  }
  if (done) {
    return (
      <AuthCard icon={CheckCircle2} title={invite ? 'Your account is ready' : 'Password changed'}
        subtitle={invite ? 'Log in with your e-mail and new password. The first time, you will scan a QR code with an authenticator app (Google or Microsoft Authenticator).' : 'You can now log in with your new password.'}>
        <button onClick={() => navigate(t.loginPath)} className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm transition ${t.button}`}>Go to {t.admin ? 'Admin Login' : 'Login'}</button>
      </AuthCard>
    );
  }
  if (!link.valid) {
    return (
      <AuthCard icon={XCircle} title="This link has expired" subtitle="Reset links work once, for 30 minutes, and only the newest one you asked for works.">
        <Link to={t.admin ? '/admin/forgot-password' : '/forgot-password'} className={`block text-center w-full py-2.5 rounded-xl text-white font-semibold text-sm transition ${t.button}`}>Send a new link</Link>
      </AuthCard>
    );
  }

  const field = (value, set, placeholder, auto) => (
    <span className="relative block">
      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" strokeWidth={1.5} />
      <input type={show ? 'text' : 'password'} required maxLength={64} value={value} onChange={(e) => set(e.target.value)} placeholder={placeholder} autoFocus={auto} autoComplete="new-password"
        className={`block w-full pl-10 pr-10 py-2.5 border border-[#222] rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:ring-1 transition text-sm ${t.ring}`} />
    </span>
  );

  return (
    <AuthCard icon={ShieldCheck} title={invite ? 'Welcome to TruthLens' : 'Choose a new password'} subtitle={invite ? `Choose a password for ${link.email}` : `For ${link.email}`}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="flex items-center justify-between text-xs font-medium text-gray-300 mb-1.5">
            New password
            <button type="button" onClick={() => setShow(!show)} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-300">
              {show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? 'Hide' : 'Show'}
            </button>
          </span>
          {field(password, setPassword, 'New password', true)}
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-300 mb-1.5">Confirm new password</span>
          {field(again, setAgain, 'Type it again')}
        </label>
        <PasswordChecklist password={password} confirm={again} />
        <button type="submit" disabled={loading || !canSubmit} className={`w-full py-2.5 rounded-xl text-white font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${t.button}`}>
          {loading ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </AuthCard>
  );
};

export default ResetPasswordPage;
