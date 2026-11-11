import { MissionResult, Round, Mission } from '../types/fll';

/**
 * Calculates the total score of a round by summing mission results
 * and subtracting penalties if any.
 */
export function calculateRoundTotalScore(
  missionResults: MissionResult[],
  penaltyCount = 0,
  penaltyPointsPerUnit = 5
): number {
  const missionsSum = missionResults.reduce((acc, curr) => acc + (Number(curr.score) || 0), 0);
  const totalPenalty = penaltyCount * penaltyPointsPerUnit;
  return Math.max(0, missionsSum - totalPenalty);
}

/**
 * Formats seconds into MM:SS format.
 */
export function formatSeconds(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parses MM:SS format into seconds.
 */
export function parseSeconds(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const m = parseInt(parts[0], 10) || 0;
    const s = parseInt(parts[1], 10) || 0;
    return m * 60 + s;
  }
  const directNum = parseInt(timeStr, 10);
  return isNaN(directNum) ? 0 : directNum;
}

export interface DashboardStats {
  totalRounds: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  averageTimeSeconds: number;
  overallSuccessRate: number; // percentage 0-100
  consistencyStdDev: number; // lower means more consistent
}

/**
 * Computes dashboard aggregate metrics from rounds list.
 */
export function computeDashboardStats(rounds: Round[]): DashboardStats {
  if (!rounds || rounds.length === 0) {
    return {
      totalRounds: 0,
      averageScore: 0,
      maxScore: 0,
      minScore: 0,
      averageTimeSeconds: 0,
      overallSuccessRate: 0,
      consistencyStdDev: 0,
    };
  }

  const scores = rounds.map((r) => r.totalScore);
  const times = rounds.map((r) => r.totalTimeSeconds);

  const totalScore = scores.reduce((a, b) => a + b, 0);
  const averageScore = Math.round(totalScore / rounds.length);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);

  const totalTime = times.reduce((a, b) => a + b, 0);
  const averageTimeSeconds = Math.round(totalTime / rounds.length);

  // Standard deviation for consistency
  const variance =
    scores.reduce((acc, score) => acc + Math.pow(score - averageScore, 2), 0) / rounds.length;
  const consistencyStdDev = Math.round(Math.sqrt(variance) * 10) / 10;

  // Calculate mission success rate across all attempted missions
  let totalAttempted = 0;
  let totalSuccessful = 0;

  for (const round of rounds) {
    for (const mr of round.missionResults || []) {
      if (mr.status !== 'not_attempted') {
        totalAttempted++;
        if (mr.status === 'completed') {
          totalSuccessful += 1;
        } else if (mr.status === 'partial') {
          totalSuccessful += 0.5;
        }
      }
    }
  }

  const overallSuccessRate =
    totalAttempted > 0 ? Math.round((totalSuccessful / totalAttempted) * 100) : 0;

  return {
    totalRounds: rounds.length,
    averageScore,
    maxScore,
    minScore,
    averageTimeSeconds,
    overallSuccessRate,
    consistencyStdDev,
  };
}

export interface MissionStatsSummary {
  missionId: string;
  missionCode: string;
  missionName: string;
  attemptsCount: number;
  completedCount: number;
  partialCount: number;
  failedCount: number;
  successRate: number; // percentage
  averageScoreObtained: number;
  averageTimeSpent: number;
}

/**
 * Computes performance metrics for each mission across all rounds.
 */
export function computeMissionStats(missions: Mission[], rounds: Round[]): MissionStatsSummary[] {
  return missions.map((mission) => {
    let attemptsCount = 0;
    let completedCount = 0;
    let partialCount = 0;
    let failedCount = 0;
    let totalScore = 0;
    let totalTime = 0;

    for (const round of rounds) {
      const result = round.missionResults?.find(
        (mr) => mr.missionId === mission.id || mr.missionCode === mission.code
      );
      if (result) {
        if (result.status !== 'not_attempted') {
          attemptsCount++;
          if (result.status === 'completed') completedCount++;
          else if (result.status === 'partial') partialCount++;
          else if (result.status === 'failed') failedCount++;

          totalScore += result.score || 0;
          totalTime += result.timeSpentSeconds || 0;
        }
      }
    }

    const successRate =
      attemptsCount > 0
        ? Math.round(((completedCount + partialCount * 0.5) / attemptsCount) * 100)
        : 0;

    const averageScoreObtained =
      attemptsCount > 0 ? Math.round((totalScore / attemptsCount) * 10) / 10 : 0;

    const averageTimeSpent =
      attemptsCount > 0 ? Math.round((totalTime / attemptsCount) * 10) / 10 : 0;

    return {
      missionId: mission.id,
      missionCode: mission.code,
      missionName: mission.name,
      attemptsCount,
      completedCount,
      partialCount,
      failedCount,
      successRate,
      averageScoreObtained,
      averageTimeSpent,
    };
  });
}

/**
 * Strategy performance breakdown
 */
export interface StrategyPerformance {
  strategyName: string;
  roundsCount: number;
  averageScore: number;
  maxScore: number;
  averageTimeSeconds: number;
  pointsPerSecond: number;
}

export function computeStrategyPerformance(rounds: Round[]): StrategyPerformance[] {
  const groups: Record<string, Round[]> = {};

  for (const r of rounds) {
    const strat = r.strategy?.trim() || 'Padrão / Não informada';
    if (!groups[strat]) groups[strat] = [];
    groups[strat].push(r);
  }

  return Object.entries(groups).map(([stratName, rList]) => {
    const totalScore = rList.reduce((acc, curr) => acc + curr.totalScore, 0);
    const totalTime = rList.reduce((acc, curr) => acc + curr.totalTimeSeconds, 0);
    const avgScore = Math.round(totalScore / rList.length);
    const avgTime = Math.round(totalTime / rList.length);
    const maxScore = Math.max(...rList.map((r) => r.totalScore));
    const pointsPerSecond = avgTime > 0 ? Math.round((avgScore / avgTime) * 100) / 100 : 0;

    return {
      strategyName: stratName,
      roundsCount: rList.length,
      averageScore: avgScore,
      maxScore,
      averageTimeSeconds: avgTime,
      pointsPerSecond,
    };
  });
}
