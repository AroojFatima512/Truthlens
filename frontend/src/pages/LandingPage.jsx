import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Search, BarChart2, Layers, Brain, TrendingUp, Split, Zap, AlertCircle, FileText, Globe, Bell } from 'lucide-react';
import { motion, useInView } from 'framer-motion';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import PageTransition from '../components/common/PageTransition';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { homePathFor } from '../utils/homePath';
import { fetchOverview, fetchModelMetrics } from '../services/newsService';

// Test-set accuracy of the deployed bias model (plain DeBERTa-v3-base, MBIC test set, 311 sentences).
// Shown until the ML side stores its evaluation in model_metrics (then that figure is shown instead).
const MODEL_ACCURACY = 85.5;
const pct = (v) => (typeof v === 'number' ? Math.round((v <= 1 ? v * 100 : v) * 10) / 10 : null);

const AnimatedCounter = ({ end, suffix = "", duration = 2 }) => {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  useEffect(() => {
    if (isInView) {
      let start = 0;
      const increment = end / (duration * 60);
      const timer = setInterval(() => {
        start += increment;
        if (start >= end) {
          setCount(end);
          clearInterval(timer);
        } else {
          setCount(Math.floor(start));
        }
      }, 1000 / 60);
      return () => clearInterval(timer);
    }
  }, [isInView, end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
};

const LandingPage = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const isAdmin = user?.role === 'admin';

  // Real numbers from the database (public endpoint, works without logging in)
  const [overview, setOverview] = useState(null);
  const [biasModel, setBiasModel] = useState(null);   // { accuracy, dataset, testSize, evaluatedAt, ... }
  const [sentimentModel, setSentimentModel] = useState(null);
  useEffect(() => {
    fetchModelMetrics().then((list) => {
      setBiasModel(list.find((m) => m.model === 'bias-sentence') || null);
      setSentimentModel(list.find((m) => m.model === 'sentiment') || null);
    });
  }, []);
  // e.g. "Sentiment: accuracy 70.9%, macro-F1 0.69 (399 human-labelled sentences)"
  const sentimentNote = sentimentModel && sentimentModel.accuracy != null
    ? `Sentiment: accuracy ${pct(sentimentModel.accuracy)}%${sentimentModel.macroF1 != null ? `, macro-F1 ${Number(sentimentModel.macroF1).toFixed(2)}` : ''}${sentimentModel.testSize ? ` (${sentimentModel.testSize} human-labelled sentences)` : ''}`
    : null;
  const accuracy = pct(biasModel?.accuracy) ?? MODEL_ACCURACY;
  const accuracyNote = biasModel
    ? `${biasModel.name || 'Bias model'}: accuracy on ${biasModel.dataset || 'the test set'}${biasModel.testSize ? ` (${biasModel.testSize} sentences)` : ''}${biasModel.f1 != null ? `, F1 ${pct(biasModel.f1)}%` : ''}`
    : 'DeBERTa bias model, accuracy on the MBIC test set (311 sentences)';
  useEffect(() => {
    fetchOverview().then(setOverview).catch((err) => console.error('Could not load stats', err));
  }, []);

  const FEATURES = [
    { icon: ShieldCheck, label: 'Bias Detection', color: 'text-purple-600 dark:text-purple-400', glow: 'from-purple-500/10' },
    { icon: Search, label: 'Sentiment Analysis', color: 'text-green-600 dark:text-green-400', glow: 'from-green-500/10' },
    { icon: Split, label: 'Cross-source Comparison', color: 'text-blue-500 dark:text-blue-400', glow: 'from-blue-500/10' },
    { icon: Brain, label: 'AI Explainability', color: 'text-indigo-600 dark:text-indigo-400', glow: 'from-indigo-500/10' },
    { icon: TrendingUp, label: 'Trend Tracking', color: 'text-orange-500 dark:text-orange-400', glow: 'from-orange-500/10' },
  ];
  const STATS = [
    { icon: Globe, tint: 'bg-blue-50 dark:bg-[#11203d]', color: 'text-blue-600 dark:text-blue-500', label: 'News Sources', value: <AnimatedCounter end={overview?.sources?.length || 0} duration={1.5} /> },
    { icon: FileText, tint: 'bg-teal-50 dark:bg-[#0d2627]', color: 'text-teal-600 dark:text-teal-400', label: 'Articles Analyzed', value: <AnimatedCounter end={overview?.totalArticles || 0} duration={2} /> },
    { icon: BarChart2, tint: 'bg-blue-50 dark:bg-[#11203d]', color: 'text-blue-600 dark:text-blue-500', label: 'Bias Model Accuracy', title: sentimentNote ? `${accuracyNote}\n${sentimentNote}` : accuracyNote,
      note: sentimentNote ? `Sentiment ${pct(sentimentModel.accuracy)}%` : null, value: <AnimatedCounter key={accuracy} end={accuracy} suffix="%" duration={2.5} /> },
    { icon: Split, tint: 'bg-red-50 dark:bg-[#3d1616]', color: 'text-red-600 dark:text-red-500', label: 'Stories Compared', value: <AnimatedCounter end={overview?.comparisons || 0} duration={2} /> },
  ];

  // Layout: three screen-high parts on a laptop. Screen 1 is the hero with both buttons; screen 2 holds
  // Powerful Features and the numbers; screen 3 is a call to action and the footer. Heights follow the window
  // (100dvh minus the 4rem navbar), and the headline size follows the window height, so nothing is cut
  // off on a short laptop screen and nothing looks empty on a tall monitor.
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-bg-dark transition-colors duration-500 ease-out">
      <Navbar />

      <PageTransition className="flex-grow">
        {/* Screen 1: hero */}
        <section className="relative flex items-center min-h-[calc(100dvh-4rem)] py-8 overflow-hidden bg-gray-50 dark:bg-bg-dark transition-colors duration-500 ease-out">
          <motion.div
            style={{ backgroundImage: "url('/ai_news_bg.png')" }}
            animate={{ backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'], scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 40, ease: 'easeInOut' }}
            className="absolute inset-0 bg-[length:120%_120%] opacity-80 dark:opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-50/20 via-gray-50/70 to-gray-50 dark:from-bg-dark/40 dark:via-bg-dark/75 dark:to-bg-dark pointer-events-none transition-colors duration-500"></div>

          {/* floating snippets, in the corners so they never cover the headline */}
          <motion.div
            animate={{ y: [0, -10, 0] }}
            transition={{ repeat: Infinity, duration: 6, ease: 'easeInOut' }}
            className="absolute top-[9%] left-[2.5%] 2xl:left-[5%] bg-white/60 dark:bg-bg-card/60 backdrop-blur-md border border-white/40 dark:border-gray-700/50 px-4 py-3 rounded-xl shadow-[0_0_30px_rgba(26,115,232,0.15)] hidden xl:block z-10"
          >
            <div className="flex items-center gap-3 mb-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
              <span className="text-xs text-gray-800 dark:text-gray-200 font-medium tracking-wide">Source A: "Regime collapses..."</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>
              <span className="text-xs text-gray-800 dark:text-gray-200 font-medium tracking-wide">Source B: "Leadership transitions..."</span>
            </div>
          </motion.div>
          <motion.div
            animate={{ y: [0, 10, 0] }}
            transition={{ repeat: Infinity, duration: 5, ease: 'easeInOut', delay: 1 }}
            className="absolute bottom-[14%] right-[2.5%] 2xl:right-[5%] bg-white/60 dark:bg-bg-card/60 backdrop-blur-md border border-white/40 dark:border-gray-700/50 px-4 py-3 rounded-xl shadow-[0_0_30px_rgba(168,85,247,0.15)] hidden xl:flex items-center gap-3 z-10"
          >
            <div className="p-2 bg-purple-500/20 rounded-lg"><Brain className="text-purple-600 dark:text-purple-400" size={20} /></div>
            <div>
              <p className="text-xs text-gray-900 dark:text-white font-bold">AI Scan Complete</p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400">Bias scored sentence by sentence</p>
            </div>
          </motion.div>

          <div className="relative w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-20">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: 'easeOut' }}>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-5 shadow-[0_0_20px_rgba(26,115,232,0.15)]">
                <Zap size={15} /> {user ? `Welcome back, ${user.name?.split(' ')[0] || 'there'}` : 'Advanced AI Media Analysis'}
              </div>

              <h1 className="font-extrabold text-gray-900 dark:text-white tracking-tight leading-[1.08] drop-shadow-sm text-[clamp(2.25rem,min(9vh,6.5vw),4.75rem)]">
                See the News.<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500 drop-shadow-sm">See the Bias.</span>
              </h1>
              <p className="mt-5 max-w-2xl mx-auto text-base md:text-lg text-gray-700 dark:text-gray-300 leading-relaxed">
                TruthLens is an AI-powered detection platform that automatically analyzes and compares news from multiple sources to help you see the full picture.
              </p>

              <div className="mt-7 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                {/* Logged in: go to your own area. Visitors: sign up. */}
                <Link to={user ? homePathFor(user, settings) : '/register'} className="px-7 py-3 border border-transparent text-base font-bold rounded-lg text-white bg-gradient-to-r from-primary to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all duration-300 shadow-[0_0_30px_rgba(26,115,232,0.4)] hover:shadow-[0_0_40px_rgba(26,115,232,0.6)] transform hover:-translate-y-1">
                  {!user ? 'Start Detecting Bias' : isAdmin ? 'Open Admin Dashboard' : 'Go to My News'}
                </Link>
                <Link to={!user ? '/about#how-it-works' : isAdmin ? '/admin/sources' : '/compare'} className="px-7 py-3 border border-gray-300 dark:border-gray-600 text-base font-bold rounded-lg text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300 backdrop-blur-sm bg-white/30 dark:bg-bg-dark/30 hover:shadow-lg transform hover:-translate-y-1">
                  {!user ? 'See How It Works' : isAdmin ? 'Manage Sources' : 'Compare Sources'}
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Screen 2: features and the numbers */}
        <section className="min-h-[calc(100dvh-4rem)] flex flex-col justify-center gap-6 lg:gap-8 py-8 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          {/* Powerful Features */}
          <div className="bg-white dark:bg-[#0b1120] rounded-[1.75rem] px-5 py-6 lg:px-8 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-gray-100 dark:border-gray-800 transition-colors duration-500 ease-out relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-primary/10 blur-[60px] rounded-full pointer-events-none"></div>
            <h3 className="text-center text-gray-900 dark:text-white font-bold mb-5 relative z-10 text-base uppercase tracking-wider">Powerful Features</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 relative z-10">
              {FEATURES.map(({ icon: Icon, label, color, glow }) => (
                <motion.div key={label} whileHover={{ y: -4 }} className="bg-gray-50 dark:bg-[#121c33] rounded-2xl px-3 py-5 text-center hover:bg-white dark:hover:bg-[#1a2642] transition-all duration-300 flex flex-col items-center justify-center gap-2 border border-gray-100 dark:border-gray-800/50 shadow-sm hover:shadow-md dark:shadow-none group relative overflow-hidden">
                  <div className={`absolute inset-0 bg-gradient-to-b ${glow} to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300`}></div>
                  <Icon className={`${color} group-hover:scale-110 transition-transform duration-300 relative z-10`} size={28} strokeWidth={1.5} />
                  <span className="text-sm font-bold text-gray-800 dark:text-white relative z-10 leading-tight">{label}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* the numbers, live from the database */}
          <div className="bg-white dark:bg-[#0b1120] rounded-[1.5rem] py-5 px-4 md:px-6 shadow-[0_10px_40px_rgba(0,0,0,0.04)] dark:shadow-2xl border border-gray-200 dark:border-gray-800/80 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-0 md:divide-x divide-gray-200 dark:divide-gray-800/80 transition-colors duration-500">
            {STATS.map(({ icon: Icon, tint, color, label, value, title, note }) => (
              <div key={label} className="flex items-center gap-3 px-2 lg:px-6 justify-start md:justify-center group">
                <div className={`w-11 h-11 rounded-full ${tint} flex items-center justify-center shrink-0`}>
                  <Icon className={color} size={20} strokeWidth={2} />
                </div>
                <div className="flex flex-col text-left">
                  <div className="text-2xl lg:text-[1.75rem] leading-tight font-extrabold text-gray-900 dark:text-white tracking-tight">{value}</div>
                  <div title={title} className="text-gray-500 dark:text-gray-400 text-[10px] lg:text-xs font-bold uppercase tracking-wider">{label}</div>
                  {note && <div className="text-gray-400 dark:text-gray-500 text-[10px] mt-0.5" title={title}>{note}</div>}
                </div>
              </div>
            ))}
          </div>

        </section>

        {/* Screen 3: a short call to action, with the footer under it. How TruthLens works is explained
            once, on the About page (#how-it-works). */}
        <div className="min-h-[calc(100dvh-4rem)] flex flex-col">
        <section className="flex-1 flex flex-col justify-center py-3 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] border border-blue-400/20 bg-gradient-to-br from-[#0f2a4d] via-[#0d1a33] to-[#1a1240] px-6 py-6 md:px-12 md:py-7 text-center shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
            <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />
            <div className="relative">
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
                Ready to <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">see the bias</span>?
              </h2>
              <p className="mt-2 max-w-2xl mx-auto text-sm md:text-base text-slate-300 leading-relaxed">
                {user
                  ? 'Read the news with every sentence scored, compare how outlets cover the same story, or analyse an article of your own.'
                  : 'Create a free account to read the news with every sentence scored, compare how outlets cover the same story, and analyse any article yourself.'}
              </p>
              <div className="mt-5 flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
                <Link to={user ? homePathFor(user, settings) : '/register'} className="px-7 py-3 text-base font-bold rounded-lg text-white bg-gradient-to-r from-primary to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all duration-300 shadow-[0_0_30px_rgba(26,115,232,0.4)] hover:-translate-y-0.5">
                  {!user ? 'Create an account' : isAdmin ? 'Open Admin Dashboard' : 'Go to My News'}
                </Link>
                <Link to="/about#how-it-works" className="px-7 py-3 text-base font-bold rounded-lg text-white border border-white/20 bg-white/5 hover:bg-white/10 transition-all duration-300 hover:-translate-y-0.5">
                  Learn how it works →
                </Link>
              </div>
            </div>
          </div>
        </section>
        <Footer compact />
        </div>
      </PageTransition>
    </div>
  );
};

export default LandingPage;

