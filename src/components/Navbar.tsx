import React, { useState } from 'react';
import {
  FolderOpen,
  Trophy,
  Bot,
  Video,
  Key,
} from 'lucide-react';

export type TabKey = 'analyze' | 'folders' | 'history' | 'api';

interface NavbarProps {
  activeTab: TabKey;
  onSelectTab: (tab: TabKey) => void;
  missionsCount: number;
  roundsCount: number;
  isAiReady?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onSelectTab,
  missionsCount,
  roundsCount,
  isAiReady = false,
}) => {
  const tabs = [
    { key: 'analyze' as TabKey, label: 'Vídeo do Round', icon: Video },
    { key: 'folders' as TabKey, label: 'Pastas de Gabarito', icon: FolderOpen, badge: missionsCount },
    { key: 'history' as TabKey, label: 'Histórico & Rounds', icon: Trophy, badge: roundsCount },
    { key: 'api' as TabKey, label: 'Configurar IA', icon: Key },
  ];

  return (
    <header className="sticky top-0 z-40 w-full px-4 sm:px-6 pt-3 pb-2">
      <div className="max-w-4xl mx-auto">
        {/* iOS Dynamic Island Floating Capsule - Clean, minimal, aligned */}
        <div className="ios-glass rounded-[26px] px-3 sm:px-5 h-14 flex items-center justify-between transition-all">
          {/* Logo / Brand */}
          <button
            onClick={() => onSelectTab('analyze')}
            className="flex items-center gap-2 group focus:outline-none ios-pressable px-1.5 py-1 rounded-2xl"
          >
            <div className="w-7 h-7 rounded-[9px] bg-gradient-to-b from-cyan-400/20 to-cyan-500/5 border border-white/15 flex items-center justify-center shadow-inner group-hover:border-cyan-400/40 transition-colors">
              <Bot className="w-3.5 h-3.5 text-cyan-300" />
            </div>
            <span className="font-semibold text-xs tracking-tight text-white hidden sm:inline">
              FrancoDroid
            </span>
          </button>

          {/* Symmetrical Apple Segmented Control */}
          <nav className="flex items-center p-1 rounded-full bg-black/40 border border-white/5 shadow-inner">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => onSelectTab(tab.key)}
                  className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 select-none ios-pressable ${
                    isActive
                      ? 'ios-pill-active text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-cyan-300' : 'text-slate-400'}`} />
                  <span className="hidden md:inline">{tab.label}</span>
                  {typeof tab.badge === 'number' && tab.badge > 0 && (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-cyan-400/25 text-cyan-200 border border-cyan-400/30' : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* REAL AI Status Indicator Capsule (Clickable -> leads to Configurar IA) */}
          <button
            onClick={() => onSelectTab('api')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-mono transition-all ios-pressable ${
              isAiReady
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/15'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300 hover:bg-rose-500/15'
            }`}
            title={isAiReady ? 'IA Conectada com chave válida' : 'IA Não Conectada - Clique para inserir chave'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isAiReady
                  ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)] animate-pulse'
                  : 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.9)]'
              }`}
            />
            <span className="text-[11px] font-medium">
              {isAiReady ? 'IA Conectada' : 'IA Não Conectada'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
