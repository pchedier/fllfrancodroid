import React from 'react';
import {
  FolderOpen,
  Trophy,
  Bot,
  Video,
  Key,
  Cloud,
  CloudOff,
} from 'lucide-react';

export type TabKey = 'analyze' | 'folders' | 'history' | 'api';

interface NavbarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  missionsCount: number;
  roundsCount: number;
  isAiReady?: boolean;
  cloudUserEmail?: string | null;
  onCloudAction?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  missionsCount,
  roundsCount,
  isAiReady = false,
  cloudUserEmail = null,
  onCloudAction,
}) => {
  const tabs = [
    { key: 'analyze' as TabKey, label: 'Vídeo do Round', icon: Video },
    { key: 'folders' as TabKey, label: 'Pastas de Gabarito', icon: FolderOpen, count: missionsCount },
    { key: 'history' as TabKey, label: 'Histórico', icon: Trophy, count: roundsCount },
    { key: 'api' as TabKey, label: 'Configurar IA', icon: Key },
  ];

  return (
    <header className="sticky top-0 z-40 w-full px-4 sm:px-6 pt-3 pb-2">
      <div className="max-w-5xl mx-auto">
        <div className="fd-panel rounded-2xl px-3 sm:px-5 h-14 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand Zone */}
          <button
            onClick={() => onSelectTab('analyze')}
            className="flex items-center gap-2.5 group focus:outline-none whitespace-nowrap shrink-0"
          >
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-400/25 to-emerald-400/20 border border-cyan-400/30 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Bot className="w-4 h-4 text-cyan-300" />
            </div>
            <span className="font-bold text-sm tracking-tight text-white hidden sm:inline">
              FrancoDroid
            </span>
          </button>

          {/* Navigation Links */}
          <nav className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/10">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => onSelectTab(tab.key)}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 whitespace-nowrap shrink-0 ${
                    isActive
                      ? 'fd-tab-active text-white'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-300' : 'text-slate-400'}`} />
                  <span className="hidden md:inline">{tab.label}</span>
                  {typeof tab.count === 'number' && tab.count > 0 && (
                    <span
                      className={`text-[10px] font-mono ${
                        isActive ? 'text-cyan-300' : 'text-slate-500'
                      }`}
                    >
                      ({tab.count})
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Status Actions */}
          <div className="flex items-center gap-1.5 shrink-0">
            {onCloudAction && (
              <button
                type="button"
                onClick={onCloudAction}
                title={
                  cloudUserEmail
                    ? `Backup na nuvem ativo (${cloudUserEmail}). Clique para gerenciar.`
                    : 'Salvar Histórico e Treinos da IA na Nuvem Google (não apaga ao atualizar)'
                }
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-medium transition-all whitespace-nowrap ${
                  cloudUserEmail
                    ? 'bg-cyan-500/15 border-cyan-400/35 text-cyan-200 hover:bg-cyan-500/25'
                    : 'bg-white/[0.04] border-white/15 text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                {cloudUserEmail ? (
                  <Cloud className="w-3.5 h-3.5 text-cyan-300" />
                ) : (
                  <CloudOff className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span className="hidden sm:inline">
                  {cloudUserEmail ? 'Nuvem Salva' : 'Entrar Google'}
                </span>
              </button>
            )}

            <button
              onClick={() => onSelectTab('api')}
              className={`flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
                isAiReady
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/20'
              }`}
              title={
                isAiReady
                  ? 'IA Conectada com chave válida'
                  : 'IA Não Conectada - Clique para inserir chave'
              }
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  isAiReady
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]'
                    : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]'
                }`}
              />
              <span className="hidden sm:inline">
                {isAiReady ? 'IA Conectada' : 'IA Desconectada'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
