'use client';

import React from 'react';
import {
  History,
  X,
  CheckCircle2,
  XCircle,
  Clock,
} from 'lucide-react';
import { PlayerBet } from '@/lib/types';
import { formatKs } from '@/lib/constants';
import { sounds } from '@/lib/audio';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  bets: PlayerBet[];
}

export function HistoryModal({ isOpen, onClose, bets }: HistoryModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-xl animate-fadeIn">
      <div className="relative w-full max-w-md dark-glass rounded-3xl p-5 shadow-[0_20px_60px_rgba(0,0,0,0.85)] border border-white/20 flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-2xl bg-white/10 border border-white/20 text-white">
              <History className="w-5 h-5 stroke-white stroke-[2.4]" />
            </div>
            <div>
              <h3 className="font-black text-white text-base tracking-tight">လောင်းကြေးမှတ်တမ်း</h3>
              <p className="text-[11px] text-white/70 font-medium">သင်၏ အံစာတုံး ထိုးမှတ်တမ်း & အနိုင်အရှုံးများ</p>
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

        {/* Bets List in Dark Glass Cards */}
        <div className="flex-1 overflow-y-auto py-3 pr-1 flex flex-col gap-2">
          {bets.length === 0 ? (
            <div className="p-10 text-center text-xs text-white/60 flex flex-col items-center justify-center gap-2">
              <Clock className="w-8 h-8 stroke-white stroke-[2]" />
              <span className="font-bold text-white/80">လတ်တလော လောင်းကြေးမှတ်တမ်း မရှိသေးပါ။</span>
            </div>
          ) : (
            bets.map((bet, idx) => {
              const isWin = bet.status === 'win';
              const isPending = bet.status === 'pending';

              return (
                <div
                  key={`history-bet-${bet.betId || idx}-${idx}`}
                  className="p-3.5 rounded-2xl dark-glass-card flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-md font-black text-xs bg-white/15 border border-white/20 text-white font-mono">
                        #{bet.roundId}
                      </span>
                      <span className="font-black text-xs text-white">
                        {bet.selection} ({bet.multiplier}x)
                      </span>
                    </div>

                    <div className="flex items-center gap-1 font-black text-xs">
                      {isWin && (
                        <span className="flex items-center gap-1 text-white">
                          <CheckCircle2 className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                          နိုင်ငွေ +{formatKs(bet.payout)}
                        </span>
                      )}
                      {!isWin && !isPending && (
                        <span className="flex items-center gap-1 text-white/70">
                          <XCircle className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                          ရှုံး
                        </span>
                      )}
                      {isPending && (
                        <span className="flex items-center gap-1 text-white/80">
                          <Clock className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                          စောင့်ဆိုင်းဆဲ
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-white/70 font-bold border-t border-white/10 pt-1 mt-0.5">
                    <span>လောင်းကြေး: {formatKs(bet.amount)}</span>
                    <span className="font-mono">
                      {new Date(bet.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
