import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MessageCircle, Info, Send, MapPin, Users, Building2, BarChart3, Sparkles, Play, Pause, RotateCcw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Theme, CountryData, ChatMessage } from '../types';
import { createChatStream, generateBarRacePayload, BarRacePayload } from '../services/openAIService';

import ReactECharts from 'echarts-for-react';

interface CountryCardProps {
  country: CountryData | null;
  isLoading: boolean;
  onClose: () => void;
  theme: Theme;
}

export const CountryCard: React.FC<CountryCardProps> = ({ country, isLoading, onClose, theme }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'chat' | 'race'>('info');
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Bar race state
  const [race, setRace] = useState<BarRacePayload | null>(null);
  const [raceStatus, setRaceStatus] = useState<'idle' | 'generating' | 'ready' | 'error'>('idle');
  const [raceError, setRaceError] = useState<string>('');
  const [raceFrameIndex, setRaceFrameIndex] = useState(0);
  const [racePlaying, setRacePlaying] = useState(true);
  const [lastRaceQuery, setLastRaceQuery] = useState<string>('');

  const chartRef = useRef<ReactECharts | null>(null);
  const raceTimerRef = useRef<number | null>(null);

  const isDark = theme === Theme.DARK;

  // Mobile Detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Reset when country changes
  useEffect(() => {
    if (country) {
      setChatHistory([{
        id: 'welcome',
        role: 'model',
        text: `Hello! I'm your guide for **${country.name}**. Ask me anything about the local food, customs, or hidden gems!\n\nIf you want a bar race, ask like: **"Bar race of life expectancy 2000 to 2020 in Europe (top 10)"**`,
        timestamp: Date.now()
      }]);
    }
    setActiveTab('info');

    // reset race
    setRace(null);
    setRaceStatus('idle');
    setRaceError('');
    setRaceFrameIndex(0);
    setRacePlaying(true);
    setLastRaceQuery('');
  }, [country]);

  // Auto-scroll chat
  useEffect(() => {
    if (activeTab === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatHistory, activeTab]);

  const wantsBarRace = (text: string) => {
    const t = text.toLowerCase();
    return t.startsWith('/race') || t.includes('bar race') || t.includes('barrace') || t.includes('ranking over time');
  };

  const normRaceQuery = (text: string) => {
    if (text.trim().toLowerCase().startsWith('/race')) return text.replace(/^\/race\s*/i, '').trim();
    return text.trim();
  };

  const handleGenerateRace = async (query: string) => {
    if (!country) return;
    setRaceStatus('generating');
    setRaceError('');
    setRace(null);
    setRaceFrameIndex(0);
    setRacePlaying(true);

    try {
      const payload = await generateBarRacePayload(query, country);
      if (!payload.frames?.length) throw new Error("No frames returned.");

      setRace(payload);
      setRaceStatus('ready');
      setActiveTab('race');
    } catch (e: any) {
      setRaceStatus('error');
      setRaceError(e?.message || "Failed to generate bar race.");
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !country) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: inputMessage,
      timestamp: Date.now()
    };

    // Add user message
    setChatHistory(prev => [...prev, userMsg]);
    setInputMessage('');
    setIsTyping(true);

    // Start chart request if user asked for bar race (in parallel with chat reply)
    if (wantsBarRace(userMsg.text)) {
      const q = normRaceQuery(userMsg.text);
      setLastRaceQuery(q);
      handleGenerateRace(q);
    }

    // Stream chat reply
    const modelMsgId = (Date.now() + 1).toString();
    let fullResponse = '';

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

  // --- Build initial option for the current race frame
  const raceOption = useMemo(() => {
    if (!race || raceStatus !== 'ready') return null;
    const frame = race.frames[Math.min(raceFrameIndex, race.frames.length - 1)];

    const axisText = (n: number) => {
      const v = Number(n);
      if (!Number.isFinite(v)) return '';
      // keep compact formatting
      return Math.abs(v) >= 1000 ? `${Math.round(v)}` : `${Math.round(v * 10) / 10}`;
    };

    return {
      grid: { top: 12, bottom: 32, left: 150, right: 55 },
      xAxis: {
        max: 'dataMax',
        axisLabel: { formatter: (n: number) => axisText(n) }
      },
      yAxis: {
        type: 'category',
        inverse: true,
        max: race.topN,
        axisLabel: {
          show: true,
          fontSize: 12
        },
        animationDuration: 300,
        animationDurationUpdate: 300
      },
      dataset: {
        dimensions: ['value', 'country'],
        source: frame.rows.map(r => ({ value: r.value, country: r.country }))
      },
      series: [{
        realtimeSort: true,
        type: 'bar',
        encode: { x: 'value', y: 'country' },
        label: {
          show: true,
          position: 'right',
          valueAnimation: true,
          fontFamily: 'monospace',
          formatter: (p: any) => axisText(p.value)
        }
      }],
      animationDuration: 0,
      animationDurationUpdate: race.updateFrequencyMs,
      animationEasing: 'linear',
      animationEasingUpdate: 'linear',
      graphic: {
        elements: [{
          type: 'text',
          right: 24,
          bottom: 44,
          style: {
            text: String(frame.year),
            font: 'bolder 64px monospace',
            fill: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
          },
          z: 100
        }]
      },
      tooltip: {
        trigger: 'item',
        formatter: (p: any) => {
          const c = p?.data?.country ?? p?.name ?? '';
          const v = p?.data?.value ?? p?.value ?? '';
          return `<b>${c}</b><br/>${race.metric}: ${axisText(v)} ${race.unit ?? ''}`;
        }
      }
    };
  }, [race, raceStatus, raceFrameIndex, isDark]);

  // Drive the bar race playback (year-by-year)
  useEffect(() => {
    if (!race || raceStatus !== 'ready') return;

    // cleanup any old timer
    if (raceTimerRef.current) {
      window.clearInterval(raceTimerRef.current);
      raceTimerRef.current = null;
    }

    if (!racePlaying) return;

    raceTimerRef.current = window.setInterval(() => {
      setRaceFrameIndex((idx) => {
        const next = idx + 1;
        if (next >= race.frames.length) return idx; // stop at end
        return next;
      });
    }, race.updateFrequencyMs);

    return () => {
      if (raceTimerRef.current) {
        window.clearInterval(raceTimerRef.current);
        raceTimerRef.current = null;
      }
    };
  }, [race, raceStatus, racePlaying]);

  // When raceFrameIndex changes, push incremental updates to chart (smooth)
  useEffect(() => {
    if (!race || raceStatus !== 'ready') return;
    const frame = race.frames[Math.min(raceFrameIndex, race.frames.length - 1)];
    const inst = chartRef.current?.getEchartsInstance?.();
    if (!inst) return;

    inst.setOption({
      dataset: {
        dimensions: ['value', 'country'],
        source: frame.rows.map(r => ({ value: r.value, country: r.country }))
      },
      graphic: {
        elements: [{
          type: 'text',
          right: 24,
          bottom: 44,
          style: {
            text: String(frame.year),
            font: 'bolder 64px monospace',
            fill: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'
          },
          z: 100
        }]
      }
    }, { notMerge: false, lazyUpdate: true });
  }, [raceFrameIndex, race, raceStatus, isDark]);

  // Stop at end automatically
  useEffect(() => {
    if (!race || raceStatus !== 'ready') return;
    if (raceFrameIndex >= race.frames.length - 1) setRacePlaying(false);
  }, [raceFrameIndex, race, raceStatus]);

  return (
    <AnimatePresence>
      {(country || isLoading) && (
        <motion.div
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className={`fixed z-20 flex flex-col shadow-2xl backdrop-blur-xl
            bottom-0 left-0 w-full h-[45vh] rounded-t-3xl border-t
            sm:top-0 sm:right-0 sm:h-full sm:w-[400px] sm:rounded-none sm:rounded-l-2xl sm:border-l sm:border-t-0
            ${isDark ? 'bg-slate-900/95 text-white border-white/10' : 'bg-white/95 text-slate-800 border-gray-200'}`}
        >
          {/* Mobile Drag Handle */}
          <div
            className="w-full flex justify-center pt-3 pb-1 sm:hidden opacity-30 cursor-pointer"
            onClick={onClose}
          >
            <div className="w-12 h-1.5 rounded-full bg-current"></div>
          </div>

          {/* Header */}
          <div className={`px-4 pb-2 pt-2 sm:p-4 flex items-center justify-between border-b shrink-0 ${isDark ? 'border-white/10' : 'border-gray-200/50'}`}>
            {isLoading ? (
              <div className="flex items-center gap-3 animate-pulse">
                <div className="w-8 h-6 bg-gray-400 rounded"></div>
                <div className="h-6 w-32 bg-gray-400 rounded"></div>
              </div>
            ) : (
              <div className="flex items-center gap-3 overflow-hidden">
                {country?.code && country.code !== '-99' ? (
                  <img
                    src={`https://flagcdn.com/w80/${country.code.toLowerCase()}.png`}
                    srcSet={`https://flagcdn.com/w160/${country.code.toLowerCase()}.png 2x`}
                    alt={country.name}
                    className="w-10 h-auto rounded shadow-sm border border-black/10 shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-3xl shrink-0" role="img" aria-label="flag">{country?.flagEmoji}</span>
                )}

                <div className="min-w-0">
                  <h2 className="text-lg sm:text-xl font-bold leading-tight truncate">{country?.name}</h2>
                  <p className="text-xs opacity-70 truncate">{country?.capital}</p>
                </div>
              </div>
            )}
            <button onClick={onClose} className="p-2 hover:bg-black/10 rounded-full transition-colors shrink-0">
              <X size={20} />
            </button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
              <p className="text-sm opacity-70">Exploring...</p>
            </div>
          )}

          {/* Content */}
          {!isLoading && country && (
            <>
              {/* Tabs */}
              <div className={`flex border-b shrink-0 ${isDark ? 'border-white/10' : 'border-gray-200/50'}`}>
                <button
                  onClick={() => setActiveTab('info')}
                  className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative
                    ${activeTab === 'info' ? 'text-blue-500' : 'opacity-60 hover:opacity-100'}`}
                >
                  <Info size={16} /> Info
                  {activeTab === 'info' && <motion.div layoutId="underline" className="absolute bottom-0 w-full h-0.5 bg-blue-500" />}
                </button>

                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative
                    ${activeTab === 'chat' ? 'text-blue-500' : 'opacity-60 hover:opacity-100'}`}
                >
                  <MessageCircle size={16} /> Chat
                  {activeTab === 'chat' && <motion.div layoutId="underline" className="absolute bottom-0 w-full h-0.5 bg-blue-500" />}
                </button>

                <button
                  onClick={() => setActiveTab('race')}
                  className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors relative
                    ${activeTab === 'race' ? 'text-blue-500' : 'opacity-60 hover:opacity-100'}`}
                >
                  <BarChart3 size={16} /> Race
                  {activeTab === 'race' && <motion.div layoutId="underline" className="absolute bottom-0 w-full h-0.5 bg-blue-500" />}
                </button>
              </div>

              <div className="flex-1 overflow-hidden relative bg-transparent">
                {/* Info Tab */}
                {activeTab === 'info' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar"
                  >
                    <div className={`p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                      <p className="text-sm leading-relaxed">{country.description}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className={`p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-1 opacity-60 mb-1">
                          <Users size={12} />
                          <span className="text-[10px] uppercase font-bold">Pop</span>
                        </div>
                        <span className="text-sm font-semibold truncate block">{country.population}</span>
                      </div>

                      <div className={`p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                        <div className="flex items-center gap-1 opacity-60 mb-1">
                          <Building2 size={12} />
                          <span className="text-[10px] uppercase font-bold">Capital</span>
                        </div>
                        <span className="text-sm font-semibold truncate block">{country.capital}</span>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-[10px] font-bold uppercase tracking-wider opacity-50 mb-2 flex items-center gap-1">
                        <MapPin size={12} /> Highlights
                      </h3>
                      <div className="space-y-2">
                        {country.touristSites.map((site, i) => (
                          <div key={i} className={`flex items-start gap-2 p-2 rounded-lg ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
                            <div className="mt-1.5 w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                            <span className="text-sm leading-tight">{site}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className={`p-3 rounded-xl border ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles size={14} className="text-blue-500" />
                        <div className="text-xs font-semibold">Want a Bar Race?</div>
                      </div>
                      <div className="text-xs opacity-70">
                        Ask in chat:
                        <span className="font-mono"> “/race life expectancy 2000 to 2020 in Europe top 10”</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Chat Tab */}
                {activeTab === 'chat' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-full flex flex-col">
                    <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                      {chatHistory.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] p-3 rounded-2xl text-xs sm:text-sm markdown-content
                              ${msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-none'
                                : (isDark ? 'bg-white/10 text-gray-100 rounded-bl-none' : 'bg-gray-100 text-gray-800 rounded-bl-none')
                              }`}>
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
                          placeholder='Ask... (use "/race ...")'
                          className={`flex-1 pl-4 pr-10 py-2.5 rounded-full text-sm outline-none ring-1 ring-transparent focus:ring-blue-500 transition-all
                            ${isDark ? 'bg-white/5 text-white placeholder-white/30' : 'bg-gray-100 text-gray-800 placeholder-gray-400'}`}
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={isTyping || !inputMessage.trim()}
                          className="p-2.5 bg-blue-600 text-white rounded-full disabled:opacity-50 hover:bg-blue-500 transition-colors shrink-0"
                        >
                          <Send size={16} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Race Tab */}
                {activeTab === 'race' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="h-full flex flex-col"
                  >
                    <div className="p-4 border-b shrink-0 flex items-start justify-between gap-3
                      border-white/10"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold truncate">
                          {race?.title || "Bar Race"}
                        </div>
                        <div className="text-xs opacity-70">
                          {race ? `${race.metric}${race.unit ? ` (${race.unit})` : ''} • ${race.scope === 'continent' ? `Continent: ${race.continent}` : 'World'}` : 'Ask using /race ...'}
                        </div>
                        {race?.note && (
                          <div className="text-[11px] opacity-60 mt-1">{race.note}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setRacePlaying(p => !p)}
                          disabled={raceStatus !== 'ready'}
                          className={`p-2 rounded-full border transition-colors
                            ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-gray-200 hover:bg-gray-100'}
                            ${raceStatus !== 'ready' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title={racePlaying ? "Pause" : "Play"}
                        >
                          {racePlaying ? <Pause size={16} /> : <Play size={16} />}
                        </button>

                        <button
                          onClick={() => {
                            setRaceFrameIndex(0);
                            setRacePlaying(true);
                          }}
                          disabled={raceStatus !== 'ready'}
                          className={`p-2 rounded-full border transition-colors
                            ${isDark ? 'border-white/10 hover:bg-white/10' : 'border-gray-200 hover:bg-gray-100'}
                            ${raceStatus !== 'ready' ? 'opacity-50 cursor-not-allowed' : ''}`}
                          title="Restart"
                        >
                          <RotateCcw size={16} />
                        </button>

                        <button
                          onClick={() => {
                            if (!lastRaceQuery || !country) return;
                            handleGenerateRace(lastRaceQuery);
                          }}
                          disabled={!lastRaceQuery || raceStatus === 'generating'}
                          className="px-3 py-2 rounded-full text-xs font-semibold bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
                          title="Regenerate"
                        >
                          Regenerate
                        </button>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-hidden p-4">
                      {raceStatus === 'idle' && (
                        <div className={`h-full rounded-2xl border flex items-center justify-center text-center p-6
                          ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}
                        >
                          <div className="max-w-xs">
                            <div className="text-sm font-bold mb-2">No bar race yet</div>
                            <div className="text-xs opacity-70">
                              Go to Chat and ask:
                              <div className="mt-2 font-mono text-[11px] opacity-90">
                                /race life expectancy 2000 to 2020 in Europe top 10
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {raceStatus === 'generating' && (
                        <div className={`h-full rounded-2xl border p-6 flex flex-col items-center justify-center gap-3
                          ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}
                        >
                          <motion.div
                            className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent"
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}
                          />
                          <div className="text-sm font-bold">Generating bar race…</div>
                          <div className="text-xs opacity-70 text-center max-w-xs">
                            GPT is compiling the dataset from your query. This can take a moment.
                          </div>
                        </div>
                      )}

                      {raceStatus === 'error' && (
                        <div className={`h-full rounded-2xl border p-6
                          ${isDark ? 'border-red-500/30 bg-red-500/10' : 'border-red-200 bg-red-50'}`}
                        >
                          <div className="text-sm font-bold mb-1">Failed to generate</div>
                          <div className="text-xs opacity-80">{raceError || "Unknown error"}</div>
                        </div>
                      )}

                      {raceStatus === 'ready' && raceOption && race && (
                        <div className={`h-full rounded-2xl border overflow-hidden
                          ${isDark ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-white'}`}
                        >
                          <ReactECharts
                            ref={(r) => { chartRef.current = r; }}
                            option={raceOption as any}
                            style={{ height: '100%', width: '100%' }}
                            notMerge={true}
                            lazyUpdate={true}
                          />
                        </div>
                      )}
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
