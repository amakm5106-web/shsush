import type { FishAnimationStyle, FishCategory, FishSpriteTarget } from './fishData';
import { fishStyleHitColors } from './fishVisuals';

export interface Point {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface FishVisualSnapshot {
  target: FishSpriteTarget;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  phaseSpeed: number;
  tailAmplitude: number;
}

interface Projectile {
  id: number;
  startedAt: number;
  duration: number;
  from: Point;
  to: Point;
  fish: FishVisualSnapshot;
  scoreGain: number;
  lastTrailAt: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  kind: 'spark' | 'bubble' | 'droplet';
}

interface ImpactPulse {
  id: number;
  x: number;
  y: number;
  startedAt: number;
  duration: number;
  category: FishCategory;
  animationStyle: FishAnimationStyle;
  radius: number;
}

interface FishDeath {
  id: number;
  startedAt: number;
  duration: number;
  point: Point;
  fish: FishVisualSnapshot;
}

interface CoinDrop {
  id: number;
  startedAt: number;
  duration: number;
  origin: Point;
  vx: number;
  vy: number;
  phase: number;
}

interface ScoreFloater {
  id: number;
  startedAt: number;
  duration: number;
  point: Point;
  value: number;
}

export interface CannonEffectState {
  angle: number;
  targetAngle: number;
  recoil: number;
  muzzleStartedAt: number;
  muzzleUntil: number;
  muzzlePosition: Point | null;
  projectiles: Projectile[];
  impacts: ImpactPulse[];
  deaths: FishDeath[];
  particles: Particle[];
  coins: CoinDrop[];
  floaters: ScoreFloater[];
  collectionUntil: number;
  nextId: number;
}

const MAX_PARTICLES = 112;
const MAX_PROJECTILES = 7;
const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const randomBetween = (min: number, max: number) => min + Math.random() * (max - min);

const effectColors: Record<FishCategory, [string, string, string]> = {
  small: ['#e8ffff', '#72eaff', '#8ce8d4'],
  medium: ['#fff1c8', '#36ddff', '#ffab63'],
  large: ['#d2edff', '#4e9fff', '#80d8ff'],
  rare: ['#fff1ff', '#d39aff', '#63edff'],
  golden: ['#fff8c7', '#ffd044', '#fff0a0'],
  special: ['#fff0ff', '#eb7cff', '#58f3ff'],
  boss: ['#fff4ce', '#ffae46', '#54e9ff'],
};

function effectColorsFor(category: FishCategory | null, animationStyle?: FishAnimationStyle): [string, string, string] {
  return (animationStyle ? fishStyleHitColors[animationStyle] : undefined)
    ?? (category ? effectColors[category] : ['#f3ffff', '#44eaff', '#ffe27b']);
}

export function createCannonEffectState(): CannonEffectState {
  return {
    angle: -Math.PI / 2,
    targetAngle: -Math.PI / 2,
    recoil: 0,
    muzzleStartedAt: 0,
    muzzleUntil: 0,
    muzzlePosition: null,
    projectiles: [],
    impacts: [],
    deaths: [],
    particles: [],
    coins: [],
    floaters: [],
    collectionUntil: 0,
    nextId: 1,
  };
}

export function cannonOrigin(layout: CanvasSize): Point {
  const baseSize = clamp(layout.width * .25, 86, 128);
  return { x: layout.width / 2, y: layout.height - baseSize * .69 };
}

function turretSize(layout: CanvasSize) {
  const width = clamp(layout.width * .29, 88, 144);
  return { width, height: width * 2 / 3 };
}

function muzzlePoint(state: CannonEffectState, layout: CanvasSize): Point {
  const origin = cannonOrigin(layout);
  const size = turretSize(layout);
  const pivotX = size.width * .34;
  const pivotY = size.height * .53;
  const muzzleX = size.width * .96;
  const muzzleY = size.height * .50;
  const localX = muzzleX - pivotX;
  const localY = muzzleY - pivotY;
  const cosine = Math.cos(state.angle);
  const sine = Math.sin(state.angle);
  return {
    x: origin.x + localX * cosine - localY * sine - cosine * state.recoil,
    y: origin.y + localX * sine + localY * cosine - sine * state.recoil,
  };
}

export function aimCannonAt(state: CannonEffectState, layout: CanvasSize, point: Point) {
  if (!layout.width || !layout.height) return;
  const origin = cannonOrigin(layout);
  let angle = Math.atan2(point.y - origin.y, point.x - origin.x);
  if (angle > 0) angle -= TAU;
  state.targetAngle = clamp(angle, -Math.PI + .12, -.12);
}

function pushParticle(state: CannonEffectState, particle: Particle) {
  if (state.particles.length >= MAX_PARTICLES) state.particles.shift();
  state.particles.push(particle);
}

function spawnBurst(
  state: CannonEffectState,
  point: Point,
  category: FishCategory | null,
  count: number,
  speed: number,
  animationStyle?: FishAnimationStyle,
) {
  const colors = effectColorsFor(category, animationStyle);
  for (let index = 0; index < count; index += 1) {
    const angle = randomBetween(0, TAU);
    const velocity = randomBetween(speed * .35, speed);
    const life = randomBetween(.22, .62);
    const color = colors[index % colors.length];
    pushParticle(state, {
      x: point.x,
      y: point.y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity - speed * .16,
      size: randomBetween(1.4, category === 'boss' ? 4.5 : 3.3),
      life,
      maxLife: life,
      color,
      kind: index % 4 === 0 ? 'bubble' : index % 3 === 0 ? 'droplet' : 'spark',
    });
  }
}

export function launchSuccessfulShot(
  state: CannonEffectState,
  fish: FishVisualSnapshot,
  scoreGain: number,
  layout: CanvasSize,
  now: number,
) {
  if (!layout.width || !layout.height) return;
  const to = { x: fish.x * layout.width, y: fish.y * layout.height };
  aimCannonAt(state, layout, to);
  const from = muzzlePoint(state, layout);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const duration = clamp(distance / 1.15, 130, 460);

  if (state.projectiles.length >= MAX_PROJECTILES) state.projectiles.shift();
  state.projectiles.push({
    id: state.nextId++,
    startedAt: now,
    duration,
    from,
    to,
    fish: { ...fish, target: { ...fish.target } },
    scoreGain,
    lastTrailAt: 0,
  });

  state.recoil = 9;
  state.muzzlePosition = from;
  state.muzzleStartedAt = now;
  state.muzzleUntil = now + 105;
  spawnBurst(state, from, null, 5, 86);
}

function resolveImpact(state: CannonEffectState, projectile: Projectile, now: number) {
  const { fish } = projectile;
  const category = fish.target.category;
  const impactRadius = clamp(fish.target.size * fish.target.visualScale * .32, 18, 54);
  state.impacts.push({
    id: state.nextId++,
    x: projectile.to.x,
    y: projectile.to.y,
    startedAt: now,
    duration: category === 'boss' ? 490 : 360,
    category,
    animationStyle: fish.target.animationStyle,
    radius: impactRadius,
  });
  state.deaths.push({
    id: state.nextId++,
    startedAt: now,
    duration: category === 'boss' ? 860 : category === 'golden' || category === 'special' ? 720 : 560,
    point: { ...projectile.to },
    fish: { ...fish, target: { ...fish.target } },
  });
  state.floaters.push({
    id: state.nextId++,
    startedAt: now,
    duration: 1050,
    point: { x: projectile.to.x, y: projectile.to.y - fish.target.size * .4 },
    value: projectile.scoreGain,
  });
  const particleCount = category === 'boss' ? 17 : category === 'golden' || category === 'rare' || category === 'special' ? 12 : 8;
  spawnBurst(state, projectile.to, category, particleCount, category === 'boss' ? 115 : 82, fish.target.animationStyle);

  const coinCount = category === 'boss' || category === 'golden' ? 4 : 3;
  for (let index = 0; index < coinCount; index += 1) {
    state.coins.push({
      id: state.nextId++,
      startedAt: now + index * 55,
      duration: randomBetween(760, 1050),
      origin: { ...projectile.to },
      vx: randomBetween(-92, 92),
      vy: randomBetween(-150, -84),
      phase: randomBetween(0, TAU),
    });
  }
  if (state.coins.length > 48) state.coins.splice(0, state.coins.length - 48);
}

function projectileProgress(projectile: Projectile, now: number) {
  return clamp((now - projectile.startedAt) / projectile.duration, 0, 1);
}

function projectilePoint(projectile: Projectile, now: number): Point {
  const linear = projectileProgress(projectile, now);
  const eased = 1 - Math.pow(1 - linear, 1.18);
  return {
    x: projectile.from.x + (projectile.to.x - projectile.from.x) * eased,
    y: projectile.from.y + (projectile.to.y - projectile.from.y) * eased,
  };
}

export function updateCannonEffects(state: CannonEffectState, dt: number, now: number, layout: CanvasSize) {
  const safeDelta = Math.min(dt, .05);
  const aimSmoothing = 1 - Math.exp(-15 * safeDelta);
  state.angle += (state.targetAngle - state.angle) * aimSmoothing;
  state.recoil *= Math.exp(-22 * safeDelta);

  const remainingProjectiles: Projectile[] = [];
  state.projectiles.forEach((projectile) => {
    if (projectileProgress(projectile, now) >= 1) {
      resolveImpact(state, projectile, now);
      return;
    }
    if (now - projectile.lastTrailAt >= 30) {
      const point = projectilePoint(projectile, now);
      const life = randomBetween(.15, .32);
      pushParticle(state, {
        x: point.x,
        y: point.y,
        vx: randomBetween(-12, 12),
        vy: randomBetween(-15, 15),
        size: randomBetween(1.3, 2.8),
        life,
        maxLife: life,
        color: Math.random() < .5 ? '#cfffff' : '#39eaff',
        kind: 'spark',
      });
      projectile.lastTrailAt = now;
    }
    remainingProjectiles.push(projectile);
  });
  state.projectiles = remainingProjectiles;

  state.particles.forEach((particle) => {
    particle.life -= safeDelta;
    particle.x += particle.vx * safeDelta;
    particle.y += particle.vy * safeDelta;
    particle.vx *= Math.exp(-1.8 * safeDelta);
    particle.vy += (particle.kind === 'bubble' ? -12 : 42) * safeDelta;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);
  state.impacts = state.impacts.filter((impact) => now - impact.startedAt < impact.duration);
  state.deaths = state.deaths.filter((death) => now - death.startedAt < death.duration);
  state.floaters = state.floaters.filter((floater) => now - floater.startedAt < floater.duration);

  const origin = cannonOrigin(layout);
  const remainingCoins: CoinDrop[] = [];
  state.coins.forEach((coin) => {
    if (now < coin.startedAt || now - coin.startedAt < coin.duration) {
      remainingCoins.push(coin);
      return;
    }
    state.collectionUntil = now + 260;
    spawnBurst(state, origin, 'golden', 4, 46);
  });
  state.coins = remainingCoins;
}

function drawSnapshotFish(
  context: CanvasRenderingContext2D,
  fish: FishVisualSnapshot,
  point: Point,
  image: HTMLImageElement,
  now: number,
  alpha: number,
  scale: number,
  rotation: number,
) {
  if (!image.complete || !image.naturalWidth) return;
  const width = fish.target.size * fish.target.visualScale * scale;
  const height = width * image.naturalHeight / image.naturalWidth;
  const bob = Math.sin((now / 1000) * Math.max(1, fish.phaseSpeed) + fish.phase) * 1.5;
  context.save();
  context.globalAlpha *= alpha;
  context.translate(point.x, point.y + bob);
  context.rotate(rotation);
  context.scale(fish.vx >= 0 ? 1 : -1, 1);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

function drawProjectile(context: CanvasRenderingContext2D, projectile: Projectile, now: number, getImage: (url: string) => HTMLImageElement) {
  const point = projectilePoint(projectile, now);
  const fishImage = getImage(`/assets/fishing/fish/${projectile.fish.target.sprite}.webp`);
  drawSnapshotFish(context, projectile.fish, projectile.to, fishImage, now, .96, 1, 0);

  const gradient = context.createLinearGradient(projectile.from.x, projectile.from.y, point.x, point.y);
  gradient.addColorStop(0, 'rgba(75,238,255,0)');
  gradient.addColorStop(.62, 'rgba(65,232,255,.35)');
  gradient.addColorStop(1, 'rgba(236,255,255,.95)');
  context.save();
  context.lineCap = 'round';
  context.lineWidth = 5;
  context.strokeStyle = gradient;
  context.shadowBlur = 17;
  context.shadowColor = '#36eaff';
  context.beginPath();
  context.moveTo(projectile.from.x, projectile.from.y);
  context.lineTo(point.x, point.y);
  context.stroke();
  const orb = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, 12);
  orb.addColorStop(0, 'rgba(255,255,255,1)');
  orb.addColorStop(.2, 'rgba(198,255,255,.98)');
  orb.addColorStop(.55, 'rgba(50,222,255,.68)');
  orb.addColorStop(1, 'rgba(50,222,255,0)');
  context.fillStyle = orb;
  context.beginPath();
  context.arc(point.x, point.y, 12, 0, TAU);
  context.fill();
  context.restore();
}

function drawImpacts(context: CanvasRenderingContext2D, state: CannonEffectState, now: number) {
  state.impacts.forEach((impact) => {
    const progress = clamp((now - impact.startedAt) / impact.duration, 0, 1);
    const colors = effectColorsFor(impact.category, impact.animationStyle);
    const radius = impact.radius * (.4 + progress * 1.55);
    context.save();
    context.globalAlpha = (1 - progress) * .86;
    context.lineWidth = impact.category === 'boss' ? 3.2 : 2.2;
    context.strokeStyle = colors[1];
    context.shadowColor = colors[1];
    context.shadowBlur = 13;
    context.beginPath();
    context.arc(impact.x, impact.y, radius, 0, TAU);
    context.stroke();
    if (impact.category === 'golden' || impact.category === 'rare' || impact.category === 'special' || impact.category === 'boss') {
      context.globalAlpha = (1 - progress) * .52;
      context.lineWidth = 1.5;
      context.strokeStyle = colors[2];
      context.beginPath();
      context.arc(impact.x, impact.y, radius * .68, 0, TAU);
      context.stroke();
    }
    context.restore();
  });
}

function drawDeaths(context: CanvasRenderingContext2D, state: CannonEffectState, now: number, getImage: (url: string) => HTMLImageElement) {
  state.deaths.forEach((death) => {
    const progress = clamp((now - death.startedAt) / death.duration, 0, 1);
    const wobble = Math.sin(progress * 30 + death.id) * (1 - progress) * 5;
    const point = {
      x: death.point.x + Math.sin(progress * 12 + death.id) * progress * 9 + wobble,
      y: death.point.y + progress * 20,
    };
    const colors = effectColorsFor(death.fish.target.category, death.fish.target.animationStyle);
    const glowRadius = death.fish.target.size * death.fish.target.visualScale * .72;
    const deathGlow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, glowRadius);
    deathGlow.addColorStop(0, `${colors[1]}33`);
    deathGlow.addColorStop(1, `${colors[1]}00`);
    context.save();
    context.globalAlpha = (1 - progress) * .72;
    context.fillStyle = deathGlow;
    context.beginPath();
    context.ellipse(point.x, point.y, glowRadius, glowRadius * .68, 0, 0, TAU);
    context.fill();
    context.restore();
    const image = getImage(`/assets/fishing/fish/${death.fish.target.sprite}.webp`);
    const bossSpin = death.fish.target.animationStyle === 'boss-octopus' ? .68
      : death.fish.target.animationStyle === 'boss-whale' ? .2
        : death.fish.target.animationStyle === 'boss-dragon' ? .54
          : death.fish.target.category === 'boss' ? .42 : .7;
    const spin = (death.fish.vx >= 0 ? 1 : -1) * progress * bossSpin;
    drawSnapshotFish(context, death.fish, point, image, now, 1 - progress, 1 - progress * .18, spin);
  });
}

function drawCoins(context: CanvasRenderingContext2D, state: CannonEffectState, now: number, layout: CanvasSize) {
  const target = cannonOrigin(layout);
  state.coins.forEach((coin) => {
    if (now < coin.startedAt) return;
    const progress = clamp((now - coin.startedAt) / coin.duration, 0, 1);
    const drop = clamp(progress / .34, 0, 1);
    const dropEase = 1 - Math.pow(1 - drop, 2);
    const dropX = coin.origin.x + coin.vx * .28 * dropEase;
    const dropY = coin.origin.y + coin.vy * .28 * dropEase + 65 * drop * drop;
    const collect = clamp((progress - .3) / .7, 0, 1);
    const collectEase = collect * collect * (3 - 2 * collect);
    const x = dropX + (target.x - dropX) * collectEase;
    const y = dropY + (target.y - dropY) * collectEase - Math.sin(collect * Math.PI) * 22;
    const lifeAlpha = progress > .9 ? (1 - progress) / .1 : 1;
    const spin = Math.max(.16, Math.abs(Math.cos(progress * 28 + coin.phase)));
    context.save();
    context.globalAlpha = lifeAlpha;
    context.translate(x, y);
    context.scale(spin, 1);
    const gold = context.createRadialGradient(-2, -3, 1, 0, 0, 9);
    gold.addColorStop(0, '#fff8d4');
    gold.addColorStop(.42, '#ffd959');
    gold.addColorStop(1, '#d98b1c');
    context.fillStyle = gold;
    context.shadowColor = '#ffca43';
    context.shadowBlur = 10;
    context.beginPath();
    context.arc(0, 0, 7.2, 0, TAU);
    context.fill();
    context.lineWidth = 1.25;
    context.strokeStyle = '#fff2a3';
    context.stroke();
    context.shadowBlur = 0;
    context.strokeStyle = 'rgba(148,82,7,.7)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-2.2, -3.5);
    context.lineTo(-2.2, 3.5);
    context.moveTo(2.2, -3.5);
    context.lineTo(2.2, 3.5);
    context.stroke();
    context.restore();
  });
}

function drawParticles(context: CanvasRenderingContext2D, state: CannonEffectState) {
  state.particles.forEach((particle) => {
    const alpha = clamp(particle.life / particle.maxLife, 0, 1);
    context.save();
    context.globalAlpha = alpha;
    context.strokeStyle = particle.color;
    context.fillStyle = particle.color;
    context.shadowColor = particle.color;
    context.shadowBlur = particle.kind === 'spark' ? 7 : 4;
    if (particle.kind === 'bubble') {
      context.lineWidth = .9;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, TAU);
      context.stroke();
      context.beginPath();
      context.arc(particle.x - particle.size * .32, particle.y - particle.size * .32, Math.max(.5, particle.size * .22), 0, TAU);
      context.fill();
    } else if (particle.kind === 'spark') {
      context.lineWidth = Math.max(.8, particle.size * .55);
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(particle.x, particle.y);
      context.lineTo(particle.x - particle.vx * .025, particle.y - particle.vy * .025);
      context.stroke();
    } else {
      context.beginPath();
      context.ellipse(particle.x, particle.y, particle.size * .72, particle.size * 1.2, 0, 0, TAU);
      context.fill();
    }
    context.restore();
  });
}

