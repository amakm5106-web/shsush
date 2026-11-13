import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

// This is deterministic software validation of the game's code, not player-history or production data.
const require = createRequire(import.meta.url);
const ts = require('typescript');
const sourcePath = path.resolve('lib/buffaloSlotServer.ts');
const compiledPath = path.join(os.tmpdir(), `buffaloSlotServer-${process.pid}.cjs`);
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
fs.writeFileSync(compiledPath, compiled);
const engine = require(compiledPath);
const {
  BUFFALO_PAYOUT_SCALE_AT_80,
  createBuffaloBaseOutcome,
  getBuffaloFreeSpinAward,
  getBuffaloPayoutScale,
  isBuffaloRtpPercent,
  isBuffaloStake,
} = engine;

function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

const noop = () => {};
// Test safety guard only; production Free Spin retriggers are not capped by this validator.
const MAX_SIMULATED_FREE_SPINS_PER_FEATURE = 1_000;
function simulatePaidFeature(stake, random, onPayout = noop) {
  const paid = createBuffaloBaseOutcome(stake, false, random);
  let payoutTotal = paid.payout;
  onPayout(paid.payout);
  let freeSpinsRemaining = getBuffaloFreeSpinAward(paid.scatterCount);
  let freeSpinsPlayed = 0;

  while (freeSpinsRemaining > 0) {
    if (freeSpinsPlayed >= MAX_SIMULATED_FREE_SPINS_PER_FEATURE) {
      throw new Error(`A deterministic test feature exceeded ${MAX_SIMULATED_FREE_SPINS_PER_FEATURE} Free Spins`);
    }
    freeSpinsRemaining -= 1;
    freeSpinsPlayed += 1;
    const freeSpin = createBuffaloBaseOutcome(stake, true, random);
    payoutTotal += freeSpin.payout;
    onPayout(freeSpin.payout);
    freeSpinsRemaining += getBuffaloFreeSpinAward(freeSpin.scatterCount);
  }
  return payoutTotal;
}

function stakesAllowedByGame() {
  return [...new Set(Array.from({ length: 10 }, (_, index) => index + 1)
    .flatMap((level) => [1, 5, 10, 20, 50].map((multiplier) => 80 * level * multiplier)))].sort((a, b) => a - b);
}

const targets = [50, 80, 95];
const calibrationRounds = Number(process.env.CALIBRATION_ROUNDS || 1_000_000);
const validationRounds = Number(process.env.VERIFY_ROUNDS || 1_000_000);
const tolerancePercentPoints = Number(process.env.RTP_TOLERANCE_PP || 1.25);
const regenerate = process.env.REGENERATE === '1';
const stakes = stakesAllowedByGame();

assert.equal(stakes.length, 35, 'Expected the current 35 legal Buffalo stake amounts');
assert.equal(Object.keys(BUFFALO_PAYOUT_SCALE_AT_80).length, stakes.length, 'Every legal stake needs a calibration entry');
for (const stake of stakes) {
  assert.ok(isBuffaloStake(stake), `Stake ${stake} should be legal`);
  assert.ok(Number.isFinite(BUFFALO_PAYOUT_SCALE_AT_80[stake]) && BUFFALO_PAYOUT_SCALE_AT_80[stake] > 0,
    `Stake ${stake} needs a positive calibration factor`);
}
for (const target of targets) assert.ok(isBuffaloRtpPercent(target), `RTP ${target} should be accepted`);
for (const invalid of [49, 96, 80.5, '80', null, NaN]) assert.equal(isBuffaloRtpPercent(invalid), false);
assert.equal(getBuffaloFreeSpinAward(2), 0);
assert.equal(getBuffaloFreeSpinAward(3), 3);
assert.equal(getBuffaloFreeSpinAward(5), 3);
assert.throws(() => getBuffaloPayoutScale(81, 80));
assert.throws(() => getBuffaloPayoutScale(80, 96));

let minimumBaseline = Infinity;
let maximumBaseline = -Infinity;
let maximumDeviation = 0;
const rows = [];
const calibrationFactors = {};
try {
  for (const stake of stakes) {
    const calibrationRandom = seededRandom(0x0B0FFA10 + stake);
    let calibrationPayout = 0;
    for (let round = 0; round < calibrationRounds; round += 1) {
      calibrationPayout += simulatePaidFeature(stake, calibrationRandom);
    }
    const baselineRtp = calibrationPayout / (calibrationRounds * stake);
    const derivedFactor = 0.8 / baselineRtp;
    const calibratedFactor = BUFFALO_PAYOUT_SCALE_AT_80[stake];
    calibrationFactors[stake] = Number(derivedFactor.toFixed(9));
    if (!regenerate) {
      assert.ok(Math.abs(derivedFactor - calibratedFactor) < 1e-7,
        `Stake ${stake}: stored factor does not match deterministic ${calibrationRounds}-feature calibration`);
    }
    minimumBaseline = Math.min(minimumBaseline, baselineRtp * 100);
    maximumBaseline = Math.max(maximumBaseline, baselineRtp * 100);

    if (regenerate) {
      rows.push({ stake, baselineRtpPercent: Number((baselineRtp * 100).toFixed(4)) });
      continue;
    }

    const validationRandom = seededRandom(0x6D2B79F5 + stake);
    const totals = Object.fromEntries(targets.map((target) => [target, 0]));
    for (let round = 0; round < validationRounds; round += 1) {
      simulatePaidFeature(stake, validationRandom, (payout) => {
        for (const target of targets) {
          totals[target] += Math.round(payout * getBuffaloPayoutScale(stake, target));
        }
      });
    }
    const actual = Object.fromEntries(targets.map((target) => {
      const rtp = (totals[target] / (validationRounds * stake)) * 100;
      const deviation = Math.abs(rtp - target);
      maximumDeviation = Math.max(maximumDeviation, deviation);
      assert.ok(deviation <= tolerancePercentPoints,
        `Stake ${stake} at ${target}%: observed ${rtp.toFixed(3)}% differs by ${deviation.toFixed(3)}pp`);
      return [target, Number(rtp.toFixed(4))];
    }));
    rows.push({ stake, baselineRtpPercent: Number((baselineRtp * 100).toFixed(4)), actualRtpPercent: actual });
  }
  console.log(JSON.stringify({
    success: true,
    regeneratingCalibration: regenerate,
    paidFeaturesPerStake: calibrationRounds,
    validationFeaturesPerStake: regenerate ? 0 : validationRounds,
    stakeCount: stakes.length,
    baselineRtpRangePercent: [Number(minimumBaseline.toFixed(4)), Number(maximumBaseline.toFixed(4))],
    maxObservedDeviationPercentagePoints: regenerate ? null : Number(maximumDeviation.toFixed(4)),
    tolerancePercentagePoints: tolerancePercentPoints,
    calibrationFactorsAt80: calibrationFactors,
    targets: rows,
  }, null, 2));
} finally {
  try { fs.unlinkSync(compiledPath); } catch {}
}
