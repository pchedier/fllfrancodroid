import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRoundTotalScore,
  formatSeconds,
  parseSeconds,
  computeDashboardStats,
  computeMissionStats,
  computeStrategyPerformance,
} from './fllCalculations';
import { MissionResult, Round, Mission } from '../types/fll';

test('calculateRoundTotalScore sums mission scores and subtracts penalties', () => {
  const results: MissionResult[] = [
    { missionId: '1', missionCode: 'M01', status: 'completed', score: 30, attempts: 1, timeSpentSeconds: 15 },
    { missionId: '2', missionCode: 'M02', status: 'partial', score: 15, attempts: 2, timeSpentSeconds: 20 },
    { missionId: '3', missionCode: 'M03', status: 'failed', score: 0, attempts: 1, timeSpentSeconds: 10 },
  ];

  // 30 + 15 + 0 = 45 with 0 penalties
  assert.equal(calculateRoundTotalScore(results, 0), 45);

  // 45 - (2 * 5) = 35 with 2 penalties of 5 pts each
  assert.equal(calculateRoundTotalScore(results, 2, 5), 35);

  // Ensures score doesn't go below 0
  assert.equal(calculateRoundTotalScore(results, 20, 5), 0);
});

test('formatSeconds and parseSeconds convert correctly', () => {
  assert.equal(formatSeconds(150), '02:30');
  assert.equal(formatSeconds(65), '01:05');
  assert.equal(formatSeconds(0), '00:00');

  assert.equal(parseSeconds('02:30'), 150);
  assert.equal(parseSeconds('01:05'), 65);
  assert.equal(parseSeconds('45'), 45);
});

test('computeDashboardStats handles empty list gracefully', () => {
  const stats = computeDashboardStats([]);
  assert.equal(stats.totalRounds, 0);
  assert.equal(stats.averageScore, 0);
  assert.equal(stats.maxScore, 0);
  assert.equal(stats.consistencyStdDev, 0);
});

test('computeDashboardStats computes accurate aggregates and consistency', () => {
  const dummyRounds: Round[] = [
    {
      id: 'r1',
      roundNumber: 1,
      date: '2026-11-01',
      operator: 'Pedro',
      strategy: 'Rota Alpha',
      totalTimeSeconds: 140,
      totalScore: 200,
      createdAt: 1,
      missionResults: [
        { missionId: 'm1', missionCode: 'M01', status: 'completed', score: 100, attempts: 1, timeSpentSeconds: 30 },
        { missionId: 'm2', missionCode: 'M02', status: 'completed', score: 100, attempts: 1, timeSpentSeconds: 40 },
      ],
    },
    {
      id: 'r2',
      roundNumber: 2,
      date: '2026-11-02',
      operator: 'Lucas',
      strategy: 'Rota Alpha',
      totalTimeSeconds: 150,
      totalScore: 300,
      createdAt: 2,
      missionResults: [
        { missionId: 'm1', missionCode: 'M01', status: 'completed', score: 100, attempts: 1, timeSpentSeconds: 25 },
        { missionId: 'm2', missionCode: 'M02', status: 'completed', score: 100, attempts: 1, timeSpentSeconds: 35 },
      ],
    },
  ];

  const stats = computeDashboardStats(dummyRounds);
  assert.equal(stats.totalRounds, 2);
  assert.equal(stats.averageScore, 250);
  assert.equal(stats.maxScore, 300);
  assert.equal(stats.minScore, 200);
  assert.equal(stats.averageTimeSeconds, 145);
  assert.equal(stats.overallSuccessRate, 100);
  assert.equal(stats.consistencyStdDev, 50);
});

test('computeMissionStats calculates per-mission success rates and averages', () => {
  const missions: Mission[] = [
    { id: 'm1', code: 'M01', name: 'Missão 1', description: 'Desc 1', maxScore: 50, criteria: [] },
    { id: 'm2', code: 'M02', name: 'Missão 2', description: 'Desc 2', maxScore: 40, criteria: [] },
  ];

  const rounds: Round[] = [
    {
      id: 'r1',
      roundNumber: 1,
      date: '2026-11-01',
      operator: 'Piloto',
      strategy: 'A',
      totalTimeSeconds: 120,
      totalScore: 70,
      createdAt: 1,
      missionResults: [
        { missionId: 'm1', missionCode: 'M01', status: 'completed', score: 50, attempts: 1, timeSpentSeconds: 20 },
        { missionId: 'm2', missionCode: 'M02', status: 'failed', score: 0, attempts: 1, timeSpentSeconds: 15 },
      ],
    },
    {
      id: 'r2',
      roundNumber: 2,
      date: '2026-11-02',
      operator: 'Piloto',
      strategy: 'A',
      totalTimeSeconds: 130,
      totalScore: 70,
      createdAt: 2,
      missionResults: [
        { missionId: 'm1', missionCode: 'M01', status: 'partial', score: 25, attempts: 1, timeSpentSeconds: 22 },
        { missionId: 'm2', missionCode: 'M02', status: 'completed', score: 40, attempts: 2, timeSpentSeconds: 25 },
      ],
    },
  ];

  const missionSummaries = computeMissionStats(missions, rounds);
  const m1Summary = missionSummaries.find((s) => s.missionCode === 'M01');
  const m2Summary = missionSummaries.find((s) => s.missionCode === 'M02');

  assert.ok(m1Summary);
  assert.ok(m2Summary);

  // M1: 1 completed (1.0) + 1 partial (0.5) out of 2 attempts = 75%
  assert.equal(m1Summary?.successRate, 75);
  assert.equal(m1Summary?.averageScoreObtained, 37.5);

  // M2: 1 failed + 1 completed out of 2 attempts = 50%
  assert.equal(m2Summary?.successRate, 50);
  assert.equal(m2Summary?.averageScoreObtained, 20);
});
