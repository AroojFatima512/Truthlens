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
  useEffect(() => {
    fetchModelMetrics().then((list) => setBiasModel(list.find((m) => m.model === 'bias-sentence') || null));
  }, []);
  const accuracy = pct(biasModel?.accuracy) ?? MODEL_ACCURACY;
  const accuracyNote = biasModel
    ? `${biasModel.name || 'Bias model'}: accuracy on ${biasModel.dataset || 'the test set'}${biasModel.testSize ? ` (${biasModel.testSize} sentences)` : ''}${biasModel.f1 != null ? `, F1 ${pct(biasModel.f1)}%` : ''}`
    : 'DeBERTa bias model, accuracy on the MBIC test set (311 sentences)';
  useEffect(() => {
    fetchOverview().then(setOverview).catch((err) => console.error('Could not load stats', err));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-bg-dark transition-colors duration-500 ease-out">
      <Navbar />
      
      <PageTransition className="flex-grow">
        {/* Hero Section */}
        <section className="relative pt-20 pb-40 overflow-hidden bg-gray-50 dark:bg-bg-dark transition-colors duration-500 ease-out">
          <motion.div 
            style={{ backgroundImage: "url('/ai_news_bg.png')" }}
            animate={{ 
              backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
              scale: [1, 1.1, 1]
            }}
            transition={{ repeat: Infinity, duration: 40, ease: "easeInOut" }}
            className="absolute inset-0 bg-[length:120%_120%] opacity-80 dark:opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-gray-50/20 via-gray-50/70 to-gray-50 dark:from-bg-dark/40 dark:via-bg-dark/80 dark:to-bg-dark pointer-events-none transition-colors duration-500"></div>
          
          {/* Subtle floating comparison snippet */}
          <motion.div 
            animate={{ y: [0, -15, 0] }}
            transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
            className="absolute top-32 left-10 md:left-20 bg-white/60 dark:bg-bg-card/60 backdrop-blur-md border border-white/40 dark:border-gray-700/50 p-4 rounded-xl shadow-[0_0_30px_rgba(26,115,232,0.15)] hidden xl:block z-10"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
              <span className="text-xs text-gray-800 dark:text-gray-200 font-medium tracking-wide">Source A: "Regime collapses..."</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.8)]"></div>
              <span className="text-xs text-gray-800 dark:text-gray-200 font-medium tracking-wide">Source B: "Leadership transitions..."</span>
            </div>
          </motion.div>

          <motion.div 
            animate={{ y: [0, 15, 0] }}
            transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
            className="absolute top-48 right-10 md:right-20 bg-white/60 dark:bg-bg-card/60 backdrop-blur-md border border-white/40 dark:border-gray-700/50 p-4 rounded-xl shadow-[0_0_30px_rgba(168,85,247,0.15)] hidden xl:flex items-center gap-4 z-10"
          >
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Brain className="text-purple-600 dark:text-purple-400" size={24} />
            </div>
            <div>
              <p className="text-xs text-gray-900 dark:text-white font-bold">AI Scan Complete</p>
              <p className="text-[11px] text-gray-600 dark:text-gray-400">Bias scored sentence by sentence</p>
            </div>
          </motion.div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold mb-8 shadow-[0_0_20px_rgba(26,115,232,0.15)]">
                <Zap size={16} /> {user ? `Welcome back, ${user.name?.split(' ')[0] || 'there'}` : 'Advanced AI Media Analysis'}
              </div>
              
              <h1 className="text-5xl md:text-7xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-6 drop-shadow-sm">
                See the News.<br/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-500 drop-shadow-sm">See the Bias.</span>
              </h1>
              <p className="mt-4 max-w-2xl text-xl text-gray-700 dark:text-gray-300 mx-auto mb-10 leading-relaxed">
                TruthLens is an AI-powered detection platform that automatically analyzes and compares news from multiple sources to help you see the full picture.
              </p>
              
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                {/* Logged in: go to your own area. Visitors: sign up. */}
                <Link to={user ? homePathFor(user, settings) : '/register'} className="px-8 py-3.5 border border-transparent text-base font-bold rounded-lg text-white bg-gradient-to-r from-primary to-blue-600 hover:from-blue-600 hover:to-blue-700 transition-all duration-300 shadow-[0_0_30px_rgba(26,115,232,0.4)] hover:shadow-[0_0_40px_rgba(26,115,232,0.6)] transform hover:-translate-y-1">
                  {!user ? 'Start Detecting Bias' : isAdmin ? 'Open Admin Dashboard' : 'Go to My News'}
                </Link>
                <Link to={!user ? '/about' : isAdmin ? '/admin/sources' : '/compare'} className="px-8 py-3.5 border border-gray-300 dark:border-gray-600 text-base font-bold rounded-lg text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300 backdrop-blur-sm bg-white/30 dark:bg-bg-dark/30 hover:shadow-lg transform hover:-translate-y-1">
                  {!user ? 'See How It Works' : isAdmin ? 'Manage Sources' : 'Compare Sources'}
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Powerful Features Section */}
        <section className="relative z-30 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-28 mb-10">
          <div className="bg-white dark:bg-[#0b1120] rounded-t-[3rem] p-10 shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-t border-x border-gray-100 dark:border-gray-800 transition-colors duration-500 ease-out relative overflow-hidden">
             
             {/* Soft glow in background of the features block */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-32 bg-primary/10 blur-[60px] rounded-full pointer-events-none"></div>

             <h3 className="text-center text-gray-900 dark:text-white font-bold mb-8 relative z-10 text-lg uppercase tracking-wider">Powerful Features</h3>
             
             <div className="grid grid-cols-2 md:grid-cols-5 gap-4 relative z-10">
               <motion.div whileHover={{ y: -5 }} className="bg-gray-50 dark:bg-[#121c33] rounded-2xl p-6 text-center hover:bg-white dark:hover:bg-[#1a2642] transition-all duration-300 flex flex-col items-center justify-center h-36 border border-gray-100 dark:border-gray-800/50 shadow-sm hover:shadow-md dark:shadow-none group relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-b from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                 <ShieldCheck className="text-purple-600 dark:text-purple-400 mb-3 group-hover:scale-110 transition-transform duration-300 relative z-10" size={36} strokeWidth={1.5} />
                 <span className="text-sm font-bold text-gray-800 dark:text-white relative z-10">Bias Detection</span>
               </motion.div>
               
               <motion.div whileHover={{ y: -5 }} className="bg-gray-50 dark:bg-[#121c33] rounded-2xl p-6 text-center hover:bg-white dark:hover:bg-[#1a2642] transition-all duration-300 flex flex-col items-center justify-center h-36 border border-gray-100 dark:border-gray-800/50 shadow-sm hover:shadow-md dark:shadow-none group relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-b from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                 <Search className="text-green-600 dark:text-green-400 mb-3 group-hover:scale-110 transition-transform duration-300 relative z-10" size={36} strokeWidth={1.5} />
                 <span className="text-sm font-bold text-gray-800 dark:text-white relative z-10">Sentiment Analysis</span>
               </motion.div>
               
               <motion.div whileHover={{ y: -5 }} className="bg-gray-50 dark:bg-[#121c33] rounded-2xl p-6 text-center hover:bg-white dark:hover:bg-[#1a2642] transition-all duration-300 flex flex-col items-center justify-center h-36 border border-gray-100 dark:border-gray-800/50 shadow-sm hover:shadow-md dark:shadow-none group relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                 <Split className="text-blue-500 dark:text-blue-400 mb-3 group-hover:scale-110 transition-transform duration-300 relative z-10" size={36} strokeWidth={1.5} />
                 <span className="text-sm font-bold text-gray-800 dark:text-white relative z-10 leading-tight">Cross-source<br/>Comparison</span>
               </motion.div>
               
               <motion.div whileHover={{ y: -5 }} className="bg-gray-50 dark:bg-[#121c33] rounded-2xl p-6 text-center hover:bg-white dark:hover:bg-[#1a2642] transition-all duration-300 flex flex-col items-center justify-center h-36 border border-gray-100 dark:border-gray-800/50 shadow-sm hover:shadow-md dark:shadow-none group relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                 <Brain className="text-indigo-600 dark:text-indigo-400 mb-3 group-hover:scale-110 transition-transform duration-300 relative z-10" size={36} strokeWidth={1.5} />
                 <span className="text-sm font-bold text-gray-800 dark:text-white relative z-10 leading-tight">AI Explainability</span>
               </motion.div>
               
               <motion.div whileHover={{ y: -5 }} className="bg-gray-50 dark:bg-[#121c33] rounded-2xl p-6 text-center hover:bg-white dark:hover:bg-[#1a2642] transition-all duration-300 flex flex-col items-center justify-center h-36 border border-gray-100 dark:border-gray-800/50 shadow-sm hover:shadow-md dark:shadow-none group relative overflow-hidden">
                 <div className="absolute inset-0 bg-gradient-to-b from-orange-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                 <TrendingUp className="text-orange-500 dark:text-orange-400 mb-3 group-hover:scale-110 transition-transform duration-300 relative z-10" size={36} strokeWidth={1.5} />
                 <span className="text-sm font-bold text-gray-800 dark:text-white relative z-10 leading-tight">Trend Tracking</span>
               </motion.div>
             </div>
          </div>
        </section>



        {/* Stats Section with Animated Counters */}
        <section className="py-20 bg-gray-50 dark:bg-bg-dark transition-colors duration-500 ease-out border-t border-gray-200 dark:border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="bg-white dark:bg-[#0b1120] rounded-[1.5rem] py-6 px-4 md:px-6 shadow-[0_10px_40px_rgba(0,0,0,0.04)] dark:shadow-2xl border border-gray-200 dark:border-gray-800/80 flex flex-col md:flex-row justify-between items-center md:divide-x divide-gray-200 dark:divide-gray-800/80 gap-6 md:gap-0 transition-colors duration-500">
              
              {/* Stat 1 */}
              <div className="flex items-center gap-4 px-2 lg:px-6 w-full md:w-1/4 justify-start md:justify-center group">
                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-[#11203d] flex items-center justify-center shrink-0 transition-colors duration-300 group-hover:bg-blue-100 dark:group-hover:bg-[#1a2d52]">
                  <Globe className="text-blue-600 dark:text-blue-500" size={22} strokeWidth={2} />
                </div>
                <div className="flex flex-col text-left">
                  <div className="text-2xl lg:text-3xl font-extrabold text-gray-900 dark:text-white mb-0.5 tracking-tight transition-colors duration-300">
                    <AnimatedCounter end={overview?.sources?.length || 0} duration={1.5} />
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 text-[10px] lg:text-xs font-bold uppercase tracking-wider transition-colors duration-300">News Sources</div>
                </div>
              </div>

              {/* Stat 2 */}
              <div className="flex items-center gap-4 px-2 lg:px-6 w-full md:w-1/4 justify-start md:justify-center group">
                <div className="w-12 h-12 rounded-full bg-teal-50 dark:bg-[#0d2627] flex items-center justify-center shrink-0 transition-colors duration-300 group-hover:bg-teal-100 dark:group-hover:bg-[#13383a]">
                  <FileText className="text-teal-600 dark:text-teal-400" size={22} strokeWidth={2} />
                </div>
                <div className="flex flex-col text-left">
                  <div className="text-2xl lg:text-3xl font-extrabold text-gray-900 dark:text-white mb-0.5 tracking-tight transition-colors duration-300">
                    <AnimatedCounter end={overview?.totalArticles || 0} duration={2} />
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 text-[10px] lg:text-xs font-bold uppercase tracking-wider transition-colors duration-300">Articles Analyzed</div>
                </div>
              </div>

              {/* Stat 3 */}
              <div className="flex items-center gap-4 px-2 lg:px-6 w-full md:w-1/4 justify-start md:justify-center group">
                <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-[#11203d] flex items-center justify-center shrink-0 transition-colors duration-300 group-hover:bg-blue-100 dark:group-hover:bg-[#1a2d52]">
                  <BarChart2 className="text-blue-600 dark:text-blue-500" size={22} strokeWidth={2} />
                </div>
                <div className="flex flex-col text-left">
                  <div className="text-2xl lg:text-3xl font-extrabold text-gray-900 dark:text-white mb-0.5 tracking-tight transition-colors duration-300">
                    <AnimatedCounter key={accuracy} end={accuracy} suffix="%" duration={2.5} />
                  </div>
                  <div title={accuracyNote} className="text-gray-500 dark:text-gray-400 text-[10px] lg:text-xs font-bold uppercase tracking-wider transition-colors duration-300">Bias Model Accuracy</div>
                </div>
              </div>

              {/* Stat 4 */}
              <div className="flex items-center gap-4 px-2 lg:px-6 w-full md:w-1/4 justify-start md:justify-center group">
                <div className="w-12 h-12 rounded-full bg-red-50 dark:bg-[#3d1616] flex items-center justify-center shrink-0 transition-colors duration-300 group-hover:bg-red-100 dark:group-hover:bg-[#521d1d]">
                  <Split className="text-red-600 dark:text-red-500" size={22} strokeWidth={2} />
                </div>
                <div className="flex flex-col text-left">
                  <div className="text-2xl lg:text-3xl font-extrabold text-gray-900 dark:text-white mb-0.5 tracking-tight transition-colors duration-300">
                    <AnimatedCounter end={overview?.comparisons || 0} duration={2} />
                  </div>
                  <div className="text-gray-500 dark:text-gray-400 text-[10px] lg:text-xs font-bold uppercase tracking-wider transition-colors duration-300">Stories Compared</div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* How It Works (replaces made-up testimonials) */}
        <section className="py-20 bg-[#0b1120] transition-colors duration-500 ease-out">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-bold text-center text-white mb-16 tracking-tight">How TruthLens Works</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { n: 1, icon: <Globe className="text-blue-500" size={22} />, title: 'Collect', text: `A Scrapy crawler collects articles from ${overview?.sources?.length ? overview.sources.map((x) => x.name).join(', ').replace(/, ([^,]*)$/, ' and $1') : 'Pakistani news outlets'}, cleans them and keeps every earlier version of an article.` },
                { n: 2, icon: <Brain className="text-purple-400" size={22} />, title: 'Analyse', text: 'A DeBERTa model scores every sentence for biased wording, and other models add sentiment and the people, places and organisations mentioned.' },
                { n: 3, icon: <Split className="text-emerald-400" size={22} />, title: 'Compare', text: 'Sentence-BERT finds the same story in different outlets and shows what each one words differently or leaves out.' },
              ].map((step) => (
                <div key={step.n} className="bg-[#121c33] rounded-2xl p-8 border border-gray-800/80 shadow-lg flex flex-col">
                  <div className="flex items-center gap-4 mb-5">
                    <div className="w-12 h-12 rounded-full bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-lg">
                      {step.n}
                    </div>
                    <div className="flex items-center gap-2">
                      {step.icon}
                      <p className="text-white font-semibold text-lg">{step.title}</p>
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

      </PageTransition>

      <Footer />
    </div>
  );
};

export default LandingPage;

