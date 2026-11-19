import React, { useRef, useState } from 'react';
import {
  FolderPlus,
  CheckCircle2,
  Trash2,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  FolderTree,
  Image as ImageIcon,
  Info,
  Link2,
  ExternalLink,
  Loader2,
  CloudDownload,
} from 'lucide-react';
import { parseFolderRelativePath, validateMissionReference } from '../utils/folderParser';
import { StorageService } from '../services/storageService';
import { BIOGLOW_OFFICIAL_MISSIONS } from '../data/bioglowMissions';
import { TEAM_DRIVE_GABARITO_URL } from '../data/teamConfig';
import { Mission } from '../types/fll';
import { hasBackendServer, loadStaticTeamGabarito } from '../services/clientAiEngine';

export interface ReferencePhotoItem {
  name: string;
  url: string;
  base64?: string;
  points?: number;
  tierLabel?: string;
}

export interface FolderMissionReference {
  missionCode: string;
  completaFiles: ReferencePhotoItem[];
  parcialFiles: ReferencePhotoItem[];
  incompletaFiles: ReferencePhotoItem[];
  pointTiers?: Record<
    string,
    {
      label: string;
      points: number;
      files: ReferencePhotoItem[];
    }
  >;
}

interface RejectedFileInfo {
  path: string;
  reason: string;
}

interface FolderReferenceViewProps {
  references: Record<string, FolderMissionReference>;
  onReferencesUpdated: (updated: Record<string, FolderMissionReference>) => void;
  onNavigateToAnalyze: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Resize image file to compact JPEG base64 (max 480px) for fast multimodal comparison & safe storage
async function compressImageToBase64(file: File, maxDimension = 480): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      try {
        let width = img.width;
        let height = img.height;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          URL.revokeObjectURL(objectUrl);
          resolve(dataUrl);
          return;
        }
      } catch {
        // fallback below
      }
      URL.revokeObjectURL(objectUrl);
      resolve('');
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve('');
    };
    img.src = objectUrl;
  });
}

