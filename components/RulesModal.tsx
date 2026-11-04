'use client';

import React from 'react';
import {
  HelpCircle,
  X,
  Dices,
  Crown,
  TrendingDown,
  TrendingUp,
  Percent,
  Gift,
  ShieldCheck,
} from 'lucide-react';
import { GameSettings } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
}

export function RulesModal({ isOpen, onClose, settings }: RulesModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xl animate-fadeIn">
      <div className="relative w-full max-w-lg dark-glass rounded-3xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] border border-white/20 flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20 text-white">
              <Dices className="w-5 h-5 stroke-white stroke-[2.4]" />
            </div>
            <div>
              <h3 className="font-black text-white text-base tracking-tight">အံစာတုံး ကစားနည်း & စည်းမျဉ်းများ</h3>
              <p className="text-[11px] text-white/70 font-medium">Official Game Rules & Payout Guide</p>
            </div>
          </div>

          <button
            onClick={() => {
              sounds.playChip();
              onClose();
            }}
            className="p-2 rounded-xl dark-glass-btn text-white active:scale-90"
          >
            <X className="w-5 h-5 stroke-white stroke-[2.4]" />
          </button>
        </div>

        {/* Scrollable Rules Content */}
        <div className="flex-1 overflow-y-auto py-3 pr-1 flex flex-col gap-3 text-xs">
          {/* General Mechanism */}
          <div className="p-4 rounded-2xl dark-glass-card">
            <h4 className="font-black text-white flex items-center gap-2 mb-2 text-sm">
              <ShieldCheck className="w-4 h-4 stroke-white stroke-[2.4]" />
              အခြေခံ ကစားနည်းပုံစံ
            </h4>
            <p className="text-white/80 leading-relaxed font-bold">
              အံစာတုံး ၂ တုံးကို တစ်ပြိုင်နက်တည်း လှည့်၍ ကျရောက်လာသော အမှတ် ၂ ခု၏ ပေါင်းလဒ် (၂ မှ ၁၂ အထိ) ကို ခန့်မှန်း၍ လောင်းကြေးထပ်ရပါမည်။
              တစ်ပွဲလျှင် စက္ကန့် ၆၀ သတ်မှတ်ထားပြီး ကစားသူအားလုံး တပြိုင်နက်တည်း တစ်ပြေးညီ ဆော့ကစားကြရပါသည်။
            </p>
          </div>

          {/* Over / Under & Common 7 Rule */}
          <div className="p-4 rounded-2xl dark-glass-card">
            <h4 className="font-black text-white flex items-center gap-2 mb-2 text-sm">
              <Crown className="w-4 h-4 stroke-white stroke-[2.4]" />
              အဓိက ရွေးချယ်မှု ၃ မျိုး (Mutually Exclusive)
            </h4>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="p-2.5 rounded-xl bg-black/60 border border-white/15 flex flex-col items-center text-center">
                <span className="font-black text-white flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                  အသေး (၂-၆)
                </span>
                <span className="font-black text-white text-xs mt-1">{settings.OVER_UNDER_MULTIPLIER}x ဆ</span>
              </div>

              <div className="p-2.5 rounded-xl bg-black/60 border border-white/20 flex flex-col items-center text-center">
                <span className="font-black text-white flex items-center gap-1">
                  <Crown className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                  ဘုံအများဆုံး ၇
                </span>
                <span className="font-black text-white text-xs mt-1">{settings.SIX_MULTIPLIER}x ဆ</span>
              </div>

              <div className="p-2.5 rounded-xl bg-black/60 border border-white/15 flex flex-col items-center text-center">
                <span className="font-black text-white flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                  အကြီး (၈-၁၂)
                </span>
                <span className="font-black text-white text-xs mt-1">{settings.OVER_UNDER_MULTIPLIER}x ဆ</span>
              </div>
            </div>
            <p className="mt-2.5 text-[11px] text-white/70 font-medium">
              * မှတ်ချက်: ပေါင်းလဒ် ၇ ကျရောက်ပါက အသေး သို့မဟုတ် အကြီး ထိုးထားသူများ ရှုံးနိမ့်မည်ဖြစ်ပြီး ၇ ထိုးထားသူများသာ အလျော်ရရှိပါမည်။
            </p>
          </div>

          {/* Specific Numbers Rule */}
          <div className="p-4 rounded-2xl dark-glass-card">
            <h4 className="font-black text-white flex items-center gap-2 mb-2 text-sm">
              <Dices className="w-4 h-4 stroke-white stroke-[2.4]" />
              ဂဏန်း အတိအကျ ထိုးခြင်း (၂ မှ ၁၂)
            </h4>
            <p className="text-white/80 leading-relaxed font-bold">
              ကျရောက်မည့် ဂဏန်းအတိအကျကို ထိုးနိုင်သည်။
              ဂဏန်း ၇ အတွက် <strong>{settings.SIX_MULTIPLIER}x ဆ</strong> ရရှိပြီး၊
              အခြားဂဏန်းများအတွက် <strong>{settings.DEFAULT_NUM_MULTIPLIER}x ဆ</strong> အသီးသီး လျော်ကြေးပေးပါသည်။
            </p>
          </div>

          {/* Deposit & Withdrawal Rules from bot.py */}
          <div className="p-4 rounded-2xl dark-glass-card">
            <h4 className="font-black text-white flex items-center gap-2 mb-2 text-sm">
              <Percent className="w-4 h-4 stroke-white stroke-[2.4]" />
              ငွေသွင်း/ထုတ် & မိတ်ဆက် စည်းကမ်းချက်များ
            </h4>
            <ul className="list-disc list-inside space-y-1.5 text-white/80 font-bold">
              <li>ပထမဆုံး ငွေသွင်းအနည်းဆုံး: <strong>{formatKs(settings.MINIMUM_FIRST_DEPOSIT)}</strong></li>
              <li>နောက်ပိုင်း ငွေသွင်းအနည်းဆုံး: <strong>{formatKs(settings.MINIMUM_DEPOSIT)}</strong></li>
              <li>အနည်းဆုံး ငွေထုတ်ပမာဏ: <strong>{formatKs(settings.MINIMUM_WITHDRAW)}</strong></li>
              <li>
                ပထမဆုံး ငွေထုတ်ယူခွင့်ရရန် အတည်ပြုပြီး ငွေသွင်းစုစုပေါင်း <strong>{formatKs(settings.FIRST_WITHDRAW_DEPOSIT_REQUIRED)}</strong> ပြည့်ရပါမည်။
              </li>
              <li>
                ဒုတိယအကြိမ်နှင့် နောက်ပိုင်း ငွေထုတ်ရန် ထုတ်ယူမည့်ပမာဏ၏ <strong>{settings.WITHDRAW_WAGER_PERCENT * 100}%</strong> လောင်းကြေးပြည့်ရပါမည်။
              </li>
              <li>
                မိတ်ဆက်ကော်မရှင် <strong>{settings.COMMISSION_RATE * 100}%</strong> + မိတ်ဆက်သူ {formatKs(settings.PROMO_BET_THRESHOLD)} လောင်းပြီးပါက Promo Bonus <strong>{formatKs(settings.PROMO_BONUS_AMOUNT)}</strong> ရရှိမည်။
              </li>
            </ul>
          </div>
        </div>

        {/* Close Button */}
        <div className="pt-3 border-t border-white/15">
          <button
            onClick={() => {
              sounds.playChip();
              onClose();
            }}
            className="w-full py-3 rounded-2xl dark-glass-btn hover:bg-white/20 border border-white/25 text-white font-black text-xs active:scale-95 transition-all shadow-md"
          >
            နားလည်ပါပြီ
          </button>
        </div>
      </div>
    </div>
  );
}
