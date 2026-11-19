import {
  Mission,
  Round,
  RobotSettings,
  StrategyPlan,
  AiAnalysisResult,
  AiTrainingExample,
} from '../types/fll';
import { BIOGLOW_OFFICIAL_MISSIONS } from '../data/bioglowMissions';

const STORAGE_KEYS = {
  MISSIONS: 'francodroid_fll_missions_v1',
  ROUNDS: 'francodroid_fll_rounds_v1',
  AI_TRAINING: 'francodroid_ai_training_v1',
  DELETED_ROUND_IDS: 'francodroid_deleted_round_ids_v1',
  DELETED_TRAINING_IDS: 'francodroid_deleted_training_ids_v1',
  SETTINGS: 'francodroid_fll_settings_v1',
  STRATEGIES: 'francodroid_fll_strategies_v1',
  AI_HISTORY: 'francodroid_fll_ai_history_v1',
  DRIVE_CONFIG: 'francodroid_fll_drive_config_v1',
  DRIVE_REFERENCES: 'francodroid_fll_drive_references_v1',
};

export const DEFAULT_ROBOT_SETTINGS: RobotSettings = {
  robotName: 'FrancoBot Prime',
  driveBase: 'Diferencial com rodas de 56mm e centro de massa rebaixado',
  largeMotors: '2x Motores Grandes (Portas C e D) - Tração',
  mediumMotors: '2x Motores Médios (Portas A e B) - Garras Ativas',
  sensors: '2x Sensores de Cor/Luminosidade (Alinhamento em linhas) + 1x Giroscópio integrado',
  clawsAndAttachments: [
    'Garra Frontal Multiuso',
    'Empurrador Angular Passivo',
    'Braço de Elevação Motorizado',
    'Guia de Parede com Rolamentos',
  ],
  operators: ['Piloto 1', 'Piloto 2'],
  strategies: ['Estratégia 1: Zona Leste + Central', 'Estratégia 2: Zona Oeste Rápida'],
  targetScore: 400,
  supabaseUrl: '',
  supabaseAnonKey: '',
  googleSheetsWebhook: '',
};

