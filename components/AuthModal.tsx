'use client';

import React, { useState } from 'react';
import {
  X,
  Phone,
  Lock,
  User,
  Gift,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { sounds } from '@/lib/audio';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  referralCodeFromUrl?: string | null;
  onGoogleSignIn: () => Promise<void>;
  onPhoneSignIn: (phone: string, psw: string) => Promise<{ success: boolean; error?: string }>;
  onPhoneSignUp: (
    phone: string,
    psw: string,
    name: string,
    referralCode?: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export function AuthModal({
  isOpen,
  onClose,
  referralCodeFromUrl,
  onGoogleSignIn,
  onPhoneSignIn,
  onPhoneSignUp,
}: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [phone, setPhone] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [referralCode, setReferralCode] = useState<string>(referralCodeFromUrl || '');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanPhone = phone.trim().replace(/\s+/g, '');
    if (!cleanPhone || cleanPhone.length < 7) {
      setErrorMessage('ဖုန်းနံပါတ် အပြည့်အစုံ မှန်ကန်စွာ ထည့်သွင်းပေးပါ (ဥပမာ 09xxxxxxxxx)');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage('စကားဝှက် (Password) အနည်းဆုံး ၆ လုံး ထားရှိပေးပါ');
      return;
    }

    setLoading(true);
    sounds.playChip();

    try {
      if (tab === 'login') {
        const res = await onPhoneSignIn(cleanPhone, password);
        if (!res.success) {
          setErrorMessage(res.error || 'ဖုန်းနံပါတ် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်');
        } else {
          sounds.playWin();
          onClose();
        }
      } else {
        if (!fullName.trim()) {
          setErrorMessage('နာမည် အပြည့်အစုံ ထည့်သွင်းပေးပါ');
          setLoading(false);
          return;
        }
        const res = await onPhoneSignUp(cleanPhone, password, fullName.trim(), referralCode.trim() || undefined);
        if (!res.success) {
          setErrorMessage(res.error || 'အကောင့်ဖွင့်ခြင်း မအောင်မြင်ပါ။ ပြန်လည်စစ်ဆေးပါ');
        } else {
          sounds.playWin();
          onClose();
        }
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'အကောင့်ဝင်ရောက်မှု အဆင်မပြေပါ');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleClick = async () => {
    sounds.playChip();
    setErrorMessage('');
    setLoading(true);
    try {
      await onGoogleSignIn();
      onClose();
    } catch {
      setErrorMessage('Google Sign In မအောင်မြင်ပါ။ နောက်တစ်ကြိမ် ကြိုးစားပါ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-fadeIn">
      <div className="relative w-full max-w-sm rounded-3xl bg-zinc-950/95 border border-white/20 shadow-[0_20px_60px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col text-white">
        {/* Glow Accent Header */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-amber-400 via-emerald-400 to-cyan-400" />

        {/* Top Header & Close */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-emerald-400 stroke-[2.2]" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white tracking-tight">
                {tab === 'login' ? 'အကောင့်ဝင်ရောက်ရန် (Login)' : 'အကောင့်သစ်ဖွင့်ရန် (Sign Up)'}
              </h3>
              <p className="text-[10px] text-white/60 font-medium">Xin Aiii Live Casino</p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playChip();
              onClose();
            }}
            className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-all active:scale-95"
            title="ပိတ်မည်"
          >
            <X className="w-4 h-4 stroke-[2.2]" />
          </button>
        </div>

        {/* Tab Switcher: Login / Sign Up */}
        <div className="px-5 pb-2">
          <div className="grid grid-cols-2 p-1 rounded-2xl bg-black/60 border border-white/10">
            <button
              type="button"
              onClick={() => {
                sounds.playChip();
                setTab('login');
                setErrorMessage('');
              }}
              className={`py-2 rounded-xl text-xs font-black transition-all ${
                tab === 'login'
                  ? 'bg-white text-black shadow-md'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              အကောင့်ဝင်ရန် (Login)
            </button>
            <button
              type="button"
              onClick={() => {
                sounds.playChip();
                setTab('signup');
                setErrorMessage('');
              }}
              className={`py-2 rounded-xl text-xs font-black transition-all ${
                tab === 'signup'
                  ? 'bg-white text-black shadow-md'
                  : 'text-white/70 hover:text-white'
              }`}
            >
              အကောင့်သစ် (Sign Up)
            </button>
          </div>
        </div>

        {/* Error Banner if any */}
        {errorMessage && (
          <div className="mx-5 mb-2 px-3 py-2 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2 animate-shake">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400 stroke-[2.2]" />
            <span className="font-medium text-[11px] leading-tight">{errorMessage}</span>
          </div>
        )}

        {/* Phone & Password Form */}
        <form onSubmit={handleSubmit} className="px-5 py-2 flex flex-col gap-3">
          {tab === 'signup' && (
            <div>
              <label className="text-[11px] font-bold text-white/80 mb-1 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-white/60" />
                <span>နာမည်အပြည့်အစုံ (Full Name)</span>
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="ဥပမာ - ကိုကျော်ဇင်"
                className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-medium placeholder:text-white/30 focus:outline-none focus:border-white transition-all"
              />
            </div>
          )}

          <div>
            <label className="text-[11px] font-bold text-white/80 mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-white/60" />
              <span>ဖုန်းနံပါတ် (Phone Number)</span>
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xxxxxxxxx"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-mono font-medium placeholder:text-white/30 focus:outline-none focus:border-white transition-all"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-white/80 mb-1 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-white/60" />
              <span>စကားဝှက် (Password)</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="အနည်းဆုံး ၆ လုံး"
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-xs font-mono font-medium placeholder:text-white/30 focus:outline-none focus:border-white transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Referral Code (Show in Account Setup right under password) */}
          {tab === 'signup' && (
            <div className="p-2.5 rounded-2xl bg-amber-500/10 border border-amber-400/25 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black text-amber-300 flex items-center gap-1.5">
                  <Gift className="w-3.5 h-3.5 text-amber-400" />
                  <span>Referral (ဖိတ်ခေါ်ကုဒ်)</span>
                </span>
                {referralCode ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>ချိတ်ဆက်ပြီး</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-white/50">(မထည့်လည်း ရပါသည်)</span>
                )}
              </div>
              <input
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="ဖိတ်ခေါ်ကုဒ်ရှိပါက ထည့်ပါ"
                className="w-full px-3 py-1.5 rounded-xl bg-black/70 border border-amber-400/30 text-amber-200 text-xs font-mono font-bold placeholder:text-white/30 focus:outline-none focus:border-amber-400 transition-all uppercase"
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-1 py-3 rounded-2xl bg-white hover:bg-zinc-200 text-black font-black text-xs active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <span>{tab === 'login' ? 'အကောင့်ဝင်ရောက်မည်' : 'အကောင့်ဖွင့်မည်'}</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>
        </form>

        {/* Divider */}
        <div className="px-5 py-2 flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-[10px] text-white/50 font-bold uppercase tracking-wider">သို့မဟုတ်</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google One-Tap Sign In Button */}
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={handleGoogleClick}
            disabled={loading}
            className="w-full py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-black text-xs active:scale-95 transition-all flex items-center justify-center gap-2.5 shadow-sm"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Google အကောင့်ဖြင့် အမြန်ဝင်မည်</span>
          </button>
        </div>
      </div>
    </div>
  );
}
