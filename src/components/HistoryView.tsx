import React, { useState, useRef } from 'react';
import {
  Search,
  Trash2,
  Clock,
  User,
  X,
  Trophy,
  Cloud,
  Download,
  Upload,
  CheckCircle2,
  LogOut,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { Round, Mission } from '../types/fll';
import { formatSeconds } from '../utils/fllCalculations';
import { StorageService } from '../services/storageService';

interface HistoryViewProps {
  rounds: Round[];
  missions: Mission[];
  trainingCount?: number;
  cloudUserEmail?: string | null;
  onConnectCloud?: () => void;
  onDisconnectCloud?: () => void;
  onImportBackup?: (jsonText: string) => void;
  onEditRound: (round: Round) => void;
  onDeleteRound: (id: string) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  rounds,
  missions,
  trainingCount = 0,
  cloudUserEmail = null,
  onConnectCloud,
  onDisconnectCloud,
  onImportBackup,
  onDeleteRound,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'score_desc' | 'time_asc'>('date_desc');
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'rounds' | 'mission_evolution'>('rounds');
  const [selectedMissionCode, setSelectedMissionCode] = useState<string>(
    missions[0]?.code || 'M01'
  );
  const [roundToDeleteId, setRoundToDeleteId] = useState<string | null>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = () => {
    try {
      const json = StorageService.exportFullBackup();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `francodroid-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowToast('Backup completo (Histórico + Treinos da IA) baixado!', 'success');
    } catch {
      onShowToast('Não foi possível exportar o backup.', 'error');
    }
  };

  const handleBackupFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      onImportBackup?.(text);
    } catch {
      onShowToast('Erro ao ler arquivo de backup.', 'error');
    }
  };

  const filteredRounds = rounds
    .filter((r) => {
      const matchesSearch =
        (r.operator && r.operator.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (r.strategy && r.strategy.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (r.notes && r.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        `Round ${r.roundNumber}`.toLowerCase().includes(searchTerm.toLowerCase());

      return matchesSearch;
    })
    .sort((a, b) => {
      if (sortBy === 'score_desc') return b.totalScore - a.totalScore;
      if (sortBy === 'time_asc') return a.totalTimeSeconds - b.totalTimeSeconds;
      return b.createdAt - a.createdAt;
    });

  const toggleCompare = (id: string) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      if (prev.length >= 2) {
        onShowToast('Selecione no máximo 2 rounds para comparação detalhada.', 'info');
        return [prev[1], id];
      }
      return [...prev, id];
    });
  };

  const roundsToCompare = rounds.filter((r) => selectedForCompare.includes(r.id));

  const missionEvolutionData = [...rounds]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((r) => {
      const mr = r.missionResults?.find((m) => m.missionCode === selectedMissionCode);
      return {
        round: `R${r.roundNumber}`,
        pontos: mr ? mr.score : 0,
        status: mr ? mr.status : 'not_attempted',
      };
    });

  return (
    <div className="max-w-4xl mx-auto space-y-6 fd-fade-up">
      {/* Clean Header */}
      <div className="text-center space-y-2 py-1">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
          Histórico de Execuções
        </h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
          Acompanhe os rounds salvos, revise as pontuações arbitradas e compare a evolução de cada missão.
        </p>
      </div>

      {/* Persistent Storage & Cloud Backup Strip */}
      <div className="fd-panel rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 text-left">
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              cloudUserEmail
                ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                : 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300'
            }`}
          >
            {cloudUserEmail ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Cloud className="w-4 h-4" />
            )}
          </div>
          <div className="text-xs">
            <p className="font-semibold text-white">
              {cloudUserEmail
                ? `Backup Permanente Ativo (Nuvem Google + Servidor + Navegador)`
                : `Salvo no Navegador + Servidor (${rounds.length} rounds · ${trainingCount} regras da IA)`}
            </p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {cloudUserEmail
                ? `Conta conectada: ${cloudUserEmail} — seus rounds e treinos nunca serão apagados ao atualizar.`
                : 'Conecte sua conta Google para manter Histórico e Treinos da IA salvos na nuvem entre dispositivos e atualizações.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={backupInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleBackupFileSelected}
            className="hidden"
          />
          <button
            type="button"
            onClick={handleExportBackup}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Baixar cópia em arquivo JSON"
          >
            <Download className="w-3.5 h-3.5 text-cyan-300" />
            <span>Exportar</span>
          </button>
          <button
            type="button"
            onClick={() => backupInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/15 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
            title="Mesclar backup JSON sem apagar dados atuais"
          >
            <Upload className="w-3.5 h-3.5 text-emerald-300" />
            <span>Restaurar</span>
          </button>
          {cloudUserEmail ? (
            <button
              type="button"
              onClick={onDisconnectCloud}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/15 border border-white/15 hover:border-rose-500/30 text-slate-300 hover:text-rose-200 text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Desconectar sincronização na nuvem (seus dados continuam salvos)"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sair Nuvem</span>
            </button>
          ) : (
            onConnectCloud && (
              <button
                type="button"
                onClick={onConnectCloud}
                className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-cyan-500/20 hover:brightness-105 transition-all"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Salvar na Nuvem</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Segmented Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex p-1 rounded-xl bg-black/40 border border-white/10">
          <button
            onClick={() => setActiveTab('rounds')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'rounds'
                ? 'fd-tab-active text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lista de Rounds ({filteredRounds.length})
          </button>
          <button
            onClick={() => setActiveTab('mission_evolution')}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === 'mission_evolution'
                ? 'fd-tab-active text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Evolução por Missão
          </button>
        </div>
      </div>

      {/* Comparison Floating Bar */}
      {selectedForCompare.length > 0 && (
        <div className="fd-panel rounded-2xl p-3.5 flex items-center justify-between gap-3 fd-fade-up">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono font-bold text-cyan-300">
              {selectedForCompare.length}/2
            </span>
            <span className="text-slate-300">
              {selectedForCompare.length === 1
                ? 'Selecione mais um round para comparar'
                : '2 rounds selecionados para comparação'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedForCompare([])}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-1"
            >
              Cancelar
            </button>
            {selectedForCompare.length === 2 && (
              <button
                onClick={() => setIsCompareModalOpen(true)}
                className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-bold text-xs transition-all"
              >
                Comparar Agora
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Tab 1: Rounds List */}
      {activeTab === 'rounds' && (
        <div className="space-y-4">
          <div className="fd-card rounded-2xl p-3.5 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por round, piloto ou anotação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/40 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-cyan-400"
              >
                <option value="date_desc">Mais recentes</option>
                <option value="score_desc">Maior pontuação</option>
                <option value="time_asc">Menor tempo</option>
              </select>
            </div>
          </div>

          {filteredRounds.length === 0 ? (
            <div className="fd-card rounded-2xl p-12 text-center space-y-2">
              <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-white">Nenhum round gravado ainda</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Realize a primeira análise de vídeo para começar o histórico da equipe.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRounds.map((round) => {
                const isSelected = selectedForCompare.includes(round.id);

                return (
                  <div
                    key={round.id}
                    className={`fd-card fd-interactive rounded-2xl p-4 sm:p-5 ${
                      isSelected ? 'border-cyan-400/50 bg-cyan-950/15' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCompare(round.id)}
                          className="mt-1 sm:mt-0 rounded border-white/20 bg-black/40 text-cyan-400 focus:ring-0 cursor-pointer"
                        />

                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-white">
                              Round #{round.roundNumber}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className="text-slate-400 font-mono">
                              {new Date(round.createdAt).toLocaleDateString('pt-BR')} às{' '}
                              {new Date(round.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {round.verifiedByAi && (
                              <>
                                <span className="text-slate-600">·</span>
                                <span className="text-cyan-300 font-medium">Analisado por IA</span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {round.operator || 'Piloto'}
                            </span>
                            <span>·</span>
                            <span className="flex items-center gap-1 font-mono">
                              <Clock className="w-3 h-3" />
                              {formatSeconds(round.totalTimeSeconds)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <div className="text-right">
                          <span className="text-[11px] font-mono text-slate-500 block">
                            Pontos
                          </span>
                          <span className="text-2xl font-bold font-mono text-cyan-300">
                            {round.totalScore}
                            <span className="text-xs text-slate-400 font-normal ml-1">pts</span>
                          </span>
                        </div>

                        {roundToDeleteId === round.id ? (
                          <div className="flex items-center gap-1.5 bg-rose-500/15 border border-rose-500/30 px-2.5 py-1.5 rounded-xl fd-fade-up">
                            <span className="text-[11px] text-rose-200 font-medium">Excluir?</span>
                            <button
                              onClick={() => {
                                onDeleteRound(round.id);
                                setRoundToDeleteId(null);
                              }}
                              className="px-2.5 py-0.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-semibold transition-all"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setRoundToDeleteId(null)}
                              className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-[11px] transition-all"
                            >
                              Não
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setRoundToDeleteId(round.id)}
                            title="Excluir este round do histórico"
                            className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {round.notes && (
                      <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-white/10 leading-relaxed">
                        {round.notes}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main Tab 2: Mission Evolution */}
      {activeTab === 'mission_evolution' && (
        <div className="space-y-4">
          <div className="fd-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-white">Selecione a Missão:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {(missions.length > 0 ? missions : [{ code: 'M01' }, { code: 'M02' }, { code: 'M03' }]).map(
                (m) => (
                  <button
                    key={m.code}
                    onClick={() => setSelectedMissionCode(m.code)}
                    className={`px-3 py-1.5 rounded-xl font-mono text-xs font-medium transition-all ${
                      selectedMissionCode === m.code
                        ? 'fd-tab-active text-cyan-300'
                        : 'bg-white/[0.03] text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.code}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="fd-panel rounded-2xl p-6">
            <h3 className="text-xs font-semibold text-white mb-4">
              Desempenho da {selectedMissionCode} ao Longo dos Rounds
            </h3>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={missionEvolutionData}>
                  <XAxis dataKey="round" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 39, 0.96)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.12)',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pontos"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    dot={{ fill: '#22d3ee', r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Modal */}
      {isCompareModalOpen && roundsToCompare.length === 2 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="fd-panel rounded-3xl p-6 max-w-2xl w-full space-y-5 fd-fade-up">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-semibold text-white">Comparativo de Execuções</h3>
              <button
                onClick={() => setIsCompareModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {roundsToCompare.map((r) => (
                <div key={r.id} className="fd-card rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-white">
                      Round #{r.roundNumber}
                    </span>
                    <span className="text-xs font-mono font-bold text-cyan-300">
                      {r.totalScore} pts
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div>
                      Tempo: <strong className="text-white font-mono">{formatSeconds(r.totalTimeSeconds)}</strong>
                    </div>
                    <div>
                      Piloto: <strong className="text-white">{r.operator}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsCompareModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white text-slate-950 text-xs font-bold"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
