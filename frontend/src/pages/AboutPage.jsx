import React from 'react';
import Navbar from '../components/common/Navbar';
import Footer from '../components/common/Footer';
import { ShieldCheck, Target, Eye, Database, Code, Cpu, ChevronRight, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

const AboutPage = () => {
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
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-bg-dark transition-colors duration-500 ease-out overflow-hidden">
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

        {/* Header Section */}
        <div className="relative border-b border-gray-200/50 dark:border-gray-800/50 min-h-[65vh] flex flex-col items-center justify-center overflow-hidden bg-white/50 dark:bg-bg-card/50 backdrop-blur-sm z-10 transition-colors duration-500 py-10">
          <div className="absolute inset-0 bg-[url('/ai_news_bg.png')] bg-cover bg-center opacity-10 dark:opacity-5 pointer-events-none mix-blend-luminosity"></div>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
          >
            <motion.div 
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="inline-flex items-center justify-center p-5 bg-primary/10 rounded-3xl mb-8 shadow-[0_0_40px_rgba(26,115,232,0.3)] border border-primary/20 backdrop-blur-md"
            >
              <ShieldCheck className="text-primary drop-shadow-md" size={56} strokeWidth={1.5} />
            </motion.div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 dark:text-white mb-5 tracking-tight">
              About <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400">TruthLens</span>
            </h1>
            <p className="text-base md:text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto font-light leading-relaxed">
              An AI-powered media bias detection and cross-source comparison platform.
            </p>
          </motion.div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-0 relative z-10">
          
          {/* The Vision */}
          <motion.section 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="text-center max-w-3xl mx-auto flex flex-col justify-center py-10"
          >
            <motion.h2 variants={itemVariants} className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-8 flex items-center justify-center gap-4">
              <Target className="text-primary" size={32} /> The Vision
            </motion.h2>
            <motion.div variants={itemVariants} className="bg-white/60 dark:bg-gray-900/40 backdrop-blur-md border border-gray-200/50 dark:border-gray-800/50 p-8 rounded-3xl shadow-xl shadow-gray-200/20 dark:shadow-none">
              <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed mb-6">
                Modern news is rapid and often fraught with subjective framing. TruthLens uses advanced <strong className="text-primary">Natural Language Processing (NLP)</strong> to automatically analyze articles from multiple outlets, revealing exactly how the same story is altered by different publishers.
              </p>
              <p className="text-lg text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                Our mission is to restore media literacy by highlighting hidden biases in real-time.
              </p>
            </motion.div>
          </motion.section>

          {/* How It Works */}
          <motion.section
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="flex flex-col justify-center py-8"
          >
            <motion.div variants={itemVariants} className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white flex items-center justify-center gap-4 mb-4">
                <Activity className="text-primary" size={32} /> How It Works
              </h2>
            </motion.div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
              {/* Animated Desktop Flow Connector Line */}
              <motion.div 
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
                className="hidden md:block absolute top-1/2 left-10 right-10 h-0.5 bg-gradient-to-r from-primary/10 via-primary/50 to-primary/10 -translate-y-1/2 z-0 origin-left"
              />

              {[
                { icon: Database, title: "1. Crawling", desc: "Automated fetch from top outlets." },
                { icon: Cpu, title: "2. AI Scan", desc: "BERT/RoBERTa bias models." },
                { icon: Code, title: "3. Comparison", desc: "Identify omitted facts & diffs." },
                { icon: Eye, title: "4. Insights", desc: "Explainable highlighted metrics." }
              ].map((step, i) => (
                <motion.div 
                  key={i}
                  variants={itemVariants}
                  whileHover={{ y: -8, scale: 1.01 }}
                  className="bg-white/80 dark:bg-bg-card/80 backdrop-blur-md p-6 rounded-2xl border border-gray-200/50 dark:border-gray-700/50 relative z-10 shadow-lg hover:shadow-primary/20 hover:border-primary/50 transition-all duration-300 group"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-900 rounded-xl flex items-center justify-center mb-4 border border-gray-200 dark:border-gray-700 group-hover:border-primary/40 group-hover:shadow-[0_0_20px_rgba(26,115,232,0.3)] transition-all">
                    <step.icon className="text-primary" size={20} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{step.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 font-medium">{step.desc}</p>
                  {i < 3 && <ChevronRight className="hidden md:block absolute -right-6 top-1/2 -translate-y-1/2 text-primary/40" size={24} />}
                </motion.div>
              ))}
            </div>
          </motion.section>

          {/* The Team */}
          <motion.section 
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="flex flex-col justify-center py-8"
          >
            <div className="bg-white/40 dark:bg-bg-card/40 backdrop-blur-xl p-6 rounded-[2rem] border border-gray-200/50 dark:border-gray-800/50 shadow-2xl shadow-gray-200/15 dark:shadow-[0_0_30px_rgba(0,0,0,0.4)] transition-colors duration-500 relative overflow-hidden">
            {/* Decorative background within team card */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 opacity-50" />
            
            <motion.div variants={itemVariants} className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">The Team</h2>
              <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto text-base leading-relaxed">
                Developed as an FYP at COMSATS University Islamabad, Lahore Campus <br className="hidden md:block"/> (Department of Computer Science | Session 2023–2027).
              </p>
            </motion.div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto mb-6">
              {[
                { initials: "AF", name: "Arooj Fatima", role: "Group Leader | SP23-BCS-027", tag: "UI/UX & Architecture" },
                { initials: "AY", name: "Areeba Yasmeen", role: "Team Member | SP23-BCS-022", tag: "Data Integration" }
              ].map((member, i) => (
                <motion.div 
                  key={i}
                  variants={itemVariants}
                  whileHover={{ scale: 1.03 }}
                  className="bg-white dark:bg-bg-dark p-5 rounded-3xl border border-gray-200 dark:border-gray-700 text-center hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300 group relative overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  <div className="w-16 h-16 bg-gradient-to-br from-primary/10 to-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 text-xl font-extrabold text-primary group-hover:from-primary group-hover:to-indigo-600 group-hover:text-white transition-all duration-500 shadow-inner relative z-10">
                    {member.initials}
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1 relative z-10">{member.name}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 relative z-10">{member.role}</p>
                  <span className="text-xs font-bold text-primary bg-primary/10 px-4 py-2 rounded-full relative z-10 uppercase tracking-wide">
                    {member.tag}
                  </span>
                </motion.div>
              ))}
            </div>

            <motion.div variants={itemVariants} className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-900/80 dark:to-bg-dark rounded-3xl p-6 border border-gray-200 dark:border-gray-800 text-center max-w-2xl mx-auto relative overflow-hidden shadow-inner">
              <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-blue-400 to-indigo-600"></div>
              <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-4">Project Supervisors</h3>
              <div className="flex flex-col sm:flex-row justify-center gap-6 md:gap-10">
                <div className="group">
                  <p className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-primary transition-colors">Sir Usman Akram</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">Supervisor (Assistant Professor)</p>
                </div>
                <div className="group">
                  <p className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-primary transition-colors">Sir Abid Sohail Bhutta</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">Co-Supervisor (Assistant Professor)</p>
                </div>
              </div>
            </motion.div>
            </div>
          </motion.section>

        </div>
      </main>

      <Footer />
    </div>
  );
};

export default AboutPage;
