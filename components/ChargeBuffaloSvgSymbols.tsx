import React from 'react';

// Ornate Golden Framed Buffalo Symbol (Top Tier Mascot)
export function BuffaloSymbolSvg({ className = 'w-full h-full' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        {/* Outer Frame Golden Gradients */}
        <linearGradient id="buf_gold_frame" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fff3a1" />
          <stop offset="25%" stopColor="#d4af37" />
          <stop offset="50%" stopColor="#8a6114" />
          <stop offset="75%" stopColor="#e5c158" />
          <stop offset="100%" stopColor="#634509" />
        </linearGradient>
        <linearGradient id="buf_inner_plate" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1a0f07" />
          <stop offset="50%" stopColor="#2c170a" />
          <stop offset="100%" stopColor="#0d0703" />
        </linearGradient>
        <linearGradient id="buf_horn_grad" x1="0%" y1="0%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="#1e2229" />
          <stop offset="50%" stopColor="#474d57" />
          <stop offset="100%" stopColor="#111317" />
        </linearGradient>
        <linearGradient id="buf_fur_main" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#854817" />
          <stop offset="40%" stopColor="#572b0b" />
          <stop offset="80%" stopColor="#3d1b06" />
          <stop offset="100%" stopColor="#220e03" />
        </linearGradient>
        <linearGradient id="buf_fur_highlight" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#c2772f" />
          <stop offset="50%" stopColor="#e0994a" />
          <stop offset="100%" stopColor="#a35d1f" />
        </linearGradient>
        <filter id="buf_glow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="#000" floodOpacity="0.8" />
        </filter>
      </defs>

      {/* Outer Ornate Golden Plaque Border */}
      <rect x="2" y="2" width="96" height="96" rx="6" fill="url(#buf_inner_plate)" stroke="url(#buf_gold_frame)" strokeWidth="3.5" />
      <rect x="6" y="6" width="88" height="88" rx="4" fill="none" stroke="url(#buf_gold_frame)" strokeWidth="1" strokeDasharray="3 1.5" opacity="0.8" />

      {/* Corner Ornaments */}
      <circle cx="9" cy="9" r="2" fill="#ffd700" />
      <circle cx="91" cy="9" r="2" fill="#ffd700" />
      <circle cx="9" cy="91" r="2" fill="#ffd700" />
      <circle cx="91" cy="91" r="2" fill="#ffd700" />

      {/* Buffalo Horns (Massive Curved) */}
      <g filter="url(#buf_glow)">
        {/* Left Horn */}
        <path
          d="M 28 36 C 24 24 13 23 11 31 C 9 39 18 47 30 45 C 24 43 18 39 17 33 C 17 28 23 28 28 36 Z"
          fill="url(#buf_horn_grad)"
          stroke="#111"
          strokeWidth="0.8"
        />
        {/* Right Horn */}
        <path
          d="M 72 36 C 76 24 87 23 89 31 C 91 39 82 47 70 45 C 76 43 82 39 83 33 C 83 28 77 28 72 36 Z"
          fill="url(#buf_horn_grad)"
          stroke="#111"
          strokeWidth="0.8"
        />
      </g>

      {/* Buffalo Body / Shoulder Mass */}
      <ellipse cx="50" cy="85" rx="34" ry="20" fill="url(#buf_fur_main)" />

      {/* Head & Neck Silhouette */}
      <path
        d="M 28 42 C 28 32 36 26 50 26 C 64 26 72 32 72 42 C 72 56 68 76 50 78 C 32 76 28 56 28 42 Z"
        fill="url(#buf_fur_main)"
      />

      {/* Forehead Thick Wool / Fur Clump */}
      <path
        d="M 33 34 C 36 27 44 24 50 24 C 56 24 64 27 67 34 C 70 41 68 47 64 48 C 60 46 58 48 50 47 C 42 48 40 46 36 48 C 32 47 30 41 33 34 Z"
        fill="url(#buf_fur_highlight)"
      />

      {/* Fur Texture Tufts */}
      <path d="M 40 32 L 42 37 L 45 33 L 48 38 L 50 32 L 53 38 L 56 33 L 59 37 L 61 32" stroke="#572b0b" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M 38 40 L 44 44 L 50 41 L 56 44 L 62 40" stroke="#ffd080" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />

      {/* Eyes with Intense Gaze */}
      <g>
        {/* Left Eye */}
        <ellipse cx="38" cy="46" rx="3.5" ry="2.2" fill="#0f0904" />
        <circle cx="38.5" cy="45.8" r="1.3" fill="#ffb703" />
        <circle cx="39" cy="45.5" r="0.5" fill="#ffffff" />
        <path d="M 34 43 Q 38 42 42 44" stroke="#1f1105" strokeWidth="1.5" strokeLinecap="round" />

        {/* Right Eye */}
        <ellipse cx="62" cy="46" rx="3.5" ry="2.2" fill="#0f0904" />
        <circle cx="61.5" cy="45.8" r="1.3" fill="#ffb703" />
        <circle cx="61" cy="45.5" r="0.5" fill="#ffffff" />
        <path d="M 66 43 Q 62 42 58 44" stroke="#1f1105" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* Snout & Nostrils */}
      <path
        d="M 41 57 C 41 54 44 53 50 53 C 56 53 59 54 59 57 C 59 66 56 71 50 71 C 44 71 41 66 41 57 Z"
        fill="#1e130c"
      />
      {/* Nostrils */}
      <ellipse cx="45.5" cy="64" rx="2.5" ry="3" fill="#0a0502" />
      <ellipse cx="54.5" cy="64" rx="2.5" ry="3" fill="#0a0502" />
      <path d="M 47 62 Q 50 63 53 62" stroke="#4a3020" strokeWidth="1" strokeLinecap="round" />

      {/* Chin Beard */}
      <path
        d="M 44 71 L 43 83 L 47 80 L 50 85 L 53 80 L 57 83 L 56 71 Z"
        fill="#261205"
      />
      <path d="M 46 73 L 47 81 M 50 72 L 50 83 M 54 73 L 53 81" stroke="#6e3c15" strokeWidth="0.8" />

      {/* Golden Frame Inner Bevel Highlight */}
      <rect x="3" y="3" width="94" height="94" rx="5" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.3" />
    </svg>
  );
}

