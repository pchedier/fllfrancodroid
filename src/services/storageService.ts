import { Mission, Round, RobotSettings, StrategyPlan, AiAnalysisResult } from '../types/fll';
import { BIOGLOW_OFFICIAL_MISSIONS } from '../data/bioglowMissions';

const STORAGE_KEYS = {
  MISSIONS: 'francodroid_fll_missions_v1',
  ROUNDS: 'francodroid_fll_rounds_v1',
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

  // ROUNDS (Starts EMPTY: "Não utilize dados fictícios como se fossem resultados reais. Inclua estados vazios e instruções para configuração.")
  static getRounds(): Round[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ROUNDS);
      if (!data) return [];
      return JSON.parse(data) as Round[];
    } catch (e) {
      console.error('Erro ao ler rounds:', e);
      return [];
    }
  }

  static saveRounds(rounds: Round[]): void {
    localStorage.setItem(STORAGE_KEYS.ROUNDS, JSON.stringify(rounds));
    window.dispatchEvent(new CustomEvent('fll_data_changed', { detail: { type: 'rounds' } }));
  }

  static addRound(round: Round): { updated: Round[]; newRound: Round } {
    const current = this.getRounds();
    // Auto increment round number
    const maxNumber = current.reduce((max, r) => Math.max(max, r.roundNumber || 0), 0);
    const roundNumber = round.roundNumber && round.roundNumber > 0 ? round.roundNumber : maxNumber + 1;
    const newRound = { ...round, roundNumber };
    const updated = [newRound, ...current];
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
    const current = this.getRounds();
    const updated = current.filter((r) => r.id !== id);
    this.saveRounds(updated);
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

  // BACKUP & RESTORE
  static exportFullBackup(): string {
    const payload = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      team: 'FrancoDroid',
      missions: this.getMissions(),
      rounds: this.getRounds(),
      settings: this.getRobotSettings(),
      strategies: this.getStrategyPlans(),
      aiHistory: this.getAiAnalyses(),
    };
    return JSON.stringify(payload, null, 2);
  }

  static importFullBackup(jsonStr: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data.missions)) this.saveMissions(data.missions);
      if (Array.isArray(data.rounds)) this.saveRounds(data.rounds);
      if (data.settings && typeof data.settings === 'object') this.saveRobotSettings(data.settings);
      if (Array.isArray(data.strategies)) this.saveStrategyPlans(data.strategies);
      if (Array.isArray(data.aiHistory)) localStorage.setItem(STORAGE_KEYS.AI_HISTORY, JSON.stringify(data.aiHistory));
      return { success: true, message: 'Dados importados com sucesso!' };
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
