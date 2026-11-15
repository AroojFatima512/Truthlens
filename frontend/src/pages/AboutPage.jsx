import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import { ShieldCheck, Target, Eye, Globe, Brain, Split, ChevronRight, Activity, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchOverview, fetchModelMetrics } from '../services/newsService';

const pct = (v) => (typeof v === 'number' ? Math.round((v <= 1 ? v * 100 : v) * 10) / 10 : null);
const listNames = (names) => names.join(', ').replace(/, ([^,]*)$/, ' and $1');
const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

// Layout: screen-high parts on a laptop. 1: About TruthLens, 2: The Vision, 3: How It Works,
// 4: The Team and the supervisors, then the footer. Home's "See How It Works" opens /about#how-it-works.
const AboutPage = () => {
  const { hash } = useLocation();
  const [overview, setOverview] = useState(null);
  const [biasModel, setBiasModel] = useState(null);
  useEffect(() => {
    fetchOverview().then(setOverview).catch(() => {});
    fetchModelMetrics().then((list) => setBiasModel(list.find((m) => m.model === 'bias-sentence') || null)).catch(() => {});
  }, []);
  // arriving with #how-it-works (or another section): scroll to it once the page has rendered
  useEffect(() => {
    if (!hash) return undefined;
    const t = setTimeout(() => jump(hash.slice(1)), 150);
    return () => clearTimeout(t);
  }, [hash]);

  const outlets = overview?.sources?.length ? listNames(overview.sources.map((x) => x.name)) : 'Dawn, Geo News, Express Tribune, The Nation and Aaj News';
  const accuracy = pct(biasModel?.accuracy);
  const steps = [
    { icon: Globe, color: 'text-blue-500', title: 'Collect', tools: 'Scrapy · MongoDB',
      text: `A crawler collects new articles from ${outlets}, cleans them and keeps every earlier version of an article when an outlet edits it.` },
    { icon: Brain, color: 'text-purple-400', title: 'Analyse', tools: accuracy ? `DeBERTa · ${accuracy}% bias accuracy` : 'DeBERTa · sentiment · NER',
      text: 'A fine-tuned DeBERTa model scores every sentence for biased wording; other models add the tone and the people, places and organisations mentioned.' },
    { icon: Split, color: 'text-emerald-400', title: 'Compare', tools: 'Sentence-BERT',
      text: 'The same story from different outlets is grouped together, showing which words each outlet changed and which names it left out.' },
    { icon: Eye, color: 'text-amber-400', title: 'Explain', tools: 'Captum · full bias report',
      text: 'Captum shows which words drove each biased sentence, and the full report breaks the score into five bias dimensions you can check yourself.' },
  ];
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.15, delayChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-bg-dark transition-colors duration-500 ease-out overflow-x-clip">
      <Navbar />
      
      <main className="flex-grow relative">
        {/* Animated Background Blobs for the entire page */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
          <motion.div 
            animate={{ 
              x: [0, 100, 0],
              y: [0, -50, 0],
              rotate: [0, 90, 0],
              scale: [1, 1.2, 1]
            }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-[10%] -right-[5%] w-[500px] h-[500px] bg-blue-500/10 dark:bg-blue-600/10 rounded-full blur-[100px]"
          />
          <motion.div 
            animate={{ 
              x: [0, -100, 0],
              y: [0, 100, 0],
              rotate: [0, -90, 0],
              scale: [1, 1.5, 1]
            }}
            transition={{ duration: 25, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="absolute top-[40%] -left-[10%] w-[600px] h-[600px] bg-purple-500/10 dark:bg-purple-600/10 rounded-full blur-[120px]"
          />
        </div>

        {/* Screen 1: About TruthLens */}
        <section className="relative border-b border-gray-200/50 dark:border-gray-800/50 min-h-[calc(100dvh-4rem)] flex flex-col items-center justify-center overflow-hidden bg-white/50 dark:bg-bg-card/50 backdrop-blur-sm z-10 transition-colors duration-500 py-10">
          <div className="absolute inset-0 bg-[url('/ai_news_bg.png')] bg-cover bg-center opacity-10 dark:opacity-5 pointer-events-none mix-blend-luminosity"></div>
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-flex items-center justify-center p-5 bg-primary/10 rounded-3xl mb-7 shadow-[0_0_40px_rgba(26,115,232,0.3)] border border-primary/20 backdrop-blur-md"
            >
              <ShieldCheck className="text-primary drop-shadow-md" size={52} strokeWidth={1.5} />
            </motion.div>
            <h1 className="font-extrabold text-gray-900 dark:text-white mb-5 tracking-tight leading-[1.08] text-[clamp(2.25rem,min(9vh,6.5vw),4.25rem)]">
              About <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">TruthLens</span>
            </h1>
            <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light leading-relaxed">
              An AI-powered media bias detection and cross-source comparison platform.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 text-sm">
              {[
                ['#vision', 'The Vision', Target, 'border-blue-400/40 bg-blue-500/15 text-blue-600 dark:text-blue-300 hover:bg-blue-500/25 shadow-[0_0_20px_rgba(59,130,246,0.15)]'],
                ['#how-it-works', 'How It Works', Activity, 'border-purple-400/40 bg-purple-500/15 text-purple-600 dark:text-purple-300 hover:bg-purple-500/25 shadow-[0_0_20px_rgba(168,85,247,0.15)]'],
                ['#team', 'The Team', Users, 'border-emerald-400/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/25 shadow-[0_0_20px_rgba(16,185,129,0.15)]'],
              ].map(([href, label, Icon, style]) => (
                <a key={href} href={href} onClick={(e) => { e.preventDefault(); jump(href.slice(1)); }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border font-medium backdrop-blur-sm transition-all hover:-translate-y-0.5 ${style}`}>
                  <Icon size={15} /> {label}
                </a>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Screen 2: The Vision */}
        <motion.section id="vision"
          variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }}
          className="relative z-10 min-h-[calc(100dvh-4rem)] scroll-mt-16 flex flex-col justify-center max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center"
        >
          <motion.h2 variants={itemVariants} className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-6 flex items-center justify-center gap-4">
            <Target className="text-primary" size={32} /> The Vision
          </motion.h2>
          <motion.div variants={itemVariants} className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-md border border-gray-200/50 dark:border-gray-800/50 p-6 md:p-8 rounded-3xl shadow-xl shadow-gray-200/20 dark:shadow-none">
            <p className="text-base md:text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-5">
              Modern news is rapid and often fraught with subjective framing. TruthLens uses advanced <strong className="text-primary">Natural Language Processing (NLP)</strong> to automatically analyze articles from multiple outlets, revealing exactly how the same story is altered by different publishers.
            </p>
            <p className="text-base md:text-lg text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
              Our mission is to restore media literacy by highlighting hidden biases in real-time.
            </p>
          </motion.div>
        </motion.section>

        {/* Screen 3: How It Works (the only place it is explained; Home links here) */}
        <motion.section id="how-it-works"
          variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }}
          className="relative z-10 min-h-[calc(100dvh-4rem)] scroll-mt-16 flex flex-col justify-center max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
        >
          <motion.div variants={itemVariants} className="text-center mb-5 lg:mb-7">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-4">
              <Activity className="text-primary" size={32} /> How It Works
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">From a news website to a highlighted, explained bias score, in four steps.</p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative">
            <motion.div
              initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }}
              transition={{ duration: 1.5, delay: 0.5, ease: 'easeOut' }}
              className="hidden lg:block absolute top-1/2 left-10 right-10 h-0.5 bg-gradient-to-r from-primary/10 via-primary/50 to-primary/10 -translate-y-1/2 z-0 origin-left"
            />
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                variants={itemVariants}
                whileHover={{ y: -6 }}
                className="bg-white/80 dark:bg-bg-card/80 backdrop-blur-md p-5 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 relative z-10 shadow-lg hover:shadow-primary/20 hover:border-primary/50 transition-all duration-300 group flex flex-col"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-xl flex items-center justify-center border border-gray-200 dark:border-gray-700 group-hover:border-primary/40 group-hover:shadow-[0_0_20px_rgba(26,115,232,0.3)] transition-all">
                    <step.icon className={step.color} size={19} />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">{i + 1}. {step.title}</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">{step.text}</p>
                <p className="mt-auto pt-3 text-[11px] font-semibold uppercase tracking-wider text-primary/80">{step.tools}</p>
                {i < steps.length - 1 && <ChevronRight className="hidden lg:block absolute -right-[1.15rem] top-1/2 -translate-y-1/2 text-primary/40" size={20} />}
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Screen 4: The Team and supervisors; the footer follows */}
        <div id="team" className="relative z-10 min-h-[calc(100dvh-4rem)] scroll-mt-16 flex flex-col">
          <motion.section
            variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
            className="flex-1 flex flex-col justify-center w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3"
          >
            <div className="relative overflow-hidden rounded-[2rem] border border-gray-200/50 dark:border-gray-800/60 bg-white/40 dark:bg-bg-card/40 backdrop-blur-xl px-5 py-4 md:px-8 xl:py-6 shadow-2xl shadow-gray-200/15 dark:shadow-[0_0_30px_rgba(0,0,0,0.4)] transition-colors duration-500">
              <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-blue-500/60 to-transparent" />

              <motion.div variants={itemVariants} className="relative text-center mb-3 xl:mb-5">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-1.5">The Team</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                  Developed as an FYP at COMSATS University Islamabad, Lahore Campus <br className="hidden md:block" />(Department of Computer Science | Session 2023–2027).
                </p>
              </motion.div>

              <div className="relative grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto mb-3 xl:mb-4">
                {[
                  { initials: 'AF', name: 'Arooj Fatima', role: 'Group Leader | SP23-BCS-027', tag: 'AI Models & Crawler' },
                  { initials: 'AY', name: 'Areeba Yasmeen', role: 'Team Member | SP23-BCS-022', tag: 'Backend & Security' },
                ].map((m) => (
                  <motion.div
                    key={m.name}
                    variants={itemVariants}
                    whileHover={{ y: -4 }}
                    className="relative overflow-hidden rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-bg-dark px-5 py-4 xl:py-5 text-center transition-all duration-300 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
                  >
                    <div className="w-12 h-12 xl:w-14 xl:h-14 mx-auto mb-2 xl:mb-3 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-lg font-extrabold text-primary">
                      {m.initials}
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{m.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 mb-2.5">{m.role}</p>
                    <span className="inline-block text-[11px] font-bold px-3.5 py-1 rounded-full uppercase tracking-wide text-primary bg-primary/10">{m.tag}</span>
                  </motion.div>
                ))}
              </div>

              <motion.div variants={itemVariants} className="relative max-w-3xl mx-auto overflow-hidden rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-bg-dark px-6 py-3 xl:py-4 text-center">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/60"></div>
                <h3 className="text-[11px] font-bold uppercase tracking-widest mb-2 xl:mb-3 text-gray-400 dark:text-gray-500">Project Supervisors</h3>
                <div className="flex flex-col sm:flex-row justify-center gap-4 md:gap-14">
                  <div className="group">
                    <p className="font-bold text-base text-gray-900 dark:text-white group-hover:text-primary transition-colors">Sir Usman Akram</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 font-medium">Supervisor (Assistant Professor)</p>
                  </div>
                  <div className="group">
                    <p className="font-bold text-base text-gray-900 dark:text-white group-hover:text-primary transition-colors">Sir Abid Sohail Bhutta</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 font-medium">Co-Supervisor (Assistant Professor)</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.section>
        </div>
        <Footer compact />
      </main>
    </div>
  );
};

export default AboutPage;
