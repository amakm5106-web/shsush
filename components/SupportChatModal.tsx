'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Headphones,
  Send,
  MessageCircle,
  Copy,
  Check,
  X,
  Sparkles,
  PhoneCall,
  Clock,
  ShieldCheck,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { sounds } from '@/lib/audio';
import { UserProfile, GameSettings } from '@/lib/types';

interface SupportChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  settings: GameSettings;
}

interface ChatMessage {
  id: string;
  sender: 'user' | 'support';
  text: string;
  timestamp: number;
}

export function SupportChatModal({
  isOpen,
  onClose,
  user,
  settings,
}: SupportChatModalProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome_1',
      sender: 'support',
      text: 'မင်္ဂလာပါရှင်! X-Site Casino & Lottery ၏ ၂၄ နာရီ ဝန်ဆောင်မှုစင်တာမှ ကြိုဆိုပါသည်ရှင်။ မည်သည့်အကြောင်းအရာများ ကူညီပေးရမလဲရှင်။',
      timestamp: 0,
    },
  ]);
  const [inputVal, setInputVal] = useState<string>('');
  const [copiedId, setCopiedId] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, messages, isTyping]);

  const telegramLink = settings.GAME_GROUP_LINK || 'https://t.me/xsite_support';
  const kpayPhone = settings.KPAY_PHONE || '09883921102';

  const handleCopyUserId = React.useCallback(() => {
    sounds.playChip();
    const info = `User ID: ${user?.uid || 'Guest'}\nName: ${user?.fullName || 'ဧည့်သည်'}\nPhone: ${user?.phoneNumber || 'N/A'}`;
    navigator.clipboard.writeText(info);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  }, [user]);

  const handleSendMessage = React.useCallback((textToSend?: string) => {
    const text = (textToSend || inputVal).trim();
    if (!text) return;

    const currentTime = Date.now();
    sounds.playChip();
    const userMsg: ChatMessage = {
      id: `msg_${currentTime}_${Math.random().toString(36).substring(2, 6)}`,
      sender: 'user',
      text,
      timestamp: currentTime,
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputVal('');

    // Simulated Smart Support Bot Response
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      let reply = 'လူကြီးမင်း၏ မေးမြန်းချက်ကို လက်ခံရရှိပါသည်ရှင်။ အသေးစိတ် စစ်ဆေးပေးနေပါသည်ရှင်။';

      const lower = text.toLowerCase();
      if (lower.includes('သွင်း') || lower.includes('ထုတ်') || lower.includes('deposit') || lower.includes('withdraw')) {
        reply = `ငွေသွင်း/ငွေထုတ်နှင့် ပတ်သက်၍ အမြန်ဆုံး အတည်ပြုပေးရန်အတွက် သင်၏ User ID (${user?.uid || 'Guest'}) နှင့် ငွေလွှဲပြေစာကို ကျွန်မတို့၏ တရားဝင် Telegram Support သို့ တိုက်ရိုက် ပေးပို့နိုင်ပါသည်ရှင်။ KPay: ${kpayPhone}`;
      } else if (lower.includes('bonus') || lower.includes('ဘောနပ်') || lower.includes('ဆုကြေး') || lower.includes('ဖိတ်')) {
        reply = 'မန်ဘာဖိတ်ခေါ်မှု ဆုကြေးများအတွက် မန်ဘာများ ငွေသွင်းသည်နှင့် တပြိုင်နက် ကော်မရှင်နှင့် ပရိုမိုးရှင်း အပိုဆုများကို အလိုအလျောက် ပင်မလက်ကျန်သို့ တိုက်ရိုက် ထုတ်ယူနိုင်ပါသည်ရှင်။';
      } else if (lower.includes('dice') || lower.includes('အံစာ') || lower.includes('ကျွဲ') || lower.includes('buffalo') || lower.includes('spin')) {
        reply = 'ဂိမ်းများသည် 24/7 တိုက်ရိုက် စက္ကန့် ၆၀ လည်ပတ်နေပြီး တရားမျှတသော ရလဒ်စနစ်ဖြင့် စီမံထားပါသည်ရှင်။ မည်သည့်အခက်အခဲမဆို ဆက်လက်မေးမြန်းနိုင်ပါသည်ရှင်။';
      } else {
        reply = `ကျေးဇူးပြု၍ Telegram Support (${telegramLink}) သို့ တိုက်ရိုက် ဆက်သွယ်ပါက ကျွန်မတို့၏ Customer Care Officer မှ ၁ မိနစ်အတွင်း တိုက်ရိုက် အဖြေပေးပါမည်ရှင်။`;
      }

      const replyTime = Date.now();
      setMessages((prev) => [
        ...prev,
        {
          id: `reply_${replyTime}_${Math.random().toString(36).substring(2, 6)}`,
          sender: 'support',
          text: reply,
          timestamp: replyTime,
        },
      ]);
      sounds.playChip();
    }, 900);
  }, [inputVal, kpayPhone, telegramLink, user]);

  if (!isOpen) return null;

  const QUICK_TOPICS = [
    'ငွေသွင်းငွေထုတ် အကူအညီ',
    'မန်ဘာဖိတ်ခေါ်မှု ဘောနပ်စ်',
    'အကောင့်စိစစ်ပေးရန်',
    'Telegram Support တိုက်ရိုက်မေးမည်',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md h-[90vh] max-h-[680px] rounded-3xl bg-zinc-950 border border-white/15 p-4 sm:p-5 shadow-2xl flex flex-col justify-between relative animate-scaleUp overflow-hidden">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 inset-x-0 h-28 bg-amber-500/10 blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-black shadow-lg shadow-amber-950/50">
              <Headphones className="w-5 h-5 stroke-[2.3]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-base font-black text-white tracking-tight">
                  Support Chat
                </h2>
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              </div>
              <p className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>၂၄ နာရီ ဝန်ဆောင်မှု · Online</span>
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playChip();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
            title="ပိတ်မည်"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        </div>

        {/* User Account ID Quick Banner for Easy Support Lookups */}
        <div className="my-2 p-2.5 rounded-2xl bg-black/60 border border-white/10 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-2 truncate">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-white/50 block font-medium">သင်၏ ကစားသမား ID:</span>
              <span className="text-xs font-mono font-bold text-white truncate">
                {user?.uid ? `${user.uid.slice(0, 14)}...` : 'ဧည့်သည် (Guest)'}
              </span>
            </div>
          </div>

          <button
            onClick={handleCopyUserId}
            className="px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all shrink-0"
          >
            {copiedId ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">ကူးပြီးပါပြီ</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-amber-400" />
                <span>ID ကူးယူမည်</span>
              </>
            )}
          </button>
        </div>

        {/* Direct Channels Quick Bar (Telegram & Viber/Hotline) */}
        <div className="grid grid-cols-2 gap-2 mb-2 z-10 shrink-0">
          <a
            href={telegramLink.startsWith('http') ? telegramLink : `https://t.me/${telegramLink.replace('@', '')}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sounds.playChip()}
            className="p-2 rounded-xl bg-[#229ED9]/15 hover:bg-[#229ED9]/25 border border-[#229ED9]/30 flex items-center justify-center gap-1.5 text-sky-300 font-bold text-xs transition-all active:scale-95 shadow-sm"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Telegram Support</span>
            <ExternalLink className="w-3 h-3 text-sky-400/70" />
          </a>

          <a
            href={`tel:${kpayPhone}`}
            onClick={() => sounds.playChip()}
            className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 flex items-center justify-center gap-1.5 text-emerald-300 font-bold text-xs transition-all active:scale-95 shadow-sm"
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Hotline ဖုန်းခေါ်</span>
          </a>
        </div>

        {/* Chat Messages Body */}
        <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 my-1 z-10 custom-scrollbar">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs font-medium leading-relaxed shadow-md ${
                  m.sender === 'user'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-black font-semibold rounded-tr-sm'
                    : 'bg-zinc-900 border border-white/10 text-white/95 rounded-tl-sm'
                }`}
              >
                {m.text}
              </div>
              <span className="text-[9px] text-white/40 mt-1 px-1 font-mono">
                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}

          {isTyping && (
            <div className="flex items-center gap-1.5 text-white/60 text-xs px-2 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-bounce [animation-delay:0.4s]" />
              <span className="text-[10px] text-amber-300 ml-1">Support စာရိုက်နေပါသည်...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick FAQ Topic Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1.5 shrink-0 no-scrollbar">
          {QUICK_TOPICS.map((topic, i) => (
            <button
              key={i}
              onClick={() => handleSendMessage(topic)}
              className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-white/80 hover:text-white text-[10px] font-bold whitespace-nowrap active:scale-95 transition-all shrink-0"
            >
              {topic}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="pt-2 border-t border-white/10 flex items-center gap-2 z-10 shrink-0">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendMessage();
            }}
            placeholder="မေးမြန်းလိုသည်များကို ရိုက်ထည့်ပါ..."
            className="flex-1 px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white placeholder-white/40 text-xs focus:outline-none focus:border-amber-400 transition-all font-medium"
          />

          <button
            onClick={() => handleSendMessage()}
            disabled={!inputVal.trim()}
            className="p-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-black font-black disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all shadow-md shrink-0"
            title="ပို့မည်"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
