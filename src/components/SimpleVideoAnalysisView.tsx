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
  Check,
  Share2,
  Key,
  Trash2,
  Scissors,
  Square,
  Plus,
  Minus,
  ShieldAlert,
  Brain,
  ChevronDown,
  ChevronUp,
  Send,
  Camera,
  Cloud,
  Download,
  Upload as UploadIcon,
  CloudDownload,
  ExternalLink,
  Loader2,
  UserCheck,
} from 'lucide-react';
import { FolderMissionReference } from './FolderReferenceView';
import { VideoTrimmerPanel } from './VideoTrimmerPanel';
import { Round, MissionResult, MissionStatus, AiTrainingExample } from '../types/fll';
import { BIOGLOW_OFFICIAL_MISSIONS } from '../data/bioglowMissions';
import { TEAM_DRIVE_GABARITO_URL } from '../data/teamConfig';
import { validateMissionReference } from '../utils/folderParser';
import { analyzeMediaClientSide, hasBackendServer } from '../services/clientAiEngine';

interface SimpleVideoAnalysisViewProps {
  references: Record<string, FolderMissionReference>;
  isAiReady?: boolean;
  isLoadingDriveGabarito?: boolean;
  trainingExamples: AiTrainingExample[];
  cloudUserEmail?: string | null;
  onQuickSaveApiKey?: (apiKey: string) => Promise<boolean>;
  onLoadTeamDriveGabarito?: () => Promise<void>;
  onSaveTrainingExamples: (
    examples: Array<Omit<AiTrainingExample, 'id' | 'createdAt'>>
  ) => Promise<void>;
  onDeleteTrainingExample: (id: string) => Promise<void>;
  onImportTrainingBackup?: (jsonText: string) => void;
  onConnectCloud?: () => void;
  onNavigateToFolders: () => void;
  onNavigateToApi: () => void;
  onSaveToHistory: (round: Round) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

interface DetectedMissionItem {
  missionCode: string;
  status: 'completed' | 'partial' | 'failed' | 'not_attempted';
  estimatedScore: number;
  timestampEstimate?: string;
  evidenceDescription: string;
  confidence?: number;
}

interface AnalysisResultData {
  estimatedTotalScore: number;
  totalTimeFormatted: string;
  totalTimeSeconds: number;
  overallConfidence: number;
  summary: string;
  trajectoryNotes: string;
  mechanismNotes: string;
  missionsDetected: DetectedMissionItem[];
  modelUsed?: string;
  usedGabarito?: boolean;
  trainingRulesApplied?: number;
  partsAnalyzed?: number;
  gabaritoWarning?: string;
}

const MAX_UPLOAD_MB = 100;
const CHUNK_SIZE_BYTES = 1024 * 1024; // 1 MB safe chunks bypass reverse proxy limits
const RECOMMEND_TRIM_MB = 25;
const RECOMMEND_TRIM_SEC = 65;

const formatSec = (sec: number): string => {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
};

export const SimpleVideoAnalysisView: React.FC<SimpleVideoAnalysisViewProps> = ({
  references,
  isAiReady = false,
  isLoadingDriveGabarito = false,
  trainingExamples,
  cloudUserEmail = null,
  onQuickSaveApiKey,
  onLoadTeamDriveGabarito,
  onSaveTrainingExamples,
  onDeleteTrainingExample,
  onImportTrainingBackup,
  onConnectCloud,
  onNavigateToFolders,
  onNavigateToApi,
  onSaveToHistory,
  onShowToast,
}) => {
  const [quickApiKey, setQuickApiKey] = useState('');
  const [isValidatingQuickKey, setIsValidatingQuickKey] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number>(0);
  const [videoResolution, setVideoResolution] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [videoLoadError, setVideoLoadError] = useState<string | null>(null);
  const [splitMode, setSplitMode] = useState<'auto' | 'parts' | 'single'>('auto');
  const [showTrimmer, setShowTrimmer] = useState(false);
  const [trimSummaryNote, setTrimSummaryNote] = useState<string | null>(null);

  // Simple informed missions selector: empty = Automatic, non-empty = User informed which missions were done
  const [informedMissions, setInformedMissions] = useState<string[]>([]);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('Iniciando...');
  const [analysisPercent, setAnalysisPercent] = useState<number>(0);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [lastErrorMsg, setLastErrorMsg] = useState<string | null>(null);

  const [result, setResult] = useState<AnalysisResultData | null>(null);
  const [originalAiMissions, setOriginalAiMissions] = useState<DetectedMissionItem[]>([]);
  const [editableMissions, setEditableMissions] = useState<DetectedMissionItem[]>([]);
  const [editableTime, setEditableTime] = useState<number>(150);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Manual mission adder state
  const [addMissionCode, setAddMissionCode] = useState<string>('');
  const [addMissionScore, setAddMissionScore] = useState<number>(0);

  // Real AI Training feedback state
  const [trainingNote, setTrainingNote] = useState('');
  const [attachSnapshot, setAttachSnapshot] = useState(true);
  const [isSubmittingTraining, setIsSubmittingTraining] = useState(false);
  const [trainingSavedForRun, setTrainingSavedForRun] = useState(false);
  const [showTrainingMemory, setShowTrainingMemory] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const trainingBackupInputRef = useRef<HTMLInputElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const activeXhrRef = useRef<XMLHttpRequest | null>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const activeJobIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef<boolean>(false);

  const validGabaritoKeys = Object.keys(references)
    .filter((code) => validateMissionReference(references[code]).isValid)
    .sort();

  const mediaSizeMb = mediaFile ? mediaFile.size / (1024 * 1024) : 0;
  const isOverMaxLimit = mediaSizeMb > MAX_UPLOAD_MB;
  const isVeryShortClip = isVideo && videoDuration > 0 && videoDuration < 2.5;
  const shouldSuggestTrim =
    isVideo && (mediaSizeMb > RECOMMEND_TRIM_MB || videoDuration > RECOMMEND_TRIM_SEC);

  const editableScore = editableMissions.reduce(
    (sum, m) => sum + (Number(m.estimatedScore) || 0),
    0
  );

  // Revoke previous object URL on change/unmount
  useEffect(() => {
    return () => {
      if (mediaPreviewUrl) {
        URL.revokeObjectURL(mediaPreviewUrl);
      }
    };
  }, [mediaPreviewUrl]);

  // Warn user not to leave tab while analyzing
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isAnalyzing) {
        e.preventDefault();
        e.returnValue =
          'A IA está analisando seu round. Se você sair, o processamento será interrompido.';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isAnalyzing]);

  // Compute real diff between what AI returned vs what user corrected
  const computeCorrectionDiffs = (): Array<{
    missionCode: string;
    mistakeType: AiTrainingExample['mistakeType'];
    aiPredictedSummary: string;
    expectedSummary: string;
  }> => {
    if (!result) return [];
    const diffs: Array<{
      missionCode: string;
      mistakeType: AiTrainingExample['mistakeType'];
      aiPredictedSummary: string;
      expectedSummary: string;
    }> = [];

    const origMap = new Map<string, DetectedMissionItem>(
      originalAiMissions.map((m) => [m.missionCode, m])
    );
    const currMap = new Map<string, DetectedMissionItem>(
      editableMissions.map((m) => [m.missionCode, m])
    );

    // 1. False positives removed by user
    origMap.forEach((orig, code) => {
      if (!currMap.has(code)) {
        diffs.push({
          missionCode: code,
          mistakeType: 'false_positive',
          aiPredictedSummary: `IA identificou ${code} (${orig.estimatedScore} pts)`,
          expectedSummary: `${code} NÃO foi realizada neste vídeo (0 pts — não incluir)`,
        });
      }
    });

    // 2. Score changes
    currMap.forEach((curr, code) => {
      const orig = origMap.get(code);
      if (orig && orig.estimatedScore !== curr.estimatedScore) {
        diffs.push({
          missionCode: code,
          mistakeType: 'wrong_score',
          aiPredictedSummary: `IA deu ${orig.estimatedScore} pts em ${code}`,
          expectedSummary: `Pontuação correta em ${code} é ${curr.estimatedScore} pts`,
        });
      } else if (!orig) {
        diffs.push({
          missionCode: code,
          mistakeType: 'missed_mission',
          aiPredictedSummary: `IA não identificou ${code}`,
          expectedSummary: `${code} foi realizada com ${curr.estimatedScore} pts`,
        });
      }
    });

    return diffs;
  };

  const correctionDiffs = computeCorrectionDiffs();
  const hasEditsOrNote = correctionDiffs.length > 0 || trainingNote.trim().length > 0;

  const loadMediaFile = (file: File, trimmedNote: string | null = null) => {
    if (mediaPreviewUrl) {
      URL.revokeObjectURL(mediaPreviewUrl);
    }

    const isVid = file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name);
    const url = URL.createObjectURL(file);
    const sizeMb = file.size / (1024 * 1024);

    setIsVideo(isVid);
    setMediaFile(file);
    setMediaPreviewUrl(url);
    setVideoDuration(0);
    setVideoResolution({ w: 0, h: 0 });
    setVideoLoadError(null);
    setResult(null);
    setOriginalAiMissions([]);
    setEditableMissions([]);
    setLastErrorMsg(null);
    setTrimSummaryNote(trimmedNote);
    setTrainingSavedForRun(false);
    setTrainingNote('');

    if (isVid && sizeMb > MAX_UPLOAD_MB) {
      setShowTrimmer(true);
      onShowToast(
        `Vídeo com ${sizeMb.toFixed(1)} MB excede o limite de ${MAX_UPLOAD_MB} MB. Use o cortador abaixo!`,
        'error'
      );
    } else {
      setShowTrimmer(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    loadMediaFile(file, null);
    e.target.value = '';
  };

  const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const el = e.currentTarget;
    setVideoLoadError(null);
    if (el.duration && isFinite(el.duration)) {
      setVideoDuration(el.duration);
    }
    if (el.videoWidth && el.videoHeight) {
      setVideoResolution({ w: el.videoWidth, h: el.videoHeight });
    } else if (el.duration > 0) {
      setVideoLoadError(
        'O vídeo carregou sem trilha visual visível neste navegador. O servidor tentará converter via FFmpeg antes da análise.'
      );
    }
  };

  const handleVideoError = () => {
    setVideoLoadError(
      'Este formato/codec de vídeo não pôde ser reproduzido no navegador (ex: HEVC ou arquivo corrompido). O servidor tentará converter via FFmpeg ao analisar.'
    );
  };

  const toggleInformedMission = (code: string) => {
    setInformedMissions((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code].sort()
    );
  };

  const handleClearResult = () => {
    setResult(null);
    setOriginalAiMissions([]);
    setEditableMissions([]);
    setEditableTime(150);
    setTrainingNote('');
    setTrainingSavedForRun(false);
    onShowToast('Resultado descartado.', 'info');
  };

  const handleCancelAnalysis = () => {
    cancelRequestedRef.current = true;
    if (activeXhrRef.current) {
      activeXhrRef.current.abort();
      activeXhrRef.current = null;
    }
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    if (activeJobIdRef.current) {
      const idToCancel = activeJobIdRef.current;
      activeJobIdRef.current = null;
      fetch(`/api/ai/jobs/${encodeURIComponent(idToCancel)}`, { method: 'DELETE' }).catch(() => {});
    }
    setIsAnalyzing(false);
    setAnalysisPercent(0);
    onShowToast('Análise cancelada.', 'info');
  };

  const handleUpdateMissionScore = (idx: number, nextScore: number) => {
    setTrainingSavedForRun(false);
    setEditableMissions((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        const meta = BIOGLOW_OFFICIAL_MISSIONS.find((bm) => bm.code === m.missionCode);
        const max = meta?.maxScore ?? 40;
        const clamped = Math.max(0, Math.min(max, Math.round(nextScore)));
        let nextStatus: DetectedMissionItem['status'] = 'failed';
        if (clamped >= max && max > 0) nextStatus = 'completed';
        else if (clamped > 0) nextStatus = 'partial';
        return { ...m, estimatedScore: clamped, status: nextStatus };
      })
    );
  };

  const handleRemoveDetectedMission = (idx: number) => {
    setTrainingSavedForRun(false);
    setEditableMissions((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddMissingMission = () => {
    if (!addMissionCode) return;
    if (editableMissions.some((m) => m.missionCode === addMissionCode)) {
      onShowToast(`A missão ${addMissionCode} já está na lista.`, 'info');
      return;
    }
    const meta = BIOGLOW_OFFICIAL_MISSIONS.find((bm) => bm.code === addMissionCode);
    const max = meta?.maxScore ?? 30;
    const score = Math.max(0, Math.min(max, addMissionScore));
    const status: DetectedMissionItem['status'] =
      score <= 0 ? 'failed' : score >= max ? 'completed' : 'partial';

    setTrainingSavedForRun(false);
    setEditableMissions((prev) =>
      [
        ...prev,
        {
          missionCode: addMissionCode,
          status,
          estimatedScore: score,
          evidenceDescription: 'Adicionada na correção manual pelo operador.',
          confidence: 100,
        },
      ].sort((a, b) => a.missionCode.localeCompare(b.missionCode))
    );
    setAddMissionCode('');
    setAddMissionScore(0);
  };

  const captureCurrentMediaSnapshot = (): string | undefined => {
    try {
      const sourceEl = isVideo ? previewVideoRef.current : previewImgRef.current;
      if (!sourceEl) return undefined;

      const srcW = isVideo
        ? (sourceEl as HTMLVideoElement).videoWidth
        : (sourceEl as HTMLImageElement).naturalWidth;
      const srcH = isVideo
        ? (sourceEl as HTMLVideoElement).videoHeight
        : (sourceEl as HTMLImageElement).naturalHeight;

      if (!srcW || !srcH) return undefined;

      const maxDim = 480;
      const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(2, Math.round(srcW * scale));
      canvas.height = Math.max(2, Math.round(srcH * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return undefined;

      ctx.drawImage(sourceEl, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      return undefined;
    }
  };

  const handleSendTrainingCorrection = async () => {
    if (!hasEditsOrNote) {
      onShowToast('Faça alguma correção nos pontos/missões ou escreva uma explicação antes de treinar.', 'info');
      return;
    }

    setIsSubmittingTraining(true);
    try {
      const snapshot = attachSnapshot ? captureCurrentMediaSnapshot() : undefined;
      const explanation = trainingNote.trim();

      const examplesToSend: Array<Omit<AiTrainingExample, 'id' | 'createdAt'>> =
        correctionDiffs.length > 0
          ? correctionDiffs.map((d, idx) => ({
              missionCode: d.missionCode,
              mistakeType: d.mistakeType,
              aiPredictedSummary: d.aiPredictedSummary,
              expectedSummary: d.expectedSummary,
              userExplanation: explanation,
              snapshotBase64: idx === 0 ? snapshot : undefined,
            }))
          : [
              {
                missionCode: editableMissions[0]?.missionCode || 'GERAL',
                mistakeType: 'other',
                aiPredictedSummary: `IA pontuou ${result?.estimatedTotalScore ?? 0} pts`,
                expectedSummary: `Regra ensinada pela equipe`,
                userExplanation: explanation,
                snapshotBase64: snapshot,
              },
            ];

      await onSaveTrainingExamples(examplesToSend);
      setTrainingSavedForRun(true);
      onShowToast(
        `IA treinada! ${examplesToSend.length} correção(ões) salva(s) permanentemente e ativas para próximas análises.`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Erro ao enviar treinamento para a IA.', 'error');
    } finally {
      setIsSubmittingTraining(false);
    }
  };

  const handleDeleteTrainingRule = async (id: string) => {
    try {
      await onDeleteTrainingExample(id);
      onShowToast('Regra de treinamento removida.', 'info');
    } catch {
      onShowToast('Erro ao remover regra.', 'error');
    }
  };

  const handleExportTrainingRules = () => {
    try {
      const json = JSON.stringify(
        { exportedAt: new Date().toISOString(), aiTraining: trainingExamples },
        null,
        2
      );
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `francodroid-treino-ia-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onShowToast('Regras de treinamento da IA exportadas!', 'success');
    } catch {
      onShowToast('Erro ao exportar regras.', 'error');
    }
  };

  const parseFetchJsonSafely = async (resp: Response, contextLabel: string): Promise<any> => {
    const text = await resp.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const trimmed = text.trim();
      if (trimmed.startsWith('<')) {
        throw new Error(
          `O servidor intermediário retornou uma página HTML inesperada em "${contextLabel}" (HTTP ${resp.status}). Recarregue a página ou tente dividir o vídeo em partes.`
        );
      }
      throw new Error(
        `Resposta inválida ao ${contextLabel} (HTTP ${resp.status}). Tente novamente em instantes.`
      );
    }
    if (!resp.ok) {
      throw new Error(parsed?.error || `Erro HTTP ${resp.status} em ${contextLabel}.`);
    }
    return parsed;
  };

  const uploadFileInSafeChunks = async (file: File, signal: AbortSignal): Promise<string> => {
    const initResp = await fetch('/api/ai/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'video/mp4',
      }),
      signal,
    });
    const initData = await parseFetchJsonSafely(initResp, 'preparar envio');
    const uploadId = String(initData.uploadId || '');
    if (!uploadId) {
      throw new Error('Não foi possível iniciar sessão de envio em partes.');
    }

    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE_BYTES));

    for (let i = 0; i < totalChunks; i++) {
      if (cancelRequestedRef.current || signal.aborted) {
        throw new Error('ABORTED');
      }

      const start = i * CHUNK_SIZE_BYTES;
      const end = Math.min(file.size, start + CHUNK_SIZE_BYTES);
      const blobSlice = file.slice(start, end);

      let uploadedOk = false;
      let lastChunkErr: any = null;

      for (let attempt = 0; attempt < 3 && !uploadedOk; attempt++) {
        try {
          const fd = new FormData();
          fd.append('uploadId', uploadId);
          fd.append('index', String(i));
          fd.append('chunk', blobSlice, `part_${i}.bin`);

          const chunkResp = await fetch('/api/ai/upload/chunk', {
            method: 'POST',
            body: fd,
            signal,
          });
          await parseFetchJsonSafely(chunkResp, `enviar pedaço ${i + 1}/${totalChunks}`);
          uploadedOk = true;
        } catch (err: any) {
          if (err?.name === 'AbortError' || err?.message === 'ABORTED') throw new Error('ABORTED');
          lastChunkErr = err;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
          }
        }
      }

      if (!uploadedOk) {
        throw lastChunkErr || new Error(`Falha ao enviar pedaço ${i + 1}/${totalChunks}.`);
      }

      const pctChunk = Math.round(((i + 1) / totalChunks) * 100);
      setAnalysisPercent(Math.min(26, Math.max(4, Math.round(pctChunk * 0.26))));
      setAnalysisStep(
        `Enviando em partes seguras (${i + 1}/${totalChunks} — ${(end / (1024 * 1024)).toFixed(1)} / ${mediaSizeMb.toFixed(1)} MB)...`
      );
    }

    return uploadId;
  };

  const handleAnalyze = async (overrideSplitMode?: 'auto' | 'parts' | 'single') => {
    const activeSplitMode = overrideSplitMode || splitMode;
    const savedApiKey = localStorage.getItem('francodroid_user_gemini_api_key')?.trim() || '';
    if (!savedApiKey) {
      onShowToast('Conecte sua chave da IA acima (Passo 2) antes de analisar.', 'error');
      return;
    }

    if (!mediaFile) {
      onShowToast('Selecione o vídeo ou foto do round antes de analisar.', 'error');
      return;
    }

    if (isOverMaxLimit) {
      setShowTrimmer(true);
      onShowToast(
        `O vídeo tem ${mediaSizeMb.toFixed(1)} MB (limite: ${MAX_UPLOAD_MB} MB). Corte ou comprima no Cortador abaixo.`,
        'error'
      );
      return;
    }

    setLastErrorMsg(null);
    setIsAnalyzing(true);
    setAnalysisPercent(2);
    setElapsedSeconds(0);
    setTrainingSavedForRun(false);
    setTrainingNote('');
    cancelRequestedRef.current = false;
    activeJobIdRef.current = null;
    const abortCtrl = new AbortController();
    activeAbortRef.current = abortCtrl;

    setAnalysisStep(
      isVideo
        ? `Preparando envio de vídeo (${mediaSizeMb.toFixed(1)} MB)...`
        : 'Enviando foto da mesa...'
    );

    const startTime = Date.now();
    const elapsedTimer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    try {
      let resData: AnalysisResultData;
      const serverOnline = await hasBackendServer();

      if (!serverOnline) {
        resData = await analyzeMediaClientSide({
          mediaFile,
          isVideo,
          videoDuration,
          informedMissions,
          references,
          trainingExamples,
          splitMode: activeSplitMode,
          apiKey: savedApiKey,
          signal: abortCtrl.signal,
          onProgress: (pct, msg) => {
            setAnalysisPercent(pct);
            setAnalysisStep(msg);
          },
        });
      } else {
      const scopeCodes =
        informedMissions.length > 0
          ? informedMissions
          : BIOGLOW_OFFICIAL_MISSIONS.map((m) => m.code);

      // Ensure server has gabarito cache if user loaded local folders (avoids re-uploading MBs of photos on every analyze!)
      let includeInlineRefImages = false;
      if (validGabaritoKeys.length > 0) {
        try {
          const gabCheck = await fetch('/api/gabarito', { signal: abortCtrl.signal });
          const gabData = await gabCheck.json().catch(() => ({}));
          if (!gabData?.missionCount || gabData.missionCount === 0) {
            await fetch('/api/gabarito', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ references }),
              signal: abortCtrl.signal,
            }).catch(() => {
              includeInlineRefImages = true;
            });
          }
        } catch {
          includeInlineRefImages = true;
        }
      }

      const referenceImages: Array<{
        missionCode: string;
        tierLabel: string;
        points: number;
        base64: string;
      }> = [];

      const referenceBase = validGabaritoKeys
        .filter((code) => scopeCodes.includes(code))
        .map((code) => {
          const item = references[code];
          const pointTiersSummary = item.pointTiers
            ? Object.entries(item.pointTiers).map(([k, v]) => {
                if (includeInlineRefImages) {
                  const sampleWithBase64 = v.files.find((f) => Boolean(f.base64));
                  if (sampleWithBase64?.base64) {
                    referenceImages.push({
                      missionCode: code,
                      tierLabel: v.label,
                      points: v.points,
                      base64: sampleWithBase64.base64,
                    });
                  }
                }
                return {
                  tierKey: k,
                  label: v.label,
                  points: v.points,
                };
              })
            : [];

          return {
            missionCode: code,
            pointTiers: pointTiersSummary,
          };
        });

      const payloadMissions = BIOGLOW_OFFICIAL_MISSIONS.map((m) => ({
        code: m.code,
        name: m.name,
        maxScore: m.maxScore,
        partialScore: m.partialScore,
        validScores: m.validScores,
        description: m.description,
        visualGuide: m.visualGuide,
        zone: m.zone,
        criteria: m.criteria,
      }));

      let snapsCount = 0;
      const clientTrainingPayload = trainingExamples.slice(0, 80).map((t) => {
        const keepSnap = Boolean(t.snapshotBase64) && snapsCount < 2;
        if (keepSnap) snapsCount++;
        return {
          ...t,
          snapshotBase64: keepSnap ? t.snapshotBase64 : undefined,
        };
      });

      const analysisMetadataPayload = {
        mimeType: mediaFile.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
        informedMissions,
        referenceBase,
        referenceImages,
        useServerGabarito: validGabaritoKeys.length > 0,
        splitMode: activeSplitMode,
        clientTrainingExamples: clientTrainingPayload,
        userApiKey: savedApiKey,
        missions: payloadMissions,
      };

      let startResponse: any;

      if (mediaFile.size > CHUNK_SIZE_BYTES) {
        // Upload safely in 1 MB chunks so proxies NEVER block or return HTTP 200 HTML
        const uploadId = await uploadFileInSafeChunks(mediaFile, abortCtrl.signal);
        if (cancelRequestedRef.current) return;

        setAnalysisPercent(28);
        setAnalysisStep('Iniciando processamento no servidor...');

        const startResp = await fetch('/api/ai/analyze-mat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId,
            ...analysisMetadataPayload,
          }),
          signal: abortCtrl.signal,
        });
        startResponse = await parseFetchJsonSafely(startResp, 'iniciar a análise');
      } else {
        // Small file <= 1 MB: single multipart upload
        const formData = new FormData();
        formData.append('media', mediaFile);
        formData.append('payload', JSON.stringify(analysisMetadataPayload));

        startResponse = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          activeXhrRef.current = xhr;
          xhr.open('POST', '/api/ai/analyze-mat');
          xhr.timeout = 90000;

          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable && ev.total > 0) {
              const pctUpload = Math.round((ev.loaded / ev.total) * 100);
              setAnalysisPercent(Math.min(26, Math.max(4, Math.round(pctUpload * 0.26))));
              setAnalysisStep(`Enviando arquivo (${pctUpload}%)`);
            }
          };

          xhr.onload = () => {
            let parsed: any = null;
            try {
              parsed = JSON.parse(xhr.responseText);
            } catch {
              const txt = (xhr.responseText || '').trim();
              if (txt.startsWith('<')) {
                reject(
                  new Error(
                    `O servidor intermediário retornou HTML inesperado (HTTP ${xhr.status}). Recarregue a página e tente novamente.`
                  )
                );
                return;
              }
            }
            if (xhr.status >= 200 && xhr.status < 300 && parsed) {
              resolve(parsed);
            } else if (xhr.status === 413) {
              reject(
                new Error(
                  parsed?.error ||
                    `O arquivo (${mediaSizeMb.toFixed(1)} MB) excedeu o limite. Use o Cortador de Vídeo para reduzir.`
                )
              );
            } else {
              reject(
                new Error(
                  parsed?.error ||
                    `Erro HTTP ${xhr.status} ao iniciar a análise. Tente novamente em instantes.`
                )
              );
            }
          };

          xhr.onerror = () =>
            reject(new Error('Falha de rede durante o envio. Verifique sua conexão e tente novamente.'));
          xhr.ontimeout = () =>
            reject(new Error('Tempo limite no envio do arquivo. Tente dividir ou cortar o vídeo.'));
          xhr.onabort = () => reject(new Error('ABORTED'));

          xhr.send(formData);
        });
      }

      activeXhrRef.current = null;
      if (cancelRequestedRef.current) return;

      let serverResData: AnalysisResultData;
      if (startResponse.jobId) {
        const jobId = String(startResponse.jobId);
        activeJobIdRef.current = jobId;
        setAnalysisPercent(30);
        setAnalysisStep('Preparando mídia no servidor...');

        const absoluteMaxWaitMs = 360000;
        const stallTimeoutMs = 110000;
        const pollStart = Date.now();
        let lastActivityAt = Date.now();
        let lastServerSig = '';
        let lastStepSnapshot = 'Preparando mídia no servidor...';

        while (true) {
          if (cancelRequestedRef.current) {
            throw new Error('ABORTED');
          }
          const now = Date.now();
          if (now - lastActivityAt > stallTimeoutMs) {
            throw new Error(
              activeSplitMode === 'parts'
                ? `A IA ficou sem resposta por mais de 110s na etapa "${lastStepSnapshot}". Informe apenas as missões feitas acima para acelerar ou corte um trecho menor (15–30s) no Cortador.`
                : `A IA ficou sem resposta por mais de 110s na etapa "${lastStepSnapshot}". Use "Dividir em Partes" ou corte apenas o trecho das missões.`
            );
          }
          if (now - pollStart > absoluteMaxWaitMs) {
            throw new Error(
              activeSplitMode === 'parts'
                ? 'O vídeo demorou mais de 6 minutos mesmo dividido em partes. Informe apenas as missões feitas acima ou corte um trecho de 15–30s no Cortador.'
                : 'A IA demorou mais de 6 minutos. Use "Dividir em Partes" ou corte apenas o trecho das missões.'
            );
          }

          await new Promise((r) => setTimeout(r, 1100));
          if (cancelRequestedRef.current) {
            throw new Error('ABORTED');
          }

          const pollRes = await fetch(`/api/ai/jobs/${encodeURIComponent(jobId)}`);
          const jobData = await parseFetchJsonSafely(pollRes, 'acompanhar análise');

          const serverSig = `${jobData.stage ?? ''}|${jobData.progress ?? ''}|${jobData.message ?? ''}|${jobData.updatedAt ?? ''}`;
          if (serverSig !== lastServerSig) {
            lastServerSig = serverSig;
            lastActivityAt = Date.now();
          }

          if (typeof jobData.progress === 'number') {
            setAnalysisPercent((prev) => Math.max(prev, Math.min(98, jobData.progress)));
          }
          if (jobData.message) {
            lastStepSnapshot = jobData.message;
            setAnalysisStep(jobData.message);
          }

          if (jobData.stage === 'done' && jobData.analysis) {
            serverResData = jobData.analysis;
            break;
          }
          if (jobData.stage === 'error') {
            throw new Error(jobData.error || 'Erro durante a análise na IA.');
          }
          if (jobData.stage === 'cancelled') {
            throw new Error('ABORTED');
          }
        }
      } else if (startResponse.analysis) {
        serverResData = startResponse.analysis;
      } else {
        throw new Error('Resposta inesperada do servidor.');
      }

      resData = serverResData;
      }

      activeJobIdRef.current = null;
      setAnalysisPercent(100);
      setAnalysisStep('Análise concluída!');

      const detected = resData.missionsDetected || [];
      setResult(resData);
      setOriginalAiMissions(detected.map((m) => ({ ...m })));
      setEditableMissions(detected.map((m) => ({ ...m })));
      setEditableTime(
        resData.totalTimeSeconds || (videoDuration ? Math.round(videoDuration) : 60)
      );

      onShowToast(
        resData.usedGabarito
          ? 'Análise concluída com Gabarito + Livro de Regras!'
          : 'Análise concluída pelo Livro de Regras! Confira os pontos abaixo.',
        resData.usedGabarito ? 'success' : 'info'
      );

      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    } catch (err: unknown) {
      if (err instanceof Error && (err.message === 'ABORTED' || err.name === 'AbortError')) {
        return;
      }
      console.error(err);
      const msg =
        err instanceof Error ? err.message : 'Falha na comunicação com o servidor de IA.';
      setLastErrorMsg(msg);
      onShowToast(msg, 'error');
    } finally {
      clearInterval(elapsedTimer);
      activeXhrRef.current = null;
      activeAbortRef.current = null;
      activeJobIdRef.current = null;
      setIsAnalyzing(false);
    }
  };

  const handleSaveRound = () => {
    if (!result) return;

    const missionResults: MissionResult[] = editableMissions.map((m) => ({
      missionId: `m_${m.missionCode.toLowerCase()}`,
      missionCode: m.missionCode,
      status: m.status as MissionStatus,
      score: Number(m.estimatedScore) || 0,
      attempts: 1,
      timeSpentSeconds: Math.max(
        5,
        Math.round((Number(editableTime) || 60) / Math.max(1, editableMissions.length))
      ),
      notes: `${m.timestampEstimate ? `[${m.timestampEstimate}] ` : ''}${m.evidenceDescription}`,
    }));

    const newRound: Round = {
      id: `round_${Date.now()}`,
      roundNumber: 0,
      date: new Date().toISOString().slice(0, 16),
      operator: 'Piloto FrancoDroid',
      strategy: result.usedGabarito
        ? 'Análise IA (Gabarito + Regras)'
        : 'Análise IA (Livro de Regras)',
      totalTimeSeconds: Number(editableTime) || 60,
      totalScore: Number(editableScore) || 0,
      notes: result.summary,
      missionResults,
      createdAt: Date.now(),
      verifiedByAi: true,
    };

    onSaveToHistory(newRound);
  };

  const handleCopySummary = () => {
    if (!result) return;
    const text = `FrancoDroid FLL: ${editableScore} pts em ${formatSec(editableTime)}. ${result.summary}`;
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
    onShowToast('Resumo copiado!', 'success');
  };

  const availableToAddMissions = BIOGLOW_OFFICIAL_MISSIONS.filter(
    (bm) => !editableMissions.some((em) => em.missionCode === bm.code)
  );
  const selectedAddMissionMeta = BIOGLOW_OFFICIAL_MISSIONS.find(
    (bm) => bm.code === addMissionCode
  );

  return (
    <div className="max-w-4xl mx-auto space-y-5 fd-fade-up">
      {/* Simple Clean Header */}
      <div className="text-center space-y-1.5 py-1">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">
          Análise de Execução
        </h1>
        <p className="text-slate-400 text-sm max-w-xl mx-auto">
          Envie o vídeo ou foto. A IA analisa pelo Livro de Regras BIOGLOW e usa seu gabarito para aumentar a precisão.
        </p>
      </div>

      {/* Simple 3-Step Ready Bar: 1. Login | 2. API Key | 3. Team Drive Gabarito */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left">
        {/* Step 1: Google Account */}
        <div
          className={`fd-card rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 ${
            cloudUserEmail ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-white/15'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-lg text-[11px] font-mono font-bold flex items-center justify-center shrink-0 ${
                  cloudUserEmail
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-cyan-500/20 text-cyan-300'
                }`}
              >
                1
              </span>
              <span className="text-xs font-bold text-white">Sua Conta Google</span>
            </div>
            {cloudUserEmail && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
          </div>

          {cloudUserEmail ? (
            <p className="text-[11px] text-emerald-200 truncate">
              Conectado: <strong>{cloudUserEmail}</strong>
            </p>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                Salva histórico e treinos na nuvem.
              </span>
              {onConnectCloud && (
                <button
                  type="button"
                  onClick={onConnectCloud}
                  className="px-2.5 py-1.5 rounded-lg bg-white text-slate-950 hover:bg-slate-200 font-bold text-[11px] flex items-center gap-1 shrink-0 transition-colors"
                >
                  <UserCheck className="w-3 h-3" />
                  <span>Entrar</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Step 2: Gemini API Key (Instant Inline Connect) */}
        <div
          className={`fd-card rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 ${
            isAiReady ? 'border-emerald-500/30 bg-emerald-950/10' : 'border-rose-500/35 bg-rose-950/15'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-lg text-[11px] font-mono font-bold flex items-center justify-center shrink-0 ${
                  isAiReady
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/25 text-rose-200'
                }`}
              >
                2
              </span>
              <span className="text-xs font-bold text-white">Chave da IA</span>
            </div>
            {isAiReady ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-cyan-300 hover:underline inline-flex items-center gap-0.5 shrink-0"
              >
                <span>Criar chave</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>

          {isAiReady ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-emerald-200 font-medium">
                Gemini conectada e pronta
              </span>
              <button
                type="button"
                onClick={onNavigateToApi}
                className="text-[11px] text-slate-300 hover:text-white px-2 py-0.5 rounded-md bg-white/5"
              >
                Trocar
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!quickApiKey.trim() || !onQuickSaveApiKey) {
                  onNavigateToApi();
                  return;
                }
                setIsValidatingQuickKey(true);
                const ok = await onQuickSaveApiKey(quickApiKey.trim());
                if (ok) setQuickApiKey('');
                setIsValidatingQuickKey(false);
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="password"
                value={quickApiKey}
                onChange={(e) => setQuickApiKey(e.target.value)}
                placeholder="Cole chave Gemini aqui..."
                className="flex-1 min-w-0 bg-black/50 border border-white/15 rounded-lg px-2.5 py-1 text-[11px] text-white font-mono placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={isValidatingQuickKey || !quickApiKey.trim()}
                className="px-2.5 py-1 rounded-lg bg-cyan-400 hover:bg-cyan-300 disabled:bg-white/10 disabled:text-slate-500 text-slate-950 font-bold text-[11px] shrink-0 flex items-center gap-1"
              >
                {isValidatingQuickKey ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <span>Conectar</span>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Step 3: Team Drive Gabarito (1-Click) */}
        <div
          className={`fd-card rounded-2xl p-3.5 flex flex-col justify-between gap-2.5 ${
            validGabaritoKeys.length > 0
              ? 'border-emerald-500/30 bg-emerald-950/10'
              : 'border-amber-500/30 bg-amber-950/15'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-lg text-[11px] font-mono font-bold flex items-center justify-center shrink-0 ${
                  validGabaritoKeys.length > 0
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/25 text-amber-200'
                }`}
              >
                3
              </span>
              <span className="text-xs font-bold text-white">Gabarito (Opcional)</span>
            </div>
            <a
              href={TEAM_DRIVE_GABARITO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-cyan-300 hover:underline inline-flex items-center gap-0.5 shrink-0"
              title="Abrir pasta oficial da equipe no Google Drive"
            >
              <span>Ver Drive</span>
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>

          {validGabaritoKeys.length > 0 ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-emerald-200 truncate">
                Ativo ({validGabaritoKeys.length} missões)
              </span>
              <button
                type="button"
                onClick={onNavigateToFolders}
                className="text-[11px] text-cyan-300 hover:text-cyan-200 px-2 py-0.5 rounded-md bg-white/5 shrink-0"
              >
                Pastas
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1.5">
              {onLoadTeamDriveGabarito && (
                <button
                  type="button"
                  disabled={isLoadingDriveGabarito}
                  onClick={() => void onLoadTeamDriveGabarito()}
                  className="flex-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 font-semibold text-[11px] flex items-center justify-center gap-1 transition-all"
                >
                  {isLoadingDriveGabarito ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      <span>Baixando...</span>
                    </>
                  ) : (
                    <>
                      <CloudDownload className="w-3 h-3" />
                      <span>Usar Drive Equipe</span>
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={onNavigateToFolders}
                className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] shrink-0"
              >
                Outro
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Compact Real AI Training Memory Bar */}
      <button
        type="button"
        onClick={() => setShowTrainingMemory((v) => !v)}
        className="w-full fd-card fd-interactive rounded-2xl px-4 py-3 flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Brain
            className={`w-4 h-4 shrink-0 ${
              trainingExamples.length > 0 ? 'text-cyan-300' : 'text-slate-400'
            }`}
          />
          <div className="text-xs">
            <span className="font-semibold text-white">
              Treinamento Real da IA ({trainingExamples.length}{' '}
              {trainingExamples.length === 1 ? 'regra' : 'regras'})
            </span>
            <span className="text-slate-400 ml-2 hidden sm:inline">
              · {trainingExamples.length > 0
                ? 'Aplicadas automaticamente em toda análise'
                : 'Se a IA errar um ponto no vídeo, corrija abaixo para ensinar ela'}
            </span>
          </div>
        </div>
        {showTrainingMemory ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {/* Expandable Real Training Memory Viewer */}
      {showTrainingMemory && (
        <div className="fd-panel rounded-2xl p-4 sm:p-5 space-y-3 fd-fade-up text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <Brain className="w-4 h-4 text-cyan-300" />
              <span>
                Regras de Treinamento Salvas ({trainingExamples.length})
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-emerald-300">
                {cloudUserEmail ? 'Navegador + Servidor + Nuvem' : 'Navegador + Servidor'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <input
                ref={trainingBackupInputRef}
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    const txt = await f.text();
                    onImportTrainingBackup?.(txt);
                  } catch {
                    onShowToast('Erro ao importar arquivo de treino.', 'error');
                  }
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleExportTrainingRules}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 flex items-center gap-1"
              >
                <Download className="w-3 h-3 text-cyan-300" />
                <span>Exportar</span>
              </button>
              <button
                type="button"
                onClick={() => trainingBackupInputRef.current?.click()}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 flex items-center gap-1"
              >
                <UploadIcon className="w-3 h-3 text-emerald-300" />
                <span>Importar</span>
              </button>
              {!cloudUserEmail && onConnectCloud && (
                <button
                  type="button"
                  onClick={onConnectCloud}
                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-[11px] text-cyan-200 font-semibold flex items-center gap-1"
                >
                  <Cloud className="w-3 h-3" />
                  <span>Salvar na Nuvem</span>
                </button>
              )}
            </div>
          </div>

          {trainingExamples.length === 0 ? (
            <p className="text-xs text-slate-400 py-2">
              Nenhuma correção enviada ainda. Após analisar um vídeo, corrija os pontos ou remova missões erradas e clique em <strong>Enviar Correção e Treinar IA</strong>.
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {trainingExamples.map((ex) => (
                <div
                  key={ex.id}
                  className="fd-card rounded-xl p-3 flex items-start justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    {ex.snapshotBase64 && (
                      <img
                        src={ex.snapshotBase64}
                        alt={ex.missionCode}
                        className="w-14 h-10 object-cover rounded-lg border border-white/15 shrink-0"
                      />
                    )}
                    <div className="space-y-0.5 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-cyan-300">{ex.missionCode}</span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(ex.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-slate-300">
                        <span className="text-rose-300 line-through mr-1.5">
                          {ex.aiPredictedSummary}
                        </span>
                        → <span className="text-emerald-300 font-medium">{ex.expectedSummary}</span>
                      </p>
                      {ex.userExplanation && (
                        <p className="text-[11px] text-slate-400 italic">"{ex.userExplanation}"</p>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteTrainingRule(ex.id)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                    title="Apagar regra"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Upload, Mission Check & Analyze Card */}
      <div className="fd-panel rounded-3xl p-6 sm:p-7 space-y-5 relative overflow-hidden">
        {isAnalyzing && (
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent fd-laser z-30 pointer-events-none" />
        )}

        {/* Step 1: Video / Photo Dropzone */}
        <div
          onClick={() => !isAnalyzing && !showTrimmer && fileInputRef.current?.click()}
          className={`relative rounded-2xl p-6 sm:p-7 transition-all text-center flex flex-col items-center justify-center min-h-[200px] border-2 border-dashed ${
            isAnalyzing
              ? 'border-cyan-500/40 bg-cyan-950/20 cursor-wait'
              : showTrimmer
              ? 'border-cyan-500/25 bg-white/[0.01] cursor-default'
              : mediaFile
              ? 'border-cyan-500/30 bg-white/[0.02] cursor-pointer'
              : 'border-white/15 hover:border-cyan-400/50 bg-gradient-to-b from-white/[0.02] to-transparent hover:from-cyan-500/[0.04] cursor-pointer'
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
            <div className="w-full max-w-lg mx-auto space-y-3" onClick={(e) => e.stopPropagation()}>
              {isVideo ? (
                <div className="relative rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-black">
                  <video
                    ref={previewVideoRef}
                    src={mediaPreviewUrl}
                    controls={!isAnalyzing}
                    onLoadedMetadata={handleVideoMetadata}
                    onError={handleVideoError}
                    className="w-full max-h-64 object-contain mx-auto"
                  />
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center">
                      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-black/80 border border-cyan-400/40 text-cyan-300 text-xs font-mono">
                        <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                        <span>Analisando Vídeo</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-black">
                  <img
                    ref={previewImgRef}
                    src={mediaPreviewUrl}
                    alt="Prévia do Round"
                    className="w-full max-h-64 object-contain mx-auto"
                  />
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-black/55 backdrop-blur-[2px] flex items-center justify-center">
                      <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-black/80 border border-cyan-400/40 text-cyan-300 text-xs font-mono">
                        <Radio className="w-3.5 h-3.5 animate-pulse text-cyan-400" />
                        <span>Analisando Foto</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="font-medium text-slate-200 truncate max-w-[220px]">
                  {mediaFile?.name}
                </span>
                <span className="text-slate-600">·</span>
                <span
                  className={`font-mono font-semibold ${
                    isOverMaxLimit
                      ? 'text-rose-300'
                      : mediaSizeMb > RECOMMEND_TRIM_MB
                      ? 'text-amber-300'
                      : 'text-emerald-300'
                  }`}
                >
                  {mediaSizeMb.toFixed(1)} MB
                </span>
                {videoDuration > 0 && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono text-slate-300">{formatSec(videoDuration)}</span>
                  </>
                )}
                {videoResolution.w > 0 && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono text-slate-400">
                      {videoResolution.w}×{videoResolution.h}
                    </span>
                  </>
                )}
              </div>

              {!isAnalyzing && (
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 font-medium transition-colors"
                  >
                    Trocar Arquivo
                  </button>
                  {isVideo && (
                    <button
                      type="button"
                      onClick={() => setShowTrimmer((v) => !v)}
                      className={`px-3.5 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        showTrimmer || isOverMaxLimit
                          ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                          : shouldSuggestTrim
                          ? 'bg-amber-500/15 border-amber-400/40 text-amber-200 hover:bg-amber-500/25'
                          : 'bg-white/5 border-white/15 text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      <Scissors className="w-3.5 h-3.5" />
                      <span>{showTrimmer ? 'Fechar Cortador' : 'Cortar / Otimizar Vídeo'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-400/30 flex items-center justify-center shadow-lg shadow-cyan-500/10">
                <Upload className="w-6 h-6 text-cyan-300" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">
                  Envie o Vídeo da Execução ou Foto da Mesa
                </h3>
                <p className="text-xs text-slate-400">
                  Vídeos MP4, MOV, WebM (até {MAX_UPLOAD_MB} MB, enviado em partes seguras) ou foto JPEG/PNG
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Pre-flight Warnings & Multi-Part Video Strategy Selector */}
        {mediaFile && isVideo && !isAnalyzing && (
          <div className="space-y-3">
            {trimSummaryNote && (
              <div className="rounded-xl p-3 border border-emerald-500/30 bg-emerald-950/20 text-xs text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{trimSummaryNote}</span>
              </div>
            )}

            {videoLoadError && (
              <div className="rounded-2xl p-3.5 border border-amber-500/40 bg-amber-950/25 flex items-start gap-2.5 text-left">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-amber-200">Aviso antes de analisar</p>
                  <p className="text-slate-300 mt-0.5 leading-relaxed">{videoLoadError}</p>
                </div>
              </div>
            )}

            {isVeryShortClip && !videoLoadError && (
              <div className="rounded-2xl p-3.5 border border-amber-500/35 bg-amber-950/20 flex items-start gap-2.5 text-left">
                <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-semibold text-amber-200">
                    Clipe bem curto detectado ({videoDuration.toFixed(1)}s · {mediaSizeMb.toFixed(1)} MB)
                  </p>
                  <p className="text-slate-300 mt-0.5 leading-relaxed">
                    Os {mediaSizeMb.toFixed(1)} MB serão enviados em pedaços seguros e comprimidos automaticamente para análise rápida. Só garanta que o robô apareça concluindo a missão nesse clipe.
                  </p>
                </div>
              </div>
            )}

            {isOverMaxLimit ? (
              <div className="rounded-2xl p-4 border border-rose-500/40 bg-rose-950/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <p className="font-semibold text-rose-200">
                      Arquivo com {mediaSizeMb.toFixed(1)} MB ultrapassa o limite de {MAX_UPLOAD_MB} MB
                    </p>
                    <p className="text-slate-300 mt-0.5">
                      Use o Cortador abaixo para selecionar apenas a tentativa ou comprimir.
                    </p>
                  </div>
                </div>
                {!showTrimmer && (
                  <button
                    type="button"
                    onClick={() => setShowTrimmer(true)}
                    className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-semibold shrink-0 flex items-center gap-1.5"
                  >
                    <Scissors className="w-3.5 h-3.5" />
                    <span>Abrir Cortador</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-2xl p-3.5 border border-white/10 bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left">
                <div className="text-xs">
                  <p className="font-semibold text-slate-200 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Divisão de vídeo para IA</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {splitMode === 'parts'
                      ? 'Divide automaticamente em trechos de ~25s, analisa cada parte e junta todos os pontos.'
                      : splitMode === 'single'
                      ? 'Analisa em 1 bloco só (use apenas em vídeos curtos).'
                      : 'Automático: vídeos > 40s (ou se der limite) são divididos em partes e unidos no resultado.'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0 bg-black/40 p-1 rounded-xl border border-white/10">
                  {(
                    [
                      { id: 'auto', label: 'Automático' },
                      { id: 'parts', label: 'Dividir Partes' },
                      { id: 'single', label: 'Único' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSplitMode(opt.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                        splitMode === opt.id
                          ? 'bg-cyan-400 text-slate-950 shadow-sm'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Built-in Video Trimmer */}
        {showTrimmer && mediaFile && mediaPreviewUrl && isVideo && !isAnalyzing && (
          <VideoTrimmerPanel
            file={mediaFile}
            previewUrl={mediaPreviewUrl}
            duration={videoDuration || 60}
            width={videoResolution.w}
            height={videoResolution.h}
            onApplyTrimmed={(trimmedFile, info) => {
              const note = `Vídeo otimizado: ${info.originalSizeMb.toFixed(1)} MB → ${info.newSizeMb.toFixed(1)} MB (${formatSec(info.startSec)} a ${formatSec(info.endSec)}).`;
              loadMediaFile(trimmedFile, note);
              onShowToast(
                `Trecho pronto! Reduzido para ${info.newSizeMb.toFixed(1)} MB.`,
                'success'
              );
            }}
            onCancel={() => setShowTrimmer(false)}
            onShowToast={onShowToast}
          />
        )}

        {/* Step 2: Simple "Which missions were attempted?" selector */}
        <div className="space-y-2.5 pt-1 text-left">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
            <div className="flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-semibold text-slate-200">
                Informar quais missões foram feitas neste vídeo (opcional)
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {informedMissions.length === 0
                ? 'Automático (só pontua o que o robô tocar)'
                : `Verificar apenas: ${informedMissions.join(', ')}`}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setInformedMissions([])}
              className={`px-3 py-1.5 rounded-xl font-mono text-xs font-medium transition-all ${
                informedMissions.length === 0
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50 shadow-sm'
                  : 'bg-white/[0.04] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              Automático
            </button>

            {BIOGLOW_OFFICIAL_MISSIONS.map((m) => {
              const isSelected = informedMissions.includes(m.code);
              const hasGab = validGabaritoKeys.includes(m.code);
              return (
                <button
                  key={m.code}
                  type="button"
                  title={`${m.code}: ${m.name}${hasGab ? ' (Com gabarito)' : ''}`}
                  onClick={() => toggleInformedMission(m.code)}
                  className={`px-3 py-1.5 rounded-xl font-mono text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 shadow-md shadow-cyan-500/20'
                      : 'bg-white/[0.04] text-slate-300 hover:text-white border border-white/10'
                  }`}
                >
                  <span>{m.code}</span>
                  {hasGab && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-slate-900' : 'bg-emerald-400'
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500">
            Marcar quais missões o robô tentou fazer evita que a IA confunda peças paradas no fundo da mesa. Pontinhos verdes indicam missões com fotos no gabarito.
          </p>
        </div>

        {/* Progress Card */}
        {isAnalyzing && (
          <div className="fd-card rounded-2xl p-4 border border-cyan-500/30 bg-cyan-950/20 space-y-3 fd-fade-up">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-300 text-xs font-semibold">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 animate-pulse" />
                <span>Mantenha esta aba aberta ({elapsedSeconds}s)</span>
              </div>
              <button
                type="button"
                onClick={handleCancelAnalysis}
                className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-semibold flex items-center gap-1 border border-rose-500/30 shrink-0"
              >
                <Square className="w-3 h-3" />
                <span>Cancelar</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-200 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
                  {analysisStep}
                </span>
                <span className="text-cyan-300 font-bold">{analysisPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full fd-shimmer-bar transition-all duration-300 rounded-full"
                  style={{ width: `${analysisPercent}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Inline Error Card with Context-Aware Retry */}
        {lastErrorMsg && !isAnalyzing && (
          <div className="rounded-2xl p-4 border border-rose-500/40 bg-rose-950/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-left fd-fade-up">
            <div className="flex items-start gap-2.5">
              <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-rose-200">Não foi possível concluir a análise</p>
                <p className="text-slate-300 mt-0.5 leading-relaxed">{lastErrorMsg}</p>
              </div>
            </div>
            {isVideo && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (splitMode !== 'parts') {
                      setSplitMode('parts');
                      void handleAnalyze('parts');
                    } else {
                      void handleAnalyze('parts');
                    }
                  }}
                  className="px-3 py-2 rounded-xl bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>{splitMode === 'parts' ? 'Tentar em Partes Novamente' : 'Dividir em Partes e Tentar'}</span>
                </button>
                {!showTrimmer && (
                  <button
                    type="button"
                    onClick={() => setShowTrimmer(true)}
                    className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Scissors className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Cortar Vídeo</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Analyze Button */}
        <button
          type="button"
          disabled={!mediaFile || isAnalyzing || isOverMaxLimit}
          onClick={() => void handleAnalyze()}
          className={`w-full py-3.5 rounded-xl font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-2 ${
            !mediaFile || isAnalyzing || isOverMaxLimit
              ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/10'
              : 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 hover:brightness-105 shadow-xl shadow-cyan-500/20 active:scale-[0.99]'
          }`}
        >
          {isAnalyzing ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              <span>Analisando ({elapsedSeconds}s)...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>
                {!isAiReady
                  ? 'Conecte a Chave da IA acima para Analisar'
                  : splitMode === 'parts' && isVideo
                  ? 'Dividir em Partes e Analisar com IA'
                  : 'Analisar Vídeo com IA'}
              </span>
            </>
          )}
        </button>
      </div>

      {/* Results, Manual Corrections & REAL AI Training */}
      {result && (
        <div ref={resultsRef} className="fd-panel rounded-3xl p-6 sm:p-7 space-y-6 fd-fade-up">
          {/* Status / Accuracy / Partial-Parts Warning */}
          {(result.usedGabarito === false || Boolean(result.gabaritoWarning)) && (
            <div className="rounded-2xl p-4 border border-amber-500/40 bg-amber-950/25 flex items-start gap-3 text-left">
              <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-amber-200">
                  {result.usedGabarito === false
                    ? 'Análise sem gabarito — confira os pontos e corrija se houver erro'
                    : 'Aviso sobre a análise em partes'}
                </p>
                <p className="text-slate-300 leading-relaxed">
                  {result.gabaritoWarning ||
                    'Análise feita apenas pelo Livro de Regras BIOGLOW. Confira os pontos abaixo.'}
                </p>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="fd-card rounded-2xl p-4 text-center border-cyan-500/25">
              <span className="text-[11px] font-mono text-slate-400 block mb-1">
                Pontuação Total
              </span>
              <div className="flex items-baseline justify-center gap-1.5">
                <span className="text-3xl sm:text-4xl font-bold font-mono text-cyan-300 tracking-tight">
                  {editableScore}
                </span>
                <span className="text-xs text-slate-400 font-medium">pts</span>
              </div>
            </div>

            <div className="fd-card rounded-2xl p-4 text-center border-emerald-500/25 flex flex-col items-center justify-center">
              <span className="text-[11px] font-mono text-slate-400 block mb-1">
                Tempo do Round
              </span>
              <div className="flex items-center justify-center gap-2">
                <span className="text-3xl sm:text-4xl font-bold font-mono text-emerald-300 tracking-tight">
                  {formatSec(editableTime)}
                </span>
                <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg px-1.5 py-0.5">
                  <button
                    type="button"
                    onClick={() => setEditableTime((t) => Math.max(1, t - 5))}
                    className="p-1 text-slate-400 hover:text-white"
                    title="-5s"
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-[11px] font-mono text-slate-300 w-9 text-center">
                    {editableTime}s
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditableTime((t) => Math.min(300, t + 5))}
                    className="p-1 text-slate-400 hover:text-white"
                    title="+5s"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="fd-card rounded-2xl p-4 space-y-2 text-left">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-white">
                <FileText className="w-4 h-4 text-cyan-400" />
                <span>Resumo da IA</span>
                {typeof result.partsAnalyzed === 'number' && result.partsAnalyzed > 1 && (
                  <span className="text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                    {result.partsAnalyzed} partes combinadas
                  </span>
                )}
                {typeof result.trainingRulesApplied === 'number' &&
                  result.trainingRulesApplied > 0 && (
                    <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/15 border border-cyan-500/30 px-2 py-0.5 rounded-md">
                      {result.trainingRulesApplied} regra(s) treinada(s) aplicada(s)
                    </span>
                  )}
              </div>
              <button
                onClick={handleCopySummary}
                className="text-xs font-mono text-slate-400 hover:text-cyan-300 flex items-center gap-1.5 px-2.5 py-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                {copiedSummary ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Share2 className="w-3.5 h-3.5" />
                )}
                <span>{copiedSummary ? 'Copiado' : 'Copiar'}</span>
              </button>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{result.summary}</p>
          </div>

          {/* Editable Missions List with Exact Official Score Quick Buttons */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-cyan-400" />
                <span>Missões Identificadas (corrija os pontos ou remova falsos positivos)</span>
              </h3>
              <span className="text-xs font-mono text-slate-400">
                {editableMissions.length}{' '}
                {editableMissions.length === 1 ? 'missão' : 'missões'}
              </span>
            </div>

            {editableMissions.length === 0 ? (
              <div className="fd-card rounded-2xl p-5 text-center text-xs text-slate-400">
                Nenhuma missão listada. Adicione abaixo a missão que foi realmente realizada para corrigir e treinar a IA.
              </div>
            ) : (
              <div className="space-y-2.5">
                {editableMissions.map((m, idx) => {
                  const isCompleted = m.status === 'completed';
                  const isPartial = m.status === 'partial';
                  const meta = BIOGLOW_OFFICIAL_MISSIONS.find((bm) => bm.code === m.missionCode);
                  const validPts = meta?.validScores || [0, meta?.partialScore || 10, meta?.maxScore || 30];

                  return (
                    <div
                      key={`${m.missionCode}-${idx}`}
                      className="fd-card rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-xl bg-cyan-500/15 text-cyan-300 border border-cyan-500/25 shrink-0">
                            {m.missionCode}
                          </span>
                          <div className="text-left space-y-1">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              {meta && <span className="text-white font-semibold">{meta.name}</span>}
                              <span
                                className={`font-semibold flex items-center gap-1 ${
                                  isCompleted
                                    ? 'text-emerald-300'
                                    : isPartial
                                    ? 'text-amber-300'
                                    : 'text-rose-300'
                                }`}
                              >
                                {isCompleted ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                ) : isPartial ? (
                                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                                ) : (
                                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                )}
                                {isCompleted
                                  ? 'Completa'
                                  : isPartial
                                  ? 'Parcial'
                                  : 'Incompleta'}
                              </span>
                              {m.timestampEstimate && (
                                <span className="font-mono text-slate-400 flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-slate-500" />
                                  {m.timestampEstimate}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-300 leading-relaxed">
                              {m.evidenceDescription}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveDetectedMission(idx)}
                          className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 text-[11px] font-medium flex items-center gap-1 shrink-0 self-end sm:self-start border border-transparent hover:border-rose-500/30 transition-all"
                          title="Remover missão que não foi feita"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Não foi feita</span>
                        </button>
                      </div>

                      {/* Exact Official Point Selector Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                        <span className="text-[11px] text-slate-400">Pontuação correta:</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {validPts.map((pts) => {
                            const active = m.estimatedScore === pts;
                            return (
                              <button
                                key={pts}
                                type="button"
                                onClick={() => handleUpdateMissionScore(idx, pts)}
                                className={`px-2.5 py-1 rounded-lg font-mono text-xs font-semibold transition-all ${
                                  active
                                    ? 'bg-cyan-400 text-slate-950 shadow-sm'
                                    : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                                }`}
                              >
                                {pts} pts
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Missing Mission Bar */}
            {availableToAddMissions.length > 0 && (
              <div className="fd-card rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
                <select
                  value={addMissionCode}
                  onChange={(e) => {
                    const code = e.target.value;
                    setAddMissionCode(code);
                    const meta = BIOGLOW_OFFICIAL_MISSIONS.find((bm) => bm.code === code);
                    setAddMissionScore(meta?.maxScore || 20);
                  }}
                  className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-400"
                >
                  <option value="" className="bg-slate-900">
                    + Adicionar missão que a IA não identificou...
                  </option>
                  {availableToAddMissions.map((bm) => (
                    <option key={bm.code} value={bm.code} className="bg-slate-900">
                      {bm.code} — {bm.name} (máx {bm.maxScore} pts)
                    </option>
                  ))}
                </select>

                {selectedAddMissionMeta && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(
                      selectedAddMissionMeta.validScores || [
                        0,
                        selectedAddMissionMeta.partialScore || 10,
                        selectedAddMissionMeta.maxScore,
                      ]
                    ).map((pts) => (
                      <button
                        key={pts}
                        type="button"
                        onClick={() => setAddMissionScore(pts)}
                        className={`px-2.5 py-1.5 rounded-lg font-mono text-xs font-semibold ${
                          addMissionScore === pts
                            ? 'bg-emerald-400 text-slate-950'
                            : 'bg-white/5 text-slate-300 border border-white/10'
                        }`}
                      >
                        {pts}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleAddMissingMission}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* REAL AI Correction & Training Box */}
          <div className="fd-card rounded-2xl p-4 sm:p-5 border border-cyan-500/30 bg-cyan-950/15 space-y-3.5 text-left">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-cyan-300 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-white">
                    A IA errou? Envie a correção para treinar ela de verdade
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Suas correções ficam salvas no servidor e são usadas automaticamente em todas as próximas análises.
                  </p>
                </div>
              </div>
              {trainingSavedForRun && (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-[11px] font-semibold shrink-0 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" />
                  Treinada!
                </span>
              )}
            </div>

            {correctionDiffs.length > 0 && (
              <div className="rounded-xl bg-black/35 border border-white/10 p-3 space-y-1.5">
                <span className="text-[11px] font-mono text-cyan-300 block font-semibold">
                  Correções detectadas automaticamente ({correctionDiffs.length}):
                </span>
                {correctionDiffs.map((d, i) => (
                  <p key={i} className="text-xs text-slate-300">
                    · <strong className="text-rose-300">{d.aiPredictedSummary}</strong> →{' '}
                    <strong className="text-emerald-300">{d.expectedSummary}</strong>
                  </p>
                ))}
              </div>
            )}

            <textarea
              rows={2}
              value={trainingNote}
              onChange={(e) => {
                setTrainingNote(e.target.value);
                setTrainingSavedForRun(false);
              }}
              placeholder="Explique o erro para a IA não repetir (ex: 'O robô só passou perto da M08 sem abaixar a trepadeira; na M01 o bloco vermelho ficou fora da caixinha')..."
              className="w-full bg-black/45 border border-white/15 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 resize-none"
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={attachSnapshot}
                  onChange={(e) => setAttachSnapshot(e.target.checked)}
                  className="accent-cyan-400 rounded"
                />
                <Camera className="w-3.5 h-3.5 text-cyan-300" />
                <span>Incluir imagem/frame atual como exemplo visual para a IA</span>
              </label>

              <button
                type="button"
                disabled={!hasEditsOrNote || isSubmittingTraining || trainingSavedForRun}
                onClick={handleSendTrainingCorrection}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 ${
                  !hasEditsOrNote || isSubmittingTraining || trainingSavedForRun
                    ? 'bg-white/10 text-slate-500 cursor-not-allowed'
                    : 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-md shadow-cyan-500/20'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>
                  {isSubmittingTraining
                    ? 'Salvando regra...'
                    : trainingSavedForRun
                    ? 'Correção Aplicada na IA'
                    : 'Enviar Correção e Treinar IA'}
                </span>
              </button>
            </div>
          </div>

          {/* Save / Discard Footer */}
          <div className="pt-3 flex items-center justify-between gap-3 border-t border-white/10">
            <button
              onClick={handleClearResult}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 text-xs font-medium transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Descartar Análise</span>
            </button>

            <button
              onClick={handleSaveRound}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 hover:brightness-105 text-xs font-bold transition-all shadow-lg shadow-cyan-500/20"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Round no Histórico</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
