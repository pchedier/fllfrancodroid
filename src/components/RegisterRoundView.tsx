import React, { useState, useEffect, useRef } from 'react';
import {
  Timer,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  Save,
  Plus,
  Trash2,
  Sparkles,
  Info,
  Clock,
  User,
  GitFork,
  FileText,
  ShieldAlert,
} from 'lucide-react';
import { Mission, MissionResult, MissionStatus, Round, RobotSettings } from '../types/fll';
import { calculateRoundTotalScore, formatSeconds, parseSeconds } from '../utils/fllCalculations';

interface RegisterRoundViewProps {
  missions: Mission[];
  settings: RobotSettings;
  onSaveRound: (round: Round) => void;
  onNavigateToMissions: () => void;
  initialRoundData?: Partial<Round>;
}

export const RegisterRoundView: React.FC<RegisterRoundViewProps> = ({
  missions,
  settings,
  onSaveRound,
  onNavigateToMissions,
  initialRoundData,
}) => {
  // Official Match Stopwatch (150s / 2m30s)
  const [stopwatchSeconds, setStopwatchSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Form states
  const [dateStr, setDateStr] = useState<string>(
    initialRoundData?.date || new Date().toISOString().slice(0, 16)
  );
  const [operator, setOperator] = useState<string>(
    initialRoundData?.operator || settings.operators[0] || 'Piloto 1'
  );
  const [strategy, setStrategy] = useState<string>(
    initialRoundData?.strategy || settings.strategies[0] || 'Estratégia Principal'
  );
  const [totalTimeSeconds, setTotalTimeSeconds] = useState<number>(
    initialRoundData?.totalTimeSeconds || 150
  );
  const [penaltyCount, setPenaltyCount] = useState<number>(
    initialRoundData?.penaltyCount || 0
  );
  const [notes, setNotes] = useState<string>(initialRoundData?.notes || '');

  // Mission results mapping
  const [missionResults, setMissionResults] = useState<MissionResult[]>(() => {
    if (initialRoundData?.missionResults && initialRoundData.missionResults.length > 0) {
      return initialRoundData.missionResults;
    }
    // Initialize results for existing missions
    return missions.map((m) => ({
      missionId: m.id,
      missionCode: m.code,
      status: 'not_attempted' as MissionStatus,
      score: 0,
      attempts: 0,
      timeSpentSeconds: 0,
      notes: '',
      selectedCriteriaIds: [],
    }));
  });

  // Re-sync when missions prop updates if results are empty
  useEffect(() => {
    if (missions.length > 0 && missionResults.length === 0) {
      setMissionResults(
        missions.map((m) => ({
          missionId: m.id,
          missionCode: m.code,
          status: 'not_attempted',
          score: 0,
          attempts: 0,
          timeSpentSeconds: 0,
          notes: '',
          selectedCriteriaIds: [],
        }))
      );
    }
  }, [missions]);

  // Stopwatch interval
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setStopwatchSeconds((prev) => {
          if (prev >= 150) {
            // Stop at 2m30s
            setIsTimerRunning(false);
            return 150;
          }
          return prev + 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isTimerRunning]);

  const handleStartTimer = () => setIsTimerRunning(true);
  const handlePauseTimer = () => setIsTimerRunning(false);
  const handleResetTimer = () => {
    setIsTimerRunning(false);
    setStopwatchSeconds(0);
  };
  const handleApplyStopwatchToRound = () => {
    setTotalTimeSeconds(stopwatchSeconds);
  };

  // Change mission status & auto score calculation
  const handleStatusChange = (missionId: string, status: MissionStatus) => {
    const mission = missions.find((m) => m.id === missionId);
    setMissionResults((prev) =>
      prev.map((mr) => {
        if (mr.missionId !== missionId) return mr;

        let autoScore = mr.score;
        let attempts = mr.attempts;

        if (status === 'completed') {
          autoScore = mission ? mission.maxScore : 20;
          if (attempts === 0) attempts = 1;
        } else if (status === 'partial') {
          autoScore = mission && mission.partialScore !== undefined ? mission.partialScore : Math.floor((mission?.maxScore || 20) / 2);
          if (attempts === 0) attempts = 1;
        } else if (status === 'failed') {
          autoScore = 0;
          if (attempts === 0) attempts = 1;
        } else if (status === 'not_attempted') {
          autoScore = 0;
          attempts = 0;
        }

        return {
          ...mr,
          status,
          score: autoScore,
          attempts,
        };
      })
    );
  };

  const handleScoreChange = (missionId: string, score: number) => {
    setMissionResults((prev) =>
      prev.map((mr) => (mr.missionId === missionId ? { ...mr, score: Math.max(0, score) } : mr))
    );
  };

  const handleAttemptsChange = (missionId: string, attempts: number) => {
    setMissionResults((prev) =>
      prev.map((mr) => (mr.missionId === missionId ? { ...mr, attempts: Math.max(0, attempts) } : mr))
    );
  };

  const handleTimeSpentChange = (missionId: string, timeSpentSeconds: number) => {
    setMissionResults((prev) =>
      prev.map((mr) =>
        mr.missionId === missionId ? { ...mr, timeSpentSeconds: Math.max(0, timeSpentSeconds) } : mr
      )
    );
  };

  const handleMissionNotesChange = (missionId: string, notes: string) => {
    setMissionResults((prev) =>
      prev.map((mr) => (mr.missionId === missionId ? { ...mr, notes } : mr))
    );
  };

  // Total Score live computation
  const totalScore = calculateRoundTotalScore(missionResults, penaltyCount, 5);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const newRound: Round = {
      id: initialRoundData?.id || `round_${Date.now()}`,
      roundNumber: initialRoundData?.roundNumber || 0,
      date: dateStr,
      operator: operator.trim() || 'Piloto FrancoDroid',
      strategy: strategy.trim() || 'Padrão',
      totalTimeSeconds: Number(totalTimeSeconds) || 150,
      totalScore,
      notes: notes.trim(),
      penaltyCount,
      penaltyPoints: penaltyCount * 5,
      missionResults,
      createdAt: Date.now(),
      verifiedByAi: initialRoundData?.verifiedByAi || false,
    };

    onSaveRound(newRound);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Timer className="w-6 h-6 text-cyan-400" />
            Registrar Round de Teste (FLL)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Cronometre a execução oficial de 2m30s, avalie cada missão e calcule a telemetria do robô.
          </p>
        </div>

        {/* Live Score Counter Pill */}
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-700 px-4 py-2.5 rounded-2xl shadow-lg shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
              Pontuação Total
            </div>
            <div className="text-2xl font-black text-cyan-400 font-mono leading-none">
              {totalScore} <span className="text-xs font-normal text-slate-400">pts</span>
            </div>
          </div>
          {penaltyCount > 0 && (
            <div className="pl-3 border-l border-slate-800 text-[11px] font-mono text-rose-400">
              -{penaltyCount * 5} pts penalidade
            </div>
          )}
        </div>
      </div>

      {/* Official 2m30s Match Stopwatch Box */}
      <div className="p-6 rounded-2xl border border-cyan-800/40 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/30 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div
              className={`w-14 h-14 rounded-2xl flex items-center justify-center font-mono text-xl font-bold shadow-inner ${
                stopwatchSeconds >= 120
                  ? 'bg-rose-950 text-rose-400 border border-rose-500/50 animate-pulse'
                  : 'bg-slate-950 text-cyan-300 border border-cyan-500/30'
              }`}
            >
              {formatSeconds(stopwatchSeconds)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-white text-base">Cronômetro Oficial de Round</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                  150s (2m30s)
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {stopwatchSeconds >= 120
                  ? '⚠️ Últimos 30 segundos! Alerta de encerramento do round.'
                  : isTimerRunning
                  ? 'Round em andamento...'
                  : 'Pronto para iniciar a contagem regressiva/progressiva.'}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {!isTimerRunning ? (
              <button
                type="button"
                onClick={handleStartTimer}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Iniciar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePauseTimer}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all active:scale-95"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pausar</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleResetTimer}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Zerar</span>
            </button>

            <button
              type="button"
              onClick={handleApplyStopwatchToRound}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 text-xs font-medium transition-all"
            >
              <span>Usar no formulário ({formatSeconds(stopwatchSeconds)})</span>
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Round Parameters Card */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
          <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <FileText className="w-4 h-4 text-cyan-400" />
            Metadados do Round
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Data e Hora */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Data e Horário
              </label>
              <input
                type="datetime-local"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            {/* Operador / Piloto */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Piloto / Operador
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="operators-list"
                  value={operator}
                  onChange={(e) => setOperator(e.target.value)}
                  placeholder="Nome do integrante"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
                <datalist id="operators-list">
                  {settings.operators.map((op) => (
                    <option key={op} value={op} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Estratégia */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Estratégia Utilizada
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="strategies-list"
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value)}
                  placeholder="Selecione ou digite"
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
                />
                <datalist id="strategies-list">
                  {settings.strategies.map((st) => (
                    <option key={st} value={st} />
                  ))}
                </datalist>
              </div>
            </div>

            {/* Tempo Total */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Tempo Total Gasto (segundos)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="300"
                  value={totalTimeSeconds}
                  onChange={(e) => setTotalTimeSeconds(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
                />
                <span className="text-xs text-slate-400 font-mono shrink-0">
                  {formatSeconds(totalTimeSeconds)}
                </span>
              </div>
            </div>
          </div>

          {/* Precision Penalties counter & General notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-200 block">
                  Penalidades de Precisão (Toques)
                </span>
                <span className="text-[11px] text-slate-400">
                  Desconto de 5 pontos por toque no robô
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPenaltyCount((prev) => Math.max(0, prev - 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold"
                >
                  -
                </button>
                <span className="font-mono font-bold text-base w-6 text-center text-rose-400">
                  {penaltyCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPenaltyCount((prev) => Math.min(6, prev + 1))}
                  className="w-7 h-7 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center justify-center font-bold"
                >
                  +
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Observações Gerais do Round
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Desvio de alinhamento na saída 2, roda escorregou no tapete, troca de garra rápida..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Missões Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                Desempenho Individual das Missões
              </h2>
              <p className="text-xs text-slate-400">
                Selecione o status de cada missão executada pelo robô durante o round de teste.
              </p>
            </div>

            <button
              type="button"
              onClick={onNavigateToMissions}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline flex items-center gap-1"
            >
              Configurar Missões Oficiais
            </button>
          </div>

          {/* If no missions registered */}
          {missions.length === 0 ? (
            <div className="p-8 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
              <h3 className="text-base font-bold text-white">Nenhuma missão cadastrada no momento</h3>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                Conforme solicitado, o sistema não contém missões inventadas. Você pode cadastrar as missões oficiais da temporada FLL no módulo &quot;Missões&quot; ou importar o arquivo JSON.
              </p>
              <button
                type="button"
                onClick={onNavigateToMissions}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors"
              >
                <Plus className="w-4 h-4" />
                Cadastrar Missões Oficiais
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {missions.map((mission) => {
                const result =
                  missionResults.find((mr) => mr.missionId === mission.id) || {
                    missionId: mission.id,
                    missionCode: mission.code,
                    status: 'not_attempted' as MissionStatus,
                    score: 0,
                    attempts: 0,
                    timeSpentSeconds: 0,
                    notes: '',
                  };

                return (
                  <div
                    key={mission.id}
                    className={`p-4 rounded-xl border transition-all ${
                      result.status === 'completed'
                        ? 'bg-emerald-950/20 border-emerald-500/40'
                        : result.status === 'partial'
                        ? 'bg-cyan-950/20 border-cyan-500/40'
                        : result.status === 'failed'
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : 'bg-slate-900/60 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Mission Info */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-cyan-400 border border-slate-700">
                            {mission.code}
                          </span>
                          <h4 className="font-bold text-sm text-white">{mission.name}</h4>
                          <span className="text-[11px] text-slate-400">
                            (Máx: {mission.maxScore} pts)
                          </span>
                        </div>
                        {mission.description && (
                          <p className="text-xs text-slate-400 mt-1 line-clamp-1">
                            {mission.description}
                          </p>
                        )}
                        {mission.zone && (
                          <span className="inline-block mt-1 text-[10px] text-slate-500 font-mono">
                            📍 Zona: {mission.zone} {mission.recommendedAttachment ? `• Garra: ${mission.recommendedAttachment}` : ''}
                          </span>
                        )}
                      </div>

                      {/* Status Selector Buttons */}
                      <div className="flex items-center flex-wrap gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStatusChange(mission.id, 'not_attempted')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            result.status === 'not_attempted'
                              ? 'bg-slate-700 text-white shadow-inner'
                              : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Não tentada
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(mission.id, 'failed')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            result.status === 'failed'
                              ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40 font-bold'
                              : 'bg-slate-800/80 text-rose-400 hover:bg-rose-950/50'
                          }`}
                        >
                          Falhou
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(mission.id, 'partial')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            result.status === 'partial'
                              ? 'bg-cyan-600 text-white shadow-md shadow-cyan-900/40 font-bold'
                              : 'bg-slate-800/80 text-cyan-400 hover:bg-cyan-950/50'
                          }`}
                        >
                          Parcial
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(mission.id, 'completed')}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            result.status === 'completed'
                              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/40 font-bold'
                              : 'bg-slate-800/80 text-emerald-400 hover:bg-emerald-950/50'
                          }`}
                        >
                          Concluída
                        </button>
                      </div>

                      {/* Points & Attempts & Time inputs */}
                      <div className="flex items-center gap-3 shrink-0">
                        <div>
                          <label className="block text-[10px] text-slate-400 font-mono uppercase">
                            Pontos
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={result.score}
                            onChange={(e) =>
                              handleScoreChange(mission.id, Number(e.target.value))
                            }
                            className="w-16 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-cyan-300 font-mono font-bold text-xs text-center focus:outline-none focus:border-cyan-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 font-mono uppercase">
                            Tentativas
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="10"
                            value={result.attempts}
                            onChange={(e) =>
                              handleAttemptsChange(mission.id, Number(e.target.value))
                            }
                            className="w-14 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs text-center focus:outline-none focus:border-cyan-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-400 font-mono uppercase">
                            Tempo (s)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="150"
                            value={result.timeSpentSeconds}
                            onChange={(e) =>
                              handleTimeSpentChange(mission.id, Number(e.target.value))
                            }
                            className="w-14 px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-slate-200 font-mono text-xs text-center focus:outline-none focus:border-cyan-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Mission specific notes if attempted */}
                    {result.status !== 'not_attempted' && (
                      <div className="mt-2.5 pt-2 border-t border-slate-800/80">
                        <input
                          type="text"
                          value={result.notes || ''}
                          onChange={(e) => handleMissionNotesChange(mission.id, e.target.value)}
                          placeholder="Obs da missão (ex: garra escorregou, motor A perdeu passo, alinhamento perfeito)"
                          className="w-full px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-300 text-[11px] focus:outline-none focus:border-cyan-500"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Submit Actions */}
        <div className="sticky bottom-4 z-20 p-4 rounded-2xl bg-slate-900/90 border border-slate-700 backdrop-blur-md shadow-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">Total a salvar:</span>
            <span className="text-xl font-bold font-mono text-cyan-400">{totalScore} pontos</span>
            <span className="text-xs text-slate-400 font-mono">
              • {formatSeconds(totalTimeSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Round Oficial</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
