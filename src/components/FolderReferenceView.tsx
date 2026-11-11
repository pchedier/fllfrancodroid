import React, { useRef, useState } from 'react';
import {
  FolderOpen,
  FolderPlus,
  CheckCircle2,
  Trash2,
  Upload,
  ArrowRight,
  Layers,
  Sparkles,
  Check,
  X,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { parseFolderRelativePath } from '../utils/folderParser';
import { StorageService } from '../services/storageService';
import { Mission } from '../types/fll';

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
  // Dynamic point tiers e.g. { "30pts": { label: "3 sementes (30 pts)", points: 30, files: [...] }, "20pts": ... }
  pointTiers?: Record<
    string,
    {
      label: string;
      points: number;
      files: ReferencePhotoItem[];
    }
  >;
}

interface FolderReferenceViewProps {
  references: Record<string, FolderMissionReference>;
  onReferencesUpdated: (updated: Record<string, FolderMissionReference>) => void;
  onNavigateToAnalyze: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export const FolderReferenceView: React.FC<FolderReferenceViewProps> = ({
  references,
  onReferencesUpdated,
  onNavigateToAnalyze,
  onShowToast,
}) => {
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const missionKeys = Object.keys(references).sort();
  const totalPhotos = missionKeys.reduce((acc, code) => {
    const item = references[code];
    return acc + item.completaFiles.length + item.parcialFiles.length + item.incompletaFiles.length;
  }, 0);

  // Read folder using webkitRelativePath
  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    const newReferences: Record<string, FolderMissionReference> = { ...references };
    const autoMissions: Mission[] = [];

    let loadedCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/') && !file.name.match(/\.(jpg|jpeg|png|webp|bmp)$/i)) {
        continue;
      }

      const relativePath = file.webkitRelativePath || file.name;
      const { missionCode, state, points, tierLabel, tierKey, fileName } = parseFolderRelativePath(relativePath);

      if (!newReferences[missionCode]) {
        newReferences[missionCode] = {
          missionCode,
          completaFiles: [],
          parcialFiles: [],
          incompletaFiles: [],
          pointTiers: {},
        };

        autoMissions.push({
          id: `m_${missionCode.toLowerCase()}`,
          code: missionCode,
          name: `Missão ${missionCode}`,
          description: `Critérios baseados na pasta de fotos de referência ${missionCode}`,
          maxScore: 30,
          partialScore: 15,
          criteria: [],
          zone: 'Tapete Geral',
          estimatedDurationSeconds: 20,
        });
      }

      if (!newReferences[missionCode].pointTiers) {
        newReferences[missionCode].pointTiers = {};
      }

      const objectUrl = URL.createObjectURL(file);
      const photoItem: ReferencePhotoItem = {
        name: fileName,
        url: objectUrl,
        points,
        tierLabel,
      };

      // Register in specific point tier (e.g., "3 sementes completa", "2 sementes 20 pontos", "1 semente 10 pontos")
      const tiers = newReferences[missionCode].pointTiers!;
      if (!tiers[tierKey]) {
        tiers[tierKey] = {
          label: tierLabel,
          points: points !== undefined ? points : (state === 'completa' ? 30 : state === 'parcial' ? 15 : 0),
          files: [],
        };
      }
      tiers[tierKey].files.push(photoItem);

      // Keep standard backward compatibility arrays
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

