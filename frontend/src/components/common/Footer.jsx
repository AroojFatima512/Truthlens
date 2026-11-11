import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

// Shown on the public pages (Home, About). Only links that lead somewhere real.
const Footer = () => {
  const { user } = useAuth();

  const links = user
    ? [['/feed', 'News Feed'], ['/compare', 'Compare Sources'], ['/dashboard', 'Dashboard'], ['/feedback', 'Send Feedback']]
    : [['/register', 'Create an Account'], ['/login', 'Log In']];

  return (
    <footer className="bg-[#0b1120] text-white border-t border-gray-800/50 pt-14 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row gap-10 justify-between mb-12">
          <div className="md:w-1/2 lg:w-1/3">
            <Link to="/" className="flex items-center gap-2 mb-5">
              <ShieldCheck className="text-blue-500" size={28} />
              <span className="text-xl font-bold tracking-tight text-white">Truth<span className="text-blue-500">Lens</span></span>
            </Link>
            <p className="text-gray-400 text-sm leading-relaxed">
              An AI-powered platform that promotes media literacy by revealing bias and comparing how different outlets report the same news.
            </p>
          </div>

          <div className="flex gap-16">
            <div>
              <h3 className="text-white font-bold mb-5 text-sm">TruthLens</h3>
              <ul className="space-y-3">
                <li><Link to="/" className="text-gray-400 hover:text-white text-sm transition">Home</Link></li>
                <li><Link to="/about" className="text-gray-400 hover:text-white text-sm transition">About the Project</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="text-white font-bold mb-5 text-sm">{user ? 'Your Account' : 'Get Started'}</h3>
              <ul className="space-y-3">
                {links.map(([to, label]) => (
                  <li key={to}><Link to={to} className="text-gray-400 hover:text-white text-sm transition">{label}</Link></li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800/80 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-gray-500">
          <p>&copy; {new Date().getFullYear()} TruthLens. Final Year Project.</p>
          <p>COMSATS University Islamabad, Lahore Campus</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
