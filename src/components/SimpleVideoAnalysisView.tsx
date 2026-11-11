import React, { useState, useRef, useEffect } from 'react';
import {
  Video,
  Upload,
  Sparkles,
  Trophy,
  Clock,
  Save,
  FolderOpen,
  ArrowRight,
  FileText,
  Eye,
  CheckCircle2,
  AlertCircle,
  XCircle,
  AlertTriangle,
  Radio,
  Cpu,
  Layers,
  ShieldCheck,
  Check,
  HelpCircle,
  Play,
  Share2,
  Key,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { FolderMissionReference } from './FolderReferenceView';
import { Round, MissionResult, MissionStatus } from '../types/fll';
import { BIOGLOW_OFFICIAL_MISSIONS } from '../data/bioglowMissions';

interface SimpleVideoAnalysisViewProps {
  references: Record<string, FolderMissionReference>;
  isAiReady?: boolean;
  onNavigateToFolders: () => void;
  onNavigateToApi: () => void;
  onSaveToHistory: (round: Round) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface AnalysisResultData {
  estimatedTotalScore: number;
  totalTimeFormatted: string;
  totalTimeSeconds: number;
  overallConfidence: number;
  summary: string;
  trajectoryNotes: string;
  mechanismNotes: string;
  missionsDetected: Array<{
    missionCode: string;
    status: 'completed' | 'partial' | 'failed' | 'not_attempted';
    estimatedScore: number;
    timestampEstimate?: string;
    evidenceDescription: string;
    confidence?: number;
  }>;
  modelUsed?: string;
}

export const SimpleVideoAnalysisView: React.FC<SimpleVideoAnalysisViewProps> = ({
  references,
  isAiReady = false,
  onNavigateToFolders,
  onNavigateToApi,
  onSaveToHistory,
  onShowToast,
}) => {
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('Iniciando...');
  const [analysisPercent, setAnalysisPercent] = useState<number>(0);
  const [result, setResult] = useState<AnalysisResultData | null>(null);
  const [editableScore, setEditableScore] = useState<number>(0);
  const [editableTime, setEditableTime] = useState<number>(150);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [selectedFocusMission, setSelectedFocusMission] = useState<string>('ALL');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const missionKeys = Object.keys(references);

  // iOS Safari/Chrome protection: Warn user not to leave tab while analyzing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAnalyzing) {
        e.preventDefault();
        e.returnValue = 'A IA está analisando seu round. Se você sair ou recarregar, o processamento será interrompido.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnalyzing]);

  // File selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVid = file.type.startsWith('video/');
    setIsVideo(isVid);
    setMediaFile(file);
    setMediaPreviewUrl(URL.createObjectURL(file));
    setResult(null);
  };

  // Convert File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const full = reader.result as string;
        resolve(full);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Discard/clear the current analysis result
  const handleClearResult = () => {
    setResult(null);
    setEditableScore(0);
    setEditableTime(150);
    onShowToast('Resultado descartado com sucesso.', 'info');
  };

  // Run AI Video / Photo analysis with 60s client-side timeout & abort controller
  const handleAnalyze = async () => {
    const savedApiKey = localStorage.getItem('francodroid_user_gemini_api_key')?.trim() || '';
    if (!savedApiKey) {
      onShowToast('Conecte sua chave da IA na aba "Configurar IA" antes de analisar.', 'error');
      onNavigateToApi?.();
      return;
    }

    if (!mediaFile) {
      onShowToast('Selecione o vídeo ou foto do round antes de analisar.', 'error');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisPercent(10);
    setAnalysisStep('Codificando frames do arquivo...');

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, 65000); // 65 seconds safety ceiling

    const progressTimer = setInterval(() => {
      setAnalysisPercent((prev) => {
        if (prev < 30) {
          setAnalysisStep('Enviando telemetria para a IA...');
          return prev + 5;
        }
        if (prev < 65) {
          setAnalysisStep('Comparando com as regras oficiais FLL...');
          return prev + 4;
        }
        if (prev < 90) {
          setAnalysisStep('Arbitrando missões e minutagem...');
          return prev + 2;
        }
        if (prev < 98) {
          setAnalysisStep('Finalizando diagnóstico de trajetória...');
          return prev + 1;
        }
        return prev;
      });
    }, 1000);

    try {
      const base64Data = await fileToBase64(mediaFile);

      // Filter referenceBase if user specifically picked a single mission
      const activeKeys =
        selectedFocusMission !== 'ALL'
          ? Object.keys(references).filter((k) => k === selectedFocusMission)
          : Object.keys(references);

      const referenceBase = activeKeys.map((code) => {
        const item = references[code];
        const pointTiersSummary = item.pointTiers
          ? Object.entries(item.pointTiers).map(([k, v]) => ({
              tierKey: k,
              label: v.label,
              points: v.points,
              sampleFiles: v.files.map((f) => f.name),
            }))
          : [];

        return {
          missionCode: code,
          pointTiers: pointTiersSummary,
          hasCompletaPhotos: item.completaFiles.length > 0,
          hasParcialPhotos: item.parcialFiles.length > 0,
          hasIncompletaPhotos: item.incompletaFiles.length > 0,
          completaExampleNames: item.completaFiles.map((f) => f.name),
          parcialExampleNames: item.parcialFiles.map((f) => f.name),
          incompletaExampleNames: item.incompletaFiles.map((f) => f.name),
        };
      });

      // Filter payload missions to match loaded references or focused mission
      const payloadMissions = BIOGLOW_OFFICIAL_MISSIONS.filter(
        (m) => activeKeys.length === 0 || activeKeys.includes(m.code)
      ).map((m) => ({
        code: m.code,
        name: m.name,
        maxScore: m.maxScore,
        partialScore: m.partialScore,
        description: m.description,
        criteria: m.criteria,
      }));

      const focusPrompt =
        selectedFocusMission !== 'ALL'
          ? `O operador selecionou foco EXCLUSIVO na missão ${selectedFocusMission}. Avalie somente ${selectedFocusMission} comparando minuciosamente com o gabarito de fotos de ${selectedFocusMission}. Não retorne nenhuma outra missão.`
          : `A equipe carregou gabarito de fotos para: [${activeKeys.join(', ')}]. Avalie estritamente estas missões.`;

      const response = await fetch('/api/ai/analyze-mat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          video: isVideo ? base64Data : undefined,
          image: !isVideo ? base64Data : undefined,
          mimeType: mediaFile.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
          referenceBase,
          userApiKey: savedApiKey,
          missions: payloadMissions,
          customPrompt: focusPrompt,
        }),
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar análise do round com IA');
      }

      setAnalysisPercent(100);
      setAnalysisStep('Concluído!');

      const resData: AnalysisResultData = data.analysis;
      setResult(resData);
      setEditableScore(resData.estimatedTotalScore || 0);
      setEditableTime(resData.totalTimeSeconds || 150);
      onShowToast('Vídeo analisado e pontuado com sucesso!', 'success');

      // Smooth scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err: unknown) {
      console.error(err);
      let msg = 'Falha na comunicação com o servidor de IA';
      if (err instanceof Error) {
        if (err.name === 'AbortError') {
          msg = 'O envio demorou mais que o esperado. Tente enviar um vídeo mais curto ou foto da mesa.';
        } else {
          msg = err.message;
        }
      }
      onShowToast(msg, 'error');
    } finally {
      clearInterval(progressTimer);
      clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  };

  // Save as Round in History
  const handleSaveRound = () => {
    if (!result) return;

    const missionResults: MissionResult[] = result.missionsDetected.map((m) => ({
      missionId: `m_${m.missionCode.toLowerCase()}`,
      missionCode: m.missionCode,
      status: m.status as MissionStatus,
      score: m.estimatedScore || 0,
      attempts: 1,
      timeSpentSeconds: 20,
      notes: `${m.timestampEstimate ? `[${m.timestampEstimate}] ` : ''}${m.evidenceDescription}`,
    }));

    const newRound: Round = {
      id: `round_${Date.now()}`,
      roundNumber: 0,
      date: new Date().toISOString().slice(0, 16),
      operator: 'Piloto FrancoDroid',
      strategy: 'Análise Direta de Vídeo por IA',
      totalTimeSeconds: Number(editableTime) || 150,
      totalScore: Number(editableScore) || 0,
      notes: result.summary,
      missionResults,
      createdAt: Date.now(),
      verifiedByAi: true,
    };

    onSaveToHistory(newRound);
  };

  // Copy quick summary to clipboard
  const handleCopySummary = () => {
    if (!result) return;
    const text = `FrancoDroid FLL Analytics: ${editableScore} pontos em ${result.totalTimeFormatted}. ${result.summary}`;
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
    onShowToast('Resumo copiado para a área de transferência!', 'success');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Symmetrical Hero Header */}
      <div className="text-center space-y-2 py-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full ios-subtle text-[11px] font-mono text-cyan-300">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>FLL Intelligent Telemetry</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          Análise de Execução
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
          Envie o vídeo do round de teste. A IA analisa os frames, compara com o gabarito das pastas e extrai a pontuação e minutagem.
        </p>
      </div>

      {/* Prominent API Key Missing Notice */}
      {!isAiReady && (
        <div className="ios-glass rounded-[24px] p-4 sm:p-5 border border-rose-500/30 bg-rose-500/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 text-left">
            <div className="w-9 h-9 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
              <Key className="w-4 h-4 text-rose-300" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-white">IA Não Conectada</h3>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Para analisar o vídeo do round, conecte sua chave gratuita da API Gemini na aba <strong>Configurar IA</strong>.
              </p>
            </div>
          </div>

          <button
            onClick={onNavigateToApi}
            className="px-4 py-2 rounded-full bg-white text-black hover:bg-slate-100 font-semibold text-xs transition-all ios-pressable shrink-0 flex items-center gap-1.5"
          >
            <span>Conectar Chave Agora</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Symmetrical 3-Card iOS Interactive Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          onClick={onNavigateToFolders}
          className="ios-glass-card rounded-[22px] p-4 text-left group ios-pressable transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center text-slate-300 group-hover:text-cyan-300 transition-colors">
              <FolderOpen className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-mono text-cyan-400 font-semibold flex items-center gap-1">
              Etapa 1 <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
          <h3 className="text-xs font-semibold text-white">Gabarito de Pastas</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {missionKeys.length > 0 ? `${missionKeys.length} missões ativas` : 'Definir fotos de referência'}
          </p>
        </button>

        <div className="ios-glass-card rounded-[22px] p-4 text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center text-slate-300">
              <Video className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="text-[10px] font-mono text-slate-400 font-semibold">Etapa 2</span>
          </div>
          <h3 className="text-xs font-semibold text-white">Vídeo do Round</h3>
          <p className="text-[11px] text-slate-400 mt-0.5 truncate">
            {mediaFile ? mediaFile.name : 'MP4, WebM ou foto'}
          </p>
        </div>

        <div className="ios-glass-card rounded-[22px] p-4 text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="w-8 h-8 rounded-[12px] bg-white/5 border border-white/10 flex items-center justify-center text-slate-300">
              <Trophy className="w-4 h-4 text-emerald-400" />
            </div>
            <span className="text-[10px] font-mono text-slate-400 font-semibold">Etapa 3</span>
          </div>
          <h3 className="text-xs font-semibold text-white">Pontuação & Tempo</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {result ? `${result.estimatedTotalScore} pts calculados` : 'Cálculo automatizado'}
          </p>
        </div>
      </div>

      {/* Main Glass Media Upload Box */}
      <div className="ios-glass rounded-[28px] p-6 sm:p-7 space-y-5 relative overflow-hidden">
        {/* Laser scan animation overlay when analyzing */}
        {isAnalyzing && (
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent ios-laser z-30 pointer-events-none" />
        )}

        <div
          onClick={() => !isAnalyzing && fileInputRef.current?.click()}
          className={`relative rounded-[20px] p-6 sm:p-8 transition-all cursor-pointer text-center flex flex-col items-center justify-center min-h-[220px] border border-dashed ios-pressable ${
            isAnalyzing
              ? 'border-cyan-500/30 bg-cyan-950/15 cursor-wait'
              : mediaFile
              ? 'border-white/20 bg-white/[0.02]'
              : 'border-white/10 hover:border-white/25 bg-white/[0.015] hover:bg-white/[0.03]'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*,image/*"
            disabled={isAnalyzing}
            onChange={handleFileChange}
            className="hidden"
          />

          {mediaPreviewUrl ? (
            <div className="w-full max-w-md mx-auto space-y-3">
              {isVideo ? (
                <div className="relative rounded-[16px] overflow-hidden border border-white/15 shadow-2xl bg-black">
                  <video
                    src={mediaPreviewUrl}
                    controls={!isAnalyzing}
                    className="w-full max-h-60 object-cover"
                  />
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 border border-cyan-400/40 text-cyan-300 text-xs font-mono">
                        <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                        <span>Processando Frames</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative rounded-[16px] overflow-hidden border border-white/15 shadow-2xl bg-black">
                  <img
                    src={mediaPreviewUrl}
                    alt="Round Preview"
                    className="w-full max-h-60 object-contain"
                  />
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/75 border border-cyan-400/40 text-cyan-300 text-xs font-mono">
                        <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                        <span>Examinando Imagem</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs font-medium text-slate-200">
                  {mediaFile?.name}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">
                  • {(mediaFile!.size / (1024 * 1024)).toFixed(1)} MB
                </span>
                {!isAnalyzing && (
                  <span className="text-[11px] text-cyan-400/80 hover:text-cyan-300 underline ml-1">
                    (trocar)
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto rounded-[16px] bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-300 shadow-sm group-hover:scale-105 transition-transform">
                <Upload className="w-5 h-5 text-cyan-300" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-white">
                  Selecione o Vídeo da Execução ou Foto da Mesa
                </h3>
                <p className="text-xs text-slate-400">
                  Arraste ou clique para navegar (MP4, MOV, WebM ou JPEG)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Warning Banner: DO NOT LEAVE THE TAB WHILE ANALYZING */}
        {isAnalyzing && (
          <div className="ios-glass rounded-[20px] p-4 border border-amber-500/30 bg-amber-500/[0.07] space-y-3 animate-in fade-in duration-300">
            <div className="flex items-center gap-2.5 text-amber-300 text-xs font-semibold">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 animate-pulse" />
              <span>Atenção: Não saia desta aba enquanto a IA analisa</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed pl-6">
              O processamento do vídeo acontece em tempo real. Manter a aba ativa garante que o navegador não congele a conexão antes do término.
            </p>

            {/* Apple Minimalist Progress Bar */}
            <div className="pl-6 space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-300 flex items-center gap-1.5">
                  <Cpu className="w-3 h-3 text-cyan-400 animate-spin" />
                  {analysisStep}
                </span>
                <span className="text-cyan-300 font-bold">{analysisPercent}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${analysisPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Mission Focus Filter Selector */}
        {missionKeys.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Foco da Análise:</span>
              </span>
              <span className="font-mono text-slate-500 text-[10px]">
                {selectedFocusMission === 'ALL'
                  ? `Todas as ${missionKeys.length} missões do gabarito`
                  : `Foco exclusivo na ${selectedFocusMission}`}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedFocusMission('ALL')}
                className={`px-3 py-1.5 rounded-xl font-mono text-[11px] font-medium transition-all ${
                  selectedFocusMission === 'ALL'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-white/[0.03] text-slate-400 hover:text-white border border-white/5'
                }`}
              >
                Todas ({missionKeys.length})
              </button>
              {missionKeys.map((code) => {
                const isSelected = selectedFocusMission === code;
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setSelectedFocusMission(code)}
                    className={`px-3 py-1.5 rounded-xl font-mono text-[11px] font-medium transition-all ${
                      isSelected
                        ? 'bg-cyan-500 text-black font-bold shadow-md shadow-cyan-500/20 border border-cyan-400'
                        : 'bg-white/[0.03] text-slate-300 hover:text-white border border-white/5'
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Primary Action Button - iOS Liquid Capsule */}
        <button
          type="button"
          disabled={!mediaFile || isAnalyzing}
          onClick={handleAnalyze}
          className={`w-full py-3.5 rounded-full font-semibold text-xs tracking-wide transition-all flex items-center justify-center gap-2 ios-pressable ${
            !mediaFile || isAnalyzing
              ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5'
              : 'bg-white text-black hover:bg-slate-100 shadow-xl shadow-white/10'
          }`}
        >
          {isAnalyzing ? (
            <>
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
              <span>Analisando vídeo com IA Gemini...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-black" />
              <span>Analisar com IA</span>
            </>
          )}
        </button>
      </div>

      {/* Symmetrical Telemetry Results Display */}
      {result && (
        <div ref={resultsRef} className="ios-glass rounded-[28px] p-6 sm:p-7 space-y-6 animate-in fade-in duration-300">
          {/* Symmetrical Top Stats Header */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="ios-glass-card rounded-[20px] p-4 text-center">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Pontuação Total
              </span>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-3xl sm:text-4xl font-bold font-mono text-cyan-300 tracking-tight">
                  {editableScore}
                </span>
                <span className="text-xs text-slate-400 font-medium">pts</span>
              </div>
            </div>

            <div className="ios-glass-card rounded-[20px] p-4 text-center">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 block mb-1">
                Tempo Cronometrado
              </span>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-3xl sm:text-4xl font-bold font-mono text-emerald-300 tracking-tight">
                  {result.totalTimeFormatted || '02:15'}
                </span>
                <span className="text-xs text-slate-400 font-medium">min</span>
              </div>
            </div>
          </div>

          {/* Diagnosis Card */}
          <div className="ios-glass-card rounded-[20px] p-4 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Diagnóstico do Robô</span>
              </div>
              <button
                onClick={handleCopySummary}
                className="text-[11px] font-mono text-slate-400 hover:text-cyan-300 flex items-center gap-1 px-2 py-0.5 rounded-lg hover:bg-white/5 transition-colors"
                title="Copiar resumo para compartilhar"
              >
                {copiedSummary ? <Check className="w-3 h-3 text-emerald-400" /> : <Share2 className="w-3 h-3" />}
                <span>{copiedSummary ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed font-normal">
              {result.summary}
            </p>
            {result.trajectoryNotes && (
              <p className="text-[11px] text-slate-400 pt-1.5 border-t border-white/5">
                <strong className="text-slate-300 font-medium">Trajetória:</strong> {result.trajectoryNotes}
              </p>
            )}
            {result.mechanismNotes && (
              <p className="text-[11px] text-slate-400">
                <strong className="text-slate-300 font-medium">Mecanismos:</strong> {result.mechanismNotes}
              </p>
            )}
          </div>

          {/* Missions Detected List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                <span>Missões Identificadas</span>
              </h3>
              <span className="text-[11px] font-mono text-slate-400">
                {result.missionsDetected.length} missões
              </span>
            </div>

            <div className="space-y-2">
              {result.missionsDetected.map((m, idx) => {
                const isCompleted = m.status === 'completed';
                const isPartial = m.status === 'partial';

                return (
                  <div
                    key={idx}
                    className="ios-glass-card rounded-[18px] p-3.5 flex items-center justify-between gap-3 ios-pressable"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-xl bg-white/5 text-cyan-300 border border-white/10 shrink-0">
                        {m.missionCode}
                      </span>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-medium flex items-center gap-1 ${
                              isCompleted
                                ? 'text-emerald-300'
                                : isPartial
                                ? 'text-amber-300'
                                : 'text-rose-300'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : isPartial ? (
                              <AlertCircle className="w-3 h-3 text-amber-400" />
                            ) : (
                              <XCircle className="w-3 h-3 text-rose-400" />
                            )}
                            {isCompleted ? 'Completa' : isPartial ? 'Parcial' : 'Incompleta'}
                          </span>
                          {m.timestampEstimate && (
                            <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5 text-slate-500" />
                              {m.timestampEstimate}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                          {m.evidenceDescription}
                        </p>
                      </div>
                    </div>

                    <div className="font-mono font-semibold text-sm text-white shrink-0">
                      +{m.estimatedScore} pts
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Symmetrical Save & Discard Footer */}
          <div className="pt-2 flex items-center justify-between gap-3 border-t border-white/5">
            <button
              onClick={handleClearResult}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-medium transition-all ios-pressable"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Descartar Análise</span>
            </button>

            <button
              onClick={handleSaveRound}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-white text-black hover:bg-slate-100 text-xs font-semibold transition-all shadow-md ios-pressable"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Salvar Round no Histórico</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
