'use client';

import { useCallback, useState } from 'react';
import { ArrowLeft, Crosshair, Fish, RotateCcw, Target, Waves } from 'lucide-react';
import { sounds } from '@/lib/audio';

interface FishingGameProps {
  onBack: () => void;
}

type Catch = { id: number; x: number; y: number; size: number; tone: 'light' | 'silver' | 'dark' };

const createCatch = (id: number): Catch => ({
  id,
  x: 12 + Math.random() * 76,
  y: 18 + Math.random() * 66,
  size: 34 + Math.random() * 26,
  tone: Math.random() > 0.66 ? 'light' : Math.random() > 0.45 ? 'silver' : 'dark',
});

export function FishingGame({ onBack }: FishingGameProps) {
  const [score, setScore] = useState(0);
  const [shots, setShots] = useState(15);
  const [caught, setCaught] = useState(0);
  const [round, setRound] = useState(1);
  const [fish, setFish] = useState<Catch[]>(() => [1, 2, 3, 4, 5].map(createCatch));
  const [message, setMessage] = useState('ငါးကို ချိန်ပြီး ပစ်ပါ');

  const reset = useCallback(() => {
    setScore(0);
    setShots(15);
    setCaught(0);
    setRound((value) => value + 1);
    setFish([1, 2, 3, 4, 5].map(createCatch));
    setMessage('ငါးကို ချိန်ပြီး ပစ်ပါ');
  }, []);

  const shoot = (target: Catch) => {
    if (shots <= 0) return;
    sounds.playChip();
    const remainingShots = shots - 1;
    setShots((value) => value - 1);
    setCaught((value) => value + 1);
    setScore((value) => value + Math.round(10 + target.size / 2));
    setMessage(remainingShots === 0 ? 'အလှည့်ပြီးပါပြီ — ပြန်စကစားနိုင်ပါတယ်' : 'အောင်မြင်စွာ ဖမ်းမိပါပြီ');
    setFish((current) => [...current.filter((item) => item.id !== target.id), createCatch(Date.now())]);
  };
  const cannonLabel = shots > 0 ? `ပစ်ခွင့် ${shots}` : 'ပစ်ခွင့်ကုန်ပါပြီ';

  return (
    <div className="fishing-arena relative min-h-[680px] overflow-hidden rounded-[26px] border border-white/15 bg-[#07141b] p-3 text-white shadow-2xl sm:p-5">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,13,18,.2),rgba(3,8,12,.82)),url('/assets/casino/fishing_bg.jpg')] bg-cover bg-center" />
      <div className="relative z-10 flex min-h-[650px] flex-col">
        <header className="mb-4 flex items-center justify-between gap-3">
          <button onClick={onBack} className="icon-action border-white/20 bg-black/35 text-white"><ArrowLeft className="h-4 w-4" /><span className="hidden sm:inline">Lobby</span></button>
          <div className="text-center"><p className="text-[9px] font-black uppercase tracking-[.28em] text-white/45">Xsite Casinos Arcade</p><h1 className="mt-1 text-lg font-black tracking-[-.03em]">Deep Sea Catch</h1></div>
          <button onClick={reset} className="icon-action border-white/20 bg-black/35 text-white" title="Restart"><RotateCcw className="h-4 w-4" /></button>
        </header>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="fishing-stat"><span>Score</span><b>{score}</b></div>
          <div className="fishing-stat"><span>Catches</span><b>{caught}</b></div>
          <div className="fishing-stat"><span>Round</span><b>#{round}</b></div>
        </div>

        <div className="relative flex-1 overflow-hidden rounded-[22px] border border-white/10 bg-black/10">
          <div className="absolute inset-x-0 top-5 flex justify-center text-[10px] font-bold uppercase tracking-[.22em] text-white/40"><Waves className="mr-2 h-3.5 w-3.5" /> {message}</div>
          {fish.map((target) => (
            <button
              key={target.id}
              onClick={() => shoot(target)}
              disabled={shots <= 0}
              aria-label="Catch fish"
              className={`fish-target fish-${target.tone} ${shots <= 0 ? 'cursor-default opacity-55' : ''}`}
              style={{ left: `${target.x}%`, top: `${target.y}%`, width: target.size, height: target.size * .62 }}
            >
              <Fish className="h-full w-full fill-current stroke-[1.4]" />
              <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100"><Crosshair className="h-5 w-5 stroke-[2.8]" /></span>
            </button>
          ))}
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-center">
            <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-bold text-white/55"><Target className="h-3.5 w-3.5" /> {cannonLabel}</div>
            <div className="mx-auto h-2 w-28 overflow-hidden rounded-full bg-black/45"><div className="h-full bg-white transition-all" style={{ width: `${(shots / 15) * 100}%` }} /></div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-[10px] text-white/55 backdrop-blur-md">
          <span>ငါးကိုနှိပ်ပြီး ဖမ်းပါ · Practice mode</span>
          <span className="font-black text-white">{score} pts</span>
        </div>
      </div>
    </div>
  );
}
