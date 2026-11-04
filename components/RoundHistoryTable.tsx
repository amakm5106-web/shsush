'use client';

import React from 'react';
import {
  Table as TableIcon,
  TrendingDown,
  TrendingUp,
  Sparkles,
  Clock,
} from 'lucide-react';
import { GameRound } from '@/lib/types';

interface RoundHistoryTableProps {
  rounds: GameRound[];
}

export function RoundHistoryTable({ rounds }: RoundHistoryTableProps) {
  const smallCount = rounds.filter((r) => r.resultClass === 'small').length;
  const bigCount = rounds.filter((r) => r.resultClass === 'big').length;
  const commonCount = rounds.filter((r) => r.resultClass === 'common').length;

  return (
    <div className="w-full dark-glass rounded-3xl p-4 flex flex-col gap-3">
      {/* Header with White Bold Line Action Icon */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/15">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-white/10 border border-white/20 text-white">
            <TableIcon className="w-4 h-4 stroke-white stroke-[2.2]" />
          </div>
          <div>
            <h3 className="font-extrabold text-white text-xs tracking-tight">ပွဲစဉ်မှတ်တမ်း ဇယား</h3>
            <p className="text-[10px] text-white/70 font-medium">Round History & Dice Sum Table</p>
          </div>
        </div>

        {/* Mini stats chips with white bold icons */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="px-2.5 py-1 rounded-lg dark-glass-btn flex items-center gap-1.5 text-white font-extrabold">
            <TrendingDown className="w-3 h-3 stroke-white stroke-[2.4]" />
            <span>သေး ({smallCount})</span>
          </span>
          <span className="px-2.5 py-1 rounded-lg dark-glass-btn flex items-center gap-1.5 text-white font-extrabold">
            <Sparkles className="w-3 h-3 stroke-white stroke-[2.4]" />
            <span>၇ ({commonCount})</span>
          </span>
          <span className="px-2.5 py-1 rounded-lg dark-glass-btn flex items-center gap-1.5 text-white font-extrabold">
            <TrendingUp className="w-3 h-3 stroke-white stroke-[2.4]" />
            <span>ကြီး ({bigCount})</span>
          </span>
        </div>
      </div>

      {/* Dark Glasses Table */}
      <div className="w-full overflow-x-auto rounded-2xl border border-white/10 bg-black/40">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/15 bg-white/[0.05] text-white text-[11px] font-extrabold">
              <th className="py-3 px-3.5">ပွဲစဉ်</th>
              <th className="py-3 px-3.5">အံစာတုံး ပေါင်းလဒ်</th>
              <th className="py-3 px-3.5 text-right">အမျိုးအစား</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10 font-bold">
            {rounds.length === 0 ? (
              <tr>
                <td colSpan={3} className="py-8 text-center text-white/60 text-xs">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Clock className="w-5 h-5 text-white/50 stroke-white stroke-[2]" />
                    <span className="font-bold text-white/80">ပွဲစဉ်မှတ်တမ်း မရှိသေးပါ။ ပွဲစဉ်ရလဒ်ထွက်ပေါ်ချိန်တွင် အလိုအလျောက် ပြသပေးပါမည်။</span>
                  </div>
                </td>
              </tr>
            ) : (
              rounds.slice(0, 15).map((r, index) => {
                const d1 = r.dice1 ?? 0;
                const d2 = r.dice2 ?? 0;
                const sum = r.totalResult ?? d1 + d2;
                const isSeven = sum === 7;
                const isBig = sum >= 8;

                return (
                  <tr
                    key={`round-row-${r.roundId}-${r.settledAt || index}-${index}`}
                    className="hover:bg-white/[0.06] transition-colors"
                  >
                    {/* Round ID Column */}
                    <td className="py-3 px-3.5 text-white font-mono text-xs font-black">
                      <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/15 text-white font-black">
                        #{r.roundId}
                      </span>
                    </td>

                    {/* Dice Calculation Column: e.g. 2 + 4 = 6 */}
                    <td className="py-3 px-3.5">
                      <div className="inline-flex items-center gap-1.5 font-black text-white">
                        <span className="font-mono text-white/90 text-xs">{d1} + {d2}</span>
                        <span className="text-white/40">=</span>
                        <span className="font-mono text-sm font-black text-white px-1.5 py-0.5 rounded bg-white/10 border border-white/15">
                          {sum}
                        </span>
                      </div>
                    </td>

                    {/* Category Label Column: အသေး / ဘုံအများဆုံး ၇ / အကြီး */}
                    <td className="py-3 px-3.5 text-right">
                      {isSeven ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-white/15 border border-white/25 text-white shadow-sm">
                          <Sparkles className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                          <span>ဘုံအများဆုံး ၇</span>
                        </span>
                      ) : isBig ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-white/15 border border-white/25 text-white shadow-sm">
                          <TrendingUp className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                          <span>အကြီး</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-white/15 border border-white/25 text-white shadow-sm">
                          <TrendingDown className="w-3.5 h-3.5 stroke-white stroke-[2.4]" />
                          <span>အသေး</span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
