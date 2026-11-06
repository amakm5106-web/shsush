'use client';

import React, { useState } from 'react';
import {
  BuffaloSymbolSvg,
  EagleSymbolSvg,
  BearSymbolSvg,
  WolfSymbolSvg,
  MooseSymbolSvg,
  WildSymbolSvg,
  ScatterSymbolSvg,
} from './ChargeBuffaloSvgSymbols';

interface BuffaloSymbolImageProps {
  symbolId: string;
  wildMultiplier?: number;
  className?: string;
  isWinning?: boolean;
}

const PNG_MAP: Record<string, { png: string; webp: string; alt: string; nameMm: string }> = {
  buffalo: {
    png: '/assets/slot-symbols/individual/buffalo.png',
    webp: '/assets/slot-symbols/individual/buffalo.webp',
    alt: 'Golden Buffalo',
    nameMm: 'ကျွဲရွှေ',
  },
  eagle: {
    png: '/assets/slot-symbols/individual/eagle.png',
    webp: '/assets/slot-symbols/individual/eagle.webp',
    alt: 'Eagle',
    nameMm: 'လင်းယုန်',
  },
  bear: {
    png: '/assets/slot-symbols/individual/bear.png',
    webp: '/assets/slot-symbols/individual/bear.webp',
    alt: 'Bear',
    nameMm: 'ဝက်ဝံ',
  },
  wolf: {
    png: '/assets/slot-symbols/individual/wolf.png',
    webp: '/assets/slot-symbols/individual/wolf.webp',
    alt: 'Wolf',
    nameMm: 'ဝံပုလွေ',
  },
  moose: {
    png: '/assets/slot-symbols/individual/moose.png',
    webp: '/assets/slot-symbols/individual/moose.webp',
    alt: 'Moose',
    nameMm: 'မုစ်',
  },
  elk: {
    png: '/assets/slot-symbols/individual/moose.png',
    webp: '/assets/slot-symbols/individual/moose.webp',
    alt: 'Moose',
    nameMm: 'မုစ်',
  },
  scatter: {
    png: '/assets/slot-symbols/individual/scatter-coin.png',
    webp: '/assets/slot-symbols/individual/scatter-coin.webp',
    alt: 'Scatter Coin',
    nameMm: 'ဒင်္ဂါး',
  },
  'scatter-coin': {
    png: '/assets/slot-symbols/individual/scatter-coin.png',
    webp: '/assets/slot-symbols/individual/scatter-coin.webp',
    alt: 'Scatter Coin',
    nameMm: 'ဒင်္ဂါး',
  },
  wheel_scatter: {
    png: '/assets/slot-symbols/individual/scatter-coin.png',
    webp: '/assets/slot-symbols/individual/scatter-coin.webp',
    alt: 'Scatter Coin',
    nameMm: 'ဒင်္ဂါး',
  },
  wild: {
    png: '/assets/slot-symbols/individual/wild-sunset.png',
    webp: '/assets/slot-symbols/individual/wild-sunset.webp',
    alt: 'Wild Sunset',
    nameMm: 'WILD',
  },
  'wild-sunset': {
    png: '/assets/slot-symbols/individual/wild-sunset.png',
    webp: '/assets/slot-symbols/individual/wild-sunset.webp',
    alt: 'Wild Sunset',
    nameMm: 'WILD',
  },
};

export function BuffaloSymbolImage({
  symbolId,
  wildMultiplier = 1,
  className = 'w-full h-full',
  isWinning = false,
}: BuffaloSymbolImageProps) {
  const [loadStage, setLoadStage] = useState<'png' | 'webp' | 'svg'>('png');
  const info = PNG_MAP[symbolId] || PNG_MAP.buffalo;
  const isWild = symbolId === 'wild' || symbolId === 'wild-sunset';
  const isScatter = symbolId === 'scatter' || symbolId === 'scatter-coin' || symbolId === 'wheel_scatter';
  const isTopMascot = symbolId === 'buffalo';

  const renderSvgFallback = () => {
    switch (symbolId) {
      case 'buffalo':
        return <BuffaloSymbolSvg className="w-full h-full" />;
      case 'eagle':
        return <EagleSymbolSvg className="w-full h-full" />;
      case 'bear':
        return <BearSymbolSvg className="w-full h-full" />;
      case 'wolf':
        return <WolfSymbolSvg className="w-full h-full" />;
      case 'moose':
      case 'elk':
        return <MooseSymbolSvg className="w-full h-full" />;
      case 'wild':
      case 'wild-sunset':
        return <WildSymbolSvg multiplier={wildMultiplier} className="w-full h-full" />;
      case 'scatter':
      case 'scatter-coin':
      case 'wheel_scatter':
        return <ScatterSymbolSvg className="w-full h-full" />;
      default:
        return <BuffaloSymbolSvg className="w-full h-full" />;
    }
  };

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center overflow-hidden rounded-lg select-none transition-all duration-200 ${
        isWinning
          ? 'ring-2 ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.55)] scale-[1.04] z-20 bg-gradient-to-b from-zinc-800 to-black'
          : 'bg-gradient-to-b from-zinc-900/90 to-black/95 shadow-inner'
      } ${className}`}
    >
      {loadStage === 'svg' ? (
        renderSvgFallback()
      ) : (
        <img
          src={loadStage === 'png' ? info.png : info.webp}
          alt={info.alt}
          referrerPolicy="no-referrer"
          className={`w-full h-full object-cover pointer-events-none drop-shadow-md transition-transform duration-200 ${
            isWinning ? 'brightness-110 contrast-105 scale-105' : 'brightness-100'
          }`}
          onError={() => {
            if (loadStage === 'png') {
              setLoadStage('webp');
            } else {
              setLoadStage('svg');
            }
          }}
          loading="eager"
          draggable={false}
        />
      )}

      {/* Subtle Rim Highlight: Golden for Buffalo/Scatter, Slate/Bronze for others */}
      <div
        className={`absolute inset-0 rounded-lg pointer-events-none transition-colors ${
          isWinning
            ? 'border-2 border-amber-400/90'
            : isTopMascot || isScatter
            ? 'border border-amber-500/30'
            : 'border border-white/10'
        }`}
      />

      {/* Wild Sunset Glow & Multiplier Badge (×2, ×3, ×5 in Free Spins) */}
      {isWild && wildMultiplier > 1 && (
        <div className="absolute top-0.5 right-0.5 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-red-600 to-amber-600 border border-amber-300 shadow-xl flex items-center justify-center animate-pulse z-30">
          <span className="text-[10px] sm:text-xs font-black text-white font-mono leading-none tracking-tight drop-shadow">
            ×{wildMultiplier}
          </span>
        </div>
      )}

      {/* Subtle Label for high tier symbols when winning */}
      {isWinning && (
        <div className="absolute bottom-0 inset-x-0 bg-black/75 backdrop-blur-xs py-0.5 text-center pointer-events-none z-20">
          <span className="text-[9px] font-black text-amber-300 tracking-wider">
            {info.nameMm}
          </span>
        </div>
      )}
    </div>
  );
}
