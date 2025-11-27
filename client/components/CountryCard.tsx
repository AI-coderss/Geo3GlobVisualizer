import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  MessageCircle,
  Info,
  Send,
  MapPin,
  Users,
  Building2,
  GripHorizontal,
  ExternalLink,
  Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { CountryData, ChatMessage, Theme } from '../types';
import { createChatStream } from '../services/openAIService';

interface CountryCardProps {
  country: CountryData | null;
  isLoading: boolean;
  onClose: () => void;
  theme: Theme;
}

export const CountryCard: React.FC<CountryCardProps> = ({ country, isLoading, onClose, theme }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'chat'>('info');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isDark = theme === Theme.DARK;

  // Mobile Detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reset chat when country changes
  useEffect(() => {
    if (country) {
      setChatHistory([{
        id: 'welcome',
        role: 'model',
        text: `Hello! I'm your guide for **${country.name}**. Ask me anything about the local food, customs, or hidden gems!`,
        timestamp: Date.now()
      }]);
    }
    setActiveTab('info');
  }, [country]);

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, activeTab]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !country) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputMessage,
      timestamp: Date.now()
    };

    setChatHistory(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    const modelMsgId = (Date.now() + 1).toString();
    let fullResponse = '';

    // Optimistic update
    setChatHistory(prev => [...prev, {
      id: modelMsgId,
      role: 'model',
      text: '...',
      timestamp: Date.now()
    }]);

    await createChatStream(chatHistory, userMsg.text, country, (chunk) => {
      fullResponse += chunk;
      setChatHistory(prev => prev.map(msg =>
        msg.id === modelMsgId ? { ...msg, text: fullResponse } : msg
      ));
    });

    setIsTyping(false);
  };

  // Animation Variants
  const variants = {
    hidden: isMobile ? { y: '100%', opacity: 1 } : { x: '100%', opacity: 0 },
    visible: isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 },
    exit: isMobile ? { y: '100%', opacity: 1 } : { x: '100%', opacity: 0 }
  };

  if (!country && !isLoading) return null;

  // Famous people (kept safe even if types.ts not updated yet)
  const famousPeople: { name: string; knownFor?: string; link?: string }[] =
    ((country as any)?.famousPeople ?? []).filter(Boolean);

  const chipAnim = {
    initial: { y: 6, opacity: 0, scale: 0.98 },
    animate: { y: 0, opacity: 1, scale: 1 },
    exit: { y: 6, opacity: 0, scale: 0.98 },
    transition: { type: 'spring', damping: 22, stiffness: 240 }
  };

  const listItem = {
    hidden: { y: 8, opacity: 0 },
    show: (i: number) => ({
      y: 0,
      opacity: 1,
      transition: { delay: i * 0.04, type: 'spring', damping: 22, stiffness: 260 }
    })
  };

  return (
    <AnimatePresence>
      {(country || isLoading) && (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className={`fixed z-20 flex flex-col shadow-2xl backdrop-blur-xl overflow-hidden
            bottom-0 left-0 w-full h-[45vh] rounded-t-3xl border-t
            sm:top-0 sm:right-0 sm:h-full sm:w-[420px] sm:rounded-none sm:rounded-l-2xl sm:border-l sm:border-t-0
            ${isDark ? 'bg-slate-900/92 text-white border-white/10' : 'bg-white/92 text-slate-800 border-gray-200'}`}
        >
          {/* Subtle animated sheen */}
          <div className="pointer-events-none absolute inset-0">
            <div className={`absolute -top-24 -right-24 h-64 w-64 rounded-full blur-3xl opacity-25
              ${isDark ? 'bg-blue-500' : 'bg-blue-300'}`} />
            <div className={`absolute -bottom-28 -left-28 h-72 w-72 rounded-full blur-3xl opacity-20
              ${isDark ? 'bg-indigo-500' : 'bg-indigo-300'}`} />
          </div>

          {/* Mobile Drag Handle Indicator - Visible only on mobile */}
          <div
            className="relative w-full flex justify-center pt-3 pb-1 sm:hidden opacity-40 cursor-pointer"
            onClick={onClose}
            title="Close"
          >
            <div className="w-12 h-1.5 rounded-full bg-current" />
          </div>

          {/* Header */}
          <div className={`relative px-4 pb-2 pt-2 sm:p-4 flex items-center justify-between border-b shrink-0
            ${isDark ? 'border-white/10' : 'border-gray-200/50'}`}>
            {isLoading ? (
              <div className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-6 bg-gray-400 rounded" />
                <div className="h-6 w-32 bg-gray-400 rounded" />
              </div>
            ) : (
              <div className="flex items-center gap-3 overflow-hidden">
                {/* Render Flag Image or Emoji */}
                {country?.code && country.code !== '-99' ? (
                  <motion.img
                    {...chipAnim}
                    src={`https://flagcdn.com/w80/${country.code.toLowerCase()}.png`}
                    srcSet={`https://flagcdn.com/w160/${country.code.toLowerCase()}.png 2x`}
                    alt={country.name}
                    className="w-10 h-auto rounded-xl shadow-sm border border-black/10 shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <motion.span
                    {...chipAnim}
                    className="text-3xl shrink-0"
                    role="img"
                    aria-label="flag"
                  >
                    {country?.flagEmoji}
                  </motion.span>
                )}

                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-black leading-tight truncate">
                    {country?.name}
                  </h2>
                  <p className="text-xs opacity-70 truncate flex items-center gap-1">
                    <GripHorizontal size={12} className="opacity-60" />
                    {country?.capital}
                  </p>
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className={`p-2 rounded-full transition-colors shrink-0
                ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/10'}`}
              aria-label="Close"
              title="Close"
            >
              <X size={20} />
            </button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="relative flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
              <p className="text-sm opacity-70">Exploring...</p>
            </div>
          )}

          {/* Content */}
          {!isLoading && country && (
            <>
              {/* Tabs */}
              <div className={`relative flex border-b shrink-0 ${isDark ? 'border-white/10' : 'border-gray-200/50'}`}>
                <button
                  onClick={() => setActiveTab('info')}
                  className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors relative
                    ${activeTab === 'info' ? 'text-blue-500' : 'opacity-70 hover:opacity-100'}`}
                >
                  <Info size={16} /> Info
                  {activeTab === 'info' && (
                    <motion.div layoutId="underline" className="absolute bottom-0 w-full h-0.5 bg-blue-500" />
                  )}
                </button>

                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors relative
                    ${activeTab === 'chat' ? 'text-blue-500' : 'opacity-70 hover:opacity-100'}`}
                >
                  <MessageCircle size={16} /> Chat
                  {activeTab === 'chat' && (
                    <motion.div layoutId="underline" className="absolute bottom-0 w-full h-0.5 bg-blue-500" />
                  )}
                </button>
              </div>

              <div className="relative flex-1 overflow-hidden bg-transparent">
                {/* Info Tab */}
                {activeTab === 'info' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar"
                  >
                    {/* Description bubble */}
                    <motion.div
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: 'spring', damping: 22, stiffness: 240 }}
                      className={`p-4 rounded-2xl border shadow-sm
                        ${isDark ? 'bg-white/5 border-white/10' : 'bg-gray-50 border-gray-200/60'}`}
                    >
                      <div className="flex items-center gap-2 mb-2 opacity-80">
                        <Sparkles size={14} className="text-blue-500" />
                        <span className="text-[10px] uppercase font-black tracking-wider">Quick intro</span>
                      </div>
                      <p className="text-sm leading-relaxed">{country.description}</p>
                    </motion.div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                      <motion.div
                        whileHover={{ y: -2 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className={`p-3 rounded-2xl border
                          ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200/60'}`}
                      >
                        <div className="flex items-center gap-1 opacity-60 mb-1">
                          <Users size={12} />
                          <span className="text-[10px] uppercase font-black tracking-wide">Population</span>
                        </div>
                        <span className="text-sm font-bold truncate block">{country.population}</span>
                      </motion.div>

                      <motion.div
                        whileHover={{ y: -2 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className={`p-3 rounded-2xl border
                          ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200/60'}`}
                      >
                        <div className="flex items-center gap-1 opacity-60 mb-1">
                          <Building2 size={12} />
                          <span className="text-[10px] uppercase font-black tracking-wide">Capital</span>
                        </div>
                        <span className="text-sm font-bold truncate block">{country.capital}</span>
                      </motion.div>
                    </div>

                    {/* Highlights */}
                    <div>
                      <h3 className="text-[10px] font-black uppercase tracking-wider opacity-60 mb-2 flex items-center gap-1">
                        <MapPin size={12} /> Top highlights
                      </h3>
                      <motion.div
                        initial="hidden"
                        animate="show"
                        className="space-y-2"
                      >
                        {country.touristSites.map((site, i) => (
                          <motion.div
                            key={i}
                            custom={i}
                            variants={listItem}
                            className={`group flex items-start gap-2 p-3 rounded-2xl border transition-all
                              ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/8' : 'bg-white border-gray-200/60 hover:bg-gray-50'}`}
                          >
                            <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 group-hover:scale-125 transition-transform" />
                            <span className="text-sm leading-tight">{site}</span>
                          </motion.div>
                        ))}
                      </motion.div>
                    </div>

                    {/* Famous People (NEW) */}
                    {famousPeople.length > 0 && (
                      <div className="pt-1">
                        <h3 className="text-[10px] font-black uppercase tracking-wider opacity-60 mb-2 flex items-center gap-1">
                          <Sparkles size={12} /> Famous people
                        </h3>

                        <motion.div
                          initial="hidden"
                          animate="show"
                          className="space-y-2"
                        >
                          {famousPeople.slice(0, 5).map((p, i) => (
                            <motion.div
                              key={`${p.name}-${i}`}
                              custom={i}
                              variants={listItem}
                              className={`group p-3 rounded-2xl border transition-all
                                ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/8' : 'bg-white border-gray-200/60 hover:bg-gray-50'}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-extrabold truncate">
                                    {p.name}
                                  </div>
                                  {p.knownFor && (
                                    <div className={`text-xs mt-0.5 leading-snug
                                      ${isDark ? 'text-white/70' : 'text-slate-600'}`}>
                                      {p.knownFor}
                                    </div>
                                  )}
                                </div>

                                {p.link && (
                                  <motion.a
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.97 }}
                                    href={p.link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors
                                      ${isDark
                                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-200 hover:bg-blue-500/20'
                                        : 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100'}`}
                                    title="Open link"
                                  >
                                    Open <ExternalLink size={14} />
                                  </motion.a>
                                )}
                              </div>
                            </motion.div>
                          ))}
                        </motion.div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* Chat Tab */}
                {activeTab === 'chat' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col"
                  >
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {chatHistory.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={`max-w-[85%] p-3 rounded-2xl text-xs sm:text-sm markdown-content transition-shadow
                              ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none shadow-sm'
                                : (isDark
                                  ? 'bg-white/10 text-gray-100 rounded-bl-none shadow-sm'
                                  : 'bg-gray-100 text-gray-800 rounded-bl-none shadow-sm')
                              }`}
                          >
                            <ReactMarkdown>{msg.text}</ReactMarkdown>
                          </div>
                        </div>
                      ))}
                      <div ref={chatEndRef} />
                    </div>

                    <div className={`p-3 border-t shrink-0 ${isDark ? 'border-white/10' : 'border-gray-100'}`}>
                      <div className="relative flex items-center gap-2">
                        <input
                          type="text"
                          value={inputMessage}
                          onChange={(e) => setInputMessage(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                          placeholder="Ask..."
                          className={`flex-1 pl-4 pr-10 py-2.5 rounded-full text-sm outline-none ring-1 ring-transparent focus:ring-blue-500 transition-all
                            ${isDark ? 'bg-white/5 text-white placeholder-white/30' : 'bg-gray-100 text-gray-800 placeholder-gray-400'}`}
                        />

                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={handleSendMessage}
                          disabled={isTyping || !inputMessage.trim()}
                          className="p-2.5 bg-blue-600 text-white rounded-full disabled:opacity-50 hover:bg-blue-500 transition-colors shrink-0 shadow-sm"
                          aria-label="Send"
                          title="Send"
                        >
                          <Send size={16} />
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
