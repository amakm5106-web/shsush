'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { FishCategory, FishExit, FishSpriteTarget } from './fishData';
import { aimCannonAt, createCannonEffectState, drawCannonEffects, heldFishIds, launchSuccessfulShot, updateCannonEffects, type FishVisualSnapshot } from './cannonEffects';
import { fishVisualProfiles } from './fishVisuals';

interface FishAnimationCanvasProps {
  fish: FishSpriteTarget[];
  disabled: boolean;
  onFishClick: (target: FishSpriteTarget) => Promise<number | null>;
  onFishExit: (exits: FishExit[]) => void;
}

type SwimPattern = 'cruise' | 'wander' | 'dart' | 'school';

interface MotionProfile {
  minSpeed: number;
  maxSpeed: number;
  minTurn: number;
  maxTurn: number;
  minBeat: number;
  maxBeat: number;
  tailAmplitude: number;
}

interface MotionFish {
  target: FishSpriteTarget;
  x: number;
  y: number;
  vx: number;
  vy: number;
  desiredVx: number;
  desiredVy: number;
  speed: number;
  turnTimer: number;
  phase: number;
  phaseSpeed: number;
  tailAmplitude: number;
  spawnedAt: number;
  schoolId: number | null;
  pattern: SwimPattern;
}

interface CanvasLayout {
  width: number;
  height: number;
  dpr: number;
  seaweedLeft: number;
  seaweedTop: number;
  seaweedWidth: number;
  seaweedHeight: number;
}

interface AmbientBubble {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  phase: number;
  phaseSpeed: number;
}

const FRAME_INTERVAL = 1000 / 60;
const MAX_DELTA_SECONDS = .05;
const SWIM_SEGMENTS = 32;

const motionProfiles: Record<FishCategory, MotionProfile> = {
  small: { minSpeed: 58, maxSpeed: 96, minTurn: 1.1, maxTurn: 2.6, minBeat: 7.4, maxBeat: 10.8, tailAmplitude: 4.2 },
  medium: { minSpeed: 42, maxSpeed: 68, minTurn: 2.2, maxTurn: 4.6, minBeat: 5.1, maxBeat: 7.6, tailAmplitude: 3.6 },
  large: { minSpeed: 26, maxSpeed: 44, minTurn: 4.0, maxTurn: 7.2, minBeat: 3.2, maxBeat: 4.8, tailAmplitude: 2.8 },
  rare: { minSpeed: 40, maxSpeed: 66, minTurn: 2.2, maxTurn: 4.4, minBeat: 5.7, maxBeat: 8.2, tailAmplitude: 3.7 },
  golden: { minSpeed: 46, maxSpeed: 72, minTurn: 2.5, maxTurn: 4.9, minBeat: 6.0, maxBeat: 8.2, tailAmplitude: 3.3 },
  special: { minSpeed: 36, maxSpeed: 62, minTurn: 1.9, maxTurn: 4.0, minBeat: 6.0, maxBeat: 9.0, tailAmplitude: 4.0 },
  boss: { minSpeed: 20, maxSpeed: 36, minTurn: 4.6, maxTurn: 8.0, minBeat: 2.7, maxBeat: 4.1, tailAmplitude: 2.4 },
};

const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const fishWidth = (fish: MotionFish) => fish.target.size * fish.target.visualScale;
const fishHeight = (fish: MotionFish) => fishWidth(fish) * 2 / 3;

function createAmbientBubbles(): AmbientBubble[] {
  return Array.from({ length: 13 }, () => ({
    x: Math.random(),
    y: Math.random(),
    radius: randomBetween(2.2, 5.4),
    speed: randomBetween(10, 19),
    drift: randomBetween(-4, 4),
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: randomBetween(.35, .8),
  }));
}