function drawFloaters(context: CanvasRenderingContext2D, state: CannonEffectState, now: number) {
  state.floaters.forEach((floater) => {
    const progress = clamp((now - floater.startedAt) / floater.duration, 0, 1);
    const alpha = Math.min(1, (1 - progress) * 1.5);
    const y = floater.point.y - progress * 42;
    context.save();
    context.globalAlpha = alpha;
    context.font = '900 17px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineJoin = 'round';
    context.lineWidth = 4;
    context.strokeStyle = 'rgba(2,18,31,.86)';
    context.shadowColor = '#ffcf47';
    context.shadowBlur = 12;
    context.strokeText(`+${floater.value}`, floater.point.x, y);
    context.fillStyle = '#fff2ae';
    context.fillText(`+${floater.value}`, floater.point.x, y);
    context.font = '800 9px system-ui, sans-serif';
    context.fillStyle = '#ffffff';
    context.shadowBlur = 0;
    context.fillText('PTS', floater.point.x, y + 13);
    context.restore();
  });
}

function drawMuzzleFlash(context: CanvasRenderingContext2D, state: CannonEffectState, now: number) {
  if (!state.muzzlePosition || now >= state.muzzleUntil) return;
  const progress = clamp((now - state.muzzleStartedAt) / (state.muzzleUntil - state.muzzleStartedAt), 0, 1);
  const alpha = 1 - progress;
  const radius = 22 + progress * 15;
  const point = state.muzzlePosition;
  context.save();
  context.globalAlpha = alpha;
  const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(.2, 'rgba(203,255,255,.98)');
  glow.addColorStop(.56, 'rgba(55,221,255,.68)');
  glow.addColorStop(1, 'rgba(55,221,255,0)');
  context.fillStyle = glow;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, TAU);
  context.fill();
  context.translate(point.x, point.y);
  context.rotate(state.angle);
  context.fillStyle = 'rgba(234,255,255,.92)';
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(28 + progress * 8, -7);
  context.lineTo(17 + progress * 8, 0);
  context.lineTo(28 + progress * 8, 7);
  context.closePath();
  context.fill();
  context.restore();
}

