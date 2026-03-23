/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Volume2, 
  Play, 
  Loader2, 
  Settings2, 
  Type as TypeIcon, 
  Download,
  Trash2,
  AlertCircle,
  History as HistoryIcon,
  Zap,
  Clock,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const VOICES = [
  { id: 'Kore', name: 'Kore', description: 'Warm & Natural' },
  { id: 'Puck', name: 'Puck', description: 'Energetic & Bright' },
  { id: 'Charon', name: 'Charon', description: 'Deep & Authoritative' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Calm & Steady' },
  { id: 'Zephyr', name: 'Zephyr', description: 'Soft & Ethereal' },
];

const LOADING_MESSAGES = [
  "Synthesizing vocal chords...",
  "Tuning the pitch...",
  "Applying natural inflections...",
  "Polishing the audio stream...",
  "Almost ready to speak..."
];

interface HistoryItem {
  id: string;
  text: string;
  voice: string;
  url: string;
  timestamp: number;
}

export default function App() {
  const [text, setText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('Kore');
  const [isLoading, setIsLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Load history from localStorage on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('echo_tts_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error("Failed to load history", e);
      }
    }
  }, []);

  // Save history to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('echo_tts_history', JSON.stringify(history.slice(0, 10))); // Keep last 10
  }, [history]);

  // Rotate loading messages
  useEffect(() => {
    let interval: number;
    if (isLoading) {
      interval = window.setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const generateSpeech = async () => {
    if (!text.trim()) {
      setError('Please enter some text to convert.');
      return;
    }

    // Check if we already have this in history (simple cache)
    const existing = history.find(h => h.text === text.trim() && h.voice === selectedVoice);
    if (existing) {
      setAudioUrl(existing.url);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play();
        }
      }, 100);
      return;
    }

    setIsLoading(true);
    setError(null);
    setAudioUrl(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: text.trim() }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: selectedVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const wavBlob = createWavBlob(bytes, 24000);
        const url = URL.createObjectURL(wavBlob);
        setAudioUrl(url);
        
        // Add to history
        const newItem: HistoryItem = {
          id: Math.random().toString(36).substr(2, 9),
          text: text.trim(),
          voice: selectedVoice,
          url: url,
          timestamp: Date.now()
        };
        setHistory(prev => [newItem, ...prev].slice(0, 10));

        // Auto-play
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.load();
            audioRef.current.play().catch(e => console.error("Auto-play failed:", e));
          }
        }, 100);
      } else {
        throw new Error('No audio data received from the model.');
      }
    } catch (err: any) {
      console.error('TTS Error:', err);
      setError(err.message || 'Failed to generate speech. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const createWavBlob = (pcmData: Uint8Array, sampleRate: number) => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmData.length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 1 * 2, true);
    view.setUint16(32, 1 * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, pcmData.length, true);
    return new Blob([header, pcmData], { type: 'audio/wav' });
  };

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const clearAll = () => {
    setText('');
    setAudioUrl(null);
    setError(null);
  };

  const playFromHistory = (item: HistoryItem) => {
    setText(item.text);
    setSelectedVoice(item.voice);
    setAudioUrl(item.url);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.load();
        audioRef.current.play();
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] font-sans text-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <Volume2 className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Echo TTS</h1>
              <p className="text-slate-500 text-sm flex items-center gap-1">
                <Zap size={12} className="text-amber-500 fill-amber-500" />
                Optimized for Speed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={clearAll}
              className="p-2 text-slate-400 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50"
              title="Clear all"
            >
              <Trash2 size={20} />
            </button>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Input & Results (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            <div className="glass-card rounded-2xl p-6 shadow-sm border border-slate-200 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 text-slate-600 font-medium">
                <TypeIcon size={18} />
                <span>Text Input</span>
              </div>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste your text here..."
                className="w-full h-64 bg-transparent border-none focus:ring-0 text-lg resize-none placeholder:text-slate-300"
              />
              
              {/* Animated Loading Overlay */}
              <AnimatePresence>
                {isLoading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10"
                  >
                    <div className="relative">
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-600 rounded-full"
                      />
                      <Volume2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-600" size={24} />
                    </div>
                    <motion.p 
                      key={loadingMessageIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="mt-6 text-indigo-900 font-medium text-center px-4"
                    >
                      {LOADING_MESSAGES[loadingMessageIndex]}
                    </motion.p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-400 font-mono">
                  {text.length} characters
                </span>
                <button
                  onClick={generateSpeech}
                  disabled={isLoading || !text.trim()}
                  className={`flex items-center gap-2 px-8 py-3 rounded-xl font-medium transition-all ${
                    isLoading || !text.trim()
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200 active:scale-95'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <Play size={18} fill="currentColor" />
                      <span>Generate Speech</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-xl flex items-center gap-3"
                >
                  <AlertCircle size={20} />
                  <p className="text-sm font-medium">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Audio Player Card */}
            <AnimatePresence>
              {audioUrl && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="glass-card rounded-2xl p-6 shadow-xl border-2 border-indigo-100 bg-indigo-50/30"
                >
                  <div className="flex flex-col md:flex-row items-center gap-6">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-indigo-100">
                      <motion.div
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Volume2 className="text-indigo-600" size={32} />
                      </motion.div>
                    </div>
                    <div className="flex-1 w-full">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-indigo-900">Generated Audio</span>
                        <a 
                          href={audioUrl} 
                          download="echo-speech.wav"
                          className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider"
                        >
                          <Download size={14} />
                          Download
                        </a>
                      </div>
                      <audio 
                        ref={audioRef}
                        src={audioUrl} 
                        controls 
                        className="w-full h-10 custom-audio-player"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Column: Settings & History (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* Settings */}
            <div className="glass-card rounded-2xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-6 text-slate-600 font-medium">
                <Settings2 size={18} />
                <span>Voice Settings</span>
              </div>
              
              <div className="space-y-3">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Select Voice
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {VOICES.map((voice) => (
                    <button
                      key={voice.id}
                      onClick={() => setSelectedVoice(voice.id)}
                      className={`flex flex-col items-start p-3 rounded-xl border transition-all text-left ${
                        selectedVoice === voice.id
                          ? 'bg-indigo-50 border-indigo-200 ring-1 ring-indigo-200'
                          : 'bg-white border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <span className={`font-medium ${selectedVoice === voice.id ? 'text-indigo-700' : 'text-slate-700'}`}>
                        {voice.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {voice.description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* History */}
            <div className="glass-card rounded-2xl p-6 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-4 text-slate-600 font-medium">
                <HistoryIcon size={18} />
                <span>Recent Clips</span>
              </div>
              
              <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <Clock size={32} className="mx-auto mb-2 opacity-20" />
                    <p className="text-xs">No history yet</p>
                  </div>
                ) : (
                  history.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => playFromHistory(item)}
                      className="w-full p-3 rounded-xl border border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50/50 transition-all text-left group"
                    >
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-tighter">
                          {item.voice}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {item.text}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="p-4 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-100">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare size={16} />
                <span className="text-xs font-bold uppercase tracking-wider">Quick Phrases</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {['Hello!', 'How are you?', 'Welcome back.'].map(phrase => (
                  <button
                    key={phrase}
                    onClick={() => setText(phrase)}
                    className="text-[10px] bg-white/20 hover:bg-white/30 px-2 py-1 rounded-md transition-colors"
                  >
                    {phrase}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </main>

        <footer className="mt-20 text-center text-slate-400 text-xs">
          <p>© {new Date().getFullYear()} Echo TTS • Built with Gemini AI • Optimized for Performance</p>
        </footer>
      </div>

      <style>{`
        .custom-audio-player::-webkit-media-controls-panel {
          background-color: white;
        }
        .custom-audio-player::-webkit-media-controls-play-button {
          background-color: #4f46e5;
          border-radius: 50%;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
