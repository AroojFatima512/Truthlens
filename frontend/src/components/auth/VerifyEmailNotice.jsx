import React, { useEffect, useState } from 'react';
import { MailCheck, RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { resendVerification } from '../../services/authService';

// "Check your inbox": shown after sign-up, and when someone tries to log in before verifying.
// The resend button waits a minute between e-mails.
const WAIT = 60;

const VerifyEmailNotice = ({ email, compact = false }) => {
  const [wait, setWait] = useState(compact ? 0 : WAIT);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const resend = async () => {
    setSending(true);
    try {
      const r = await resendVerification(email);
      toast.success(r.message);
      setWait(WAIT);
    } catch (err) {
      toast.error(err.message);
    } finally { setSending(false); }
  };

  const button = (
    <button type="button" onClick={resend} disabled={sending || wait > 0}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition">
      <RotateCw size={13} className={sending ? 'animate-spin' : ''} /> {wait > 0 ? `Resend in ${wait}s` : 'Resend verification e-mail'}
    </button>
  );

  if (compact) {
    return (
      <div role="status" className="mt-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-left">
        <p className="text-[12px] text-amber-100 mb-2 flex items-start gap-2">
          <MailCheck size={15} className="mt-0.5 shrink-0 text-amber-300" />
          <span>Please verify your e-mail first. Open the link we sent to <span className="font-semibold">{email}</span> (check Spam too).</span>
        </p>
        {button}
      </div>
    );
  }
  return (
    <div className="text-center">
      <div className="mx-auto w-[55px] h-[55px] rounded-full border border-blue-600/80 flex items-center justify-center mb-4 text-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]">
        <MailCheck className="w-6 h-6" strokeWidth={1.5} />
      </div>
      <h2 className="text-[22px] lg:text-[26px] font-semibold text-white mb-2 tracking-tight">Verify your e-mail</h2>
      <p className="text-[13px] lg:text-[14px] text-gray-400 mb-1 max-w-[320px] mx-auto">
        We sent a link to <span className="text-white font-medium">{email}</span>. Open it to activate your account, then log in.
      </p>
      <p className="text-[12px] text-gray-500 mb-5">The link works for 24 hours. Not there? Check Spam or Promotions.</p>
      {button}
    </div>
  );
};

export default VerifyEmailNotice;
