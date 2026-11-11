import React, { useState } from 'react';
import {
  History,
  Search,
  Trash2,
  GitCompare,
  TrendingUp,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  HelpCircle,
  X,
  ChevronRight,
  Trophy,
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
import { formatSeconds, computeMissionStats } from '../utils/fllCalculations';

interface HistoryViewProps {
  rounds: Round[];
  missions: Mission[];
  onEditRound: (round: Round) => void;
  onDeleteRound: (id: string) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  rounds,
  missions,
  onEditRound,
  onDeleteRound,
  onShowToast,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStrategy, setSelectedStrategy] = useState('ALL');
  const [sortBy, setSortBy] = useState<'date_desc' | 'score_desc' | 'time_asc'>('date_desc');
  const [selectedForCompare, setSelectedForCompare] = useState<string[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'rounds' | 'mission_evolution'>('rounds');
  const [selectedMissionCode, setSelectedMissionCode] = useState<string>(
    missions[0]?.code || 'M01'
  );
  const [roundToDeleteId, setRoundToDeleteId] = useState<string | null>(null);

  const strategies = Array.from(new Set(rounds.map((r) => r.strategy).filter(Boolean)));

  const filteredRounds = rounds
    .filter((r) => {
      const matchesSearch =
        (r.operator && r.operator.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (r.strategy && r.strategy.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (r.notes && r.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        `Round ${r.roundNumber}`.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStrategy = selectedStrategy === 'ALL' || r.strategy === selectedStrategy;
      return matchesSearch && matchesStrategy;
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

  const missionStats = computeMissionStats(missions, rounds);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Symmetrical Hero Header */}
      <div className="text-center space-y-2 py-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full apple-glass-subtle text-[11px] font-mono text-cyan-300">
          <History className="w-3.5 h-3.5 text-cyan-400" />
          <span>Telemetria Acumulada</span>
        </span>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          Histórico de Execuções
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
          Acompanhe todos os rounds registrados, consulte as avaliações da IA e compare o desempenho de rotas e missões.
        </p>
      </div>

      {/* Symmetrical Segmented Tabs */}
      <div className="flex justify-center">
        <div className="inline-flex p-1 rounded-2xl bg-black/40 border border-white/5 shadow-inner">
          <button
            onClick={() => setActiveTab('rounds')}
            className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === 'rounds'
                ? 'apple-glass-active text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Lista de Rounds ({filteredRounds.length})
          </button>
          <button
            onClick={() => setActiveTab('mission_evolution')}
            className={`px-4 py-1.5 rounded-xl text-xs font-medium transition-all ${
              activeTab === 'mission_evolution'
                ? 'apple-glass-active text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Evolução por Missão
          </button>
        </div>
      </div>

      {/* Comparison Floating Action Bar */}
      {selectedForCompare.length > 0 && (
        <div className="apple-glass rounded-2xl p-3 flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono flex items-center justify-center text-[10px]">
              {selectedForCompare.length}
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
              className="text-xs text-slate-400 hover:text-white px-2 py-1"
            >
              Cancelar
            </button>
            {selectedForCompare.length === 2 && (
              <button
                onClick={() => setIsCompareModalOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-white text-black hover:bg-slate-100 font-semibold text-xs transition-all"
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
          {/* Symmetrical Search and Filters Card */}
          <div className="apple-glass-card rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar por round, piloto ou anotação..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-black/40 border border-white/5 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-white/20"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-black/40 border border-white/5 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-white/20"
              >
                <option value="date_desc">Mais recentes</option>
                <option value="score_desc">Maior pontuação</option>
                <option value="time_asc">Menor tempo</option>
              </select>
            </div>
          </div>

          {/* Rounds Cards */}
          {filteredRounds.length === 0 ? (
            <div className="apple-glass-card rounded-2xl p-12 text-center space-y-2">
              <Trophy className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <h3 className="text-sm font-semibold text-white">Nenhum round gravado ainda</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Realize a primeira análise de vídeo ou envie um registro para começar o histórico da equipe.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRounds.map((round) => {
                const isSelected = selectedForCompare.includes(round.id);

                return (
                  <div
                    key={round.id}
                    className={`apple-glass-card apple-glass-card-hover rounded-2xl p-4 sm:p-5 transition-all ${
                      isSelected ? 'border-cyan-400/40 bg-white/[0.04]' : ''
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start sm:items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCompare(round.id)}
                          className="mt-1 sm:mt-0 rounded border-white/10 bg-black/40 text-cyan-500 focus:ring-0 cursor-pointer"
                        />

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-lg bg-white/5 text-white border border-white/10">
                              Round #{round.roundNumber}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {new Date(round.createdAt).toLocaleDateString('pt-BR')} às{' '}
                              {new Date(round.createdAt).toLocaleTimeString('pt-BR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {round.verifiedByAi && (
                              <span className="text-[10px] font-mono px-2 py-0.2 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                                IA Verificado
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-slate-400 mt-1.5">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {round.operator || 'Piloto'}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatSeconds(round.totalTimeSeconds)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4">
                        <div className="text-right">
                          <span className="text-[10px] font-mono uppercase text-slate-500 block">
                            Pontos
                          </span>
                          <span className="text-2xl font-bold font-mono text-cyan-300">
                            {round.totalScore}
                            <span className="text-xs text-slate-500 font-normal ml-1">pts</span>
                          </span>
                        </div>

                        {roundToDeleteId === round.id ? (
                          <div className="flex items-center gap-1.5 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-xl animate-in fade-in duration-150">
                            <span className="text-[10px] text-rose-300 font-medium">Excluir?</span>
                            <button
                              onClick={() => {
                                onDeleteRound(round.id);
                                setRoundToDeleteId(null);
                              }}
                              className="px-2 py-0.5 rounded-lg bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-semibold transition-all"
                            >
                              Sim
                            </button>
                            <button
                              onClick={() => setRoundToDeleteId(null)}
                              className="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 text-[10px] transition-all"
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
                      <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-white/5 leading-relaxed">
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
          <div className="apple-glass-card rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs font-semibold text-white">Selecione a Missão:</span>
            <div className="flex items-center gap-1.5 overflow-x-auto py-1">
              {(missions.length > 0 ? missions : [{ code: 'M01' }, { code: 'M02' }, { code: 'M03' }]).map(
                (m) => (
                  <button
                    key={m.code}
                    onClick={() => setSelectedMissionCode(m.code)}
                    className={`px-3 py-1.5 rounded-xl font-mono text-xs font-medium transition-all ${
                      selectedMissionCode === m.code
                        ? 'apple-glass-active text-cyan-300'
                        : 'bg-white/[0.02] text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.code}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="apple-glass rounded-2xl p-6">
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
                      backgroundColor: 'rgba(15, 19, 28, 0.95)',
                      borderRadius: '12px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#fff',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pontos"
                    stroke="#22d3ee"
                    strokeWidth={2}
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
          <div className="apple-glass rounded-3xl p-6 max-w-2xl w-full space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-semibold text-white">
                Comparativo de Execuções
              </h3>
              <button
                onClick={() => setIsCompareModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {roundsToCompare.map((r) => (
                <div key={r.id} className="apple-glass-card rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-white">
                      Round #{r.roundNumber}
                    </span>
                    <span className="text-xs font-mono font-bold text-cyan-300">
                      {r.totalScore} pts
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div>Tempo: <strong className="text-white">{formatSeconds(r.totalTimeSeconds)}</strong></div>
                    <div>Piloto: <strong className="text-white">{r.operator}</strong></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setIsCompareModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white text-black text-xs font-semibold"
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
