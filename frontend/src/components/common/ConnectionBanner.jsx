import React, { useEffect, useRef, useState } from 'react';
import { WifiOff, Loader2 } from 'lucide-react';

// NFR-10: when the backend can't be reached (it crashed and PM2 is restarting it, or it isn't running),
// a banner says so and checks /api/health every few seconds; it disappears by itself once the server is
// back ("Reload" refreshes the page straight away).
const HEALTH = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/health`;

const ConnectionBanner = () => {
  const [down, setDown] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const onDown = () => setDown(true);
    window.addEventListener('truthlens:server-unreachable', onDown);
    return () => window.removeEventListener('truthlens:server-unreachable', onDown);
  }, []);

  useEffect(() => {
    if (!down) return undefined;
    const check = async () => {
      try {
        const r = await fetch(HEALTH, { cache: 'no-store' });
        if (r.ok || r.status === 503) { setDown(false); window.dispatchEvent(new CustomEvent('truthlens:server-back')); return; }
      } catch { /* still down */ }
      timer.current = setTimeout(check, 4000);
    };
    timer.current = setTimeout(check, 3000);
    return () => clearTimeout(timer.current);
  }, [down]);

  if (!down) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 rounded-xl border border-amber-500/40 bg-[#1f1708] px-4 py-2.5 text-sm text-amber-100 shadow-2xl">
      <WifiOff size={17} className="text-amber-400 shrink-0" />
      <span>Can't reach the TruthLens server. Reconnecting…</span>
      <Loader2 size={15} className="animate-spin text-amber-400 shrink-0" />
      <button type="button" onClick={() => window.location.reload()} className="ml-1 rounded-md border border-amber-500/40 px-2 py-0.5 text-xs hover:bg-amber-500/10">Reload</button>
    </div>
  );
};

export default ConnectionBanner;