function updateAmbientBubbles(bubbles: AmbientBubble[], dt: number, width: number, height: number) {
  if (!width || !height) return;
  bubbles.forEach((bubble) => {
    bubble.phase += dt * bubble.phaseSpeed;
    bubble.y -= bubble.speed * dt / height;
    bubble.x += (bubble.drift + Math.sin(bubble.phase) * 2.4) * dt / width;
    if (bubble.y < -.06) {
      bubble.y = 1.04;
      bubble.x = Math.random();
    }
    if (bubble.x < -.04) bubble.x = 1.04;
    else if (bubble.x > 1.04) bubble.x = -.04;
  });
}

function drawAmbient(
  context: CanvasRenderingContext2D,
  bubbles: AmbientBubble[],
  layout: CanvasLayout,
  now: number,
  seaweed: HTMLImageElement,
) {
  const { width, height } = layout;
  const shimmer = .5 + .5 * Math.sin(now * .00042);
  context.save();
  for (let index = 0; index < 3; index += 1) {
    const sway = Math.sin(now * .00022 + index * 1.8) * width * .018;
    const x = width * (.16 + index * .32) + sway;
    context.globalAlpha = .12 + shimmer * .06;
    context.fillStyle = 'rgba(150, 231, 255, .14)';
    context.beginPath();
    context.moveTo(x - width * .035, 0);
    context.lineTo(x + width * .035, 0);
    context.lineTo(x + width * .14, height * .48);
    context.lineTo(x + width * .07, height * .48);
    context.closePath();
    context.fill();
  }
  bubbles.forEach((bubble) => {
    const x = bubble.x * width;
    const y = bubble.y * height;
    const twinkle = .5 + .5 * Math.sin(now * .001 + bubble.phase);
    context.globalAlpha = .2 + twinkle * .2;
    context.strokeStyle = 'rgba(205, 246, 255, .9)';
    context.lineWidth = .9;
    context.beginPath();
    context.arc(x, y, bubble.radius, 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha *= .72;
    context.fillStyle = 'rgba(255, 255, 255, .92)';
    context.beginPath();
    context.arc(x - bubble.radius * .3, y - bubble.radius * .32, Math.max(.6, bubble.radius * .18), 0, Math.PI * 2);
    context.fill();
  });

  if (seaweed.complete && seaweed.naturalWidth && layout.seaweedWidth > 0) {
    const swayPhase = now * Math.PI * 2 / 9000;
    const sway = Math.sin(swayPhase) * .00314;
    const swayX = Math.sin(swayPhase) * 2;
    context.globalAlpha = .9;
    context.translate(layout.seaweedLeft + layout.seaweedWidth / 2 + swayX, layout.seaweedTop + layout.seaweedHeight);
    context.rotate(sway);
    context.drawImage(seaweed, -layout.seaweedWidth / 2, -layout.seaweedHeight, layout.seaweedWidth, layout.seaweedHeight);
  }
  context.restore();
}

function createMotionFish(target: FishSpriteTarget, schoolId: number | null): MotionFish {
  const profile = motionProfiles[target.category];
  const visualProfile = fishVisualProfiles[target.animationStyle];
  const speed = randomBetween(profile.minSpeed, profile.maxSpeed);
  const direction = target.direction === 'right' ? 1 : -1;
  const initialAngle = randomBetween(-.28, .28);
  const vx = direction * speed * Math.cos(initialAngle);
  const vy = speed * Math.sin(initialAngle);
  const pattern: SwimPattern = schoolId !== null
    ? 'school'
    : target.category === 'small' && Math.random() < .36
      ? 'dart'
      : target.category === 'large' || target.category === 'boss'
        ? 'cruise'
        : 'wander';

  return {
    target,
    x: target.x / 100,
    y: target.y / 100,
    vx,
    vy,
    desiredVx: vx,
    desiredVy: vy,
    speed,
    turnTimer: randomBetween(profile.minTurn, profile.maxTurn),
    phase: Math.random() * Math.PI * 2,
    phaseSpeed: randomBetween(profile.minBeat, profile.maxBeat) * visualProfile.beatMultiplier,
    tailAmplitude: profile.tailAmplitude * visualProfile.tailMultiplier * randomBetween(.84, 1.16),
    spawnedAt: performance.now(),
    schoolId,
    pattern,
  };
}

function snapshotMotion(motion: MotionFish): FishVisualSnapshot {
  return {
    target: { ...motion.target },
    x: motion.x,
    y: motion.y,
    vx: motion.vx,
    vy: motion.vy,
    phase: motion.phase,
    phaseSpeed: motion.phaseSpeed,
    tailAmplitude: motion.tailAmplitude,
  };
}

function drawUndulatingSprite(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  fish: MotionFish,
) {
  const sliceWidth = image.naturalWidth / SWIM_SEGMENTS;
  const destinationSliceWidth = width / SWIM_SEGMENTS;

  for (let index = 0; index < SWIM_SEGMENTS; index += 1) {
    const u = index / SWIM_SEGMENTS;
    const tailWeight = Math.pow(1 - u, 1.7);
    const bodyCurve = Math.sin(u * Math.PI);
    const tailWave = Math.sin(fish.phase - u * 2.6) * fish.tailAmplitude * tailWeight;
    const bodyWave = Math.sin(fish.phase * .72 + u * 7.2) * fish.tailAmplitude * .075 * bodyCurve;
    const finZone = Math.exp(-Math.pow((u - .61) / .17, 2));
    const finFlutter = Math.sin(fish.phase * 1.85 + u * 8.5) * fish.tailAmplitude * .16 * finZone;
    const sourceX = index * sliceWidth;
    const sourceWidth = Math.min(sliceWidth + 1, image.naturalWidth - sourceX);

    context.drawImage(
      image,
      sourceX,
      0,
      sourceWidth,
      image.naturalHeight,
      x + u * width,
      y + tailWave + bodyWave + finFlutter,
      destinationSliceWidth + .12,
      height,
    );
  }
}

function rgba(color: [number, number, number], alpha: number) {
  return `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
}

function drawFishAura(
  context: CanvasRenderingContext2D,
  motion: MotionFish,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  now: number,
  allowMotion: boolean,
) {
  const visual = fishVisualProfiles[motion.target.animationStyle];
  if (!visual.glow) return;

  const pulse = allowMotion ? .88 + Math.sin(motion.phase * .72) * .12 : 1;
  const halo = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * .82);
  halo.addColorStop(0, rgba(visual.glow, .13 * pulse));
  halo.addColorStop(.56, rgba(visual.glow, .075 * pulse));
  halo.addColorStop(1, rgba(visual.glow, 0));
  context.save();
  context.fillStyle = halo;
  context.beginPath();
  context.ellipse(centerX, centerY, width * .82, height * .92, 0, 0, Math.PI * 2);
  context.fill();

  const age = Math.max(0, now - motion.spawnedAt);
  const entrance = visual.entranceDurationMs > 0 && age < visual.entranceDurationMs && allowMotion
    ? 1 - age / visual.entranceDurationMs
    : 0;
  if (entrance > 0) {
    for (let ring = 0; ring < 2; ring += 1) {
      const progress = (age / visual.entranceDurationMs + ring * .43) % 1;
      const alpha = (1 - progress) * entrance * .54;
      context.globalAlpha = 1;
      context.strokeStyle = rgba(visual.accent, alpha);
      context.lineWidth = motion.target.category === 'boss' ? 2 : 1.25;
      context.beginPath();
      context.ellipse(
        centerX,
        centerY,
        width * (.48 + progress * .64),
        height * (.42 + progress * .72),
        Math.sin(motion.phase * .3) * .04,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
  }
  context.restore();
}

function drawFishSparkles(
  context: CanvasRenderingContext2D,
  motion: MotionFish,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  allowMotion: boolean,
) {
  const visual = fishVisualProfiles[motion.target.animationStyle];
  if (!visual.sparkleCount) return;

  const count = allowMotion ? visual.sparkleCount : Math.min(2, visual.sparkleCount);
  const phase = allowMotion ? motion.phase : 0;
  context.save();
  context.lineCap = 'round';
  context.lineWidth = 1.25;
  for (let index = 0; index < count; index += 1) {
    const angle = phase * .22 + index * 2.399963;
    const orbitX = width * (.34 + (index % 2) * .08);
    const orbitY = height * (.32 + (index % 3) * .06);
    const x = centerX + Math.cos(angle) * orbitX;
    const y = centerY + Math.sin(angle) * orbitY;
    const twinkle = allowMotion ? .34 + (.66 * (.5 + .5 * Math.sin(phase * 1.7 + index * 2.1))) : .42;
    const radius = (motion.target.category === 'boss' ? 2.2 : 1.6) + twinkle * 1.25;
    context.globalAlpha = twinkle;
    context.strokeStyle = rgba(visual.accent, .92);
    context.beginPath();
    context.moveTo(x - radius, y);
    context.lineTo(x + radius, y);
    context.moveTo(x, y - radius);
    context.lineTo(x, y + radius);
    context.stroke();
    context.fillStyle = 'rgba(255,255,255,.88)';
    context.beginPath();
    context.arc(x, y, radius * .25, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export function FishAnimationCanvas({ fish, disabled, onFishClick, onFishExit }: FishAnimationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simulationRef = useRef<MotionFish[]>([]);
  const layoutRef = useRef<CanvasLayout>({ width: 0, height: 0, dpr: 1, seaweedLeft: 0, seaweedTop: 0, seaweedWidth: 0, seaweedHeight: 0 });
  const ambientBubblesRef = useRef<AmbientBubble[]>([]);
  const disabledRef = useRef(disabled);
  const onFishClickRef = useRef(onFishClick);
  const onFishExitRef = useRef(onFishExit);
  const effectsRef = useRef(createCannonEffectState());
  const mountedRef = useRef(true);

  useLayoutEffect(() => {
    disabledRef.current = disabled;
    onFishClickRef.current = onFishClick;
    onFishExitRef.current = onFishExit;
  }, [disabled, onFishClick, onFishExit]);

  useEffect(() => {
    const activeIds = new Set(fish.map((target) => target.id));
    const previous = simulationRef.current.filter((motion) => activeIds.has(motion.target.id));
    const existingById = new Map(previous.map((motion) => [motion.target.id, motion]));
    const isInitialSpawn = previous.length === 0;
    const initialSchoolId = Date.now() + Math.floor(Math.random() * 10000);
    const initialSchoolSize = Math.random() < .55 ? 2 : 3;
    const schoolCounts = new Map<number, number>();
    previous.forEach((motion) => {
      if (motion.schoolId !== null) schoolCounts.set(motion.schoolId, (schoolCounts.get(motion.schoolId) ?? 0) + 1);
    });

    const next = fish.map((target, index) => {
      const existing = existingById.get(target.id);
      if (existing) {
        existing.target = target;
        return existing;
      }

      let schoolId: number | null = null;
      if (isInitialSpawn && index < initialSchoolSize) {
        schoolId = initialSchoolId;
      } else if (!isInitialSpawn && Math.random() < .38) {
        const availableSchool = Array.from(schoolCounts.entries()).find(([, count]) => count < 3);
        if (availableSchool) schoolId = availableSchool[0];
      }

      if (schoolId !== null) schoolCounts.set(schoolId, (schoolCounts.get(schoolId) ?? 0) + 1);
      return createMotionFish(target, schoolId);
    });

    simulationRef.current = next;
  }, [fish]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d', { alpha: true, desynchronized: true });
    if (!canvas || !context) return;

    let disposed = false;
    mountedRef.current = true;
    let frameId = 0;
    let lastFrameTime = 0;
    let width = 0;
    let height = 0;
    let resizeObserver: ResizeObserver | null = null;
    const imageCache = new Map<string, HTMLImageElement>();
    const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduceMotion = reduceMotionQuery.matches;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      width = rect.width;
      height = rect.height;
      const maxDpr = width < 520 ? 1.5 : 2;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const environment = canvas.closest('.fishing-arena')?.querySelector('.fishing-environment');
      const environmentRect = environment?.getBoundingClientRect();
      const seaweedWidth = environmentRect?.width ?? width;
      const seaweedHeight = seaweedWidth * 9 / 16;
      layoutRef.current = {
        width,
        height,
        dpr,
        seaweedLeft: environmentRect ? environmentRect.left - rect.left : 0,
        seaweedTop: environmentRect ? environmentRect.bottom - seaweedHeight - rect.top : height - seaweedHeight,
        seaweedWidth,
        seaweedHeight,
      };
    };

    const getImage = (url: string) => {
      let image = imageCache.get(url);
      if (!image) {
        image = new window.Image();
        image.decoding = 'async';
        image.src = url;
        imageCache.set(url, image);
      }
      return image;
    };

    const stepSimulation = (elapsedSeconds: number, now: number) => {
      if (!width || !height) return;
      const dt = Math.min(elapsedSeconds, MAX_DELTA_SECONDS) * (reduceMotion ? .32 : 1);
      updateAmbientBubbles(ambientBubblesRef.current, dt, width, height);
      const motions = simulationRef.current;
      const schools = new Map<number, MotionFish[]>();
      motions.forEach((motion) => {
        if (motion.schoolId === null) return;
        const members = schools.get(motion.schoolId) ?? [];
        members.push(motion);
        schools.set(motion.schoolId, members);
      });

      motions.forEach((motion) => {
        const profile = motionProfiles[motion.target.category];
        motion.phase += dt * motion.phaseSpeed;
        motion.turnTimer -= dt;

        if (motion.turnTimer <= 0) {
          const currentDirection = Math.sign(motion.desiredVx || motion.vx) || 1;
          const flipChance = motion.pattern === 'dart' ? .24 : .13;
          const direction = Math.random() < flipChance ? -currentDirection : currentDirection;
          const maxAngle = motion.pattern === 'cruise' ? .5 : motion.pattern === 'school' ? .98 : motion.pattern === 'dart' ? 1.38 : 1.18;
          const angle = randomBetween(-maxAngle, maxAngle);
          const speedFactor = motion.pattern === 'dart' && Math.random() < .32 ? 1.34 : randomBetween(.84, 1.14);
          const newSpeed = motion.speed * speedFactor;
          motion.desiredVx = direction * newSpeed * Math.cos(angle);
          motion.desiredVy = newSpeed * Math.sin(angle);
          motion.turnTimer = randomBetween(profile.minTurn, profile.maxTurn);
        }

        const peers = motion.schoolId === null ? undefined : schools.get(motion.schoolId);
        let goalVx = motion.desiredVx;
        let goalVy = motion.desiredVy;
        if (peers && peers.length > 1) {
          const others = peers.filter((peer) => peer !== motion);
          const centerX = others.reduce((sum, peer) => sum + peer.x, 0) / others.length;
          const centerY = others.reduce((sum, peer) => sum + peer.y, 0) / others.length;
          const averageVx = others.reduce((sum, peer) => sum + peer.vx, 0) / others.length;
          const averageVy = others.reduce((sum, peer) => sum + peer.vy, 0) / others.length;
          goalVx += clamp((centerX - motion.x) * width * .28, -motion.speed * .22, motion.speed * .22);
          goalVy += clamp((centerY - motion.y) * height * .28, -motion.speed * .22, motion.speed * .22);
          goalVx += (averageVx - motion.vx) * .08;
          goalVy += (averageVy - motion.vy) * .08;
        }

        const smoothing = 1 - Math.exp(-3.4 * dt);
        motion.vx += (goalVx - motion.vx) * smoothing;
        motion.vy += (goalVy - motion.vy) * smoothing;
        const currentSpeed = Math.hypot(motion.vx, motion.vy);
        const maxSpeed = motion.speed * 1.52;
        if (currentSpeed > maxSpeed) {
          motion.vx = motion.vx / currentSpeed * maxSpeed;
          motion.vy = motion.vy / currentSpeed * maxSpeed;
        }

        motion.x += motion.vx * dt / width;
        motion.y += motion.vy * dt / height;

        const halfHeight = fishHeight(motion) / 2 / height;
        const minY = Math.max(.16, halfHeight + .025);
        const maxY = Math.min(.88, 1 - halfHeight - .025);
        if (motion.y < minY) {
          motion.y = minY;
          motion.vy = Math.abs(motion.vy);
          motion.desiredVy = Math.abs(motion.desiredVy);
        } else if (motion.y > maxY) {
          motion.y = maxY;
          motion.vy = -Math.abs(motion.vy);
          motion.desiredVy = -Math.abs(motion.desiredVy);
        }
      });

      for (let first = 0; first < motions.length; first += 1) {
        for (let second = first + 1; second < motions.length; second += 1) {
          const a = motions[first];
          const b = motions[second];
          const dx = (a.x - b.x) * width;
          const dy = (a.y - b.y) * height;
          const distance = Math.hypot(dx, dy) || .001;
          const minDistance = (fishWidth(a) + fishWidth(b)) * .29 + 12;
          if (distance >= minDistance) continue;

          const separation = Math.min((minDistance - distance) * .025, 2.2);
          const nx = dx / distance;
          const ny = dy / distance;
          a.x += nx * separation / width;
          a.y += ny * separation / height;
          b.x -= nx * separation / width;
          b.y -= ny * separation / height;
        }
      }

      const exits: FishExit[] = [];
      const visible = motions.filter((motion) => {
        const halfWidth = fishWidth(motion) / 2;
        if (motion.x * width < -halfWidth - 8 && motion.vx < 0) {
          exits.push({ id: motion.target.id, side: 'left' });
          return false;
        }
        if (motion.x * width > width + halfWidth + 8 && motion.vx > 0) {
          exits.push({ id: motion.target.id, side: 'right' });
          return false;
        }
        return true;
      });

      if (exits.length) {
        simulationRef.current = visible;
        onFishExitRef.current(exits);
      }
      updateCannonEffects(effectsRef.current, dt, now, { width, height });
    };

    const paintFrame = (now: number) => {
      const layout = layoutRef.current;
      if (!layout.width || !layout.height) return;
      context.setTransform(layout.dpr, 0, 0, layout.dpr, 0, 0);
      context.clearRect(0, 0, layout.width, layout.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      drawAmbient(context, ambientBubblesRef.current, layout, now, getImage('/assets/fishing/seaweed-foreground.webp'));
      const heldIds = heldFishIds(effectsRef.current);

      simulationRef.current.forEach((motion) => {
        if (heldIds.has(motion.target.id)) return;
        const image = getImage(`/assets/fishing/fish/${motion.target.sprite}.webp`);
        if (!image.complete || !image.naturalWidth) return;

        const drawWidth = fishWidth(motion);
        const drawHeight = drawWidth * image.naturalHeight / image.naturalWidth;
        const centerX = motion.x * layout.width;
        const bodyBob = Math.sin(motion.phase * .74) * motion.tailAmplitude * .18;
        const centerY = motion.y * layout.height + bodyBob;
        const facing = motion.vx >= 0 ? 1 : -1;
        const pitch = clamp(Math.atan2(motion.vy, Math.max(Math.abs(motion.vx), 12)) * .42, -.24, .24);
        const bodyPulse = Math.sin(motion.phase * .82) * .012;

        drawFishAura(context, motion, centerX, centerY, drawWidth, drawHeight, now, !reduceMotion);
        context.save();
        context.translate(centerX, centerY);
        context.scale(facing, 1);
        context.rotate(facing * pitch);
        context.scale(1 + bodyPulse, 1 + Math.sin(motion.phase * 1.12) * .018);
        drawUndulatingSprite(context, image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight, motion);
        context.restore();
        drawFishSparkles(context, motion, centerX, centerY, drawWidth, drawHeight, !reduceMotion);
      });
      drawCannonEffects(context, effectsRef.current, layout, now, getImage);
    };

    const handleResize = () => resizeCanvas();
    const handleVisibility = () => { lastFrameTime = 0; };
    const handleMotionPreference = (event: MediaQueryListEvent) => { reduceMotion = event.matches; };
    resizeCanvas();
    ambientBubblesRef.current = createAmbientBubbles();
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(canvas);
    }
    window.addEventListener('resize', handleResize, { passive: true });
    document.addEventListener('visibilitychange', handleVisibility);
    reduceMotionQuery.addEventListener('change', handleMotionPreference);

    const animate = (time: number) => {
      if (disposed) return;
      frameId = window.requestAnimationFrame(animate);
      if (document.hidden) {
        lastFrameTime = 0;
        return;
      }
      if (!lastFrameTime) {
        lastFrameTime = time;
        paintFrame(time);
        return;
      }

      const elapsed = time - lastFrameTime;
      if (elapsed < FRAME_INTERVAL) return;
      lastFrameTime = time;
      stepSimulation(Math.min(elapsed / 1000, MAX_DELTA_SECONDS), time);
      paintFrame(time);
    };

    frameId = window.requestAnimationFrame(animate);

    return () => {
      disposed = true;
      mountedRef.current = false;
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('visibilitychange', handleVisibility);
      reduceMotionQuery.removeEventListener('change', handleMotionPreference);
      imageCache.forEach((image) => {
        image.onload = null;
        image.onerror = null;
        image.src = '';
      });
      imageCache.clear();
      simulationRef.current = [];
      ambientBubblesRef.current = [];
      context.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, []);

  const fireAtTarget = useCallback((target: FishSpriteTarget, aimPoint?: { x: number; y: number }) => {
    const layout = layoutRef.current;
    const motion = simulationRef.current.find((candidate) => candidate.target.id === target.id);
    const initialSnapshot: FishVisualSnapshot = motion
      ? snapshotMotion(motion)
      : {
          target: { ...target },
          x: target.x / 100,
          y: target.y / 100,
          vx: target.direction === 'right' ? 1 : -1,
          vy: 0,
          phase: 0,
          phaseSpeed: 6,
          tailAmplitude: 3,
        };
    const point = aimPoint ?? { x: initialSnapshot.x * layout.width, y: initialSnapshot.y * layout.height };
    aimCannonAt(effectsRef.current, layout, point);

    void onFishClickRef.current(target)
      .then((scoreGain) => {
        if (!mountedRef.current || typeof scoreGain !== 'number') return;
        const latestMotion = simulationRef.current.find((candidate) => candidate.target.id === target.id);
        const finalSnapshot = latestMotion ? snapshotMotion(latestMotion) : initialSnapshot;
        launchSuccessfulShot(effectsRef.current, finalSnapshot, scoreGain, layoutRef.current, performance.now());
      })
      .catch(() => undefined);
  }, []);

  const handlePointerMove = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    aimCannonAt(effectsRef.current, { width: rect.width, height: rect.height }, {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
  }, []);

  const handlePointerDown = useCallback((event: PointerEvent<HTMLCanvasElement>) => {
    if (disabledRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    let hit: MotionFish | null = null;
    let nearest = Number.POSITIVE_INFINITY;
    const motions = simulationRef.current;

    for (let index = motions.length - 1; index >= 0; index -= 1) {
      const motion = motions[index];
      const halfWidth = fishWidth(motion) * .52;
      const halfHeight = fishHeight(motion) * .52;
      const dx = (pointerX - motion.x * rect.width) / halfWidth;
      const dy = (pointerY - motion.y * rect.height) / halfHeight;
      const distance = dx * dx + dy * dy;
      if (distance <= 1.18 && distance < nearest) {
        hit = motion;
        nearest = distance;
      }
    }

    if (hit) {
      event.preventDefault();
      fireAtTarget(hit.target, { x: hit.x * rect.width, y: hit.y * rect.height });
    }
  }, [fireAtTarget]);

  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="fish-animation-canvas absolute inset-0 z-0 h-full w-full"
        onPointerMove={handlePointerMove}
        onPointerDown={handlePointerDown}
      />
      <div className="sr-only">
        {fish.map((target) => (
          <button
            key={target.id}
            type="button"
            disabled={disabled}
            aria-label={`Catch ${target.category} fish`}
            onClick={() => fireAtTarget(target)}
          >
            Catch {target.category} fish
          </button>
        ))}
      </div>
    </>
  );
}
