import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado na aplicação.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      let friendlyMsg = this.state.errorMessage;
      try {
        const parsed = JSON.parse(this.state.errorMessage);
        if (parsed?.error) {
          friendlyMsg = `Erro de sincronização (${parsed.operationType}): ${parsed.error}`;
        }
      } catch {
        // plain error message
      }

      return (
        <div className="min-h-screen bg-[#060911] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl border border-rose-500/35 bg-slate-900/90 p-6 space-y-4 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6 text-rose-300" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-bold text-white">Algo interrompeu a tela</h2>
              <p className="text-xs text-slate-300 leading-relaxed break-words">{friendlyMsg}</p>
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Recarregar Sistema</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
