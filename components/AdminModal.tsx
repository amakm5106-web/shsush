'use client';

import React, { useState } from 'react';
import {
  ShieldAlert,
  X,
  Check,
  Ban,
  Settings as SettingsIcon,
  BarChart3,
  ArrowDownLeft,
  ArrowUpRight,
  Save,
  Dices,
  RefreshCw,
  Search,
} from 'lucide-react';
import { DepositRequest, GameRound, GameSettings, PlayerBet, WithdrawalRequest } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  pendingDeposits: DepositRequest[];
  pendingWithdrawals: WithdrawalRequest[];
  allBets: PlayerBet[];
  currentRound: GameRound | null;
  onApproveDeposit: (depositId: string, userId: string, amount: number) => Promise<boolean>;
  onDeclineDeposit: (depositId: string) => Promise<boolean>;
  onApproveWithdrawal: (withdrawalId: string, userId: string, amount: number) => Promise<boolean>;
  onDeclineWithdrawal: (withdrawalId: string, userId: string, amount: number, reason?: string) => Promise<boolean>;
  onUpdateSettings: (newSettings: GameSettings) => Promise<boolean>;
  onTriggerRoll: () => void;
}

export function AdminModal({
  isOpen,
  onClose,
  settings,
  pendingDeposits,
  pendingWithdrawals,
  allBets,
  currentRound,
  onApproveDeposit,
  onDeclineDeposit,
  onApproveWithdrawal,
  onDeclineWithdrawal,
  onUpdateSettings,
  onTriggerRoll,
}: AdminModalProps) {
  const [activeTab, setActiveTab] = useState<'deposits' | 'withdrawals' | 'settings' | 'stats'>('deposits');
  const [prevSettings, setPrevSettings] = useState<GameSettings>(settings);
  const [formSettings, setFormSettings] = useState<GameSettings>({ ...settings });
  const [saving, setSaving] = useState<boolean>(false);
  const [selectedReceipt, setSelectedReceipt] = useState<string | null>(null);
  const [rejectionTarget, setRejectionTarget] = useState<WithdrawalRequest | null>(null);
  const [rejectionNote, setRejectionNote] = useState<string>('');

  if (settings !== prevSettings) {
    setPrevSettings(settings);
    setFormSettings({ ...settings });
  }

  if (!isOpen) return null;

  // Analytics computation
  const totalWager = allBets.reduce((acc, b) => acc + (b.amount || 0), 0);
  const totalPayout = allBets.reduce((acc, b) => acc + (b.payout || 0), 0);
  const grossProfit = totalWager - totalPayout;
  const totalWins = allBets.filter((b) => b.status === 'win').length;
  const totalLoss = allBets.filter((b) => b.status === 'loss').length;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const ok = await onUpdateSettings(formSettings);
      if (ok) {
        alert('Settings သိမ်းဆည်းပြီးပါပြီ!');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xl animate-fadeIn">
      <div className="relative w-full max-w-2xl dark-glass rounded-3xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] border border-white/20 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20 text-white">
              <ShieldAlert className="w-5 h-5 stroke-white stroke-[2.4]" />
            </div>
            <div>
              <h3 className="font-black text-white text-base tracking-tight">Admin Control Panel</h3>
              <p className="text-[11px] text-white/70 font-medium">ငွေသွင်း/ငွေထုတ် အတည်ပြုခြင်း & Live Settings</p>
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

        {/* Tab Navigation */}
        <div className="grid grid-cols-4 gap-1.5 p-1.5 dark-glass rounded-2xl my-3 border border-white/15">
          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('deposits');
            }}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'deposits'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            ငွေသွင်း ({pendingDeposits.length})
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('withdrawals');
            }}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'withdrawals'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            ငွေထုတ် ({pendingWithdrawals.length})
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('settings');
            }}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'settings'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <SettingsIcon className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            Settings
          </button>

          <button
            onClick={() => {
              sounds.playChip();
              setActiveTab('stats');
            }}
            className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-black transition-all ${
              activeTab === 'stats'
                ? 'bg-white/20 border border-white/30 text-white shadow-md'
                : 'text-white/60 hover:text-white'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
            စာရင်းအင်း
          </button>
        </div>

        {/* Tab 1: Deposits Management */}
        {activeTab === 'deposits' && (
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5">
            {pendingDeposits.length === 0 ? (
              <div className="py-12 text-center text-xs text-white/60 font-bold">
                စစ်ဆေးရန်ကျန်ရှိသော ငွေသွင်းတောင်းဆိုမှု မရှိပါ။
              </div>
            ) : (
              pendingDeposits.map((dep) => (
                <div
                  key={dep.depositId}
                  className="p-3.5 rounded-2xl dark-glass-card flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-black text-white text-sm">{dep.userName}</span>
                      <span className="text-[11px] text-white/60 font-mono block">ID: {dep.userId.slice(0, 8)}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-base font-black text-white">
                        +{formatKs(dep.amount)}
                      </span>
                      {dep.isFirstDeposit && dep.amount >= 5000 && (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-white/20 text-white border border-white/30 block mt-0.5">
                          +2,000 Ks Bonus ပါဝင်မည်
                        </span>
                      )}
                      <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-white/10 text-white border border-white/15 block mt-0.5">
                        {dep.method}
                      </span>
                    </div>
                  </div>

                  {dep.receiptImage && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedReceipt(dep.receiptImage || null)}
                        className="text-xs font-black text-white underline flex items-center gap-1 py-1 px-2.5 rounded-lg bg-black/40 border border-white/15"
                      >
                        <Search className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                        ပြေစာ Screenshot ကြည့်ရန်
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      onClick={() => onDeclineDeposit(dep.depositId)}
                      className="px-3 py-1.5 rounded-xl dark-glass-btn text-white text-xs font-black flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                      ငြင်းပယ်မည်
                    </button>
                    <button
                      onClick={() => onApproveDeposit(dep.depositId, dep.userId, dep.amount)}
                      className="px-4 py-1.5 rounded-xl dark-glass-btn hover:bg-white/20 border-white/30 text-white text-xs font-black flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                      အတည်ပြုမည်
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Withdrawals Management */}
        {activeTab === 'withdrawals' && (
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2.5">
            {pendingWithdrawals.length === 0 ? (
              <div className="py-12 text-center text-xs text-white/60 font-bold">
                စစ်ဆေးရန်ကျန်ရှိသော ငွေထုတ်တောင်းဆိုမှု မရှိပါ။
              </div>
            ) : (
              pendingWithdrawals.map((withItem) => (
                <div
                  key={withItem.withdrawalId}
                  className="p-3.5 rounded-2xl dark-glass-card flex flex-col gap-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-black text-white text-sm">{withItem.accountName}</span>
                      <span className="text-xs font-bold text-white/80 block">{withItem.phone} ({withItem.method.toUpperCase()})</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-base font-black text-white">
                        -{formatKs(withItem.amount)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/10">
                    <button
                      onClick={() => {
                        setRejectionTarget(withItem);
                        setRejectionNote('ဘဏ်အကောင့် အမည်နှင့် ဖုန်းနံပါတ် မကိုက်ညီပါ');
                      }}
                      className="px-3 py-1.5 rounded-xl dark-glass-btn text-white text-xs font-black flex items-center gap-1"
                    >
                      <Ban className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                      ငြင်းပယ်မည် (Note ဖြင့်)
                    </button>
                    <button
                      onClick={() => onApproveWithdrawal(withItem.withdrawalId, withItem.userId, withItem.amount)}
                      className="px-4 py-1.5 rounded-xl dark-glass-btn hover:bg-white/20 border-white/30 text-white text-xs font-black flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                      ငွေလွှဲပြီး အတည်ပြုမည်
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 3: Live Settings Form */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSaveSettings} className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">KPay ဖုန်းနံပါတ်</label>
                <input
                  type="text"
                  value={formSettings.KPAY_PHONE}
                  onChange={(e) => setFormSettings({ ...formSettings, KPAY_PHONE: e.target.value })}
                  className="py-2 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">KPay အကောင့်အမည်</label>
                <input
                  type="text"
                  value={formSettings.KPAY_NAME}
                  onChange={(e) => setFormSettings({ ...formSettings, KPAY_NAME: e.target.value })}
                  className="py-2 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">Wave ဖုန်းနံပါတ်</label>
                <input
                  type="text"
                  value={formSettings.WAVE_PHONE}
                  onChange={(e) => setFormSettings({ ...formSettings, WAVE_PHONE: e.target.value })}
                  className="py-2 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">Wave အကောင့်အမည်</label>
                <input
                  type="text"
                  value={formSettings.WAVE_NAME}
                  onChange={(e) => setFormSettings({ ...formSettings, WAVE_NAME: e.target.value })}
                  className="py-2 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">အသေး / အကြီး ဆ (Default: 1.9)</label>
                <input
                  type="number"
                  step={0.1}
                  value={formSettings.OVER_UNDER_MULTIPLIER}
                  onChange={(e) => setFormSettings({ ...formSettings, OVER_UNDER_MULTIPLIER: Number(e.target.value) })}
                  className="py-2 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">ဘုံအများဆုံး ၇ ဆ (Default: 3.9)</label>
                <input
                  type="number"
                  step={0.1}
                  value={formSettings.SIX_MULTIPLIER}
                  onChange={(e) => setFormSettings({ ...formSettings, SIX_MULTIPLIER: Number(e.target.value) })}
                  className="py-2 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">တစ်ပွဲ ကြာချိန် (စက္ကန့်)</label>
                <input
                  type="number"
                  value={formSettings.ROUND_DURATION_SECONDS}
                  onChange={(e) => setFormSettings({ ...formSettings, ROUND_DURATION_SECONDS: Number(e.target.value) })}
                  className="py-2 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">Welcome Bonus (Ks)</label>
                <input
                  type="number"
                  value={formSettings.WELCOME_BONUS}
                  onChange={(e) => setFormSettings({ ...formSettings, WELCOME_BONUS: Number(e.target.value) })}
                  className="py-2 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-xs"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">တစ်ရက် အများဆုံးငွေထုတ် ကန့်သတ်ချက် (Ks)</label>
                <input
                  type="number"
                  value={formSettings.MAX_DAILY_WITHDRAWAL || 300000}
                  onChange={(e) => setFormSettings({ ...formSettings, MAX_DAILY_WITHDRAWAL: Number(e.target.value) })}
                  className="py-2 px-3 bg-black/60 rounded-xl border border-white/20 font-black text-white text-xs"
                />
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-white/15 mt-2">
              <button
                type="button"
                onClick={onTriggerRoll}
                className="py-2.5 px-4 rounded-xl dark-glass-btn text-white font-black text-xs flex items-center gap-1.5"
              >
                <Dices className="w-4 h-4 stroke-white stroke-[2.4]" />
                ချက်ချင်း Roll စတင်မည် (Force Roll)
              </button>

              <button
                type="submit"
                disabled={saving}
                className="py-2.5 px-5 rounded-xl dark-glass-btn hover:bg-white/20 border-white/30 text-white font-black text-xs flex items-center gap-1.5 shadow-md"
              >
                <Save className="w-4 h-4 stroke-white stroke-[2.4]" />
                {saving ? 'သိမ်းဆည်းနေပါသည်...' : 'Settings သိမ်းဆည်းမည်'}
              </button>
            </div>
          </form>
        )}

        {/* Tab 4: Analytics */}
        {activeTab === 'stats' && (
          <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-3 text-xs">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-white/70 font-bold">စုစုပေါင်း လောင်းကြေး</span>
                <span className="text-lg font-black text-white mt-1 font-mono">{formatKs(totalWager)}</span>
              </div>
              <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-white/70 font-bold">စုစုပေါင်း လျော်ကြေး</span>
                <span className="text-lg font-black text-white mt-1 font-mono">{formatKs(totalPayout)}</span>
              </div>
              <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-white/70 font-bold">စုစုပေါင်း အသားတင် အမြတ်</span>
                <span className="text-lg font-black text-white mt-1 font-mono">{formatKs(grossProfit)}</span>
              </div>
              <div className="p-3.5 rounded-2xl dark-glass-card flex flex-col">
                <span className="text-white/70 font-bold">အနိုင်/အရှုံး အကြိမ်</span>
                <span className="text-lg font-black text-white mt-1 font-mono">
                  နိုင် {totalWins} / ရှုံး {totalLoss}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Admin Withdrawal Rejection Reason Dialog */}
        {rejectionTarget && (
          <div className="fixed inset-0 z-70 bg-black/90 backdrop-blur-xl flex items-center justify-center p-4 animate-fadeIn">
            <div className="relative w-full max-w-sm dark-glass rounded-3xl p-5 border border-white/20 shadow-2xl flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h4 className="text-sm font-black text-white">ငွေထုတ် ပယ်ချရသည့် အကြောင်းအရင်း</h4>
                <button
                  onClick={() => setRejectionTarget(null)}
                  className="p-1 rounded-full text-white/60 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-2.5 rounded-xl bg-black/50 border border-white/10 text-xs flex flex-col gap-1">
                <div className="flex justify-between text-white/80">
                  <span>ကစားသူ:</span>
                  <span className="font-bold text-white">{rejectionTarget.userName}</span>
                </div>
                <div className="flex justify-between text-white/80">
                  <span>ထုတ်ယူငွေ:</span>
                  <span className="font-bold text-white font-mono">{formatKs(rejectionTarget.amount)}</span>
                </div>
              </div>

              {/* Common Reason Preset Buttons */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-white/60 font-bold">အမြန်ရွေးချယ်ရန်:</span>
                <div className="flex flex-wrap gap-1">
                  {[
                    'ဘဏ်အကောင့် အမည်နှင့် ဖုန်းနံပါတ် မကိုက်ညီပါ',
                    'လိုအပ်သော လောင်းကြေး (Turnover) မပြည့်မီသေးပါ',
                    'တစ်ရက်တာ ငွေထုတ်ကန့်သတ်ချက် ပြည့်သွားပါပြီ',
                    'ဘဏ်စနစ် ယာယီပြုပြင်နေပါသည်',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectionNote(preset)}
                      className={`text-[10px] py-1 px-2 rounded-lg border text-left transition-all ${
                        rejectionNote === preset
                          ? 'bg-white text-black font-bold border-white'
                          : 'bg-white/5 text-white/80 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Note Input */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-bold text-white">အသေးစိတ် အကြောင်းအရင်း စာသား:</label>
                <textarea
                  value={rejectionNote}
                  onChange={(e) => setRejectionNote(e.target.value)}
                  rows={3}
                  placeholder="ပယ်ချရသည့် အကြောင်းအရင်းကို ရေးပါ..."
                  className="p-2.5 rounded-xl bg-black/60 border border-white/20 text-white text-xs resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setRejectionTarget(null)}
                  className="flex-1 py-2 rounded-xl bg-white/10 text-white font-bold text-xs hover:bg-white/15"
                >
                  မလုပ်တော့ပါ
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await onDeclineWithdrawal(
                      rejectionTarget.withdrawalId,
                      rejectionTarget.userId,
                      rejectionTarget.amount,
                      rejectionNote.trim() || 'အကြောင်းပြချက် မဖော်ပြထားပါ'
                    );
                    if (ok) {
                      setRejectionTarget(null);
                      alert('ငွေထုတ်တောင်းဆိုမှုကို ပယ်ချပြီး User ထံ အကြောင်းပြချက် ပေးပို့ပြီးပါပြီ။');
                    }
                  }}
                  className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs active:scale-95 transition-all shadow-md"
                >
                  ပယ်ချမည် (Confirm)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Receipt Image Lightbox Modal */}
        {selectedReceipt && (
          <div className="fixed inset-0 z-60 bg-black/95 flex items-center justify-center p-4">
            <div className="relative max-w-lg w-full flex flex-col items-center">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="absolute -top-10 right-0 p-2 text-white bg-white/20 rounded-full"
              >
                <X className="w-5 h-5 stroke-white stroke-[2.4]" />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedReceipt}
                alt="Receipt Full View"
                className="max-h-[80vh] w-auto rounded-2xl border border-white/20 object-contain"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
