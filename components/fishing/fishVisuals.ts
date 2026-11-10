import type { FishAnimationStyle } from './fishData';

export interface FishVisualProfile {
  beatMultiplier: number;
  tailMultiplier: number;
  glow: [number, number, number] | null;
  accent: [number, number, number];
  entranceDurationMs: number;
  sparkleCount: number;
}

// These profiles affect sprite deformation and light only; fish velocity, size,
// collision bounds, catch scoring, and category odds remain owned by existing code.
export const fishVisualProfiles: Record<FishAnimationStyle, FishVisualProfile> = {
  standard: {
    beatMultiplier: 1,
    tailMultiplier: 1,
    glow: null,
    accent: [154, 230, 238],
    entranceDurationMs: 0,
    sparkleCount: 0,
  },
  rare: {
    beatMultiplier: 1.12,
    tailMultiplier: 1.1,
    glow: [132, 92, 255],
    accent: [103, 235, 255],
    entranceDurationMs: 720,
    sparkleCount: 3,
  },
  golden: {
    beatMultiplier: 1.18,
    tailMultiplier: 1.02,
    glow: [255, 190, 35],
    accent: [255, 241, 151],
    entranceDurationMs: 760,
    sparkleCount: 4,
  },
  special: {
    beatMultiplier: 1.34,
    tailMultiplier: 1.3,
    glow: [182, 74, 255],
    accent: [67, 239, 255],
    entranceDurationMs: 780,
    sparkleCount: 4,
  },
  'boss-shark': {
    beatMultiplier: 1.04,
    tailMultiplier: 1.12,
    glow: [28, 190, 255],
    accent: [185, 246, 255],
    entranceDurationMs: 1350,
    sparkleCount: 5,
  },
  'boss-dragon': {
    beatMultiplier: 1.42,
    tailMultiplier: 1.55,
    glow: [255, 168, 26],
    accent: [255, 235, 123],
    entranceDurationMs: 1450,
    sparkleCount: 6,
  },
  'boss-octopus': {
    beatMultiplier: 1.5,
    tailMultiplier: 1.78,
    glow: [169, 73, 255],
    accent: [108, 234, 255],
    entranceDurationMs: 1450,
    sparkleCount: 5,
  },
  'boss-whale': {
    beatMultiplier: .72,
    tailMultiplier: .7,
    glow: [42, 147, 239],
    accent: [183, 234, 255],
    entranceDurationMs: 1450,
    sparkleCount: 5,
  },
  'boss-leviathan': {
    beatMultiplier: 1.2,
    tailMultiplier: 1.42,
    glow: [42, 231, 183],
    accent: [222, 114, 255],
    entranceDurationMs: 1580,
    sparkleCount: 6,
  },
};

export const fishStyleHitColors: Partial<Record<FishAnimationStyle, [string, string, string]>> = {
  rare: ['#fff1ff', '#bd8cff', '#64eaff'],
  golden: ['#fff8c7', '#ffd044', '#fff0a0'],
  special: ['#fff0ff', '#eb7cff', '#58f3ff'],
  'boss-shark': ['#e7ffff', '#29d9ff', '#a8f6ff'],
  'boss-dragon': ['#fff7ce', '#ffb52e', '#fff0a0'],
  'boss-octopus': ['#f5e7ff', '#be6cff', '#58e7ff'],
  'boss-whale': ['#e2f4ff', '#58b8ff', '#c5f0ff'],
  'boss-leviathan': ['#ddfff5', '#45edc4', '#e58cff'],
};
