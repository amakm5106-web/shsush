import React from 'react';
import { Volume2, VolumeX, Maximize2, ChevronLeft } from 'lucide-react';

interface ChargeBuffaloHeroBannerProps {
  onBack: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onBuyBonus: () => void;
  betAmount: number;
}

export function ChargeBuffaloHeroBanner({
  onBack,
  soundEnabled,
  onToggleSound,
  onBuyBonus,
  betAmount,
}: ChargeBuffaloHeroBannerProps) {
  const toggleFullScreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div className="relative w-full rounded-t-3xl overflow-hidden shadow-2xl border-x-2 border-t-2 border-amber-600/40 select-none bg-gradient-to-b from-sky-400 via-amber-200 to-amber-700">
      {/* Background SVG: Sky, Sun Rays, Sandstone Canyon & Charging Buffalo */}
      <svg
        viewBox="0 0 400 240"
        className="w-full h-auto block"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Sky Gradient */}
          <linearGradient id="hero_sky" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#4895ef" />
            <stop offset="35%" stopColor="#70d6ff" />
            <stop offset="70%" stopColor="#ffd166" />
            <stop offset="100%" stopColor="#f48c06" />
          </linearGradient>

          {/* Distant Canyon Mesas */}
          <linearGradient id="canyon_far" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#b08968" />
            <stop offset="60%" stopColor="#7f4f24" />
            <stop offset="100%" stopColor="#582f0e" />
          </linearGradient>

          {/* Closer Red Rock Canyon */}
          <linearGradient id="canyon_near" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e76f51" />
            <stop offset="50%" stopColor="#c84c2a" />
            <stop offset="100%" stopColor="#872910" />
          </linearGradient>

          {/* Prairie Grasslands */}
          <linearGradient id="grass_plains" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e9c46a" />
            <stop offset="40%" stopColor="#c79930" />
            <stop offset="100%" stopColor="#7a5509" />
          </linearGradient>

          {/* Charging Buffalo Fur Gradients */}
          <radialGradient id="buf_body_rad" cx="50%" cy="40%" r="55%">
            <stop offset="0%" stopColor="#934d1b" />
            <stop offset="50%" stopColor="#5c2e0b" />
            <stop offset="90%" stopColor="#301503" />
            <stop offset="100%" stopColor="#1a0a01" />
          </radialGradient>

          <linearGradient id="buf_horn_metallic" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#374151" />
            <stop offset="50%" stopColor="#9ca3af" />
            <stop offset="100%" stopColor="#111827" />
          </linearGradient>

          {/* 3D Gold Title Gradient */}
          <linearGradient id="gold_title_grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fffdf0" />
            <stop offset="25%" stopColor="#ffea75" />
            <stop offset="50%" stopColor="#e5a912" />
            <stop offset="85%" stopColor="#a76803" />
            <stop offset="100%" stopColor="#633b00" />
          </linearGradient>

          <filter id="shadow_deep" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#000" floodOpacity="0.8" />
          </filter>
        </defs>

        {/* 1. Sky */}
        <rect width="400" height="240" fill="url(#hero_sky)" />

        {/* Clouds */}
        <g opacity="0.6">
          <ellipse cx="60" cy="50" rx="40" ry="14" fill="#ffffff" />
          <ellipse cx="85" cy="45" rx="30" ry="18" fill="#ffffff" />
          <ellipse cx="320" cy="65" rx="50" ry="16" fill="#ffffff" />
          <ellipse cx="350" cy="60" rx="35" ry="18" fill="#ffffff" />
        </g>

        {/* 2. Far Mesas (Canyons) */}
        <path
          d="M 0 140 L 40 110 L 70 110 L 100 135 L 140 120 L 190 120 L 230 145 L 280 125 L 340 125 L 370 140 L 400 130 L 400 180 L 0 180 Z"
          fill="url(#canyon_far)"
          opacity="0.85"
        />

        {/* 3. Near Canyon Cliffs (Left & Right Flanks) */}
        {/* Left Canyon Wall */}
        <path
          d="M 0 70 L 35 80 L 50 155 L 75 165 L 110 180 L 0 185 Z"
          fill="url(#canyon_near)"
        />
        {/* Right Canyon Wall */}
        <path
          d="M 400 75 L 365 85 L 345 150 L 315 165 L 290 180 L 400 185 Z"
          fill="url(#canyon_near)"
        />

        {/* Canyon Strata Lines */}
        <path d="M 0 100 Q 25 105 45 110 M 0 130 Q 30 135 60 140" stroke="#ffd166" strokeWidth="1.2" opacity="0.4" />
        <path d="M 400 105 Q 375 110 355 115 M 400 135 Q 370 140 330 145" stroke="#ffd166" strokeWidth="1.2" opacity="0.4" />

        {/* 4. Prairie Ground Slope */}
        <path
          d="M 0 170 Q 200 155 400 170 L 400 240 L 0 240 Z"
          fill="url(#grass_plains)"
        />
        {/* Prairie Road / Charging Dust Track */}
        <path
          d="M 160 240 L 195 175 L 205 175 L 240 240 Z"
          fill="#8c5825"
          opacity="0.7"
        />

        {/* Dust Clouds at Buffalo Hooves */}
        <g opacity="0.75">
          <ellipse cx="170" cy="225" rx="28" ry="12" fill="#e9c46a" />
          <ellipse cx="230" cy="225" rx="28" ry="12" fill="#e9c46a" />
          <ellipse cx="190" cy="232" rx="20" ry="8" fill="#ffd166" />
          <ellipse cx="210" cy="232" rx="20" ry="8" fill="#ffd166" />
        </g>

        {/* 5. Center Charging Buffalo (Full Body Dramatic Perspective) */}
        <g filter="url(#shadow_deep)" transform="translate(200, 160)">
          {/* Buffalo Ground Shadow */}
          <ellipse cx="0" cy="65" rx="55" ry="12" fill="#301503" opacity="0.7" />

          {/* Massive Powerful Shoulders & Hump */}
          <ellipse cx="0" cy="-25" rx="46" ry="42" fill="url(#buf_body_rad)" />

          {/* Hind Quarters */}
          <ellipse cx="0" cy="15" rx="36" ry="32" fill="#3f1e09" />

          {/* Front Charging Legs */}
          {/* Left Front Leg */}
          <path
            d="M -22 15 L -26 55 L -16 57 L -12 25 Z"
            fill="#2c1405"
            stroke="#1a0a01"
            strokeWidth="1"
          />
          {/* Hoof Left */}
          <path d="M -26 55 L -28 62 L -14 62 L -16 55 Z" fill="#0f0702" />

          {/* Right Front Leg (Galloping Forward) */}
          <path
            d="M 12 18 L 18 52 L 28 50 L 22 15 Z"
            fill="#2c1405"
            stroke="#1a0a01"
            strokeWidth="1"
          />
          {/* Hoof Right */}
          <path d="M 18 52 L 19 59 L 31 57 L 28 50 Z" fill="#0f0702" />

          {/* Massive Horns */}
          <g>
            {/* Left Horn */}
            <path
              d="M -22 -35 C -36 -58 -62 -55 -60 -36 C -58 -22 -40 -12 -22 -18 C -32 -22 -44 -28 -44 -36 C -44 -44 -28 -44 -22 -35 Z"
              fill="url(#buf_horn_metallic)"
              stroke="#0f0702"
              strokeWidth="1.2"
            />
            {/* Right Horn */}
            <path
              d="M 22 -35 C 36 -58 62 -55 60 -36 C 58 -22 40 -12 22 -18 C 32 -22 44 -28 44 -36 C 44 -44 28 -44 22 -35 Z"
              fill="url(#buf_horn_metallic)"
              stroke="#0f0702"
              strokeWidth="1.2"
            />
          </g>

          {/* Buffalo Head / Face */}
          <path
            d="M -24 -36 C -24 -52 -12 -58 0 -58 C 12 -58 24 -52 24 -36 C 24 -15 18 5 0 8 C -18 5 -24 -15 -24 -36 Z"
            fill="url(#buf_body_rad)"
            stroke="#1a0a01"
            strokeWidth="1"
          />

          {/* Forehead Wool Tufts (Dense Golden-Brown Curl) */}
          <path
            d="M -18 -48 C -12 -58 12 -58 18 -48 C 22 -38 16 -28 0 -30 C -16 -28 -22 -38 -18 -48 Z"
            fill="#b86927"
          />
          <path d="M -12 -44 L -10 -36 M -4 -46 L -3 -34 M 4 -46 L 3 -34 M 12 -44 L 10 -36" stroke="#f4a261" strokeWidth="1.5" strokeLinecap="round" />

          {/* Eyes with Fierce Highlight */}
          <g>
            {/* Left Eye */}
            <ellipse cx="-13" cy="-30" rx="3.5" ry="2.2" fill="#0d0501" />
            <circle cx="-12.5" cy="-30" r="1.3" fill="#e76f51" />
            <circle cx="-12" cy="-30.5" r="0.5" fill="#ffffff" />
            {/* Right Eye */}
            <ellipse cx="13" cy="-30" rx="3.5" ry="2.2" fill="#0d0501" />
            <circle cx="12.5" cy="-30" r="1.3" fill="#e76f51" />
            <circle cx="12" cy="-30.5" r="0.5" fill="#ffffff" />
          </g>

          {/* Broad Snout & Flared Nostrils */}
          <path
            d="M -11 -12 C -11 -16 -6 -18 0 -18 C 6 -18 11 -16 11 -12 C 11 -2 8 4 0 4 C -8 4 -11 -2 -11 -12 Z"
            fill="#150a04"
          />
          {/* Nostrils */}
          <ellipse cx="-5" cy="-6" rx="2.5" ry="3.2" fill="#000" />
          <ellipse cx="5" cy="-6" rx="2.5" ry="3.2" fill="#000" />

          {/* Chin Beard */}
          <path
            d="M -8 5 L -5 18 L 0 15 L 5 18 L 7 5 Z"
            fill="#1f0c03"
          />
        </g>
      </svg>

      {/* Top Floating Action Controls (Back, Title, Sound, Expand) */}
      <div className="absolute top-2.5 inset-x-3 flex items-center justify-between z-20">
        {/* Left: Circular Blue Back Button */}
        <button
          onClick={onBack}
          className="w-10 h-10 rounded-full bg-blue-900/80 hover:bg-blue-800 border border-blue-400/40 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all backdrop-blur-md"
          title="ဂိမ်းများသို့ ပြန်သွားမည်"
        >
          <ChevronLeft className="w-6 h-6 stroke-white stroke-[2.8]" />
        </button>

        {/* Center: Glowing 3D Golden Title */}
        <div className="flex flex-col items-center select-none pointer-events-none">
          <h1
            className="text-2xl sm:text-3xl font-black italic tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-white via-amber-200 to-amber-500"
            style={{
              textShadow:
                '0 2px 4px rgba(0,0,0,0.9), 0 0 12px rgba(251,191,36,0.6), 0 4px 10px rgba(120,53,15,0.8)',
              fontFamily: 'serif, system-ui',
            }}
          >
            Charge Buffalo
          </h1>
        </div>

        {/* Right: Sound & Fullscreen Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleSound}
            className="w-9 h-9 rounded-full bg-blue-900/80 hover:bg-blue-800 border border-blue-400/40 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all backdrop-blur-md"
            title="အသံ အဖွင့်/အပိတ်"
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4 stroke-white stroke-[2.4]" />
            ) : (
              <VolumeX className="w-4 h-4 stroke-white stroke-[2.4]" />
            )}
          </button>
          <button
            onClick={toggleFullScreen}
            className="w-9 h-9 rounded-full bg-blue-900/80 hover:bg-blue-800 border border-blue-400/40 text-white flex items-center justify-center shadow-lg active:scale-95 transition-all backdrop-blur-md"
            title="မျက်နှာပြင်ပြည့်"
          >
            <Maximize2 className="w-4 h-4 stroke-white stroke-[2.4]" />
          </button>
        </div>
      </div>

      {/* Right Floating Badge: BUY BONUS (100 × BET) */}
      <button
        onClick={onBuyBonus}
        className="absolute top-14 right-2 z-20 px-3 py-2 rounded-2xl bg-gradient-to-b from-amber-200 via-amber-500 to-amber-700 border-2 border-amber-300 text-black font-black text-center shadow-2xl active:scale-95 transition-all flex flex-col items-center hover:brightness-110"
        style={{
          boxShadow: '0 8px 20px rgba(0,0,0,0.6), inset 0 1px 2px rgba(255,255,255,0.8)',
        }}
        title="ဘောနပ်စ် အလွယ်ဝယ်ယူမည် (100 × BET)"
      >
        <span
          className="text-xs font-black tracking-tight leading-none text-amber-950 uppercase"
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.7)' }}
        >
          BUY
        </span>
        <span
          className="text-sm font-black tracking-tight leading-none text-amber-950 uppercase"
          style={{ textShadow: '0 1px 0 rgba(255,255,255,0.7)' }}
        >
          BONUS
        </span>
        <span className="text-[9px] font-bold text-amber-900/90 mt-0.5 tracking-tighter">
          100 × BET
        </span>
      </button>
    </div>
  );
}