function drawCannon(context: CanvasRenderingContext2D, state: CannonEffectState, layout: CanvasSize, now: number, getImage: (url: string) => HTMLImageElement) {
  const origin = cannonOrigin(layout);
  const baseSize = clamp(layout.width * .25, 86, 128);
  const base = getImage('/assets/fishing/cannon/cannon_base.webp');
  if (base.complete && base.naturalWidth) {
    context.save();
    context.shadowColor = 'rgba(42,217,255,.32)';
    context.shadowBlur = 14;
    context.drawImage(base, layout.width / 2 - baseSize / 2, layout.height - baseSize, baseSize, baseSize);
    context.restore();
  }

  const turret = getImage('/assets/fishing/cannon/cannon_turret.webp');
  if (turret.complete && turret.naturalWidth) {
    const size = turretSize(layout);
    const pivotX = size.width * .34;
    const pivotY = size.height * .53;
    const offsetX = Math.cos(state.angle) * state.recoil;
    const offsetY = Math.sin(state.angle) * state.recoil;
    context.save();
    context.translate(origin.x - offsetX, origin.y - offsetY);
    context.rotate(state.angle);
    context.shadowColor = 'rgba(47,224,255,.32)';
    context.shadowBlur = 12;
    context.drawImage(turret, -pivotX, -pivotY, size.width, size.height);
    context.restore();
  }

  if (now < state.collectionUntil) {
    const progress = clamp(1 - (state.collectionUntil - now) / 260, 0, 1);
    context.save();
    context.globalAlpha = (1 - progress) * .72;
    context.strokeStyle = '#ffd85a';
    context.lineWidth = 2;
    context.shadowColor = '#ffd85a';
    context.shadowBlur = 11;
    context.beginPath();
    context.arc(origin.x, origin.y, 14 + progress * 29, 0, TAU);
    context.stroke();
    context.restore();
  }
}

export function drawCannonEffects(
  context: CanvasRenderingContext2D,
  state: CannonEffectState,
  layout: CanvasSize,
  now: number,
  getImage: (url: string) => HTMLImageElement,
) {
  state.projectiles.forEach((projectile) => drawProjectile(context, projectile, now, getImage));
  drawDeaths(context, state, now, getImage);
  drawImpacts(context, state, now);
  drawCoins(context, state, now, layout);
  drawParticles(context, state);
  drawFloaters(context, state, now);
  drawCannon(context, state, layout, now, getImage);
  drawMuzzleFlash(context, state, now);
}

export function heldFishIds(state: CannonEffectState) {
  const ids = new Set<number>();
  state.projectiles.forEach((projectile) => ids.add(projectile.fish.target.id));
  state.deaths.forEach((death) => ids.add(death.fish.target.id));
  return ids;
}
