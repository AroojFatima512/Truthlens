import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../components/common/Sidebar';
import { useAuth } from '../context/AuthContext';
import { 
  MessageSquare, ShieldCheck, Menu, Star, ThumbsUp, Lightbulb, 
  AlertTriangle, ChevronRight, ChevronDown, Send, Mail, FileText,
  Archive
} from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { submitFeedback, fetchMyFeedback } from '../services/feedbackService';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { staggerChildren: 0.1, delayChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } }
};

const FeedbackPage = () => {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  
  // Form State
  const [feedbackType, setFeedbackType] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // This reader's own feedback only (from MongoDB, newest first)
  const [recentFeedback, setRecentFeedback] = useState([]);

  useEffect(() => {
    fetchMyFeedback()
      .then((data) => setRecentFeedback(data || []))
      .catch((err) => console.error('Failed to fetch feedback:', err));
  }, []);

  // FAQ State
  const [openFaq, setOpenFaq] = useState(null);

  const getFeedbackStyles = (type) => {
    switch (type) {
      case 'Suggestion':
        return { icon: Lightbulb, color: 'text-amber-500', bgColor: 'bg-amber-500/10', badgeClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
      case 'Issue':
        return { icon: AlertTriangle, color: 'text-red-500', bgColor: 'bg-red-500/10', badgeClass: 'text-red-500 bg-red-500/10 border-red-500/20' };
      case 'Compliment':
      case 'Positive':
        return { icon: ThumbsUp, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10', badgeClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
      default:
        return { icon: MessageSquare, color: 'text-blue-500', bgColor: 'bg-blue-500/10', badgeClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20' };
    }
  };

  const handleReset = () => {
    setFeedbackType('');
    setSubject('');
    setMessage('');
    setRating(0);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!feedbackType || !subject || !message || rating === 0) {
      toast.error('Please fill in all required fields and leave a rating.');
      return;
    }
    
    setIsSubmitting(true);
    
    // Simulate slight network delay for better UX and animation
    setTimeout(async () => {
      const style = getFeedbackStyles(feedbackType);
      const newFeedbackData = {
        type: feedbackType === 'Compliment' ? 'Positive' : feedbackType,
        color: style.color,
        bgColor: style.bgColor,
        badgeClass: style.badgeClass,
        title: subject,
        desc: message,
        rating
      };

      try {
        const saved = await submitFeedback(newFeedbackData);   // the backend takes the sender from the login token
        setRecentFeedback(prev => [saved, ...prev]);
        toast.success('Thank you! Your feedback has been submitted.');
        handleReset();
      } catch (err) {
        toast.error('Failed to submit feedback. Please try again.');
        console.error(err);
      } finally {
        setIsSubmitting(false);
      }
    }, 500);
  };

  // Dynamic stats calculated directly from submitted feedback
  const totalFeedback = recentFeedback.length;
  const positiveCount = recentFeedback.filter(f => f.type === 'Positive').length;
  const suggestionCount = recentFeedback.filter(f => f.type === 'Suggestion').length;
  const issueCount = recentFeedback.filter(f => f.type === 'Issue').length;
  const resolvedCount = recentFeedback.filter(f => f.type === 'Issue' && f.status === 'resolved').length;   // set by an admin
  const positivePercentage = totalFeedback > 0 ? Math.round((positiveCount / totalFeedback) * 100) : 0;

  const faqs = [
    { id: 1, question: 'How is bias score calculated?', answer: 'Each sentence is scored by a DeBERTa model fine-tuned on the MBIC media-bias dataset. The article score is the average probability that its sentences use biased wording, shown as a percentage.' },
    { id: 2, question: 'How can I report an incorrect result?', answer: 'You can use the feedback form on this page to report specific articles. Select "Issue" as the type and provide the article link.' },
    { id: 3, question: 'How do I delete my account?', answer: 'Open Settings from the sidebar, then Account Settings > Delete Account. You need to enter your password; the account is removed permanently.' },
    { id: 4, question: 'Where can I view my feedback history?', answer: 'Click "My Feedback History" at the top right of this page. It shows each item and whether an admin has resolved it.' }
  ];

  return (
    <div className="min-h-[100dvh] flex flex-col bg-transparent font-sans text-white overflow-hidden selection:bg-blue-500/30">
      {/* Mobile Header */}
      <div className="lg:hidden flex items-center justify-between p-4 bg-[#0a0505] border-b border-gray-800 shadow-sm z-30">
        <div className="flex items-center gap-2">
          <ShieldCheck className="text-blue-600" size={28} />
          <span className="text-xl font-bold tracking-tight text-white">Truth<span className="text-blue-600">Lens</span></span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors">
          <Menu size={24} />
        </button>
      </div>
      
      <div className="flex flex-1 overflow-hidden w-full relative">
        <Sidebar isOpen={sidebarOpen} closeSidebar={() => setSidebarOpen(false)} />
        
        {/* Main background glow effect */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[300px] bg-blue-600/10 blur-[120px] rounded-full pointer-events-none" />

        <main className="flex-1 overflow-y-auto lg:overflow-hidden p-4 lg:p-8 hide-scrollbar relative z-10">
          <motion.div 
            className="max-w-7xl mx-auto h-full flex flex-col"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            
            {/* Header Section */}
            <motion.div variants={itemVariants} className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 shrink-0">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2 tracking-tight flex items-center gap-3">
                  Feedback 
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Beta
                  </span>
                </h1>
                <p className="text-gray-400 text-sm max-w-2xl">We highly value your feedback! Help us improve TruthLens by sharing your thoughts, ideas, or reporting issues you encounter.</p>
              </div>
              <button 
                onClick={() => navigate('/feedback/history')}
                className="flex items-center gap-2 bg-bg-card/50 backdrop-blur-sm border border-gray-700/50 hover:bg-gray-800 hover:border-gray-600 text-gray-200 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-lg"
              >
                <FileText size={18} className="text-blue-400" /> My Feedback History <ChevronRight size={16} className="text-gray-500" />
              </button>
            </motion.div>

            {/* Stat Cards */}
            <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 shrink-0">
              {/* Total */}
              <div className="bg-bg-card/80 backdrop-blur-md border border-gray-800/60 rounded-2xl p-5 flex items-start gap-4 shadow-xl hover:shadow-indigo-500/5 hover:border-gray-700 transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center shrink-0 border border-indigo-500/20 shadow-inner">
                  <MessageSquare size={22} className="text-indigo-400" />
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-xs text-gray-400 mb-0.5 font-medium">Your Feedback</p>
                  <p className="text-3xl font-bold text-white tracking-tight">{totalFeedback}</p>
                  <p className="text-[11px] text-gray-500 mt-1">All feedback you have sent</p>
                </div>
              </div>
              {/* Positive */}
              <div className="bg-bg-card/80 backdrop-blur-md border border-gray-800/60 rounded-2xl p-5 flex items-start gap-4 shadow-xl hover:shadow-emerald-500/5 hover:border-gray-700 transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20 shadow-inner">
                  <ThumbsUp size={22} className="text-emerald-500" />
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-xs text-gray-400 mb-0.5 font-medium">Positive Feedback</p>
                  <p className="text-3xl font-bold text-white tracking-tight">{positiveCount}</p>
                  <p className="text-[11px] text-emerald-500 mt-1 font-medium">{positivePercentage}% of total feedback</p>
                </div>
              </div>
              {/* Suggestions */}
              <div className="bg-bg-card/80 backdrop-blur-md border border-gray-800/60 rounded-2xl p-5 flex items-start gap-4 shadow-xl hover:shadow-amber-500/5 hover:border-gray-700 transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-inner">
                  <Lightbulb size={22} className="text-amber-500" />
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-xs text-gray-400 mb-0.5 font-medium">Suggestions</p>
                  <p className="text-3xl font-bold text-white tracking-tight">{suggestionCount}</p>
                  <p className="text-[11px] text-amber-500 mt-1 font-medium">Ideas to improve</p>
                </div>
              </div>
              {/* Issues */}
              <div className="bg-bg-card/80 backdrop-blur-md border border-gray-800/60 rounded-2xl p-5 flex items-start gap-4 shadow-xl hover:shadow-red-500/5 hover:border-gray-700 transition-all duration-300">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0 border border-red-500/20 shadow-inner">
                  <AlertTriangle size={22} className="text-red-500" />
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-xs text-gray-400 mb-0.5 font-medium">Issues Reported</p>
                  <p className="text-3xl font-bold text-white tracking-tight">{issueCount}</p>
                  <p className="text-[11px] text-gray-500 mt-1">Resolved: <span className="text-gray-300 font-semibold">{resolvedCount}</span></p>
                </div>
              </div>
            </motion.div>

            <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
              
              {/* Left Column: Form */}
              <motion.div variants={itemVariants} className="lg:w-[55%] bg-bg-card/80 backdrop-blur-md border border-gray-800/60 rounded-2xl p-6 lg:p-8 flex flex-col min-h-0 shadow-xl relative overflow-hidden">
                {/* Decorative background accent inside the form card */}
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-[60px]" />
                
                <div className="shrink-0 mb-6 relative z-10">
                  <h2 className="text-xl font-bold text-white mb-1.5 flex items-center gap-2">
                    <MessageSquare size={20} className="text-blue-500" /> Share Your Feedback
                  </h2>
                  <p className="text-sm text-gray-400">What's on your mind? We'd love to hear from you.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5 flex-1 overflow-y-auto pr-3 hide-scrollbar relative z-10 custom-scroll">
                  {/* Type */}
                  <div className="group">
                    <label className="block text-sm font-medium text-gray-300 mb-2 group-focus-within:text-blue-400 transition-colors">
                      Feedback Type <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <select 
                        value={feedbackType}
                        onChange={(e) => setFeedbackType(e.target.value)}
                        className="w-full bg-gray-900/50 border border-gray-700/80 rounded-xl px-4 py-3.5 text-sm text-gray-200 appearance-none focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                      >
                        <option value="" disabled>Select feedback type</option>
                        <option value="Suggestion">💡 Suggestion</option>
                        <option value="Issue">⚠️ Report an Issue</option>
                        <option value="Question">❓ Question</option>
                        <option value="Compliment">✨ Compliment</option>
                      </select>
                      <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none group-focus-within:text-blue-400 transition-colors" />
                    </div>
                  </div>

                  {/* Subject */}
                  <div className="group">
                    <label className="block text-sm font-medium text-gray-300 mb-2 group-focus-within:text-blue-400 transition-colors">
                      Subject <span className="text-red-500">*</span>
                    </label>
                    <input 
                      type="text" 
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Enter a brief subject"
                      className="w-full bg-gray-900/50 border border-gray-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                    />
                  </div>

                  {/* Message */}
                  <div className="group">
                    <label className="block text-sm font-medium text-gray-300 mb-2 group-focus-within:text-blue-400 transition-colors">
                      Your Message <span className="text-red-500">*</span>
                    </label>
                    <textarea 
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Provide as much detail as possible..."
                      rows={5}
                      className="w-full bg-gray-900/50 border border-gray-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all resize-none shadow-inner leading-relaxed"
                    />
                  </div>

                  {/* Rating */}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-3">Rate Your Experience</label>
                    <div className="flex items-center gap-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          type="button"
                          className="focus:outline-none"
                          onMouseEnter={() => setHoverRating(star)}
                          onMouseLeave={() => setHoverRating(0)}
                          onClick={() => setRating(star)}
                        >
                          <Star 
                            size={32} 
                            strokeWidth={1.5}
                            className={`transition-all duration-200 ${(hoverRating || rating) >= star ? 'fill-blue-500 text-blue-500 scale-110 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'text-gray-600 hover:text-gray-400'}`} 
                          />
                        </button>
                      ))}
                      <span className="ml-3 text-xs text-gray-500 bg-gray-800/50 px-3 py-1.5 rounded-lg border border-gray-800">
                        {rating === 0 ? "Click to rate" : `${rating} out of 5 stars`}
                      </span>
                    </div>
                  </div>

                  {/* Buttons */}
                  <div className="pt-6 flex items-center justify-end gap-4 shrink-0 border-t border-gray-800/60 mt-4">
                    <button 
                      type="button" 
                      onClick={handleReset}
                      className="px-6 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-white bg-transparent border border-gray-700 hover:bg-gray-800 transition-all hover:border-gray-500"
                    >
                      Reset
                    </button>
                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all shadow-lg
                        ${isSubmitting ? 'bg-blue-600/50 cursor-wait' : 'bg-blue-600 hover:bg-blue-500 hover:shadow-blue-500/25 active:scale-[0.98]'}`}
                    >
                      {isSubmitting ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                      {isSubmitting ? 'Sending...' : 'Send Feedback'}
                    </button>
                  </div>
                </form>
              </motion.div>

              {/* Right Column: Lists */}
              <motion.div variants={itemVariants} className="lg:w-[45%] flex flex-col gap-6 min-h-0">
                
                {/* Recent Feedback */}
                <div className="bg-bg-card/80 backdrop-blur-md border border-gray-800/60 rounded-2xl overflow-hidden flex flex-col flex-1 min-h-0 shadow-xl">
                  <div className="px-6 py-4 border-b border-gray-800/60 flex justify-between items-center shrink-0 bg-gray-900/30">
                    <h3 className="text-[15px] font-bold text-white flex items-center gap-2">
                      <MessageSquare size={16} className="text-gray-400" /> Your Recent Feedback
                    </h3>
                    <button onClick={() => navigate('/feedback/history')} className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded hover:bg-blue-500/10 transition-colors">View all</button>
                  </div>
                  
                  <div className="overflow-y-auto hide-scrollbar flex-1 relative custom-scroll p-2">
                    <AnimatePresence mode="popLayout">
                      {recentFeedback.length === 0 ? (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0 }}
                          className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
                        >
                          <div className="w-16 h-16 rounded-full bg-gray-800/50 border border-gray-700/50 flex items-center justify-center mb-4">
                            <Archive size={28} className="text-gray-500" />
                          </div>
                          <p className="text-sm font-medium text-gray-300 mb-1">No feedback yet</p>
                          <p className="text-xs text-gray-500">Feedback you send appears here, with its status.</p>
                        </motion.div>
                      ) : (
                        recentFeedback.map((item) => {
                          const IconComponent = getFeedbackStyles(item.type).icon;
                          return (
                          <motion.div 
                            key={item.id}
                            initial={{ opacity: 0, y: -20, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            className="p-4 mb-2 rounded-xl border border-transparent hover:border-gray-700/50 hover:bg-gray-800/30 transition-all group"
                          >
                            <div className="flex gap-4">
                              <div className={`w-10 h-10 rounded-full ${item.bgColor} flex items-center justify-center shrink-0 border border-white/5`}>
                                <IconComponent size={18} className={item.color} />
                              </div>
                              <div className="flex-1 min-w-0 pt-0.5">
                                <div className="flex justify-between items-start mb-1 gap-2">
                                  <h4 className="text-sm font-bold text-gray-200 truncate group-hover:text-white transition-colors">{item.title}</h4>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${item.badgeClass} shrink-0 uppercase tracking-wider`}>
                                    {item.type}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-400 line-clamp-2 mb-2 leading-relaxed">{item.desc}</p>
                                <p className="text-[11px] text-gray-500 font-medium">
                                  {item.createdAt ? new Date(item.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : item.time}
                                  {' · '}<span className={item.status === 'resolved' ? 'text-emerald-400' : 'text-amber-400'}>{item.status === 'resolved' ? 'Resolved' : 'Pending review'}</span>
                                </p>
                              </div>
                            </div>
                          </motion.div>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </div>
                </div>

                {/* FAQ */}
                <div className="bg-bg-card/80 backdrop-blur-md border border-gray-800/60 rounded-2xl overflow-hidden shrink-0 shadow-xl">
                  <div className="px-6 py-4 border-b border-gray-800/60 flex justify-between items-center bg-gray-900/30">
                    <h3 className="text-[15px] font-bold text-white flex items-center gap-2">Frequently Asked Questions</h3>
                    <button className="text-xs text-blue-400 hover:text-blue-300 font-medium">View all</button>
                  </div>
                  <div className="divide-y divide-gray-800/60">
                    {faqs.map((faq) => (
                      <div key={faq.id} className="bg-transparent">
                        <button 
                          onClick={() => setOpenFaq(openFaq === faq.id ? null : faq.id)}
                          className="w-full px-6 py-3.5 flex items-center justify-between text-left hover:bg-gray-800/30 transition-colors"
                        >
                          <span className="text-sm font-medium text-gray-300 pr-4">{faq.question}</span>
                          <ChevronDown size={16} className={`text-gray-500 transition-transform ${openFaq === faq.id ? 'rotate-180' : ''}`} />
                        </button>
                        {openFaq === faq.id && (
                          <div className="px-6 pb-4 text-xs text-gray-400 leading-relaxed bg-gray-800/10">
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </motion.div>
            </div>

          </motion.div>
        </main>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scroll::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.1);
          border-radius: 10px;
        }
        .custom-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
        .custom-scroll::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
        @keyframes shine {
          100% {
            left: 200%;
          }
        }
        .animate-shine {
          animation: shine 1.5s ease-in-out infinite;
        }
      `}} />
    </div>
  );
};

export default FeedbackPage;
