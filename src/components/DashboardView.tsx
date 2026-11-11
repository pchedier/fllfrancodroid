import React from 'react';
import {
  Trophy,
  Clock,
  Activity,
  Layers,
  Sparkles,
  ArrowRight,
  PlusCircle,
  FolderKanban,
  CheckCircle2,
  TrendingUp,
  Sliders,
  AlertCircle,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from 'recharts';
import { Round, Mission, RobotSettings } from '../types/fll';
import {
  computeDashboardStats,
  computeMissionStats,
  computeStrategyPerformance,
  formatSeconds,
} from '../utils/fllCalculations';
import { TabKey } from './Navbar';

interface DashboardViewProps {
  rounds: Round[];
  missions: Mission[];
  settings: RobotSettings;
  onNavigate: (tab: any) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  rounds,
  missions,
  settings,
  onNavigate,
}) => {
  const stats = computeDashboardStats(rounds);
  const missionStats = computeMissionStats(missions, rounds);
  const strategyStats = computeStrategyPerformance(rounds);

  // Chart data for score & time evolution
  const roundHistoryData = [...rounds]
    .sort((a, b) => a.roundNumber - b.roundNumber)
    .map((r) => ({
      round: `R${r.roundNumber}`,
      data: r.date ? new Date(r.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '',
      pontos: r.totalScore,
      tempoSegundos: r.totalTimeSeconds,
      meta: settings.targetScore || 400,
      limiteTempo: 150, // 2m30s
      estrategia: r.strategy || 'Padrão',
    }));

  // Chart data for mission success rates
  const missionChartData = missionStats
    .filter((m) => m.attemptsCount > 0)
    .slice(0, 10)
    .map((m) => ({
      codigo: m.missionCode,
      taxa: m.successRate,
      tentativas: m.attemptsCount,
      pontosMedios: m.averageScoreObtained,
    }));

  const hasRounds = rounds.length > 0;
  const hasMissions = missions.length > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Welcome & Season Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-6 sm:p-8">
        <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Painel de Telemetria FLL • {settings.robotName || 'FrancoBot'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              FrancoDroid FLL Analytics
            </h1>
            <p className="text-slate-400 text-sm sm:text-base mt-1 max-w-2xl leading-relaxed">
              Monitore a evolução dos rounds de 2m30s, taxa de acerto de cada missão e utilize visão
              computacional com IA para refinar rotas e mecanismos.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('register')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Registrar Round</span>
            </button>
            <button
              onClick={() => onNavigate('ai')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-sm transition-all"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Análise por IA</span>
            </button>
          </div>
        </div>

        {/* Missing missions alert banner if empty */}
        {!hasMissions && (
          <div className="mt-6 p-4 rounded-xl bg-amber-950/40 border border-amber-600/40 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs sm:text-sm font-semibold text-amber-200">
                  Nenhuma missão cadastrada no sistema
                </p>
                <p className="text-xs text-amber-300/80">
                  O sistema está limpo conforme solicitado. Cadastre as missões oficiais ou importe o arquivo JSON da temporada para calcular pontuações e registrar rounds detalhados.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('missions')}
              className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs whitespace-nowrap transition-colors"
            >
              Gerenciar Missões
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {/* Média */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Pontuação Média</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">
            {stats.averageScore} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {stats.totalRounds > 0 ? `Meta: ${settings.targetScore} pts` : 'Sem rounds'}
          </div>
        </div>

        {/* Máxima */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Pontuação Máxima</span>
            <Trophy className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-300 font-mono">
            {stats.maxScore} <span className="text-xs font-normal text-slate-400">pts</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {stats.totalRounds > 0 ? `Mín: ${stats.minScore} pts` : 'Sem rounds'}
          </div>
        </div>

        {/* Tempo Médio */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Tempo Médio</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-300 font-mono">
            {formatSeconds(stats.averageTimeSeconds)}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Limite FLL: 02:30</div>
        </div>

        {/* Quantidade de Rounds */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Total de Rounds</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.totalRounds}</div>
          <div className="mt-1 text-[11px] text-slate-400">Rounds testados</div>
        </div>

        {/* Taxa de Sucesso */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Taxa de Sucesso</span>
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-cyan-300 font-mono">
            {stats.overallSuccessRate}%
          </div>
          <div className="mt-1 text-[11px] text-slate-400">Das missões tentadas</div>
        </div>

        {/* Consistência / Desvio Padrão */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
            <span>Consistência (σ)</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-300 font-mono">
            ±{stats.consistencyStdDev}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {stats.consistencyStdDev < 25 ? 'Alta consistência' : 'Variação normal'}
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      {hasRounds ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Score Evolution */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  Evolução da Pontuação por Round
                </h3>
                <p className="text-xs text-slate-400">
                  Histórico de pontuações obtidas em relação à meta de {settings.targetScore} pts
                </p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={roundHistoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis dataKey="round" stroke="#94a3b8" fontSize={12} />
                  <YAxis stroke="#94a3b8" fontSize={12} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '0.75rem',
                      color: '#fff',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <ReferenceLine
                    y={settings.targetScore || 400}
                    label={{ value: 'Meta', fill: '#f59e0b', fontSize: 11 }}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="pontos"
                    name="Pontos Obtidos"
                    stroke="#06b6d4"
                    strokeWidth={3}
                    dot={{ fill: '#06b6d4', r: 4 }}
                    activeDot={{ r: 6, fill: '#38bdf8' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2: Time Evolution */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  Evolução do Tempo de Execução
                </h3>
                <p className="text-xs text-slate-400">
                  Tempo total gasto em cada round (limite oficial FLL: 150 segundos)
                </p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roundHistoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis dataKey="round" stroke="#94a3b8" fontSize={12} />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={12}
                    tickFormatter={(v) => formatSeconds(v)}
                  />
                  <Tooltip
                    formatter={(value: any) => [`${formatSeconds(Number(value))} min`, 'Tempo']}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#1e293b',
                      borderRadius: '0.75rem',
                      color: '#fff',
                    }}
                  />
                  <ReferenceLine
                    y={150}
                    label={{ value: 'Limite 2m30s', fill: '#ef4444', fontSize: 11 }}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                  />
                  <Bar
                    dataKey="tempoSegundos"
                    name="Tempo Total (s)"
                    fill="#10b981"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State for Rounds */
        <div className="p-10 rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-800/80 flex items-center justify-center text-cyan-400 mb-4 shadow-inner">
            <Layers className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">Nenhum round de teste registrado ainda</h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto mt-2 leading-relaxed">
            Realize um round de 2m30s no tapete da equipe e utilize o formulário com cronômetro
            integrado para acompanhar a telemetria completa do robô.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => onNavigate('register')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm transition-all"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Registrar Primeiro Round</span>
            </button>
            <button
              onClick={() => onNavigate('missions')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-all"
            >
              <FolderKanban className="w-4 h-4 text-cyan-400" />
              <span>Cadastrar Missões</span>
            </button>
          </div>
        </div>
      )}

      {/* Secondary Row: Strategy Efficiency & Mission Success Rates */}
      {hasRounds && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Strategy Performance */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <Sliders className="w-4 h-4 text-purple-400" />
              Desempenho por Estratégia
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Comparação de pontuação média e taxa de pontos por segundo (pts/s)
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-mono uppercase text-[10px]">
                    <th className="py-2.5 px-3">Estratégia</th>
                    <th className="py-2.5 px-3 text-center">Rounds</th>
                    <th className="py-2.5 px-3 text-right">Média</th>
                    <th className="py-2.5 px-3 text-right">Máx</th>
                    <th className="py-2.5 px-3 text-right">Eficiência</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {strategyStats.map((st) => (
                    <tr key={st.strategyName} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-sans font-medium text-slate-200">
                        {st.strategyName}
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-400">{st.roundsCount}</td>
                      <td className="py-2.5 px-3 text-right text-cyan-300 font-bold">
                        {st.averageScore} pts
                      </td>
                      <td className="py-2.5 px-3 text-right text-amber-300">{st.maxScore} pts</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                          {st.pointsPerSecond} pts/s
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mission Success Rates */}
          <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                Taxa de Sucesso das Missões
              </h3>
              <button
                onClick={() => onNavigate('history')}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
              >
                Ver todas <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Porcentagem de conclusão com base nos rounds realizados
            </p>

            {missionChartData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={missionChartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                    <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" unit="%" fontSize={11} />
                    <YAxis dataKey="codigo" type="category" stroke="#94a3b8" fontSize={11} width={45} />
                    <Tooltip
                      formatter={(value: any) => [`${value}%`, 'Taxa de Sucesso']}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#1e293b',
                        borderRadius: '0.75rem',
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="taxa" fill="#06b6d4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-500 text-xs">
                Nenhuma missão foi tentada nos rounds gravados até o momento.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
