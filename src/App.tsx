import React, { useState, useEffect } from 'react';
import { Navbar, TabKey } from './components/Navbar';
import { SimpleVideoAnalysisView } from './components/SimpleVideoAnalysisView';
import { FolderReferenceView, FolderMissionReference } from './components/FolderReferenceView';
import { HistoryView } from './components/HistoryView';
import { ApiSettingsView } from './components/ApiSettingsView';
import { ToastContainer, ToastMessage } from './components/Toast';
import { StorageService } from './services/storageService';
import { Round, Mission } from './types/fll';

const LOCAL_FOLDER_STORAGE_KEY = 'francodroid_fll_folder_refs_v2';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabKey>('analyze');
  const [rounds, setRounds] = useState<Round[]>(() => StorageService.getRounds());
  const [missions] = useState<Mission[]>(() => StorageService.getMissions());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isAiReady, setIsAiReady] = useState(false);

  // Folder references state
  const [folderReferences, setFolderReferences] = useState<Record<string, FolderMissionReference>>(() => {
    try {
      const data = localStorage.getItem(LOCAL_FOLDER_STORAGE_KEY);
      return data ? JSON.parse(data) : {};
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

  // Check user API key & AI status
  useEffect(() => {
    const checkKeyStatus = async () => {
      const userKey = localStorage.getItem('francodroid_user_gemini_api_key');
      if (userKey && userKey.trim()) {
        try {
          const res = await fetch('/api/ai/validate-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: userKey.trim() }),
          });
          const data = await res.json();
          setIsAiReady(Boolean(data.valid));
          return;
        } catch {
          setIsAiReady(false);
          return;
        }
      }
      setIsAiReady(false);
    };

    checkKeyStatus();
  }, []);

  // Save folder references to localStorage (keeps compressed base64 when within quota, falls back cleanly)
  const handleUpdateReferences = (updated: Record<string, FolderMissionReference>) => {
    setFolderReferences(updated);

    const serialize = (includeBase64: boolean) => {
      const result: Record<string, any> = {};
      Object.keys(updated).forEach((k) => {
        const item = updated[k];
        const mapFile = (f: any) => ({
          name: f.name,
          url: includeBase64 && f.base64 ? f.base64 : f.url,
          base64: includeBase64 ? f.base64 : undefined,
          points: f.points,
          tierLabel: f.tierLabel,
        });

        const serializedTiers: Record<string, any> = {};
        if (item.pointTiers) {
          Object.entries(item.pointTiers).forEach(([tKey, tVal]) => {
            serializedTiers[tKey] = {
              label: tVal.label,
              points: tVal.points,
              files: tVal.files.map(mapFile),
            };
          });
        }

        result[k] = {
          missionCode: item.missionCode,
          completaFiles: item.completaFiles.map(mapFile),
          parcialFiles: item.parcialFiles.map(mapFile),
          incompletaFiles: item.incompletaFiles.map(mapFile),
          pointTiers: serializedTiers,
        };
      });
      return result;
    };

    try {
      localStorage.setItem(LOCAL_FOLDER_STORAGE_KEY, JSON.stringify(serialize(true)));
    } catch {
      try {
        localStorage.setItem(LOCAL_FOLDER_STORAGE_KEY, JSON.stringify(serialize(false)));
      } catch (e) {
        console.warn('LocalStorage limit for folder refs:', e);
      }
    }
  };

  // Save Round to History
  const handleSaveToHistory = (roundToSave: Round) => {
    const { updated, newRound } = StorageService.addRound(roundToSave);
    setRounds(updated);
    showToast(`Round #${newRound.roundNumber} gravado com sucesso (${newRound.totalScore} pts)!`, 'success');
    setActiveTab('history');
  };

  const handleDeleteRound = (id: string) => {
    const updated = StorageService.deleteRound(id);
    setRounds(updated);
    showToast('Round removido do histórico com sucesso!', 'info');
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
      />

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'analyze' && (
          <SimpleVideoAnalysisView
            references={folderReferences}
            isAiReady={isAiReady}
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
            onEditRound={() => setActiveTab('analyze')}
            onDeleteRound={handleDeleteRound}
            onShowToast={showToast}
          />
        )}

        {activeTab === 'api' && (
          <ApiSettingsView
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
