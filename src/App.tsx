import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { Navbar, TabKey } from './components/Navbar';
import { SimpleVideoAnalysisView } from './components/SimpleVideoAnalysisView';
import { FolderReferenceView, FolderMissionReference } from './components/FolderReferenceView';
import { HistoryView } from './components/HistoryView';
import { ApiSettingsView } from './components/ApiSettingsView';
import { ToastContainer, ToastMessage } from './components/Toast';
import { StorageService } from './services/storageService';
import { CloudSyncService } from './services/cloudSyncService';
import {
  hasBackendServer,
  loadStaticTeamGabarito,
  validateGeminiKeyDirect,
} from './services/clientAiEngine';
import { TEAM_DRIVE_GABARITO_URL } from './data/teamConfig';
import { Round, Mission, AiTrainingExample } from './types/fll';

const LOCAL_FOLDER_STORAGE_KEY = 'francodroid_fll_folder_refs_v2';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('analyze');
  const [rounds, setRounds] = useState<Round[]>(() => StorageService.getRounds());
  const [trainingExamples, setTrainingExamples] = useState<AiTrainingExample[]>(() =>
    StorageService.getAiTraining()
  );
  const [missions] = useState<Mission[]>(() => StorageService.getMissions());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isAiReady, setIsAiReady] = useState(false);
  const [isLoadingDriveGabarito, setIsLoadingDriveGabarito] = useState(false);
  const [cloudUser, setCloudUser] = useState<User | null>(null);

  // Folder references state (rehydrate url from base64 if deduplicated in storage)
  const [folderReferences, setFolderReferences] = useState<Record<string, FolderMissionReference>>(() => {
    try {
      const data = localStorage.getItem(LOCAL_FOLDER_STORAGE_KEY);
      if (!data) return {};
      const parsed = JSON.parse(data) as Record<string, FolderMissionReference>;
      for (const code of Object.keys(parsed)) {
        const ref = parsed[code];
        const b64ByName = new Map<string, string>();
        if (ref.pointTiers) {
          for (const tk of Object.keys(ref.pointTiers)) {
            ref.pointTiers[tk].files = (ref.pointTiers[tk].files || []).map((f) => {
              if (f.base64) b64ByName.set(`${tk}|${f.name}`, f.base64);
              return { ...f, url: f.base64 || f.url || '' };
            });
          }
        }
        const rehydrate = (arr: any[]) =>
          (arr || []).map((f) => {
            if (f.base64) return { ...f, url: f.base64 };
            const match = Array.from(b64ByName.entries()).find(([k]) => k.endsWith(`|${f.name}`));
            const b64 = match?.[1];
            return b64 ? { ...f, base64: b64, url: b64 } : f;
          });
        ref.completaFiles = rehydrate(ref.completaFiles);
        ref.parcialFiles = rehydrate(ref.parcialFiles);
        ref.incompletaFiles = rehydrate(ref.incompletaFiles);
      }
      return parsed;
    } catch {
      return {};
    }
  });

  // Toast Helper
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // 1. Always-on non-destructive sync between Browser localStorage <-> Server JSON disk
  useEffect(() => {
    let active = true;
    CloudSyncService.bootstrapServerSync().then(({ rounds: mergedRounds, training: mergedTraining }) => {
      if (!active) return;
      setRounds(mergedRounds);
      setTrainingExamples(mergedTraining);
    });
    return () => {
      active = false;
    };
  }, []);

  // 2. Real-time Firebase Firestore Cloud Sync when authenticated with Google
  useEffect(() => {
    let unsubCloud: (() => void) | null = null;
    const unsubAuth = CloudSyncService.subscribeAuth((user) => {
      setCloudUser(user);
      if (unsubCloud) {
        unsubCloud();
        unsubCloud = null;
      }
      if (user) {
        unsubCloud = CloudSyncService.subscribeCloudCollections(user, {
          onRoundsSynced: (mergedRounds) => setRounds(mergedRounds),
          onTrainingSynced: (mergedTraining) => setTrainingExamples(mergedTraining),
        });
      }
    });

    return () => {
      unsubAuth();
      if (unsubCloud) unsubCloud();
    };
  }, []);

  // Check user API key & restore cached server gabarito if browser storage empty
  useEffect(() => {
    const checkKeyStatus = async () => {
      const userKey = localStorage.getItem('francodroid_user_gemini_api_key');
      if (userKey && userKey.trim()) {
        try {
          if (await hasBackendServer()) {
            const res = await fetch('./api/ai/validate-key', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ apiKey: userKey.trim() }),
            });
            const data = await res.json();
            setIsAiReady(Boolean(data.valid));
          } else {
            const data = await validateGeminiKeyDirect(userKey.trim());
            setIsAiReady(Boolean(data.valid));
          }
          return;
        } catch {
          setIsAiReady(false);
          return;
        }
      }
      setIsAiReady(false);
    };

    checkKeyStatus();

    if (Object.keys(folderReferences).length === 0) {
      const wasExplicitlyCleared = localStorage.getItem('francodroid_gabarito_cleared') === '1';
      if (!wasExplicitlyCleared) {
        hasBackendServer().then(async (hasServer) => {
          if (hasServer) {
            try {
              const r = await fetch('./api/gabarito');
              const d = await r.json();
              if (d?.references && Object.keys(d.references).length > 0) {
                setFolderReferences(d.references);
                try {
                  localStorage.setItem(LOCAL_FOLDER_STORAGE_KEY, JSON.stringify(d.references));
                } catch {}
                return;
              }
            } catch {}
          }
          try {
            const staticGab = await loadStaticTeamGabarito();
            if (staticGab?.references && Object.keys(staticGab.references).length > 0) {
              setFolderReferences(staticGab.references);
              try {
                localStorage.setItem(LOCAL_FOLDER_STORAGE_KEY, JSON.stringify(staticGab.references));
              } catch {}
            }
          } catch {}
        });
      }
    }
  }, []);

  // Save folder references to localStorage (keeps compressed base64 when within quota, falls back cleanly)
  const handleUpdateReferences = (updated: Record<string, FolderMissionReference>) => {
    setFolderReferences(updated);
    try {
      if (Object.keys(updated).length === 0) {
        localStorage.setItem('francodroid_gabarito_cleared', '1');
      } else {
        localStorage.removeItem('francodroid_gabarito_cleared');
      }
    } catch {}

    const serialize = (includeBase64: boolean, compactDedupe = false) => {
      const result: Record<string, any> = {};
      Object.keys(updated).forEach((k) => {
        const item = updated[k];
        const hasTiers = Boolean(item.pointTiers && Object.keys(item.pointTiers).length > 0);
        const mapFile = (f: any, storeB64: boolean) => ({
          name: f.name,
          url: storeB64 && f.base64 ? '' : f.url && !String(f.url).startsWith('blob:') ? f.url : '',
          base64: storeB64 ? f.base64 : undefined,
          points: f.points,
          tierLabel: f.tierLabel,
        });

        const serializedTiers: Record<string, any> = {};
        if (item.pointTiers) {
          Object.entries(item.pointTiers).forEach(([tKey, tVal]) => {
            serializedTiers[tKey] = {
              label: tVal.label,
              points: tVal.points,
              files: tVal.files.map((f) => mapFile(f, includeBase64)),
            };
          });
        }

        const storeLegacyB64 = includeBase64 && (!compactDedupe || !hasTiers);
        result[k] = {
          missionCode: item.missionCode,
          completaFiles: item.completaFiles.map((f) => mapFile(f, storeLegacyB64)),
          parcialFiles: item.parcialFiles.map((f) => mapFile(f, storeLegacyB64)),
          incompletaFiles: item.incompletaFiles.map((f) => mapFile(f, storeLegacyB64)),
          pointTiers: serializedTiers,
        };
      });
      return result;
    };

    try {
      localStorage.setItem(LOCAL_FOLDER_STORAGE_KEY, JSON.stringify(serialize(true, true)));
    } catch {
      try {
        localStorage.setItem(LOCAL_FOLDER_STORAGE_KEY, JSON.stringify(serialize(false, true)));
      } catch (e) {
        console.warn('LocalStorage limit for folder refs:', e);
      }
    }

    hasBackendServer().then((hasServer) => {
      if (!hasServer) return;
      fetch('./api/gabarito', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ references: serialize(true, false) }),
      }).catch(() => {});
    });
  };

  const handleQuickSaveApiKey = async (rawKey: string): Promise<boolean> => {
    const trimmed = rawKey.trim();
    if (!trimmed) return false;
    try {
      let data: { valid: boolean; message?: string; quotaWarning?: boolean };
      if (await hasBackendServer()) {
        const res = await fetch('./api/ai/validate-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: trimmed }),
        });
        data = await res.json();
      } else {
        data = await validateGeminiKeyDirect(trimmed);
      }

      if (data.valid) {
        localStorage.setItem('francodroid_user_gemini_api_key', trimmed);
        setIsAiReady(true);
        showToast(data.message || 'Chave Gemini conectada!', data.quotaWarning ? 'info' : 'success');
        return true;
      }
      showToast(data?.message || 'Chave inválida. Confira no Google AI Studio.', 'error');
      return false;
    } catch {
      showToast('Erro de conexão ao validar chave.', 'error');
      return false;
    }
  };

  const handleLoadTeamDriveGabarito = async () => {
    setIsLoadingDriveGabarito(true);
    try {
      let data: {
        references: Record<string, FolderMissionReference>;
        missionCount: number;
        photoCount: number;
        error?: string;
      };
      if (await hasBackendServer()) {
        const res = await fetch('./api/gabarito/import-drive-link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ driveUrl: TEAM_DRIVE_GABARITO_URL }),
        });
        const json = await res.json();
        if (!res.ok || !json?.references) {
          throw new Error(json?.error || 'Falha ao carregar gabarito do Google Drive.');
        }
        data = json;
      } else {
        data = await loadStaticTeamGabarito();
      }

      handleUpdateReferences({ ...folderReferences, ...data.references });
      showToast(
        `Gabarito da equipe carregado! ${data.missionCount} missões (${data.photoCount} fotos).`,
        'success'
      );
    } catch (err: any) {
      showToast(err?.message || 'Erro ao carregar gabarito do Drive.', 'error');
    } finally {
      setIsLoadingDriveGabarito(false);
    }
  };

  // Cloud Sign-in / Sign-out
  const handleConnectCloud = async () => {
    try {
      const user = await CloudSyncService.signInWithGoogle();
      showToast(
        `Nuvem conectada (${user.email})! Histórico e treinos da IA serão salvos permanentemente.`,
        'success'
      );
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') return;
      if (err?.code === 'auth/unauthorized-domain') {
        showToast(
          `Adicione "${window.location.hostname}" em Firebase Console -> Authentication -> Domínios autorizados para usar login Google neste link. Seus dados locais continuam salvos!`,
          'info'
        );
        return;
      }
      showToast(err?.message || 'Não foi possível conectar com a conta Google.', 'error');
    }
  };

  const handleDisconnectCloud = async () => {
    try {
      await CloudSyncService.signOutCloud();
      showToast('Sincronização na nuvem pausada. Seus dados locais continuam salvos.', 'info');
    } catch {
      showToast('Erro ao desconectar da nuvem.', 'error');
    }
  };

  // Save Round to History (Local + Server + Cloud Firestore)
  const handleSaveToHistory = async (roundToSave: Round) => {
    try {
      const { updated, newRound } = await CloudSyncService.saveRoundEverywhere(
        roundToSave,
        cloudUser
      );
      setRounds(updated);
      showToast(
        `Round #${newRound.roundNumber} salvo permanentemente (${newRound.totalScore} pts)!`,
        'success'
      );
      setActiveTab('history');
    } catch (err: any) {
      // Fallback: local + server already saved inside saveRoundEverywhere before Firestore error
      setRounds(StorageService.getRounds());
      showToast(
        'Round salvo no navegador/servidor (verifique a nuvem para sincronizar online).',
        'info'
      );
      setActiveTab('history');
    }
  };

  const handleDeleteRound = async (id: string) => {
    try {
      const updated = await CloudSyncService.deleteRoundEverywhere(id, cloudUser);
      setRounds(updated);
      showToast('Round removido do histórico com sucesso!', 'info');
    } catch {
      setRounds(StorageService.getRounds());
      showToast('Round removido localmente.', 'info');
    }
  };

  const handleSaveTrainingExamples = async (
    examplesToSend: Array<Omit<AiTrainingExample, 'id' | 'createdAt'>>
  ) => {
    const updated = await CloudSyncService.saveTrainingEverywhere(examplesToSend, cloudUser);
    setTrainingExamples(updated);
  };

  const handleDeleteTrainingExample = async (id: string) => {
    const updated = await CloudSyncService.deleteTrainingEverywhere(id, cloudUser);
    setTrainingExamples(updated);
  };

  const handleImportBackup = async (jsonText: string) => {
    const res = StorageService.importFullBackup(jsonText);
    if (!res.success) {
      showToast(res.message, 'error');
      return;
    }

    const latestRounds = StorageService.getRounds();
    const latestTraining = StorageService.getAiTraining();
    setRounds(latestRounds);
    setTrainingExamples(latestTraining);

    await CloudSyncService.pushRoundsToServer(latestRounds, StorageService.getDeletedRoundIds());
    await CloudSyncService.pushTrainingToServer(
      latestTraining,
      StorageService.getDeletedTrainingIds()
    );
    if (cloudUser) {
      await CloudSyncService.pushAllLocalToCloud(latestRounds, latestTraining, cloudUser).catch(
        () => {}
      );
    }

    showToast(res.message, 'success');
  };

  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      {/* Subtle Ambient Robotics Backdrop */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[760px] h-[360px] bg-gradient-to-b from-cyan-500/12 via-emerald-500/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed -bottom-40 left-1/4 w-[520px] h-[340px] bg-emerald-500/6 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed -bottom-40 right-1/4 w-[520px] h-[340px] bg-cyan-500/6 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Navigation */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        missionsCount={Object.keys(folderReferences).length}
        roundsCount={rounds.length}
        isAiReady={isAiReady}
        cloudUserEmail={cloudUser?.email || null}
        onCloudAction={() => {
          if (cloudUser) {
            setActiveTab('history');
          } else {
            void handleConnectCloud();
          }
        }}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'analyze' && (
          <SimpleVideoAnalysisView
            references={folderReferences}
            isAiReady={isAiReady}
            isLoadingDriveGabarito={isLoadingDriveGabarito}
            trainingExamples={trainingExamples}
            cloudUserEmail={cloudUser?.email || null}
            onQuickSaveApiKey={handleQuickSaveApiKey}
            onLoadTeamDriveGabarito={handleLoadTeamDriveGabarito}
            onSaveTrainingExamples={handleSaveTrainingExamples}
            onDeleteTrainingExample={handleDeleteTrainingExample}
            onImportTrainingBackup={handleImportBackup}
            onConnectCloud={handleConnectCloud}
            onNavigateToFolders={() => setActiveTab('folders')}
            onNavigateToApi={() => setActiveTab('api')}
            onSaveToHistory={handleSaveToHistory}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'folders' && (
          <FolderReferenceView
            references={folderReferences}
            onReferencesUpdated={handleUpdateReferences}
            onNavigateToAnalyze={() => setActiveTab('analyze')}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'history' && (
          <HistoryView
            rounds={rounds}
            missions={missions}
            trainingCount={trainingExamples.length}
            cloudUserEmail={cloudUser?.email || null}
            onConnectCloud={handleConnectCloud}
            onDisconnectCloud={handleDisconnectCloud}
            onImportBackup={handleImportBackup}
            onEditRound={() => setActiveTab('analyze')}
            onDeleteRound={handleDeleteRound}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'api' && (
          <ApiSettingsView
            isAiReady={isAiReady}
            onShowToast={showToast}
            onApiKeySaved={(_key, isValid) => {
              setIsAiReady(isValid);
            }}
          />
        )}
      </main>

      {/* Clean Minimal Footer */}
      <footer className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 border-t border-white/[0.06] text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span className="font-medium text-slate-300">FrancoDroid FLL Analytics</span>
        <span className="text-slate-500">Temporada BIOGLOW · Arbitragem por Visão Computacional</span>
      </footer>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
