'use client';

import React, { useState } from 'react';
import {
  X,
  Phone,
  Lock,
  User,
  Gift,
  ArrowUpRight,
  ShieldCheck,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Dices,
  Sparkles,
} from 'lucide-react';
import { sounds } from '@/lib/audio';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  referralCodeFromUrl?: string | null;
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
  onPhoneSignIn,
  onPhoneSignUp,
}: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [referralCode, setReferralCode] = useState(referralCodeFromUrl || '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const switchTab = (nextTab: 'login' | 'signup') => {
    sounds.playChip();
    setTab(nextTab);
    setErrorMessage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const cleanPhone = phone.trim().replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 7) {
      setErrorMessage('ဖုန်းနံပါတ် အပြည့်အစုံ မှန်ကန်စွာ ထည့်သွင်းပေးပါ');
      return;
    }

    const minimumPasswordLength = tab === 'login' ? 6 : 8;
    if (!password || password.length < minimumPasswordLength) {
      setErrorMessage(`စကားဝှက် အနည်းဆုံး ${minimumPasswordLength} လုံး ထားရှိပေးပါ`);
      return;
    }

    if (tab === 'signup' && !fullName.trim()) {
      setErrorMessage('နာမည်အပြည့်အစုံ ထည့်သွင်းပေးပါ');
      return;
    }

    setLoading(true);
    sounds.playChip();

    try {
      const result = tab === 'login'
        ? await onPhoneSignIn(cleanPhone, password)
        : await onPhoneSignUp(cleanPhone, password, fullName.trim(), referralCode.trim() || undefined);

      if (!result.success) {
        setErrorMessage(result.error || (tab === 'login' ? 'ဖုန်းနံပါတ် သို့မဟုတ် စကားဝှက် မှားယွင်းနေပါသည်' : 'အကောင့်ဖွင့်ခြင်း မအောင်မြင်ပါ'));
      } else {
        sounds.playWin();
        onClose();
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'အကောင့်ဝင်ရောက်မှု အဆင်မပြေပါ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-backdrop fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-3 sm:p-6">
      <div
        className="auth-shell relative my-auto grid w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/15 bg-[#0b0d0f] text-white shadow-[0_28px_100px_rgba(0,0,0,.82)] lg:grid-cols-[.88fr_1.12fr]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button
          onClick={() => { sounds.playChip(); onClose(); }}
          className="absolute right-4 top-4 z-20 grid h-9 w-9 place-items-center rounded-full border border-white/15 bg-black/35 text-white/75 transition hover:border-white/40 hover:bg-white hover:text-black active:scale-95"
          title="ပိတ်မည်"
          aria-label="Close authentication dialog"
        >
          <X className="h-4 w-4 stroke-[2.8]" />
        </button>

        <aside className="auth-visual relative hidden min-h-[540px] overflow-hidden border-r border-white/10 p-8 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(5,7,8,.25),rgba(5,7,8,.88)),url('/assets/casino/obsidian_bg.jpg')] bg-cover bg-center" />
          <div className="absolute inset-0 opacity-60 [background:radial-gradient(circle_at_22%_18%,rgba(255,255,255,.16),transparent_25%),linear-gradient(120deg,transparent_35%,rgba(255,255,255,.04)_50%,transparent_65%)]" />
          <div className="relative">
            <div className="mb-10 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/25 bg-white text-black shadow-[0_8px_30px_rgba(0,0,0,.35)]">
                <Dices className="h-6 w-6 stroke-[2.6]" />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.32em] text-white/55">XIN AIII</p>
                <p className="text-sm font-black tracking-[.16em]">LIVE PLAY</p>
              </div>
            </div>
            <p className="max-w-xs text-[11px] font-bold uppercase tracking-[.3em] text-white/45">A quieter way to play</p>
            <h2 className="mt-4 max-w-sm text-4xl font-black leading-[.98] tracking-[-.05em] text-white xl:text-5xl">
              Your seat<br />is waiting.
            </h2>
          </div>
          <div className="relative grid gap-3 text-xs text-white/65">
            <div className="flex items-center gap-3 border-t border-white/15 pt-3"><ShieldCheck className="h-4 w-4 text-white stroke-[2.4]" /><span>Secure account access</span></div>
            <div className="flex items-center gap-3"><Sparkles className="h-4 w-4 text-white stroke-[2.4]" /><span>Clean, fast play experience</span></div>
          </div>
        </aside>

        <section className="relative p-5 sm:p-8 lg:p-10">
          <div className="mb-7 pr-10">
            <div className="mb-4 flex items-center gap-2 text-white/50 lg:hidden">
              <Dices className="h-5 w-5 text-white stroke-[2.5]" />
              <span className="text-[10px] font-black uppercase tracking-[.3em]">Xin Aiii Live</span>
            </div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[.28em] text-white/40">Member access</p>
            <h1 id="auth-title" className="text-2xl font-black tracking-[-.04em] sm:text-3xl">
              {tab === 'login' ? 'ပြန်လည်ဝင်ရောက်ပါ' : 'အကောင့်သစ်ဖွင့်ပါ'}
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-white/45">
              {tab === 'login' ? 'သင့်အကောင့်နဲ့ ဆက်လက်ကစားရန် ဝင်ရောက်ပါ။' : 'မိနစ်အနည်းငယ်အတွင်း အကောင့်သစ်တစ်ခု ဖန်တီးပါ။'}
            </p>
          </div>

          <div className="mb-6 grid grid-cols-2 rounded-2xl border border-white/10 bg-black/35 p-1">
            <button type="button" onClick={() => switchTab('login')} className={`auth-tab ${tab === 'login' ? 'auth-tab-active' : ''}`}>အကောင့်ဝင်ရန်</button>
            <button type="button" onClick={() => switchTab('signup')} className={`auth-tab ${tab === 'signup' ? 'auth-tab-active' : ''}`}>အကောင့်သစ်</button>
          </div>

          {errorMessage && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl border border-white/20 bg-white/[.06] p-3 text-xs text-white/80">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-white stroke-[2.5]" />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'signup' && (
              <label className="auth-field-group">
                <span className="auth-label"><User className="h-3.5 w-3.5" /> နာမည်အပြည့်အစုံ</span>
                <span className="auth-input-wrap"><User className="auth-input-icon" /><input type="text" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ဥပမာ - ကိုကျော်ဇင်" className="auth-input" /></span>
              </label>
            )}

            <label className="auth-field-group">
              <span className="auth-label"><Phone className="h-3.5 w-3.5" /> ဖုန်းနံပါတ်</span>
              <span className="auth-input-wrap"><Phone className="auth-input-icon" /><input type="tel" required autoComplete="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09xxxxxxxxx" className="auth-input pl-11 font-mono" /></span>
            </label>

            <label className="auth-field-group">
              <span className="auth-label"><Lock className="h-3.5 w-3.5" /> စကားဝှက်</span>
              <span className="auth-input-wrap"><Lock className="auth-input-icon" /><input type={showPassword ? 'text' : 'password'} required minLength={tab === 'login' ? 6 : 8} autoComplete={tab === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={`အနည်းဆုံး ${tab === 'login' ? 6 : 8} လုံး`} className="auth-input pl-11 pr-11 font-mono" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="auth-eye" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span>
            </label>

            {tab === 'signup' && (
              <div className="rounded-2xl border border-white/12 bg-white/[.035] p-3.5">
                <div className="mb-2 flex items-center justify-between gap-3"><span className="auth-label"><Gift className="h-3.5 w-3.5" /> ဖိတ်ခေါ်ကုဒ်</span>{referralCode ? <span className="flex items-center gap-1 text-[10px] font-bold text-white/70"><Check className="h-3 w-3" /> ချိတ်ဆက်ပြီး</span> : <span className="text-[10px] text-white/35">မထည့်လည်းရသည်</span>}</div>
                <input type="text" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} placeholder="ကုဒ်ရှိပါက ထည့်ပါ" className="auth-input auth-input-compact font-mono uppercase" />
              </div>
            )}

            <button type="submit" disabled={loading} className="auth-submit group">
              <span>{loading ? 'လုပ်ဆောင်နေသည်...' : tab === 'login' ? 'အကောင့်ဝင်ရောက်မည်' : 'အကောင့်ဖွင့်မည်'}</span>
              <ArrowUpRight className="h-4 w-4 stroke-[2.8] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>
          </form>

          <p className="mt-6 text-center text-[10px] leading-relaxed text-white/30">ဆက်လက်လုပ်ဆောင်ခြင်းဖြင့် ဝန်ဆောင်မှုစည်းမျဉ်းများကို သဘောတူပါသည်</p>
        </section>
      </div>
    </div>
  );
}
