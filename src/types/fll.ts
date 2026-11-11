export type MissionStatus = 'not_attempted' | 'failed' | 'partial' | 'completed';

export interface ScoringCriterion {
  id: string;
  description: string;
  points: number;
}

export interface Mission {
  id: string;
  code: string; // e.g. "M01"
  name: string;
  description: string;
  maxScore: number;
  partialScore?: number;
  criteria: ScoringCriterion[];
  zone?: string; // e.g. "Lado Esquerdo", "Centro", "Área de Lançamento"
  recommendedAttachment?: string; // e.g. "Garra Frontal", "Empurrador"
  estimatedDurationSeconds?: number;
  riskLevel?: 'Baixo' | 'Médio' | 'Alto';
}

export interface MissionResult {
  missionId: string;
  missionCode: string;
  status: MissionStatus;
  score: number;
  attempts: number;
  timeSpentSeconds: number;
  notes?: string;
  selectedCriteriaIds?: string[];
}

export interface Round {
  id: string;
  roundNumber: number;
  date: string; // ISO string
  operator: string;
  strategy: string;
  totalTimeSeconds: number; // typically up to 150s (2m30s)
  totalScore: number;
  notes?: string;
  missionResults: MissionResult[];
  penaltyCount?: number;
  penaltyPoints?: number;
  createdAt: number;
  verifiedByAi?: boolean;
}

export interface RobotSettings {
  robotName: string;
  driveBase: string;
  largeMotors: string;
  mediumMotors: string;
  sensors: string;
  clawsAndAttachments: string[];
  operators: string[];
  strategies: string[];
  targetScore: number;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  googleSheetsWebhook?: string;
}

export interface AiMissionEvidence {
  missionId?: string;
  missionCode: string;
  status: MissionStatus;
  estimatedScore: number;
  confidence: number; // 0 to 100
  evidenceDescription: string;
  timestampEstimate?: string;
  mechanismObservations?: string;
}

export interface AiAnalysisResult {
  id: string;
  analyzedAt: string;
  imagePreviewUrl?: string;
  summary: string;
  overallConfidence: number;
  trajectoryNotes: string;
  mechanismNotes: string;
  estimatedTotalScore: number;
  missionsDetected: AiMissionEvidence[];
  rawFeedback?: string;
}

export interface StrategyRouteNode {
  missionId: string;
  order: number;
  estimatedTimeSeconds: number;
  expectedScore: number;
  attachmentNeeded?: string;
  risk: 'Baixo' | 'Médio' | 'Alto';
}

export interface DriveReferenceFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  webViewLink?: string;
  missionCode?: string; // e.g. M01
  state?: 'completed' | 'partial' | 'failed'; // ground truth state
  notes?: string;
  base64Data?: string;
}

export interface DriveFolderConfig {
  folderId: string;
  folderName: string;
  folderUrl?: string;
  lastSynced?: string;
}

export interface StrategyPlan {
  id: string;
  name: string;
  description: string;
  targetTimeSeconds: number;
  runs: {
    runNumber: number;
    name: string; // e.g. "Saída 1 - Missões 01 e 02"
    attachmentUsed: string;
    missionIds: string[];
    estimatedRunTimeSeconds: number;
    notes: string;
  }[];
}
