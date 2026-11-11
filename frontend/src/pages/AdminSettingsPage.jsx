import React, { useState } from 'react';
import Sidebar from '../components/common/Sidebar';
import { useAuth } from '../context/AuthContext';
import { changePassword } from '../services/authService';
import { Menu, User, Lock, Eye, EyeOff, Loader2, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

// Admin account: details and password change (saved in MongoDB).
const AdminSettingsPage = () => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next.length < 6) return toast.error('New password must be at least 6 characters');
    if (next !== confirm) return toast.error('The new passwords do not match');
    setSaving(true);
    try {
      await changePassword(current, next);
      toast.success('Password changed. Use the new one next time you log in.');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const Row = ({ label, value }) => (
    <div className="flex items-center justify-between py-3.5 border-b border-red-900/20 last:border-0">
      <span className="text-sm text-gray-400">{label}</span>
      <span className="text-sm font-medium text-white">{value}</span>
    </div>
  );
  const input = 'block w-full pl-4 pr-10 py-2.5 border border-red-900/30 rounded-lg bg-[#1a0505] text-white placeholder-gray-600 focus:outline-none focus:border-red-500/50 text-sm';

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#0a0505] text-white">
      <div className="md:hidden flex items-center justify-between p-4 bg-[#0a0505] border-b border-red-900/30 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#D32F2F] rounded-lg flex items-center justify-center"><span className="text-white font-bold text-lg">T</span></div>
          <span className="text-xl font-bold text-white tracking-tight">Truth<span className="text-[#D32F2F]">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:bg-red-950/20 rounded-lg transition-colors"><Menu size={24} /></button>
      </div>

      <div className="flex flex-1 overflow-hidden max-w-[1600px] mx-auto w-full">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-10 hide-scrollbar">
          <div className="mb-8">
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-1.5 tracking-tight">Admin Settings</h1>
            <p className="text-gray-400 text-sm">Your admin account.</p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 max-w-5xl">
            <section className="bg-[#110505] border border-red-900/20 rounded-xl shadow-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-red-900/20 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-950/40 border border-red-900/30 flex items-center justify-center text-[#D32F2F]"><User size={16} /></div>
                <h2 className="text-sm font-bold text-white">Account</h2>
              </div>
              <div className="px-6 py-2">
                <Row label="Name" value={user?.name || '–'} />
                <Row label="Email" value={user?.email || '–'} />
                <Row label="Role" value="Administrator" />
                <Row label="Last login" value={user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('en-GB') : '–'} />
              </div>
              <div className="px-6 py-4 border-t border-red-900/20 flex gap-3 text-[12px] text-gray-400">
                <ShieldCheck size={16} className="text-[#D32F2F] shrink-0 mt-0.5" />
                <p>Two-factor sign-in uses the setup key printed in the backend terminal when the admin account was created (ADMIN_2FA_SECRET in backend/.env).</p>
              </div>
            </section>

            <section className="bg-[#110505] border border-red-900/20 rounded-xl shadow-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-red-900/20 flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-950/40 border border-red-900/30 flex items-center justify-center text-[#D32F2F]"><Lock size={16} /></div>
                <h2 className="text-sm font-bold text-white">Change Password</h2>
              </div>
              <form onSubmit={submit} className="p-6 space-y-4">
                {[
                  ['Current password', current, setCurrent, 'current-password'],
                  ['New password (at least 6 characters)', next, setNext, 'new-password'],
                  ['Confirm new password', confirm, setConfirm, 'new-password'],
                ].map(([label, value, set, ac]) => (
                  <div key={label}>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
                    <div className="relative">
                      <input type={show ? 'text' : 'password'} value={value} onChange={(e) => set(e.target.value)} autoComplete={ac} required className={input} />
                      <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                        {show ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                ))}
                <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-[#D32F2F] text-white rounded-lg hover:bg-[#B71C1C] transition font-medium text-sm disabled:opacity-60">
                  {saving && <Loader2 size={16} className="animate-spin" />} Change Password
                </button>
              </form>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
