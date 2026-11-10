export type FishCategory = 'small' | 'medium' | 'large' | 'rare' | 'golden' | 'special' | 'boss';
export type FishDirection = 'left' | 'right';
export type FishEntrySide = 'left' | 'right';
export type FishAnimationStyle =
  | 'standard'
  | 'rare'
  | 'golden'
  | 'special'
  | 'boss-shark'
  | 'boss-dragon'
  | 'boss-octopus'
  | 'boss-whale'
  | 'boss-leviathan';

export interface FishSpriteTarget {
  id: number;
  x: number;
  y: number;
  size: number;
  sprite: string;
  category: FishCategory;
  animationStyle: FishAnimationStyle;
  visualScale: number;
  direction: FishDirection;
}

export interface FishExit {
  id: number;
  side: FishEntrySide;
}

interface FishSpriteVariant {
  file: string;
  category: FishCategory;
  animationStyle: FishAnimationStyle;
  visualScale: number;
  weight: number;
}

// Total category weights remain unchanged: small 34%, medium 24%, large 14%,
// rare 10%, golden 8%, special 6%, boss 4% (weights are scaled by 10).
export const fishSpriteVariants: FishSpriteVariant[] = [
  { file: 'small_fish_01', category: 'small', animationStyle: 'standard', visualScale: .8, weight: 170 },
  { file: 'small_fish_02', category: 'small', animationStyle: 'standard', visualScale: .8, weight: 170 },
  { file: 'medium_fish_01', category: 'medium', animationStyle: 'standard', visualScale: 1, weight: 120 },
  { file: 'medium_fish_02', category: 'medium', animationStyle: 'standard', visualScale: 1, weight: 120 },
  { file: 'large_fish_01', category: 'large', animationStyle: 'standard', visualScale: 1.25, weight: 70 },
  { file: 'large_fish_02', category: 'large', animationStyle: 'standard', visualScale: 1.25, weight: 70 },
  { file: 'rare_fish_01', category: 'rare', animationStyle: 'rare', visualScale: 1.12, weight: 34 },
  { file: 'rare_fish_02', category: 'rare', animationStyle: 'rare', visualScale: 1.12, weight: 33 },
  { file: 'rare_manta_ray', category: 'rare', animationStyle: 'rare', visualScale: 1.12, weight: 33 },
  { file: 'golden_fish_01', category: 'golden', animationStyle: 'golden', visualScale: 1.1, weight: 27 },
  { file: 'golden_fish_02', category: 'golden', animationStyle: 'golden', visualScale: 1.1, weight: 27 },
  { file: 'golden_royal_arowana', category: 'golden', animationStyle: 'golden', visualScale: 1.1, weight: 26 },
  { file: 'special_fish_01', category: 'special', animationStyle: 'special', visualScale: 1.35, weight: 20 },
  { file: 'special_fish_02', category: 'special', animationStyle: 'special', visualScale: 1.35, weight: 20 },
  { file: 'special_neon_ribbon_eel', category: 'special', animationStyle: 'special', visualScale: 1.35, weight: 20 },
  { file: 'boss_giant_shark', category: 'boss', animationStyle: 'boss-shark', visualScale: 1.7, weight: 8 },
  { file: 'boss_golden_dragonfish', category: 'boss', animationStyle: 'boss-dragon', visualScale: 1.7, weight: 8 },
  { file: 'boss_giant_octopus', category: 'boss', animationStyle: 'boss-octopus', visualScale: 1.7, weight: 8 },
  { file: 'boss_giant_whale', category: 'boss', animationStyle: 'boss-whale', visualScale: 1.7, weight: 8 },
  { file: 'boss_legendary_sea_monster', category: 'boss', animationStyle: 'boss-leviathan', visualScale: 1.7, weight: 8 },
];

const pickFishSprite = (): FishSpriteVariant => {
  let roll = Math.random() * 1000;
  for (const variant of fishSpriteVariants) {
    roll -= variant.weight;
    if (roll < 0) return variant;
  }
  return fishSpriteVariants[0];
};

export const createCatch = (id: number, entryFrom?: FishEntrySide): FishSpriteTarget => {
  const sprite = pickFishSprite();
  return {
    id,
    x: entryFrom === 'left' ? -12 : entryFrom === 'right' ? 112 : 12 + Math.random() * 76,
    y: 18 + Math.random() * 66,
    size: 34 + Math.random() * 26,
    sprite: sprite.file,
    category: sprite.category,
    animationStyle: sprite.animationStyle,
    visualScale: sprite.visualScale,
    direction: entryFrom === 'left' ? 'right' : entryFrom === 'right' ? 'left' : Math.random() > .5 ? 'right' : 'left',
  };
};