export class StorageService {
  // MISSIONS (Starts EMPTY as requested: "Inicialmente, utilizar dados vazios e deixar a estrutura preparada para importar as missões oficiais posteriormente.")
  static getMissions(): Mission[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MISSIONS);
      if (!data) return BIOGLOW_OFFICIAL_MISSIONS;
      const parsed = JSON.parse(data) as Mission[];
      return parsed.length > 0 ? parsed : BIOGLOW_OFFICIAL_MISSIONS;
    } catch (e) {
      console.error('Erro ao ler missões:', e);
      return BIOGLOW_OFFICIAL_MISSIONS;
    }
  }

  static saveMissions(missions: Mission[]): void {
    localStorage.setItem(STORAGE_KEYS.MISSIONS, JSON.stringify(missions));
    window.dispatchEvent(new CustomEvent('fll_data_changed', { detail: { type: 'missions' } }));
  }

  static addMission(mission: Mission): Mission[] {
    const current = this.getMissions();
    const updated = [mission, ...current];
    this.saveMissions(updated);
    return updated;
  }

  static updateMission(mission: Mission): Mission[] {
    const current = this.getMissions();
    const updated = current.map((m) => (m.id === mission.id ? mission : m));
    this.saveMissions(updated);
    return updated;
  }

  static deleteMission(id: string): Mission[] {
    const current = this.getMissions();
    const updated = current.filter((m) => m.id !== id);
    this.saveMissions(updated);
    return updated;
  }

  // ROUNDS (Non-destructive persistent storage + merge)
  static getDeletedRoundIds(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DELETED_ROUND_IDS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  static markRoundDeleted(id: string): string[] {
    const next = Array.from(new Set([...this.getDeletedRoundIds(), id])).slice(-200);
    try {
      localStorage.setItem(STORAGE_KEYS.DELETED_ROUND_IDS, JSON.stringify(next));
    } catch {}
    return next;
  }

  static getRounds(): Round[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ROUNDS);
      if (!data) return [];
      const parsed = JSON.parse(data) as Round[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Erro ao ler rounds:', e);
      return [];
    }
  }

  static saveRounds(rounds: Round[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.ROUNDS, JSON.stringify(rounds));
    } catch (e) {
      console.warn('Erro ao salvar rounds no navegador:', e);
    }
    window.dispatchEvent(new CustomEvent('fll_data_changed', { detail: { type: 'rounds' } }));
  }

  static mergeRounds(existing: Round[], incoming: Round[]): Round[] {
    const deletedSet = new Set(this.getDeletedRoundIds());
    const byId = new Map<string, Round>();

    for (const r of existing) {
      if (r && r.id && !deletedSet.has(r.id)) {
        byId.set(r.id, r);
      }
    }
    for (const r of incoming) {
      if (r && r.id && !deletedSet.has(r.id)) {
        const prev = byId.get(r.id);
        byId.set(r.id, prev ? { ...prev, ...r } : r);
      }
    }

    // Sort newest first, ensure sequential positive roundNumbers if missing
    const sorted = Array.from(byId.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    let maxNum = sorted.reduce((max, r) => Math.max(max, r.roundNumber || 0), 0);
    for (let i = sorted.length - 1; i >= 0; i--) {
      if (!sorted[i].roundNumber || sorted[i].roundNumber <= 0) {
        maxNum += 1;
        sorted[i] = { ...sorted[i], roundNumber: maxNum };
      }
    }
    return sorted;
  }

  static addRound(round: Round): { updated: Round[]; newRound: Round } {
    const current = this.getRounds();
    const maxNumber = current.reduce((max, r) => Math.max(max, r.roundNumber || 0), 0);
    const roundNumber = round.roundNumber && round.roundNumber > 0 ? round.roundNumber : maxNumber + 1;
    const newRound = { ...round, roundNumber };
    const updated = this.mergeRounds(current, [newRound]);
    this.saveRounds(updated);
    return { updated, newRound };
  }

  static updateRound(round: Round): Round[] {
    const current = this.getRounds();
    const updated = current.map((r) => (r.id === round.id ? round : r));
    this.saveRounds(updated);
    return updated;
  }

  static deleteRound(id: string): Round[] {
    this.markRoundDeleted(id);
    const current = this.getRounds();
    const updated = current.filter((r) => r.id !== id);
    this.saveRounds(updated);
    return updated;
  }

  // AI TRAINING RULES (Persistent local mirror + non-destructive merge)
  static getDeletedTrainingIds(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DELETED_TRAINING_IDS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }

  static markTrainingDeleted(id: string): string[] {
    const next = Array.from(new Set([...this.getDeletedTrainingIds(), id])).slice(-500);
    try {
      localStorage.setItem(STORAGE_KEYS.DELETED_TRAINING_IDS, JSON.stringify(next));
    } catch {}
    return next;
  }

  static getAiTraining(): AiTrainingExample[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AI_TRAINING);
      if (!data) return [];
      const parsed = JSON.parse(data) as AiTrainingExample[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static saveAiTraining(examples: AiTrainingExample[]): void {
    const writeSafe = (list: AiTrainingExample[]) => {
      localStorage.setItem(STORAGE_KEYS.AI_TRAINING, JSON.stringify(list));
    };
    try {
      writeSafe(examples);
    } catch {
      // If snapshots push over 5MB browser quota, keep recent 8 snapshots + all text rules safely
      try {
        let keptSnaps = 0;
        const compacted = examples.map((item) => {
          if (item.snapshotBase64) {
            if (keptSnaps < 8) {
              keptSnaps++;
              return item;
            }
            return { ...item, snapshotBase64: undefined };
          }
          return item;
        });
        writeSafe(compacted);
      } catch (e) {
        console.warn('Erro ao salvar treinamento da IA no navegador:', e);
      }
    }
    window.dispatchEvent(new CustomEvent('fll_data_changed', { detail: { type: 'ai_training' } }));
  }

  static mergeAiTraining(
    existing: AiTrainingExample[],
    incoming: AiTrainingExample[]
  ): AiTrainingExample[] {
    const deletedSet = new Set(this.getDeletedTrainingIds());
    const byId = new Map<string, AiTrainingExample>();

    for (const item of existing) {
      if (item && item.id && !deletedSet.has(item.id)) {
        byId.set(item.id, item);
      }
    }
    for (const item of incoming) {
      if (item && item.id && !deletedSet.has(item.id)) {
        const prev = byId.get(item.id);
        byId.set(item.id, {
          ...prev,
          ...item,
          snapshotBase64: item.snapshotBase64 || prev?.snapshotBase64,
        });
      }
    }

    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  static deleteAiTraining(id: string): AiTrainingExample[] {
    this.markTrainingDeleted(id);
    const updated = this.getAiTraining().filter((t) => t.id !== id);
    this.saveAiTraining(updated);
    return updated;
  }

  // SETTINGS
  static getRobotSettings(): RobotSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!data) return DEFAULT_ROBOT_SETTINGS;
      return { ...DEFAULT_ROBOT_SETTINGS, ...JSON.parse(data) };
    } catch (e) {
      console.error('Erro ao ler configurações do robô:', e);
      return DEFAULT_ROBOT_SETTINGS;
    }
  }

  static saveRobotSettings(settings: RobotSettings): void {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('fll_data_changed', { detail: { type: 'settings' } }));
  }

  // STRATEGY PLANS
  static getStrategyPlans(): StrategyPlan[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.STRATEGIES);
      if (!data) return [];
      return JSON.parse(data) as StrategyPlan[];
    } catch (e) {
      console.error('Erro ao ler estratégias:', e);
      return [];
    }
  }

  static saveStrategyPlans(plans: StrategyPlan[]): void {
    localStorage.setItem(STORAGE_KEYS.STRATEGIES, JSON.stringify(plans));
    window.dispatchEvent(new CustomEvent('fll_data_changed', { detail: { type: 'strategies' } }));
  }

  // GOOGLE DRIVE DATASET CONFIG & REFERENCES
  static getDriveConfig(): { folderId: string; folderUrl: string; folderName: string } {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DRIVE_CONFIG);
      if (!data) return { folderId: '', folderUrl: '', folderName: '' };
      return JSON.parse(data);
    } catch {
      return { folderId: '', folderUrl: '', folderName: '' };
    }
  }

  static saveDriveConfig(config: { folderId: string; folderUrl: string; folderName: string }): void {
    localStorage.setItem(STORAGE_KEYS.DRIVE_CONFIG, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent('fll_data_changed', { detail: { type: 'drive_config' } }));
  }

  static getDriveReferences(): any[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.DRIVE_REFERENCES);
      if (!data) return [];
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  static saveDriveReferences(refs: any[]): void {
    localStorage.setItem(STORAGE_KEYS.DRIVE_REFERENCES, JSON.stringify(refs));
    window.dispatchEvent(new CustomEvent('fll_data_changed', { detail: { type: 'drive_references' } }));
  }

  // AI ANALYSES
  static getAiAnalyses(): AiAnalysisResult[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.AI_HISTORY);
      if (!data) return [];
      return JSON.parse(data) as AiAnalysisResult[];
    } catch (e) {
      console.error('Erro ao ler histórico de IA:', e);
      return [];
    }
  }

  static saveAiAnalysis(analysis: AiAnalysisResult): void {
    const current = this.getAiAnalyses();
    const updated = [analysis, ...current].slice(0, 50); // keep last 50
    localStorage.setItem(STORAGE_KEYS.AI_HISTORY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('fll_data_changed', { detail: { type: 'ai' } }));
  }

  // BACKUP & RESTORE (Non-destructive merge on import)
  static exportFullBackup(): string {
    const payload = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      team: 'FrancoDroid',
      missions: this.getMissions(),
      rounds: this.getRounds(),
      aiTraining: this.getAiTraining(),
      settings: this.getRobotSettings(),
      strategies: this.getStrategyPlans(),
      aiHistory: this.getAiAnalyses(),
    };
    return JSON.stringify(payload, null, 2);
  }

  static importFullBackup(jsonStr: string): {
    success: boolean;
    message: string;
    roundsMerged?: Round[];
    trainingMerged?: AiTrainingExample[];
  } {
    try {
      const data = JSON.parse(jsonStr);
      let roundsMerged: Round[] | undefined;
      let trainingMerged: AiTrainingExample[] | undefined;

      // Support either full backup object OR direct array of rounds / training rules
      const incomingRounds: Round[] | null = Array.isArray(data.rounds)
        ? data.rounds
        : Array.isArray(data) && data[0]?.missionResults
        ? data
        : null;
      const incomingTraining: AiTrainingExample[] | null = Array.isArray(data.aiTraining)
        ? data.aiTraining
        : Array.isArray(data.examples)
        ? data.examples
        : Array.isArray(data) && data[0]?.expectedSummary
        ? data
        : null;

      if (incomingRounds) {
        roundsMerged = this.mergeRounds(this.getRounds(), incomingRounds);
        this.saveRounds(roundsMerged);
      }
      if (incomingTraining) {
        trainingMerged = this.mergeAiTraining(this.getAiTraining(), incomingTraining);
        this.saveAiTraining(trainingMerged);
      }
      if (Array.isArray(data.missions)) this.saveMissions(data.missions);
      if (data.settings && typeof data.settings === 'object') this.saveRobotSettings(data.settings);
      if (Array.isArray(data.strategies)) this.saveStrategyPlans(data.strategies);
      if (Array.isArray(data.aiHistory)) {
        localStorage.setItem(STORAGE_KEYS.AI_HISTORY, JSON.stringify(data.aiHistory));
      }

      return {
        success: true,
        message: 'Backup mesclado sem apagar seus dados atuais!',
        roundsMerged,
        trainingMerged,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Arquivo JSON inválido';
      return { success: false, message };
    }
  }

  static importMissionsOnly(jsonStr: string): { success: boolean; count: number; message: string } {
    try {
      const parsed = JSON.parse(jsonStr);
      const missionList: Mission[] = Array.isArray(parsed) ? parsed : (parsed.missions || []);
      if (!Array.isArray(missionList)) {
        return { success: false, count: 0, message: 'Estrutura JSON não contém uma lista de missões.' };
      }
      // Basic validation
      const sanitized = missionList.map((m, idx) => ({
        id: m.id || `m_${Date.now()}_${idx}`,
        code: m.code || `M${String(idx + 1).padStart(2, '0')}`,
        name: m.name || `Missão ${idx + 1}`,
        description: m.description || '',
        maxScore: Number(m.maxScore) || 0,
        partialScore: m.partialScore !== undefined ? Number(m.partialScore) : undefined,
        criteria: Array.isArray(m.criteria) ? m.criteria : [],
        zone: m.zone || 'Tapete Geral',
        recommendedAttachment: m.recommendedAttachment || '',
        riskLevel: m.riskLevel || 'Médio',
        estimatedDurationSeconds: Number(m.estimatedDurationSeconds) || 15,
      }));

      this.saveMissions(sanitized);
      return { success: true, count: sanitized.length, message: `${sanitized.length} missões importadas com sucesso!` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao processar JSON de missões';
      return { success: false, count: 0, message };
    }
  }
}
