import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Upload,
  Camera,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Cpu,
  Eye,
  ArrowRight,
  HelpCircle,
  FileText,
  RotateCcw,
  Check,
  Shield,
  Layers,
  FolderOpen,
  Cloud,
  LogOut,
  Folder,
  Image as ImageIcon,
  ExternalLink,
  RefreshCw,
  X,
  Plus,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { Mission, AiAnalysisResult, AiMissionEvidence, MissionStatus, DriveReferenceFile } from '../types/fll';
import { StorageService } from '../services/storageService';
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  logout,
  listFilesInFolder,
  downloadDriveImageBase64,
  extractFolderIdFromUrl,
} from '../services/googleDriveService';

interface AiAnalysisViewProps {
  missions: Mission[];
  onValidateAndCreateRound: (aiData: AiAnalysisResult) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const AiAnalysisView: React.FC<AiAnalysisViewProps> = ({
  missions,
  onValidateAndCreateRound,
  onShowToast,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [videoTimestamp, setVideoTimestamp] = useState<string>('');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AiAnalysisResult | null>(null);
  const [editableMissions, setEditableMissions] = useState<AiMissionEvidence[]>([]);
  const [showDriveGuide, setShowDriveGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Google Drive state
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [isSigningInDrive, setIsSigningInDrive] = useState(false);
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [driveConfig, setDriveConfig] = useState(() => StorageService.getDriveConfig());
  const [driveFolderInput, setDriveFolderInput] = useState(driveConfig.folderUrl || driveConfig.folderId || '');
  const [driveReferences, setDriveReferences] = useState<DriveReferenceFile[]>(() =>
    StorageService.getDriveReferences()
  );
  const [folderFiles, setFolderFiles] = useState<DriveReferenceFile[]>([]);
  const [isLoadingFolder, setIsLoadingFolder] = useState(false);
  const [useDriveBaseInPrompt, setUseDriveBaseInPrompt] = useState(true);

  // Initialize Firebase Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setGoogleUser(user);
      },
      () => {
        setGoogleUser(null);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Google Sign-In with popup
  const handleGoogleLogin = async () => {
    setIsSigningInDrive(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        onShowToast(`Conectado ao Google Drive como ${res.user.displayName || res.user.email}!`, 'success');
      }
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao conectar ao Google Drive.', 'error');
    } finally {
      setIsSigningInDrive(false);
    }
  };

  const handleGoogleLogout = async () => {
    await logout();
    setGoogleUser(null);
    onShowToast('Desconectado do Google Drive.', 'info');
  };

  // Fetch images from the specified Google Drive Folder
  const handleLoadDriveFolder = async () => {
    const folderId = extractFolderIdFromUrl(driveFolderInput);
    if (!folderId) {
      onShowToast('Cole o link ou ID da pasta do Google Drive com as fotos do tapete.', 'error');
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      onShowToast('Conecte sua conta do Google para ler a pasta do Drive.', 'error');
      return;
    }

    setIsLoadingFolder(true);
    try {
      const files = await listFilesInFolder(token, folderId);
      setFolderFiles(files);
      const newConfig = {
        folderId,
        folderUrl: driveFolderInput,
        folderName: `Pasta Drive (${files.length} imagens)`,
      };
      setDriveConfig(newConfig);
      StorageService.saveDriveConfig(newConfig);

      if (files.length === 0) {
        onShowToast('Nenhum arquivo de imagem encontrado nesta pasta do Drive.', 'info');
      } else {
        onShowToast(`${files.length} fotos encontradas na pasta do Google Drive!`, 'success');
      }
    } catch (err: any) {
      console.error(err);
      onShowToast(err.message || 'Erro ao acessar a pasta do Google Drive. Verifique as permissões de compartilhamento.', 'error');
    } finally {
      setIsLoadingFolder(false);
    }
  };

  // Select an image directly from Google Drive to inspect
  const handleUseDriveImageForAnalysis = async (file: DriveReferenceFile) => {
    const token = await getAccessToken();
    if (!token) {
      onShowToast('Conecte sua conta do Google para carregar o arquivo.', 'error');
      return;
    }

    try {
      onShowToast(`Baixando imagem "${file.name}" do Google Drive...`, 'info');
      const { base64, mimeType } = await downloadDriveImageBase64(token, file.id);
      setSelectedImage(`data:${mimeType};base64,${base64}`);
      setAnalysisResult(null);
      setIsDriveModalOpen(false);
      onShowToast(`Imagem "${file.name}" pronta para análise!`, 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Erro ao carregar imagem do Drive.', 'error');
    }
  };

  // Save selected drive images as Ground-Truth Reference Base
  const handleToggleReferenceBase = (file: DriveReferenceFile) => {
    const exists = driveReferences.some((r) => r.id === file.id);
    let updated: DriveReferenceFile[];
    if (exists) {
      updated = driveReferences.filter((r) => r.id !== file.id);
    } else {
      updated = [...driveReferences, file];
    }
    setDriveReferences(updated);
    StorageService.saveDriveReferences(updated);
  };

  // File upload handler (Local)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      onShowToast('Por favor, selecione um arquivo de imagem (JPEG, PNG ou WEBP).', 'error');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedImage(event.target?.result as string);
      setAnalysisResult(null);
    };
    reader.readAsDataURL(file);
  };

  // Run AI Analysis (with automatic retry and model fallback against 503)
  const handleRunAiAnalysis = async () => {
    if (!selectedImage) {
      onShowToast('Selecione ou tire uma foto do tapete antes de iniciar a análise.', 'error');
      return;
    }

    setIsAnalyzing(true);

    try {
      // Build reference context from Drive Ground-Truth dataset
      const referenceContext = useDriveBaseInPrompt
        ? driveReferences.map((r) => ({
            missionCode: r.missionCode || 'Geral',
            state: r.state || 'completed',
            fileName: r.name,
            notes: r.notes || `Foto de referência de ${r.state} no Drive`,
          }))
        : [];

      const response = await fetch('/api/ai/analyze-mat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: selectedImage,
          missions: missions.map((m) => ({
            code: m.code,
            name: m.name,
            description: m.description,
            maxScore: m.maxScore,
            partialScore: m.partialScore,
            zone: m.zone,
            criteria: m.criteria,
          })),
          customPrompt,
          videoTimestamp,
          referenceContext,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao processar análise da mesa com IA');
      }

      const result: AiAnalysisResult = data.analysis;
      setAnalysisResult(result);
      setEditableMissions(result.missionsDetected || []);
      StorageService.saveAiAnalysis(result);
      onShowToast(
        `Análise concluída com sucesso! ${data.analysis.modelUsed ? `(Modelo: ${data.analysis.modelUsed})` : ''}`,
        'success'
      );
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Falha na comunicação com o servidor de IA';
      onShowToast(msg, 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Human validation edits
  const handleStatusChange = (index: number, newStatus: MissionStatus) => {
    setEditableMissions((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const refMission = missions.find((m) => m.code === item.missionCode);
        let newScore = item.estimatedScore;
        if (newStatus === 'completed') newScore = refMission ? refMission.maxScore : 25;
        else if (newStatus === 'partial')
          newScore = refMission?.partialScore !== undefined ? refMission.partialScore : 10;
        else if (newStatus === 'failed' || newStatus === 'not_attempted') newScore = 0;

        return {
          ...item,
          status: newStatus,
          estimatedScore: newScore,
        };
      })
    );
  };

  const handleScoreChange = (index: number, newScore: number) => {
    setEditableMissions((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, estimatedScore: newScore } : item))
    );
  };

  const handleApplyToRound = () => {
    if (!analysisResult) return;
    const validatedResult: AiAnalysisResult = {
      ...analysisResult,
      missionsDetected: editableMissions,
      estimatedTotalScore: editableMissions.reduce((acc, curr) => acc + (curr.estimatedScore || 0), 0),
    };
    onValidateAndCreateRound(validatedResult);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-cyan-400" />
            Análise de Imagem por IA (Visão Computacional)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Identifique o estado de cada missão no tapete com suporte à base de fotos do seu Google Drive.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Open Google Drive Modal Button */}
          <button
            onClick={() => setIsDriveModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-blue-600/80 to-cyan-600/80 hover:from-blue-600 hover:to-cyan-600 text-white border border-cyan-500/50 text-xs font-semibold shadow-md shadow-blue-900/30 transition-all active:scale-95"
          >
            <Folder className="w-4 h-4 text-cyan-200" />
            <span>Base do Google Drive ({driveReferences.length} fotos)</span>
          </button>

          <button
            onClick={() => setShowDriveGuide(!showDriveGuide)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-medium transition-all"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            <span>Instruções do Dataset</span>
          </button>
        </div>
      </div>

      {/* Active Drive Reference Banner */}
      {driveReferences.length > 0 && (
        <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
            <div>
              <span className="font-bold text-cyan-200">
                Base de Referência do Drive Conectada ({driveReferences.length} fotos calibradas)
              </span>
              <p className="text-slate-400 text-[11px]">
                A IA utilizará essas fotos de ground-truth (concluídas, parciais e incompletas) para comparar a execução na mesa.
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-300 shrink-0">
            <input
              type="checkbox"
              checked={useDriveBaseInPrompt}
              onChange={(e) => setUseDriveBaseInPrompt(e.target.checked)}
              className="w-4 h-4 rounded text-cyan-500 bg-slate-900 border-slate-700 focus:ring-cyan-500"
            />
            <span>Usar fotos do Drive no diagnóstico</span>
          </label>
        </div>
      )}

      {/* Dataset Guide Box */}
      {showDriveGuide && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-cyan-800/60 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-cyan-400" />
              Como Funciona a Base de Referência com seu Google Drive
            </h3>
            <button
              onClick={() => setShowDriveGuide(false)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Fechar Guia
            </button>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Ao conectar a pasta do seu Google Drive, a IA recebe os exemplos reais de como as missões da sua temporada ficam quando estão 100% concluídas, parciais ou com falha. Isso elimina falsos positivos e garante avaliação precisa durante o round.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="font-bold text-emerald-400 block mb-1">
                1. Nomes Sugeridos no Drive
              </span>
              <p className="text-slate-400">
                O sistema detecta automaticamente nomes como <code>M01_concluida.jpg</code>, <code>M02_parcial.png</code> ou <code>M03_falha.jpg</code>.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="font-bold text-cyan-400 block mb-1">
                2. Alta Disponibilidade
              </span>
              <p className="text-slate-400">
                Se o modelo 3.8 Flash estiver sobrecarregado (503), o sistema ativa automaticamente o Gemini Flash redundante sem interromper o round.
              </p>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="font-bold text-purple-400 block mb-1">
                3. Validação do Piloto
              </span>
              <p className="text-slate-400">
                O robô e a mesa são dinâmicos: o piloto ou técnico sempre pode validar e confirmar antes de salvar oficialmente.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Upload & Inspection Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Image Dropzone & Preview */}
        <div className="lg:col-span-2 space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-6 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[300px] text-center ${
              selectedImage
                ? 'border-cyan-500/50 bg-slate-950/80'
                : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {selectedImage ? (
              <div className="space-y-4 w-full">
                <img
                  src={selectedImage}
                  alt="Tapete FLL Selecionado"
                  className="max-h-72 w-auto mx-auto rounded-xl object-contain border border-slate-800 shadow-md"
                />
                <div className="flex items-center justify-center gap-3">
                  <span className="text-xs text-cyan-300 font-medium">
                    Foto do round carregada. Clique para trocar ou selecione do Google Drive.
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-cyan-950/50 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
                  <Upload className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Carregar Foto ou Frame de Vídeo do Tapete
                  </h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Arraste ou clique para enviar uma foto do tapete da temporada, ou abra a pasta do Google Drive.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDriveModalOpen(true);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-xs font-semibold border border-slate-700"
                  >
                    Abrir Pasta do Google Drive
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Parameters & Trigger */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
              <Cpu className="w-4 h-4 text-cyan-400" />
              Parâmetros de Inspeção
            </h3>

            {/* Video Timestamp */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Timestamp do Vídeo (Opcional)
              </label>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={videoTimestamp}
                  onChange={(e) => setVideoTimestamp(e.target.value)}
                  placeholder="Ex: 01:25"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            {/* Custom focus prompt */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Foco Específico da Análise
              </label>
              <textarea
                rows={3}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Ex: Observe se a garra soltou a peça no círculo vermelho e se houve colisão na alavanca..."
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-400 space-y-1">
              <div className="flex items-center justify-between text-slate-300 font-semibold">
                <span>Conexão IA & Resiliência:</span>
                <span className="text-emerald-400 font-mono">Auto-Fallback 503 Ativo</span>
              </div>
              <p>Missões registradas: {missions.length}</p>
              <p>Fotos de referência do Drive: {driveReferences.length}</p>
            </div>
          </div>

          <button
            type="button"
            disabled={!selectedImage || isAnalyzing}
            onClick={handleRunAiAnalysis}
            className={`w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
              !selectedImage || isAnalyzing
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 shadow-cyan-500/25 active:scale-95'
            }`}
          >
            {isAnalyzing ? (
              <>
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                <span>Processando Visão Computacional...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Executar Análise com IA</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results Section */}
      {analysisResult && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-cyan-800/60 space-y-6 shadow-2xl animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 text-xs font-mono mb-1">
                <Check className="w-3.5 h-3.5" />
                <span>Análise Concluída</span>
                {analysisResult.rawFeedback && (
                  <span className="opacity-75">• {analysisResult.rawFeedback}</span>
                )}
              </div>
              <h2 className="text-xl font-bold text-white">Relatório de Visão Computacional</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Revise os resultados detectados abaixo. Você pode ajustar qualquer valor antes de validar.
              </p>
            </div>

            {/* Metrics pills */}
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-right">
                <span className="text-[10px] font-mono text-slate-400 block">Confiança Média</span>
                <span className="text-base font-bold font-mono text-cyan-400">
                  {analysisResult.overallConfidence}%
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-right">
                <span className="text-[10px] font-mono text-slate-400 block">Pontos Estimados</span>
                <span className="text-base font-bold font-mono text-emerald-400">
                  {editableMissions.reduce((acc, curr) => acc + (curr.estimatedScore || 0), 0)} pts
                </span>
              </div>
            </div>
          </div>

          {/* Diagnostic Notes Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-xs font-bold text-slate-200 block mb-1 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-cyan-400" />
                Resumo Geral do Tapete
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                {analysisResult.summary || 'Tapete analisado com sucesso.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-xs font-bold text-slate-200 block mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" />
                Trajetória e Alinhamento
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                {analysisResult.trajectoryNotes || 'Sem desvios anormais detectados na rota.'}
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-xs font-bold text-slate-200 block mb-1 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                Mecanismos & Garras
              </span>
              <p className="text-xs text-slate-400 leading-relaxed">
                {analysisResult.mechanismNotes || 'Atuadores atuaram dentro do esperado.'}
              </p>
            </div>
          </div>

          {/* Detected Missions Interactive Validation Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Eye className="w-4 h-4 text-cyan-400" />
              Missões Detectadas & Evidências Físicas (Validação Humana)
            </h3>

            <div className="border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[10px] uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Código</th>
                    <th className="py-2.5 px-3">Status Proposto</th>
                    <th className="py-2.5 px-3 text-right">Pontos</th>
                    <th className="py-2.5 px-3 text-center">Confiança</th>
                    <th className="py-2.5 px-3">Evidência Visual Observada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {editableMissions.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 text-cyan-400 font-bold">{item.missionCode}</td>
                      <td className="py-2.5 px-3">
                        <select
                          value={item.status}
                          onChange={(e) => handleStatusChange(idx, e.target.value as MissionStatus)}
                          className={`px-2 py-1 rounded text-xs font-sans font-medium focus:outline-none ${
                            item.status === 'completed'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                              : item.status === 'partial'
                              ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                              : item.status === 'failed'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : 'bg-slate-900 text-slate-400 border border-slate-700'
                          }`}
                        >
                          <option value="completed">Concluída</option>
                          <option value="partial">Parcial</option>
                          <option value="failed">Falhou</option>
                          <option value="not_attempted">Não tentada</option>
                        </select>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <input
                          type="number"
                          value={item.estimatedScore}
                          onChange={(e) => handleScoreChange(idx, Number(e.target.value))}
                          className="w-16 px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-white font-mono text-right text-xs"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            item.confidence >= 80
                              ? 'text-emerald-400'
                              : item.confidence >= 50
                              ? 'text-amber-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {item.confidence}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-sans text-slate-300 text-xs">
                        <div className="space-y-0.5">
                          <p>{item.evidenceDescription}</p>
                          {item.mechanismObservations && (
                            <p className="text-[10px] text-slate-500">
                              Mecanismo: {item.mechanismObservations}
                            </p>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Validation Bottom Action Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-800">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Shield className="w-4 h-4 text-emerald-400" />
              <span>
                Validação humana garantida: Ao transferir, você poderá revisar e salvar como Round oficial.
              </span>
            </div>

            <button
              onClick={handleApplyToRound}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 font-bold text-sm shadow-lg shadow-cyan-500/25 active:scale-95 transition-all"
            >
              <span>Validar e Salvar como Round</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Google Drive Folder & Reference Dataset Modal */}
      {isDriveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-950 border border-blue-700/60 flex items-center justify-center">
                  <Folder className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Google Drive: Pasta de Imagens do Tapete (Base da IA)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Defina a pasta do Google Drive com as imagens das missões para calibrar a visão computacional.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsDriveModalOpen(false)}
                className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Google Account Authentication Section */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {googleUser ? (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-cyan-900 border border-cyan-500 flex items-center justify-center text-xs font-bold text-cyan-200">
                    {googleUser.displayName?.slice(0, 2).toUpperCase() || 'GD'}
                  </div>
                  <div>
                    <span className="text-xs font-bold text-white block">
                      {googleUser.displayName || 'Conta Google Conectada'}
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {googleUser.email}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="text-xs font-bold text-slate-200 block">
                    Conectar Conta Google da Equipe FrancoDroid
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Permite ler e listar as imagens diretamente da sua pasta do Google Drive.
                  </span>
                </div>
              )}

              {googleUser ? (
                <button
                  type="button"
                  onClick={handleGoogleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Desconectar</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isSigningInDrive}
                  onClick={handleGoogleLogin}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold shadow-md transition-all active:scale-95"
                >
                  <svg className="w-4 h-4" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                  <span>{isSigningInDrive ? 'Conectando...' : 'Entrar com o Google'}</span>
                </button>
              )}
            </div>

            {/* Folder URL or ID Input */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-300">
                Link ou ID da Pasta do Google Drive com as Fotos do Tapete
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={driveFolderInput}
                  onChange={(e) => setDriveFolderInput(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/1aBcDeFgHiJkLmNoPqRsTuVwXyZ..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:outline-none focus:border-cyan-500 font-mono"
                />
                <button
                  type="button"
                  disabled={isLoadingFolder}
                  onClick={handleLoadDriveFolder}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md transition-all shrink-0"
                >
                  {isLoadingFolder ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FolderOpen className="w-3.5 h-3.5" />
                  )}
                  <span>Carregar Fotos da Pasta</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Dica: Você pode colar o link completo copiado da barra do navegador da sua pasta do Google Drive.
              </p>
            </div>

            {/* Loaded Files from Drive Folder */}
            {folderFiles.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Fotos Encontradas na Pasta ({folderFiles.length})
                  </h4>
                  <span className="text-[11px] text-slate-400">
                    {driveReferences.length} marcadas como base de calibração
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-72 overflow-y-auto p-1">
                  {folderFiles.map((file) => {
                    const isSelectedAsRef = driveReferences.some((r) => r.id === file.id);

                    return (
                      <div
                        key={file.id}
                        className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                          isSelectedAsRef
                            ? 'bg-cyan-950/40 border-cyan-500/60 shadow-md'
                            : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300">
                              {file.missionCode || 'Geral'}
                            </span>
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                                file.state === 'completed'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : file.state === 'partial'
                                  ? 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                                  : 'bg-rose-950 text-rose-400 border border-rose-800'
                              }`}
                            >
                              {file.state === 'completed'
                                ? 'Concluída'
                                : file.state === 'partial'
                                ? 'Parcial'
                                : 'Incompleta'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 mb-2">
                            {file.thumbnailLink ? (
                              <img
                                src={file.thumbnailLink}
                                alt={file.name}
                                className="w-12 h-12 object-cover rounded-lg border border-slate-800"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500">
                                <ImageIcon className="w-5 h-5" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-white font-medium truncate" title={file.name}>
                                {file.name}
                              </p>
                              {file.webViewLink && (
                                <a
                                  href={file.webViewLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-cyan-400 hover:underline flex items-center gap-0.5 mt-0.5"
                                >
                                  Ver no Drive <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                          <button
                            type="button"
                            onClick={() => handleToggleReferenceBase(file)}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition-all ${
                              isSelectedAsRef
                                ? 'bg-cyan-500 text-slate-950'
                                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                            }`}
                          >
                            {isSelectedAsRef ? '✓ Na Base da IA' : '+ Base da IA'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUseDriveImageForAnalysis(file)}
                            title="Analisar esta foto agora"
                            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[10px]"
                          >
                            Analisar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Footer close */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-xs text-slate-400">
                {driveReferences.length} fotos salvas como base de calibração para a IA.
              </span>
              <button
                type="button"
                onClick={() => setIsDriveModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs"
              >
                Concluir Configuração
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
