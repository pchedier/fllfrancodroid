import React, { useState } from 'react';
import {
  GitFork,
  Plus,
  Trash2,
  Clock,
  Trophy,
  Zap,
  ShieldAlert,
  Layers,
  Sparkles,
  ArrowRight,
  Sliders,
  CheckCircle2,
  Wrench,
  AlertTriangle,
} from 'lucide-react';
import { Mission, StrategyPlan, RobotSettings } from '../types/fll';
import { formatSeconds } from '../utils/fllCalculations';

interface StrategiesViewProps {
  missions: Mission[];
  settings: RobotSettings;
  strategyPlans: StrategyPlan[];
  onSaveStrategyPlan: (plan: StrategyPlan) => void;
  onDeleteStrategyPlan: (id: string) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const StrategiesView: React.FC<StrategiesViewProps> = ({
  missions,
  settings,
  strategyPlans,
  onSaveStrategyPlan,
  onDeleteStrategyPlan,
  onShowToast,
}) => {
  const [selectedPlanId, setSelectedPlanId] = useState<string>(
    strategyPlans[0]?.id || 'new_plan'
  );

  // Active plan in editor
  const activePlan = strategyPlans.find((p) => p.id === selectedPlanId) || {
    id: `plan_${Date.now()}`,
    name: 'Estratégia Principal FrancoDroid',
    description: 'Planejamento tático de rotas e trocas de garras para a mesa de 2m30s',
    targetTimeSeconds: 145,
    runs: [
      {
        runNumber: 1,
        name: 'Saída 1: Zona Leste',
        attachmentUsed: settings.clawsAndAttachments[0] || 'Garra Frontal',
        missionIds: missions.slice(0, 2).map((m) => m.id),
        estimatedRunTimeSeconds: 40,
        notes: 'Início rápido saindo da Base Direita.',
      },
    ],
  };

  const [planName, setPlanName] = useState(activePlan.name);
  const [planDesc, setPlanDesc] = useState(activePlan.description);
  const [runs, setRuns] = useState(activePlan.runs);

  // Update runs when switching plans
  const handleSelectPlan = (id: string) => {
    setSelectedPlanId(id);
    const found = strategyPlans.find((p) => p.id === id);
    if (found) {
      setPlanName(found.name);
      setPlanDesc(found.description);
      setRuns(found.runs);
    }
  };

  // Add new run
  const handleAddRun = () => {
    const nextNum = runs.length + 1;
    const newRun = {
      runNumber: nextNum,
      name: `Saída ${nextNum}: Nova Rota`,
      attachmentUsed: settings.clawsAndAttachments[0] || 'Garra Padrão',
      missionIds: [],
      estimatedRunTimeSeconds: 35,
      notes: '',
    };
    setRuns([...runs, newRun]);
  };

  // Remove run
  const handleRemoveRun = (idx: number) => {
    setRuns(runs.filter((_, i) => i !== idx));
  };

  // Toggle mission in run
  const handleToggleMissionInRun = (runIndex: number, missionId: string) => {
    setRuns((prev) =>
      prev.map((run, i) => {
        if (i !== runIndex) return run;
        const exists = run.missionIds.includes(missionId);
        const updatedMissions = exists
          ? run.missionIds.filter((id) => id !== missionId)
          : [...run.missionIds, missionId];

        // Recalculate estimated run time based on mission estimated durations
        const autoDuration = updatedMissions.reduce((acc, mId) => {
          const m = missions.find((x) => x.id === mId);
          return acc + (m?.estimatedDurationSeconds || 15);
        }, 15); // 15s base transit to and from base

        return {
          ...run,
          missionIds: updatedMissions,
          estimatedRunTimeSeconds: autoDuration,
        };
      })
    );
  };

  // Change run parameters
  const handleRunChange = (runIndex: number, field: string, value: any) => {
    setRuns((prev) =>
      prev.map((run, i) => (i === runIndex ? { ...run, [field]: value } : run))
    );
  };

  // Aggregate Metrics for Strategy
  const totalEstimatedTime = runs.reduce((acc, r) => acc + (Number(r.estimatedRunTimeSeconds) || 0), 0);
  const allAssignedMissionIds = Array.from(new Set(runs.flatMap((r) => r.missionIds)));
  const totalPlannedScore = allAssignedMissionIds.reduce((acc, mId) => {
    const m = missions.find((x) => x.id === mId);
    return acc + (m?.maxScore || 0);
  }, 0);
  const efficiency = totalEstimatedTime > 0 ? (totalPlannedScore / totalEstimatedTime).toFixed(2) : '0';

  // Save current plan
  const handleSave = () => {
    const payload: StrategyPlan = {
      id: activePlan.id,
      name: planName.trim() || 'Estratégia FrancoDroid',
      description: planDesc.trim(),
      targetTimeSeconds: 150,
      runs,
    };
    onSaveStrategyPlan(payload);
    onShowToast(`Estratégia "${payload.name}" salva com sucesso!`, 'success');
  };

  // Automatic Cluster / Proximity Suggestion
  const handleSuggestProximityClusters = () => {
    if (missions.length === 0) {
      onShowToast('Cadastre missões primeiro para gerar agrupamentos automáticos.', 'info');
      return;
    }

    // Group missions by zone or default in batches of 2-3
    const groups: Record<string, Mission[]> = {};
    missions.forEach((m) => {
      const z = m.zone?.trim() || 'Zona Central';
      if (!groups[z]) groups[z] = [];
      groups[z].push(m);
    });

    const newRuns = Object.entries(groups).map(([zoneName, mList], idx) => {
      const duration = mList.reduce((acc, m) => acc + (m.estimatedDurationSeconds || 15), 15);
      return {
        runNumber: idx + 1,
        name: `Saída ${idx + 1}: Cluster ${zoneName}`,
        attachmentUsed: mList[0]?.recommendedAttachment || settings.clawsAndAttachments[0] || 'Garra Frontal',
        missionIds: mList.map((m) => m.id),
        estimatedRunTimeSeconds: Math.min(50, duration),
        notes: `Agrupamento otimizado por proximidade geográfica (${zoneName}). Reduz deslocamento do robô.`,
      };
    });

    setRuns(newRuns);
    onShowToast('Rotas otimizadas por proximidade geradas com sucesso!', 'success');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <GitFork className="w-6 h-6 text-cyan-400" />
            Estratégias & Otimização de Rotas FLL
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Planeje as saídas da base, selecione garras e mecanismos, agrupe missões por proximidade e
            calcule a eficiência em pontos por segundo.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleSuggestProximityClusters}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-300 text-xs font-semibold shadow-md transition-all"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Sugerir Agrupamento por Proximidade</span>
          </button>

          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition-all"
          >
            <span>Salvar Estratégia</span>
          </button>
        </div>
      </div>

      {/* Strategy Summary KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Pontuação Alvo</span>
          <div className="text-2xl font-bold font-mono text-cyan-400 mt-1">
            {totalPlannedScore} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>
          <span className="text-[11px] text-slate-400">
            {allAssignedMissionIds.length} de {missions.length} missões
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Tempo Total Estimado</span>
          <div
            className={`text-2xl font-bold font-mono mt-1 ${
              totalEstimatedTime > 150 ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {formatSeconds(totalEstimatedTime)}
          </div>
          <span className="text-[11px] text-slate-400">
            {totalEstimatedTime > 150 ? '⚠️ Ultrapassa limite de 2m30s' : 'Dentro do limite FLL'}
          </span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Eficiência de Rota</span>
          <div className="text-2xl font-bold font-mono text-amber-300 mt-1">
            {efficiency} <span className="text-xs font-normal text-slate-400">pts/s</span>
          </div>
          <span className="text-[11px] text-slate-400">Rendimento por segundo</span>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <span className="text-[10px] font-mono uppercase text-slate-400 block">Saídas da Base</span>
          <div className="text-2xl font-bold font-mono text-purple-300 mt-1">
            {runs.length} <span className="text-xs font-normal text-slate-400">saídas</span>
          </div>
          <span className="text-[11px] text-slate-400">Trocas de acessório</span>
        </div>
      </div>

      {/* Strategy Details & Name Card */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Nome da Estratégia
            </label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="Ex: Rota Alfa - Máxima Eficiência"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500 font-semibold"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Objetivo Tático & Descrição
            </label>
            <input
              type="text"
              value={planDesc}
              onChange={(e) => setPlanDesc(e.target.value)}
              placeholder="Ex: Foco nas missões de maior valor no lado leste com garra motorizada..."
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Runs / Saídas Builder */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            Configuração das Saídas da Base (Runs)
          </h2>
          <button
            onClick={handleAddRun}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-medium transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Saída</span>
          </button>
        </div>

        {runs.map((run, runIndex) => {
          // Calculate score for this run
          const runScore = run.missionIds.reduce((acc, mId) => {
            const m = missions.find((x) => x.id === mId);
            return acc + (m?.maxScore || 0);
          }, 0);

          return (
            <div
              key={runIndex}
              className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono font-bold flex items-center justify-center text-xs">
                    #{run.runNumber}
                  </span>
                  <input
                    type="text"
                    value={run.name}
                    onChange={(e) => handleRunChange(runIndex, 'name', e.target.value)}
                    className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-bold text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-slate-400">Tempo estimado:</span>
                    <input
                      type="number"
                      min="5"
                      max="120"
                      value={run.estimatedRunTimeSeconds}
                      onChange={(e) =>
                        handleRunChange(runIndex, 'estimatedRunTimeSeconds', Number(e.target.value))
                      }
                      className="w-16 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-white font-mono text-center text-xs"
                    />
                    <span className="text-slate-400">s</span>
                  </div>

                  <span className="text-xs font-mono font-bold text-cyan-400 px-2 py-1 rounded bg-slate-950 border border-slate-800">
                    +{runScore} pts
                  </span>

                  {runs.length > 1 && (
                    <button
                      onClick={() => handleRemoveRun(runIndex)}
                      className="p-1.5 hover:bg-rose-950/60 rounded-lg text-slate-500 hover:text-rose-400 transition-colors"
                      title="Excluir saída"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Attachment selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5 text-slate-500" />
                    Acessório / Garra Acoplada
                  </label>
                  <select
                    value={run.attachmentUsed}
                    onChange={(e) => handleRunChange(runIndex, 'attachmentUsed', e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    {settings.clawsAndAttachments.map((att) => (
                      <option key={att} value={att}>
                        {att}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Notas de Alinhamento ou Risco</label>
                  <input
                    type="text"
                    value={run.notes}
                    onChange={(e) => handleRunChange(runIndex, 'notes', e.target.value)}
                    placeholder="Ex: Alinhar no marco preto da base, retorno suave..."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Missions Multi-Select for this Run */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Missões Atribuídas a esta Saída ({run.missionIds.length} selecionadas):
                </label>

                {missions.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-500">
                    Nenhuma missão cadastrada no banco de dados. Cadastre na aba &quot;Missões&quot; para atribuir a esta rota.
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {missions.map((m) => {
                      const isSelected = run.missionIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => handleToggleMissionInRun(runIndex, m.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-all ${
                            isSelected
                              ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20'
                              : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
                          }`}
                        >
                          <span className="font-mono">{m.code}</span>
                          <span>• {m.name}</span>
                          <span className="font-mono text-[10px] opacity-80">
                            (+{m.maxScore} pts)
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