// Golden Buffalo Coin SCATTER Symbol
export function ScatterSymbolSvg({ className = 'w-full h-full' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="scat_rim" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#ffd857" />
          <stop offset="85%" stopColor="#d4af37" />
          <stop offset="95%" stopColor="#8a6515" />
          <stop offset="100%" stopColor="#ffe680" />
        </radialGradient>
        <radialGradient id="scat_core" cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fff8c4" />
          <stop offset="35%" stopColor="#ffd857" />
          <stop offset="70%" stopColor="#c99718" />
          <stop offset="100%" stopColor="#634505" />
        </radialGradient>
        <linearGradient id="scat_ribbon" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#540b0e" />
          <stop offset="30%" stopColor="#801015" />
          <stop offset="50%" stopColor="#9e181f" />
          <stop offset="70%" stopColor="#801015" />
          <stop offset="100%" stopColor="#540b0e" />
        </linearGradient>
        <linearGradient id="scat_gold_text" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="40%" stopColor="#fff1a8" />
          <stop offset="100%" stopColor="#f3c641" />
        </linearGradient>
      </defs>

      {/* Outer Coin Disc */}
      <circle cx="50" cy="50" r="47" fill="url(#scat_rim)" stroke="#664606" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="44" fill="url(#scat_core)" stroke="#fff" strokeWidth="0.8" strokeOpacity="0.4" />

      {/* Radial Serrations / Coin Milling */}
      {Array.from({ length: 24 }).map((_, i) => {
        const deg = (360 / 24) * i;
        return (
          <line
            key={`mill-${i}`}
            x1="50"
            y1="4"
            x2="50"
            y2="7"
            stroke="#80560a"
            strokeWidth="1.5"
            transform={`rotate(${deg} 50 50)`}
          />
        );
      })}

      {/* Inner Decorative Beaded Circle */}
      <circle cx="50" cy="50" r="39" fill="none" stroke="#ffe28a" strokeWidth="1" strokeDasharray="1.5 2.5" opacity="0.9" />

      {/* Embossed Charging Buffalo Silhouette (Facing Right) */}
      <g transform="translate(18, 22) scale(0.64)">
        {/* Buffalo Silhouette */}
        <path
          d="M 12 45 C 10 38 14 30 22 28 C 30 26 38 20 45 15 C 50 12 60 12 68 18 C 76 22 84 25 88 32 C 92 37 90 45 88 50 C 85 57 82 62 76 64 C 74 68 70 75 66 76 C 64 77 62 70 60 67 C 52 69 42 70 34 68 C 30 72 26 77 22 76 C 20 74 22 68 22 64 C 16 60 12 52 12 45 Z"
          fill="#fff194"
          stroke="#94650c"
          strokeWidth="2"
        />
        {/* Buffalo Horns */}
        <path
          d="M 68 18 C 72 10 82 8 86 14 C 84 15 76 18 74 22 Z"
          fill="#ffe270"
          stroke="#694605"
          strokeWidth="1.5"
        />
        {/* Fur Hump Details */}
        <path d="M 38 28 Q 45 22 55 24" stroke="#94650c" strokeWidth="2" strokeLinecap="round" />
        <path d="M 44 34 Q 52 28 62 31" stroke="#94650c" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M 34 42 Q 44 38 56 40" stroke="#94650c" strokeWidth="1.6" strokeLinecap="round" />
        {/* Eye dot */}
        <circle cx="76" cy="27" r="2.2" fill="#523502" />
        {/* Ground shadow / Prairie dirt */}
        <ellipse cx="50" cy="74" rx="35" ry="5" fill="#a17013" opacity="0.5" />
      </g>

      {/* Red/Gold Arched SCATTER Ribbon at Base */}
      <path
        d="M 14 74 L 20 70 L 80 70 L 86 74 L 82 86 L 50 89 L 18 86 Z"
        fill="url(#scat_ribbon)"
        stroke="#ffd700"
        strokeWidth="1.2"
      />
      <path
        d="M 14 74 L 9 80 L 18 86 L 15 80 Z"
        fill="#330507"
      />
      <path
        d="M 86 74 L 91 80 L 82 86 L 85 80 Z"
        fill="#330507"
      />

      {/* SCATTER Bold Embossed Text */}
      <text
        x="50"
        y="81.5"
        textAnchor="middle"
        fontSize="8.5"
        fontWeight="900"
        fontFamily="sans-serif"
        letterSpacing="0.1em"
        fill="url(#scat_gold_text)"
        stroke="#45080b"
        strokeWidth="0.6"
      >
        SCATTER
      </text>

      {/* High-glaze Sparkle Highlight */}
      <circle cx="28" cy="22" r="2" fill="#fff" opacity="0.8" />
      <path d="M 28 17 L 28 27 M 23 22 L 33 22" stroke="#fff" strokeWidth="0.8" opacity="0.6" />
    </svg>
  );
}