export const FolderReferenceView: React.FC<FolderReferenceViewProps> = ({
  references,
  onReferencesUpdated,
  onNavigateToAnalyze,
  onShowToast,
}) => {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImportingDrive, setIsImportingDrive] = useState(false);
  const [driveUrlInput, setDriveUrlInput] = useState(TEAM_DRIVE_GABARITO_URL);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [rejectedFiles, setRejectedFiles] = useState<RejectedFileInfo[]>([]);

  const handleImportFromDriveLink = async (customUrl?: string) => {
    const targetUrl = (customUrl ?? driveUrlInput).trim();
    if (!targetUrl) {
      onShowToast('Cole o link da pasta pública do Google Drive.', 'error');
      return;
    }

    setIsImportingDrive(true);
    setRejectedFiles([]);
    try {
      let data: {
        references: Record<string, FolderMissionReference>;
        missionCount: number;
        photoCount: number;
        rejectedPaths?: string[];
        error?: string;
      };

      if (await hasBackendServer()) {
        const res = await fetch('./api/gabarito/import-drive-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveUrl: targetUrl }),
        });
        const json = await res.json();
        if (!res.ok || !json?.references) {
          throw new Error(json?.error || 'Não foi possível carregar o gabarito deste link.');
        }
        data = json;
      } else {
        const isTeamDriveUrl =
          targetUrl.includes('1ZzuH-M0neR9q8A8Qmj-Qxte30FNn51_8') ||
          targetUrl === TEAM_DRIVE_GABARITO_URL;
        if (!isTeamDriveUrl) {
          throw new Error(
            'No GitHub Pages (modo estático), apenas o Gabarito Oficial da Equipe pode ser importado por link. Para outra pasta, use o botão "Selecionar Pasta do Computador" abaixo.'
          );
        }
        data = await loadStaticTeamGabarito();
      }

      const mergedRefs = { ...references, ...data.references };
      onReferencesUpdated(mergedRefs);
      if (Array.isArray(data.rejectedPaths) && data.rejectedPaths.length > 0) {
        setRejectedFiles(
          data.rejectedPaths.map((p: string) => ({
            path: p,
            reason: 'Subpasta ou imagem fora do padrão no Drive.',
          }))
        );
      }

      onShowToast(
        `Gabarito do Drive carregado! ${data.missionCount} missões (${data.photoCount} fotos) prontas.`,
        'success'
      );
    } catch (err: any) {
      onShowToast(err?.message || 'Erro ao importar gabarito do Google Drive.', 'error');
    } finally {
      setIsImportingDrive(false);
    }
  };

  const missionKeys = Object.keys(references).sort();
  const totalPhotos = missionKeys.reduce((acc, code) => {
    const item = references[code];
    return acc + item.completaFiles.length + item.parcialFiles.length + item.incompletaFiles.length;
  }, 0);

  const invalidMissions = missionKeys.filter((code) => !validateMissionReference(references[code]).isValid);

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setRejectedFiles([]);

    const newReferences: Record<string, FolderMissionReference> = { ...references };
    const autoMissions: Mission[] = [];
    const rejected: RejectedFileInfo[] = [];
    const touchedMissions = new Set<string>();

    let loadedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|bmp)$/i)) {
        continue;
      }

      const relativePath = file.webkitRelativePath || file.name;
      const parsed = parseFolderRelativePath(relativePath);

      if (!parsed.isValid) {
        rejected.push({
          path: relativePath,
          reason: parsed.errorReason || 'Estrutura de pastas fora do padrão oficial.',
        });
        continue;
      }

      const { missionCode, state, points, tierLabel, tierKey, fileName } = parsed;
      touchedMissions.add(missionCode);

      if (!newReferences[missionCode]) {
        const officialMission = BIOGLOW_OFFICIAL_MISSIONS.find((m) => m.code === missionCode);
        newReferences[missionCode] = {
          missionCode,
          completaFiles: [],
          parcialFiles: [],
          incompletaFiles: [],
          pointTiers: {},
        };

        autoMissions.push(
          officialMission || {
            id: `m_${missionCode.toLowerCase()}`,
            code: missionCode,
            name: `Missão ${missionCode}`,
            description: `Critérios baseados na pasta de fotos de referência ${missionCode}`,
            maxScore: 30,
            partialScore: 15,
            criteria: [],
            zone: 'Tapete Geral',
            estimatedDurationSeconds: 20,
          }
        );
      }

      if (!newReferences[missionCode].pointTiers) {
        newReferences[missionCode].pointTiers = {};
      }

      const objectUrl = URL.createObjectURL(file);
      // Compress first 2 images per tier for direct visual AI comparison
      const existingInTier = newReferences[missionCode].pointTiers![tierKey]?.files.length || 0;
      const base64 = existingInTier < 2 ? await compressImageToBase64(file) : undefined;

      const photoItem: ReferencePhotoItem = {
        name: fileName,
        url: base64 || objectUrl,
        base64: base64 || undefined,
        points,
        tierLabel,
      };

      const officialMax =
        BIOGLOW_OFFICIAL_MISSIONS.find((m) => m.code === missionCode)?.maxScore || 30;
      const officialPartial =
        BIOGLOW_OFFICIAL_MISSIONS.find((m) => m.code === missionCode)?.partialScore || 15;

      const tiers = newReferences[missionCode].pointTiers!;
      if (!tiers[tierKey]) {
        tiers[tierKey] = {
          label: tierLabel,
          points:
            points !== undefined
              ? points
              : state === 'completa'
              ? officialMax
              : state === 'parcial'
              ? officialPartial
              : 0,
          files: [],
        };
      }
      tiers[tierKey].files.push(photoItem);

      if (state === 'completa') {
        newReferences[missionCode].completaFiles.push(photoItem);
      } else if (state === 'parcial') {
        newReferences[missionCode].parcialFiles.push(photoItem);
      } else {
        newReferences[missionCode].incompletaFiles.push(photoItem);
      }

      loadedCount++;
    }

    if (autoMissions.length > 0) {
      const existing = StorageService.getMissions();
      const merged = [...existing];
      autoMissions.forEach((m) => {
        if (!merged.some((x) => x.code === m.code)) {
          merged.push(m);
        }
      });
      StorageService.saveMissions(merged);
    }

    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }

    setRejectedFiles(rejected);
    onReferencesUpdated(newReferences);
    setIsProcessing(false);

    if (loadedCount === 0 && rejected.length > 0) {
      onShowToast(
        'Nenhuma imagem importada! Os nomes das pastas não seguem o formato exigido (ex: M01/completa, M02/20 pontos).',
        'error'
      );
      return;
    }

    if (rejected.length > 0) {
      onShowToast(
        `${loadedCount} fotos importadas, mas ${rejected.length} arquivos foram recusados por nome de pasta incorreto.`,
        'error'
      );
    } else if (loadedCount > 0) {
      const incompleteTouched = Array.from(touchedMissions).filter(
        (code) => !validateMissionReference(newReferences[code]).isValid
      );
      if (incompleteTouched.length > 0) {
        onShowToast(
          `Importado, mas falta o número mínimo de níveis/estados em: ${incompleteTouched.join(', ')}.`,
          'info'
        );
      } else {
        onShowToast(
          `Gabarito validado! ${loadedCount} fotos prontas em ${Object.keys(newReferences).length} missões.`,
          'success'
        );
      }
    }
  };

  const confirmClearAll = () => {
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
    setRejectedFiles([]);
    onReferencesUpdated({});
    setShowClearConfirm(false);
    onShowToast('Gabarito de fotos limpo com sucesso.', 'info');
  };

  const handleRemoveMission = (code: string) => {
    const next = { ...references };
    delete next[code];
    onReferencesUpdated(next);
    onShowToast(`Missão ${code} removida do gabarito.`, 'info');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 fd-fade-up">
      {/* Clean Page Title */}
      <div className="text-center space-y-2 py-1">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
          Pastas de Referência
        </h1>
        <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
          Envie as pastas organizadas por código da missão e pontuação exata para que a IA compare visualmente cada estado do tapete.
        </p>
      </div>

      {/* Strict Folder Formatting Alert (Rejected Files) */}
      {rejectedFiles.length > 0 && (
        <div className="fd-panel rounded-2xl p-5 border border-rose-500/40 bg-rose-950/25 space-y-3 fd-fade-up">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-rose-200">
                  {rejectedFiles.length} {rejectedFiles.length === 1 ? 'arquivo recusado' : 'arquivos recusados'} — Nome de pasta fora do padrão
                </h3>
                <p className="text-xs text-rose-200/80 mt-0.5">
                  As pastas devem informar exatamente o código da missão (<code className="font-mono text-white">M01</code>–<code className="font-mono text-white">M15</code>) e uma subpasta com o estado ou pontuação (<code className="font-mono text-white">completa</code>, <code className="font-mono text-white">20 pontos</code>, <code className="font-mono text-white">10 pontos</code>, <code className="font-mono text-white">incompleta</code>).
                </p>
              </div>
            </div>
            <button
              onClick={() => setRejectedFiles([])}
              className="text-xs text-rose-300 hover:text-white px-2.5 py-1 rounded-lg bg-rose-500/15 transition-colors shrink-0"
            >
              Fechar
            </button>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
            {rejectedFiles.slice(0, 8).map((item, idx) => (
              <div
                key={idx}
                className="text-[11px] bg-black/40 border border-rose-500/20 rounded-xl px-3 py-2 flex flex-col gap-0.5"
              >
                <span className="font-mono text-rose-300 truncate">{item.path}</span>
                <span className="text-slate-300">{item.reason}</span>
              </div>
            ))}
            {rejectedFiles.length > 8 && (
              <p className="text-[11px] text-rose-300/80 pl-1">
                + {rejectedFiles.length - 8} outros arquivos com o mesmo erro...
              </p>
            )}
          </div>
        </div>
      )}

      {/* Warning Banner for Missions Missing Required Number of Folders */}
      {invalidMissions.length > 0 && (
        <div className="fd-panel rounded-2xl p-4 sm:p-5 border border-amber-500/35 bg-amber-950/20 flex items-start gap-3 fd-fade-up">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-amber-200">
              Faltam subpastas obrigatórias em {invalidMissions.join(', ')}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              Para a IA conseguir comparar o vídeo, cada missão precisa ter <strong>pelo menos 2 níveis/estados diferentes</strong> (ex: uma pasta <code className="font-mono text-emerald-300">completa</code> e outra <code className="font-mono text-rose-300">incompleta</code> ou <code className="font-mono text-amber-300">20 pontos</code> / <code className="font-mono text-amber-300">10 pontos</code>) com fotos válidas.
            </p>
          </div>
        </div>
      )}

      {/* Quick Import from Team Google Drive or Custom Drive Link */}
      <div className="fd-panel rounded-3xl p-6 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/25 to-emerald-500/20 border border-cyan-400/35 flex items-center justify-center shrink-0">
              <CloudDownload className="w-5 h-5 text-cyan-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                Carregar Gabarito pelo Google Drive (1 Clique)
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Use a pasta oficial compartilhada da equipe ou cole o link de qualquer pasta pública do Drive organizada por missão.
              </p>
            </div>
          </div>

          <a
            href={TEAM_DRIVE_GABARITO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 shrink-0 self-start sm:self-center"
          >
            <span>Abrir Pasta no Drive</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              value={driveUrlInput}
              onChange={(e) => setDriveUrlInput(e.target.value)}
              placeholder="Cole o link da pasta do Google Drive..."
              className="w-full bg-black/50 border border-white/15 rounded-xl pl-10 pr-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 font-mono focus:outline-none focus:border-cyan-400"
            />
          </div>
          <button
            type="button"
            disabled={isImportingDrive}
            onClick={() => handleImportFromDriveLink()}
            className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shrink-0 transition-all ${
              isImportingDrive
                ? 'bg-white/10 text-slate-400 cursor-wait'
                : 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 hover:brightness-105 shadow-lg shadow-cyan-500/20'
            }`}
          >
            {isImportingDrive ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Carregando do Drive...</span>
              </>
            ) : (
              <>
                <CloudDownload className="w-4 h-4" />
                <span>Carregar Gabarito do Drive</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>
            Link padrão da equipe já preenchido acima — clique para usar imediatamente.
          </span>
          {driveUrlInput !== TEAM_DRIVE_GABARITO_URL && (
            <button
              type="button"
              onClick={() => {
                setDriveUrlInput(TEAM_DRIVE_GABARITO_URL);
                void handleImportFromDriveLink(TEAM_DRIVE_GABARITO_URL);
              }}
              className="text-cyan-300 hover:text-cyan-200 underline"
            >
              Usar pasta padrão da equipe
            </button>
          )}
        </div>
      </div>

      {/* Main Folder Upload Card (Local Computer Folder) */}
      <div className="fd-panel rounded-3xl p-6 sm:p-8 space-y-6">
        <div
          onClick={() => folderInputRef.current?.click()}
          className="relative rounded-2xl p-8 sm:p-10 transition-all cursor-pointer text-center flex flex-col items-center justify-center min-h-[175px] border-2 border-dashed border-cyan-500/25 hover:border-cyan-400/60 bg-gradient-to-b from-cyan-500/[0.04] to-transparent hover:from-cyan-500/[0.08] group fd-interactive"
        >
          <input
            ref={folderInputRef}
            type="file"
            // @ts-ignore
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFolderSelect}
            className="hidden"
          />

          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-400/30 flex items-center justify-center text-cyan-300 group-hover:scale-105 transition-transform mb-3 shadow-lg shadow-cyan-500/10">
            <FolderPlus className="w-6 h-6 text-cyan-300" />
          </div>

          <h3 className="text-base font-semibold text-white">
            {isProcessing ? 'Validando pastas e preparando fotos...' : 'Ou Selecionar Pasta do Computador'}
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1.5">
            Clique se preferir enviar uma pasta local contendo as missões (<code className="font-mono text-cyan-300">M01</code>, <code className="font-mono text-cyan-300">M02</code>, etc.)
          </p>
        </div>

        {/* Visual Formatting Guide */}
        <div className="fd-card rounded-2xl p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <FolderTree className="w-4 h-4 text-cyan-400" />
              <span>Formato Exato Obrigatório das Pastas</span>
            </div>
            <span className="text-[11px] text-slate-400">
              Mínimo 2 níveis por missão · Códigos M01 a M15
            </span>
          </div>

          <div className="p-4 rounded-xl bg-black/50 border border-white/10 font-mono text-[11px] sm:text-xs text-slate-300 overflow-x-auto leading-relaxed space-y-1.5">
            <div className="text-white font-semibold">📁 Gabarito_FLL/</div>
            <div className="pl-4">
              ├── <span className="text-cyan-300 font-semibold">📁 M01/</span>
            </div>
            <div className="pl-10 text-emerald-300">├── 📁 completa/ <span className="text-slate-500">(drone fora + peça vermelha na caixa = 30 pts)</span></div>
            <div className="pl-10 text-amber-300">├── 📁 20 pontos/ <span className="text-slate-500">(só drone fora do tapete = 20 pts)</span></div>
            <div className="pl-10 text-rose-300">└── 📁 incompleta/ <span className="text-slate-500">(0 pts)</span></div>

            <div className="pl-4 pt-1">
              └── <span className="text-cyan-300 font-semibold">📁 M02/</span>
            </div>
            <div className="pl-10 text-emerald-300">├── 📁 3 sementes completa/ <span className="text-slate-500">(30 pts)</span></div>
            <div className="pl-10 text-cyan-300">├── 📁 2 sementes 20 pontos/ <span className="text-slate-500">(20 pts)</span></div>
            <div className="pl-10 text-amber-300">├── 📁 1 semente 10 pontos/ <span className="text-slate-500">(10 pts)</span></div>
            <div className="pl-10 text-rose-300">└── 📁 0 incompleta/ <span className="text-slate-500">(0 pts)</span></div>
          </div>

          <div className="flex items-start gap-2 text-[11px] text-slate-400 pt-1">
            <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              Nomes genéricos como <code className="text-rose-300 font-mono">pasta1</code>, <code className="text-rose-300 font-mono">fotos</code> ou imagens soltas fora das subpastas de pontos serão recusados automaticamente.
            </span>
          </div>
        </div>

        {/* Action Controls */}
        {missionKeys.length > 0 && (
          <div className="pt-2 border-t border-white/10">
            {showClearConfirm ? (
              <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex flex-col sm:flex-row items-center justify-between gap-3 fd-fade-up">
                <div className="flex items-center gap-2 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>Tem certeza que deseja apagar todas as fotos do gabarito?</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-3.5 py-1.5 rounded-xl bg-white/5 text-slate-300 hover:text-white text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmClearAll}
                    className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sim, Limpar Tudo</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="text-xs text-slate-400 hover:text-rose-300 transition-colors flex items-center gap-1.5 px-3 py-2 rounded-xl hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Gabarito ({missionKeys.length} missões)</span>
                </button>

                <button
                  onClick={onNavigateToAnalyze}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 hover:brightness-105 text-xs font-bold transition-all shadow-lg shadow-cyan-500/20 active:scale-95"
                >
                  <span>Ir para Análise de Vídeo</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Loaded Missions Grid */}
      {missionKeys.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Gabarito Carregado</span>
              <span className="text-slate-500 font-normal">·</span>
              <span className="text-xs font-normal text-slate-400 font-mono">
                {missionKeys.length} {missionKeys.length === 1 ? 'missão' : 'missões'} · {totalPhotos} fotos
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {missionKeys.map((code) => {
              const item = references[code];
              const validation = validateMissionReference(item);
              const officialMission = BIOGLOW_OFFICIAL_MISSIONS.find((m) => m.code === code);
              const allPhotos = [
                ...item.completaFiles,
                ...item.parcialFiles,
                ...item.incompletaFiles,
              ];

              return (
                <div
                  key={code}
                  className={`fd-card fd-interactive rounded-2xl p-4 sm:p-5 space-y-3.5 relative group ${
                    validation.isValid
                      ? 'border-white/10'
                      : 'border-amber-500/40 bg-amber-950/15'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-cyan-300">
                          {code}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="text-xs font-semibold text-white">
                          {officialMission?.name || `Missão ${code}`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                        {validation.tierCount} {validation.tierCount === 1 ? 'nível' : 'níveis'} · {validation.photoCount} {validation.photoCount === 1 ? 'foto' : 'fotos'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {validation.isValid ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          Válida
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                          Incompleta
                        </span>
                      )}
                      <button
                        onClick={() => handleRemoveMission(code)}
                        title="Remover esta missão"
                        className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Validation Warnings if missing required number of states */}
                  {!validation.isValid && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-[11px] text-amber-200 leading-relaxed">
                      {validation.warnings[0]}
                    </div>
                  )}

                  {/* Point Tiers Breakdown */}
                  {item.pointTiers && Object.keys(item.pointTiers).length > 0 && (
                    <div className="space-y-1.5">
                      {Object.entries(item.pointTiers)
                        .sort(([, a], [, b]) => b.points - a.points)
                        .map(([tierKey, tier]) => {
                          const pts = tier.points;
                          const colorClass =
                            pts >= 30
                              ? 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10'
                              : pts >= 15
                              ? 'text-cyan-300 border-cyan-500/25 bg-cyan-500/10'
                              : pts > 0
                              ? 'text-amber-300 border-amber-500/25 bg-amber-500/10'
                              : 'text-rose-300 border-rose-500/25 bg-rose-500/10';

                          return (
                            <div
                              key={tierKey}
                              className={`flex items-center justify-between text-[11px] font-mono px-3 py-1.5 rounded-xl border ${colorClass}`}
                            >
                              <span className="font-semibold truncate pr-2">{tier.label}</span>
                              <span className="shrink-0 opacity-90">
                                {pts} pts · {tier.files.length} {tier.files.length === 1 ? 'foto' : 'fotos'}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  )}

                  {/* Thumbnail Strip */}
                  <div className="flex items-center gap-2 overflow-x-auto pt-1">
                    {allPhotos.slice(0, 5).map((p, idx) => (
                      <div key={idx} className="relative shrink-0">
                        {p.url ? (
                          <img
                            src={p.url}
                            alt={p.name}
                            className="w-10 h-10 object-cover rounded-xl border border-white/15 bg-black/40"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center">
                            <ImageIcon className="w-4 h-4 text-slate-500" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