    // Reset input value so user can re-select the same folder if needed
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }

    onReferencesUpdated(newReferences);
    setIsProcessing(false);
    onShowToast(`Sucesso! ${loadedCount} fotos importadas em ${Object.keys(newReferences).length} missões!`, 'success');
  };

  // Immediate and reliable Clear Gabarito
  const confirmClearAll = () => {
    // Reset file input
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
    }
    // Update app state & localStorage
    onReferencesUpdated({});
    setShowClearConfirm(false);
    onShowToast('Gabarito de fotos limpo com sucesso.', 'info');
  };

  // Clear single mission
  const handleRemoveMission = (code: string) => {
    const next = { ...references };
    delete next[code];
    onReferencesUpdated(next);
    onShowToast(`Missão ${code} removida do gabarito.`, 'info');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Symmetrical Header */}
      <div className="text-center space-y-2 py-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full apple-glass-subtle text-[11px] font-mono text-cyan-300">
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>Gabarito Multi-Pastas</span>
        </span>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          Pastas de Referência
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
          Selecione a pasta raiz contendo as fotos das missões com seus níveis de pontuação (ex: <code className="text-emerald-300 font-mono">completa</code>, <code className="text-cyan-300 font-mono">20 pontos</code>, <code className="text-amber-300 font-mono">10 pontos</code> ou <code className="text-rose-300 font-mono">incompleta</code>).
        </p>
      </div>

      {/* Main Glass Folder Selector Card */}
      <div className="apple-glass rounded-3xl p-6 sm:p-8 space-y-6">
        <div
          onClick={() => folderInputRef.current?.click()}
          className="relative rounded-2xl p-8 sm:p-10 transition-all cursor-pointer text-center flex flex-col items-center justify-center min-h-[190px] border border-dashed border-white/10 hover:border-white/25 bg-white/[0.015] hover:bg-white/[0.03] group"
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

          <div className="w-12 h-12 mx-auto rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-300 group-hover:scale-105 transition-transform mb-3">
            <FolderPlus className="w-5 h-5 text-cyan-300" />
          </div>

          <h3 className="text-sm font-semibold text-white">
            {isProcessing ? 'Processando e organizando as fotos...' : 'Selecionar Pasta Principal'}
          </h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
            Clique para escolher a pasta com as subpastas das missões
          </p>
        </div>

        {/* Apple-style Symmetrical Folder Structure Helper */}
        <div className="apple-glass-card rounded-2xl p-4 text-xs space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-medium text-slate-300">Estrutura de Subpastas Reconhecida</span>
            <span className="font-mono text-[10px]">Autodetect Pontos & Itens</span>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 font-mono text-[11px] text-slate-300 overflow-x-auto leading-relaxed space-y-1">
            <div>📁 Tapete_FLL/</div>
            <div className="pl-4">├── 📁 M01 / <span className="text-emerald-400">30 pontos (ou completa)</span>, <span className="text-cyan-400">20 pontos</span>, <span className="text-rose-400">incompleta</span></div>
            <div className="pl-4">└── 📁 M02 / <span className="text-emerald-400">3 sementes completa (30 pts)</span>, <span className="text-cyan-400">2 sementes 20 pontos</span>, <span className="text-amber-400">1 semente 10 pontos</span>, <span className="text-rose-400">0 incompleta</span></div>
          </div>
        </div>

        {/* Action Controls with Symmetrical In-App Confirmation */}
        {missionKeys.length > 0 && (
          <div className="pt-2 border-t border-white/5">
            {showClearConfirm ? (
              <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>Tem certeza que deseja apagar todas as fotos do gabarito?</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-3 py-1.5 rounded-xl bg-white/5 text-slate-300 hover:text-white text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmClearAll}
                    className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-medium text-xs shadow-md transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Sim, Limpar Tudo</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="text-xs text-slate-400 hover:text-rose-400 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Limpar Gabarito ({missionKeys.length} missões)</span>
                </button>

                <button
                  onClick={onNavigateToAnalyze}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white text-black hover:bg-slate-100 text-xs font-semibold transition-all shadow-md active:scale-95"
                >
                  <span>Ir para Análise de Vídeo</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Symmetrical Grid of Loaded Missions */}
      {missionKeys.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-semibold text-white flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Gabarito Ativo ({missionKeys.length} missões • {totalPhotos} fotos)</span>
            </h2>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="text-[11px] text-slate-500 hover:text-rose-400 transition-colors"
            >
              Excluir base
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {missionKeys.map((code) => {
              const item = references[code];
              return (
                <div
                  key={code}
                  className="apple-glass-card apple-glass-card-hover rounded-2xl p-4 space-y-3 relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-xl bg-white/5 text-cyan-300 border border-white/10">
                      {code}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-slate-400">
                        {item.completaFiles.length + item.parcialFiles.length + item.incompletaFiles.length} imagens
                      </span>
                      <button
                        onClick={() => handleRemoveMission(code)}
                        title="Remover esta missão"
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-white/5 transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Dynamic Point Tiers or Traditional 3-State Badges */}
                  {item.pointTiers && Object.keys(item.pointTiers).length > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(item.pointTiers).map(([tierKey, tier]) => {
                          const pts = tier.points;
                          const badgeColor =
                            pts >= 30
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                              : pts >= 20
                              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-300'
                              : pts >= 10
                              ? 'bg-amber-500/10 border-amber-500/20 text-amber-300'
                              : 'bg-rose-500/10 border-rose-500/20 text-rose-300';

                          return (
                            <span
                              key={tierKey}
                              className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border ${badgeColor} flex items-center gap-1`}
                            >
                              <span className="font-semibold">{tier.label}</span>
                              <span className="opacity-70">({tier.files.length})</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono">
                      <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="text-[10px] text-emerald-400 block font-medium">Completa</span>
                        <span className="text-sm font-semibold text-white">{item.completaFiles.length}</span>
                      </div>

                      <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="text-[10px] text-amber-400 block font-medium">Parcial</span>
                        <span className="text-sm font-semibold text-white">{item.parcialFiles.length}</span>
                      </div>

                      <div className="p-2 rounded-xl bg-white/[0.02] border border-white/5">
                        <span className="text-[10px] text-rose-400 block font-medium">Incompleta</span>
                        <span className="text-sm font-semibold text-white">{item.incompletaFiles.length}</span>
                      </div>
                    </div>
                  )}

                  {/* Thumbnail Strip */}
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                    {[...item.completaFiles, ...item.parcialFiles, ...item.incompletaFiles]
                      .slice(0, 5)
                      .map((p, idx) => (
                        <img
                          key={idx}
                          src={p.url}
                          alt={p.name}
                          className="w-9 h-9 object-cover rounded-lg border border-white/10 shrink-0"
                        />
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
