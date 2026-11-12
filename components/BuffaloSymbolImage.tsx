'use client';

import React, { useState } from 'react';
import Image from 'next/image';
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

const SPRITE_ROOT = '/assets/casino/buffalo-original';

const ORIGINAL_SYMBOLS: Record<string, { src: string; alt: string; nameMm: string }> = {
  buffalo: { src: `${SPRITE_ROOT}/symbol-bull.png`, alt: 'Buffalo', nameMm: 'ကျွဲ' },
  eagle: { src: `${SPRITE_ROOT}/symbol-SH3.png`, alt: 'Eagle', nameMm: 'လင်းယုန်' },
  bear: { src: `${SPRITE_ROOT}/symbol-SH2.png`, alt: 'Bear', nameMm: 'ဝက်ဝံ' },
  wolf: { src: `${SPRITE_ROOT}/symbol-SH4.png`, alt: 'Wolf', nameMm: 'ဝံပုလွေ' },
  moose: { src: `${SPRITE_ROOT}/symbol-SH5.png`, alt: 'Moose', nameMm: 'မုစ်' },
  wild: { src: `${SPRITE_ROOT}/symbol-SWD.png`, alt: 'Wild', nameMm: 'WILD' },
  scatter: { src: `${SPRITE_ROOT}/symbol-SSC.png`, alt: 'Scatter', nameMm: 'SCATTER' },
  card_a: { src: `${SPRITE_ROOT}/symbol-SL1.png`, alt: 'A rank', nameMm: 'A' },
  card_k: { src: `${SPRITE_ROOT}/symbol-SL2.png`, alt: 'K rank', nameMm: 'K' },
  card_q: { src: `${SPRITE_ROOT}/symbol-SL3.png`, alt: 'Q rank', nameMm: 'Q' },
  card_j: { src: `${SPRITE_ROOT}/symbol-SL4.png`, alt: 'J rank', nameMm: 'J' },
  card_10: { src: `${SPRITE_ROOT}/symbol-SL5.png`, alt: '10 rank', nameMm: '10' },
  card_9: { src: `${SPRITE_ROOT}/symbol-SL6.png`, alt: '9 rank', nameMm: '9' },
};

function fallbackSymbol(symbolId: string, multiplier: number, className: string) {
  switch (symbolId) {
    case 'buffalo':
      return <BuffaloSymbolSvg className={className} />;
    case 'eagle':
      return <EagleSymbolSvg className={className} />;
    case 'bear':
      return <BearSymbolSvg className={className} />;
    case 'wolf':
      return <WolfSymbolSvg className={className} />;
    case 'moose':
      return <MooseSymbolSvg className={className} />;
    case 'wild':
      return <WildSymbolSvg multiplier={multiplier} className={className} />;
    case 'scatter':
      return <ScatterSymbolSvg className={className} />;
    default: {
      const rank = ORIGINAL_SYMBOLS[symbolId]?.nameMm ?? '9';
      return <span className="buffalo-original-rank-fallback" aria-label={rank}>{rank}</span>;
    }
  }
}

export function BuffaloSymbolImage({
  symbolId,
  wildMultiplier = 1,
  className = 'w-full h-full',
  isWinning = false,
}: BuffaloSymbolImageProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const info = ORIGINAL_SYMBOLS[symbolId] || ORIGINAL_SYMBOLS.buffalo;
  const isWild = symbolId === 'wild';

  return (
    <div
      className={`buffalo-original-symbol ${isWinning ? 'buffalo-original-symbol--winning' : ''} ${className}`}
      aria-label={info.alt}
    >
      {imageFailed ? (
        fallbackSymbol(symbolId, wildMultiplier, 'buffalo-original-symbol__fallback')
      ) : (
        <Image
          src={info.src}
          alt={info.alt}
          width={160}
          height={128}
          sizes="(max-width: 760px) 18vw, 160px"
          className="buffalo-original-symbol__image"
          onError={() => setImageFailed(true)}
          loading="eager"
          draggable={false}
          unoptimized
        />
      )}

      {isWild && wildMultiplier > 1 && (
        <span className="buffalo-original-symbol__multiplier" aria-label={`Multiplier times ${wildMultiplier}`}>
          ×{wildMultiplier}
        </span>
      )}
    </div>
  );
}
