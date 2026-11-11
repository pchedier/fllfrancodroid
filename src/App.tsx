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
  const [missions, setMissions] = useState<Mission[]>(() => StorageService.getMissions());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isAiReady, setIsAiReady] = useState(false);

  // Folder references state (M01 -> completa, parcial, incompleta)
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

  // Save folder references to localStorage
  const handleUpdateReferences = (updated: Record<string, FolderMissionReference>) => {
    setFolderReferences(updated);
    try {
      const lightweight: Record<string, any> = {};
      Object.keys(updated).forEach((k) => {
        const item = updated[k];
        const serializedTiers: Record<string, any> = {};
        if (item.pointTiers) {
          Object.entries(item.pointTiers).forEach(([tKey, tVal]) => {
            serializedTiers[tKey] = {
              label: tVal.label,
              points: tVal.points,
              files: tVal.files.map((f) => ({ name: f.name, url: f.url, points: f.points, tierLabel: f.tierLabel })),
            };
          });
        }

        lightweight[k] = {
          missionCode: item.missionCode,
          completaFiles: item.completaFiles.map((f) => ({ name: f.name, url: f.url, points: f.points, tierLabel: f.tierLabel })),
          parcialFiles: item.parcialFiles.map((f) => ({ name: f.name, url: f.url, points: f.points, tierLabel: f.tierLabel })),
          incompletaFiles: item.incompletaFiles.map((f) => ({ name: f.name, url: f.url, points: f.points, tierLabel: f.tierLabel })),
          pointTiers: serializedTiers,
        };
      });
      localStorage.setItem(LOCAL_FOLDER_STORAGE_KEY, JSON.stringify(lightweight));
    } catch (e) {
      console.warn('LocalStorage limit for folder refs:', e);
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
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      {/* Symmetrical Apple Ambient Glow Orbs */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] bg-gradient-to-b from-cyan-500/10 via-indigo-500/5 to-transparent rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed -bottom-40 left-1/4 w-[500px] h-[350px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="fixed -bottom-40 right-1/4 w-[500px] h-[350px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Floating Apple Glass Navbar */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        missionsCount={Object.keys(folderReferences).length}
        roundsCount={rounds.length}
        isAiReady={isAiReady}
      />

      {/* Main Symmetrical Container */}
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

      {/* Apple Minimalist Symmetrical Footer */}
      <footer className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 border-t border-white/[0.06] text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-300">FrancoDroid FLL Analytics</span>
          <span className="text-white/20">•</span>
          <span>Visão Computacional & Telemetria</span>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span>Gabarito Multi-Pastas</span>
          <span className="text-white/20">•</span>
          <span>Apple Glass Interface</span>
        </div>
      </footer>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
