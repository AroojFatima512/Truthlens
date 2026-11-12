import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, CheckCircle2, XCircle, Mail } from 'lucide-react';
import toast from 'react-hot-toast';
import AuthCard from '../components/auth/AuthCard';
import { verifyEmail, resendVerification } from '../services/authService';

// /verify-email?token=...: the page the link in the sign-up e-mail opens. It verifies straight away.
const VerifyEmailPage = () => {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState({ status: 'checking' });   // checking | done | failed
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const started = useRef(false);                                // the link works once: never send it twice

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    verifyEmail(token)
      .then((r) => setState({ status: 'done', email: r.email }))
      .catch((err) => setState({ status: 'failed', message: err.message }));
  }, [token]);

  const resend = async (e) => {
    e.preventDefault();
    setSending(true);
    try { toast.success((await resendVerification(email.trim())).message); } catch (err) { toast.error(err.message); } finally { setSending(false); }
  };

  if (state.status === 'checking') {
    return <AuthCard icon={MailCheck} title="Verifying your e-mail…"><div className="h-1 rounded bg-white/10 overflow-hidden"><div className="h-full w-1/3 bg-white/40 animate-pulse" /></div></AuthCard>;
  }
  if (state.status === 'done') {
    return (
      <AuthCard icon={CheckCircle2} title="E-mail verified" subtitle={`${state.email} is confirmed. Your account is ready.`}>
        <Link to="/login" className="block text-center w-full py-2.5 rounded-xl text-white font-semibold text-sm transition bg-blue-600 hover:bg-blue-700 shadow-[0_0_15px_rgba(59,130,246,0.25)]">Log in</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard icon={XCircle} title="This link has expired" subtitle="Verification links work once, for 24 hours, and only the newest one works. Enter your e-mail for a new link.">
      <form onSubmit={resend} className="space-y-3">
        <span className="relative block">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" strokeWidth={1.5} />
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="youremail@example.com"
            className="block w-full pl-10 pr-3.5 py-2.5 border border-[#222] rounded-xl bg-transparent text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:border-blue-500 focus:ring-blue-500 text-sm" />
        </span>
        <button type="submit" disabled={sending} className="w-full py-2.5 rounded-xl text-white font-semibold text-sm transition bg-blue-600 hover:bg-blue-700 disabled:opacity-60">
          {sending ? 'Sending…' : 'Send a new link'}
        </button>
      </form>
      <p className="text-center text-sm text-gray-400 mt-4">Already verified? <Link to="/login" className="font-semibold text-blue-500 hover:text-blue-400">Log in</Link></p>
    </AuthCard>
  );
};

export default VerifyEmailPage;