// Majestic Bald Eagle Profile Symbol
export function EagleSymbolSvg({ className = 'w-full h-full' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="eagle_bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0d1b2a" />
          <stop offset="100%" stopColor="#1b263b" />
        </linearGradient>
        <linearGradient id="eagle_beak" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffe169" />
          <stop offset="60%" stopColor="#fca311" />
          <stop offset="100%" stopColor="#d46b08" />
        </linearGradient>
        <linearGradient id="eagle_feathers" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
      </defs>

      {/* Dark Navy Square Frame with Subtle Gold Rim */}
      <rect x="2" y="2" width="96" height="96" rx="6" fill="url(#eagle_bg)" stroke="#ca8a04" strokeWidth="1.5" />

      {/* Dark Body Feathers (Torso) */}
      <path
        d="M 10 95 C 10 75 25 65 38 65 C 48 65 52 75 56 95 Z"
        fill="#241e17"
      />

      {/* Head White Feathers (Facing Right) */}
      <path
        d="M 18 55 C 16 38 28 20 48 18 C 65 16 75 25 80 34 C 84 40 85 45 84 50 C 76 52 70 54 62 52 C 55 58 48 68 38 70 C 26 72 20 65 18 55 Z"
        fill="url(#eagle_feathers)"
      />

      {/* Jagged Neck Feathers (Ruff) */}
      <path
        d="M 22 62 L 26 72 L 32 66 L 38 75 L 44 68 L 50 74 L 56 66 L 62 70 L 66 62"
        fill="url(#eagle_feathers)"
        stroke="#cbd5e1"
        strokeWidth="0.8"
      />

      {/* Eagle Hooked Beak */}
      <path
        d="M 72 38 C 78 37 86 37 92 43 C 96 47 96 52 94 56 C 91 58 88 56 86 52 C 82 50 78 51 72 52 Z"
        fill="url(#eagle_beak)"
        stroke="#9a3412"
        strokeWidth="1"
      />
      {/* Beak Mouth Gape Line */}
      <path d="M 74 48 C 80 48 85 49 89 53" stroke="#7c2d12" strokeWidth="1.2" strokeLinecap="round" />
      {/* Nares (Beak Nostril) */}
      <ellipse cx="78" cy="43" rx="1.5" ry="0.8" fill="#7c2d12" transform="rotate(-15 78 43)" />

      {/* Eagle Brow & Intense Eye */}
      {/* Overhanging Brow Ridge */}
      <path d="M 48 30 C 54 28 62 29 68 34" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" />
      {/* Eye Socket & Iris */}
      <ellipse cx="58" cy="35" rx="4.5" ry="3.5" fill="#0f172a" />
      <circle cx="58.5" cy="35" r="2.8" fill="#facc15" />
      <circle cx="59" cy="35" r="1.5" fill="#000000" />
      <circle cx="59.8" cy="34.2" r="0.6" fill="#ffffff" />

      {/* Feather Texture Accents */}
      <path d="M 32 30 Q 38 35 45 32" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" />
      <path d="M 28 42 Q 36 46 44 43" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" />
      <path d="M 35 52 Q 44 56 52 53" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// Grizzly Bear Profile Symbol
export function BearSymbolSvg({ className = 'w-full h-full' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bear_bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#14110f" />
          <stop offset="100%" stopColor="#241a15" />
        </linearGradient>
        <linearGradient id="bear_fur_dark" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4a2810" />
          <stop offset="50%" stopColor="#361c0a" />
          <stop offset="100%" stopColor="#210f05" />
        </linearGradient>
        <linearGradient id="bear_fur_light" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#8c5023" />
          <stop offset="60%" stopColor="#b36e32" />
          <stop offset="100%" stopColor="#7a3f16" />
        </linearGradient>
      </defs>

      {/* Dark Slate Frame with Gold Accent */}
      <rect x="2" y="2" width="96" height="96" rx="6" fill="url(#bear_bg)" stroke="#b45309" strokeWidth="1.5" />

      {/* Bear Rounded Ear */}
      <path
        d="M 28 28 C 26 18 36 14 42 20 C 46 24 43 32 38 34 Z"
        fill="url(#bear_fur_dark)"
        stroke="#1a0c04"
        strokeWidth="1"
      />
      <path d="M 32 23 C 31 19 36 17 38 21 C 40 24 38 28 35 29 Z" fill="#693714" />

      {/* Massive Head Mass */}
      <path
        d="M 18 68 C 14 45 26 28 44 26 C 60 24 72 32 78 44 C 84 52 90 56 94 62 C 96 66 94 72 88 74 C 82 76 74 72 70 70 C 65 80 50 88 34 88 C 22 88 18 80 18 68 Z"
        fill="url(#bear_fur_dark)"
      />

      {/* Textured Fur Crest on Top of Head */}
      <path
        d="M 38 26 C 45 24 56 25 64 30 C 60 33 55 31 50 34 C 45 32 40 34 38 26 Z"
        fill="url(#bear_fur_light)"
      />

      {/* Snout / Muzzle (Golden Tan Fur) */}
      <path
        d="M 64 48 C 66 44 74 46 82 48 C 88 50 92 54 92 60 C 92 68 85 71 78 71 C 70 71 65 64 64 58 Z"
        fill="url(#bear_fur_light)"
        stroke="#522a0d"
        strokeWidth="1"
      />

      {/* Black Leathery Nose */}
      <path
        d="M 86 52 C 89 52 93 54 94 57 C 94 60 91 63 88 63 C 85 63 84 59 84 56 C 84 53 85 52 86 52 Z"
        fill="#0f0a07"
      />
      <circle cx="88" cy="55" r="0.8" fill="#ffffff" opacity="0.6" />

      {/* Mouth Line */}
      <path d="M 88 63 C 85 66 79 67 76 66" stroke="#261205" strokeWidth="1.5" strokeLinecap="round" />

      {/* Intense Eye */}
      <ellipse cx="58" cy="42" rx="3.5" ry="2.5" fill="#0d0703" />
      <circle cx="58.5" cy="42" r="1.5" fill="#d97706" />
      <circle cx="59" cy="41.8" r="0.8" fill="#000000" />
      <circle cx="59.3" cy="41.3" r="0.4" fill="#ffffff" />
      <path d="M 53 38 Q 58 37 63 40" stroke="#1f0f06" strokeWidth="1.5" strokeLinecap="round" />

      {/* Fur Shading Strands */}
      <path d="M 30 50 Q 38 54 48 52" stroke="#6e3913" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M 36 62 Q 44 66 54 64" stroke="#6e3913" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M 45 42 Q 52 46 60 44" stroke="#a35f29" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// Timber Wolf Profile Symbol
export function WolfSymbolSvg({ className = 'w-full h-full' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wolf_bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
        <linearGradient id="wolf_fur_grey" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="50%" stopColor="#475569" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
        <linearGradient id="wolf_fur_white" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
      </defs>

      {/* Dark Slate Frame */}
      <rect x="2" y="2" width="96" height="96" rx="6" fill="url(#wolf_bg)" stroke="#94a3b8" strokeWidth="1.5" />

      {/* Alert Wolf Ears (Triangular Pointed) */}
      {/* Back Ear */}
      <path d="M 32 30 L 36 14 L 46 24 Z" fill="#334155" stroke="#1e293b" strokeWidth="1" />
      {/* Front Ear */}
      <path d="M 44 28 L 52 10 L 62 24 Z" fill="#475569" stroke="#1e293b" strokeWidth="1" />
      <path d="M 48 24 L 52 14 L 57 24 Z" fill="#f1f5f9" />

      {/* Wolf Head & Neck Base */}
      <path
        d="M 20 85 C 16 62 26 40 46 32 C 60 28 72 34 80 44 C 88 52 94 56 94 62 C 94 66 88 68 84 68 C 76 72 70 82 52 86 C 36 88 24 88 20 85 Z"
        fill="url(#wolf_fur_grey)"
      />

      {/* White/Silver Throat & Cheek Ruff */}
      <path
        d="M 38 85 C 38 72 44 60 54 54 C 62 52 70 54 74 60 C 76 66 72 74 66 78 C 58 84 48 85 38 85 Z"
        fill="url(#wolf_fur_white)"
      />

      {/* Wolf Snout & Black Nose */}
      <path
        d="M 66 46 C 72 44 80 46 88 50 C 94 53 96 56 96 60 C 94 64 88 65 82 64 C 74 64 68 56 66 46 Z"
        fill="#94a3b8"
      />
      {/* Black Nose */}
      <path d="M 91 52 C 94 53 96 55 96 58 C 95 60 92 61 90 60 C 89 58 89 54 91 52 Z" fill="#0f172a" />
      {/* Whiskers */}
      <path d="M 80 60 L 92 64 M 79 62 L 90 67 M 78 64 L 88 71" stroke="#cbd5e1" strokeWidth="0.7" opacity="0.7" />

      {/* Piercing Amber Eye */}
      <ellipse cx="60" cy="40" rx="4" ry="2.5" fill="#0f172a" />
      <circle cx="60.5" cy="40" r="1.8" fill="#eab308" />
      <circle cx="61" cy="40" r="1" fill="#000000" />
      <circle cx="61.4" cy="39.4" r="0.4" fill="#ffffff" />
      {/* Eye marking / furrow */}
      <path d="M 54 36 Q 60 34 66 38" stroke="#1e293b" strokeWidth="1.5" strokeLinecap="round" />

      {/* Fur Texture Tufts */}
      <path d="M 28 60 L 32 68 L 38 62 L 42 70 L 48 64" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

// Moose / Elk Profile with Huge Branching Antlers
export function MooseSymbolSvg({ className = 'w-full h-full' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="moose_bg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#1c1917" />
          <stop offset="100%" stopColor="#292524" />
        </linearGradient>
        <linearGradient id="moose_antler" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fed7aa" />
          <stop offset="50%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#9a3412" />
        </linearGradient>
        <linearGradient id="moose_fur" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#573418" />
          <stop offset="60%" stopColor="#3d210b" />
          <stop offset="100%" stopColor="#241205" />
        </linearGradient>
      </defs>

      {/* Dark Rustic Frame */}
      <rect x="2" y="2" width="96" height="96" rx="6" fill="url(#moose_bg)" stroke="#d97706" strokeWidth="1.5" />

      {/* Palmate Branching Antlers (Top) */}
      <g stroke="#7c2d12" strokeWidth="1">
        {/* Left/Back Antler Shovel */}
        <path
          d="M 24 38 C 18 30 12 18 16 12 C 20 8 28 14 32 18 C 34 14 42 12 45 16 C 48 20 46 28 42 36 Z"
          fill="url(#moose_antler)"
        />
        {/* Right/Main Antler Shovel with Points */}
        <path
          d="M 38 34 C 42 22 48 10 56 8 C 62 6 68 12 66 18 C 72 14 80 14 82 20 C 84 26 80 32 72 38 C 65 42 54 44 45 42 Z"
          fill="url(#moose_antler)"
        />
        {/* Antler Points / Tines */}
        <path d="M 22 14 L 18 8 M 32 16 L 32 8 M 58 10 L 62 4 M 70 14 L 76 8 M 80 20 L 88 16" stroke="#fed7aa" strokeWidth="1.5" strokeLinecap="round" />
      </g>

      {/* Moose Long Head & Muzzle (Facing Left/Down) */}
      <path
        d="M 44 42 C 48 36 60 38 68 46 C 76 56 82 72 82 85 C 72 88 56 88 48 85 C 44 76 38 68 28 66 C 18 64 12 68 12 74 C 10 72 10 65 14 60 C 20 54 30 52 38 48 Z"
        fill="url(#moose_fur)"
      />

      {/* Drooping Snout / Upper Lip Characteristic of Moose */}
      <path
        d="M 12 68 C 10 68 8 72 10 76 C 14 80 20 78 24 74 C 20 72 16 70 12 68 Z"
        fill="#1e1007"
      />
      {/* Nostril */}
      <ellipse cx="15" cy="73" rx="1.5" ry="2.2" fill="#000" transform="rotate(20 15 73)" />

      {/* Moose Bell / Dewlap (Beard Flap on Throat) */}
      <path
        d="M 46 76 C 44 82 42 90 44 94 C 46 94 48 86 50 80 Z"
        fill="#261307"
      />

      {/* Kind Dark Eye */}
      <ellipse cx="44" cy="48" rx="3.2" ry="2.4" fill="#0a0502" />
      <circle cx="44.3" cy="48" r="1.2" fill="#78350f" />
      <circle cx="44.8" cy="47.6" r="0.5" fill="#ffffff" />
    </svg>
  );
}

// WILD Symbol with Sunset Canyon, Fiery Glow & Multipliers
export function WildSymbolSvg({
  multiplier = 1,
  className = 'w-full h-full',
}: {
  multiplier?: number;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="wild_sunset" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#f97316" />
          <stop offset="40%" stopColor="#ef4444" />
          <stop offset="70%" stopColor="#991b1b" />
          <stop offset="100%" stopColor="#450a0a" />
        </linearGradient>
        <radialGradient id="wild_sun" cx="50%" cy="40%" r="45%">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="40%" stopColor="#f59e0b" />
          <stop offset="100%" stopColor="#b91c1c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wild_text_grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#fef08a" />
          <stop offset="75%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>

      {/* Frame with Sunset Canyon Backdrop */}
      <rect x="2" y="2" width="96" height="96" rx="6" fill="url(#wild_sunset)" stroke="#facc15" strokeWidth="2" />

      {/* Blazing Sun */}
      <circle cx="50" cy="38" r="32" fill="url(#wild_sun)" />

      {/* Canyon Mesas Silhouette */}
      <path
        d="M 2 75 L 18 64 L 34 68 L 50 58 L 68 66 L 82 60 L 98 75 L 98 98 L 2 98 Z"
        fill="#260707"
        opacity="0.8"
      />

      {/* Buffalo Horns Silhouette in Center */}
      <path
        d="M 50 30 C 42 22 28 22 24 30 C 22 35 28 42 38 40 C 32 38 28 35 28 32 C 30 28 40 28 46 34 L 50 38 L 54 34 C 60 28 70 28 72 32 C 72 35 68 38 62 40 C 72 42 78 35 76 30 C 72 22 58 22 50 30 Z"
        fill="#fef08a"
        opacity="0.9"
      />

      {/* WILD Bold Metallic Lettering */}
      <g filter="drop-shadow(0px 2px 3px rgba(0,0,0,0.9))">
        <text
          x="50"
          y="72"
          textAnchor="middle"
          fontSize="23"
          fontWeight="900"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing="0.08em"
          fill="url(#wild_text_grad)"
          stroke="#450a0a"
          strokeWidth="1.2"
        >
          WILD
        </text>
      </g>

      {/* Multiplier Badge (if > 1 e.g. ×2, ×3, ×5 in Free Spins) */}
      {multiplier > 1 && (
        <g transform="translate(62, 8)">
          <rect x="0" y="0" width="30" height="20" rx="5" fill="#e11d48" stroke="#fecdd3" strokeWidth="1.2" filter="drop-shadow(0 2px 4px rgba(0,0,0,0.8))" />
          <text
            x="15"
            y="14.5"
            textAnchor="middle"
            fontSize="12"
            fontWeight="900"
            fontFamily="monospace"
            fill="#ffffff"
          >
            ×{multiplier}
          </text>
        </g>
      )}

      {/* Sun Rays */}
      <line x1="50" y1="6" x2="50" y2="14" stroke="#fef08a" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="28" y1="12" x2="34" y2="18" stroke="#fef08a" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <line x1="72" y1="12" x2="66" y2="18" stroke="#fef08a" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

// Official Assets Mapping from User ZIP Archive
const OFFICIAL_SYMBOL_ASSETS: Record<string, { src: string; alt: string }> = {
  buffalo: { src: '/assets/slot-symbols/individual/buffalo.webp', alt: 'Charge Buffalo' },
  scatter: { src: '/assets/slot-symbols/individual/scatter-coin.webp', alt: 'Scatter Coin' },
  wheel_scatter: { src: '/assets/slot-symbols/individual/scatter-coin.webp', alt: 'Scatter Coin' },
  'scatter-coin': { src: '/assets/slot-symbols/individual/scatter-coin.webp', alt: 'Scatter Coin' },
  eagle: { src: '/assets/slot-symbols/individual/eagle.webp', alt: 'Eagle' },
  bear: { src: '/assets/slot-symbols/individual/bear.webp', alt: 'Bear' },
  wolf: { src: '/assets/slot-symbols/individual/wolf.webp', alt: 'Wolf' },
  moose: { src: '/assets/slot-symbols/individual/moose.webp', alt: 'Moose' },
  elk: { src: '/assets/slot-symbols/individual/moose.webp', alt: 'Moose' },
  wild: { src: '/assets/slot-symbols/individual/wild-sunset.webp', alt: 'Wild Sunset' },
  'wild-sunset': { src: '/assets/slot-symbols/individual/wild-sunset.webp', alt: 'Wild Sunset' },
};

// Master Render Helper using Official Real Casino Graphics
export function RenderSlotSymbol({
  symbolId,
  wildMultiplier = 1,
  className = 'w-full h-full',
}: {
  symbolId: string;
  wildMultiplier?: number;
  className?: string;
}) {
  const asset = OFFICIAL_SYMBOL_ASSETS[symbolId] || OFFICIAL_SYMBOL_ASSETS.buffalo;
  const isWild = symbolId === 'wild' || symbolId === 'wild-sunset';
  const isScatter = symbolId === 'scatter' || symbolId === 'scatter-coin' || symbolId === 'wheel_scatter';

  return (
    <div className={`relative w-full h-full flex items-center justify-center overflow-hidden rounded-md bg-[#080d1a] border border-amber-500/30 shadow-inner group ${className}`}>
      {/* Official Game Symbol Graphic */}
      <img
        src={asset.src}
        alt={asset.alt}
        className="w-full h-full object-cover select-none pointer-events-none drop-shadow-md transition-transform duration-200 group-hover:scale-105"
        loading="eager"
        draggable={false}
      />

      {/* Wild Sunset Glow & Multiplier Badge (×2, ×3, ×5 in Free Spins) */}
      {isWild && wildMultiplier > 1 && (
        <div className="absolute top-0.5 right-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-red-600 to-amber-600 border border-amber-300 shadow-xl flex items-center justify-center animate-pulse">
          <span className="text-[10px] font-black text-white font-mono leading-none tracking-tighter drop-shadow">
            ×{wildMultiplier}
          </span>
        </div>
      )}

      {/* Gold Rim Accent for Buffalo and Scatter */}
      {(symbolId === 'buffalo' || isScatter) && (
        <div className="absolute inset-0 rounded-md border border-amber-400/30 pointer-events-none" />
      )}
    </div>
  );
}
