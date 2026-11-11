import React, { useState, useEffect } from 'react';
import { Key, ShieldCheck, ExternalLink, Check, Copy, AlertCircle, Sparkles, Eye, EyeOff, Trash2, Loader2, CheckCircle2 } from 'lucide-react';

interface ApiSettingsViewProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onApiKeySaved?: (key: string, isValid: boolean) => void;
}

export const API_KEY_STORAGE_KEY = 'francodroid_user_gemini_api_key';

export const ApiSettingsView: React.FC<ApiSettingsViewProps> = ({ onShowToast, onApiKeySaved }) => {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>('idle');

  useEffect(() => {
    try {
      const stored = localStorage.getItem(API_KEY_STORAGE_KEY) || '';
      if (stored) {
        setSavedKey(stored);
        setApiKey(stored);
        // Automatically validate existing key
        validateKeyOnServer(stored);
      }
    } catch {
      // localStorage fallback
    }
  }, []);

  const validateKeyOnServer = async (keyToValidate: string) => {
    if (!keyToValidate.trim()) {
      setValidationStatus('idle');
      return false;
    }

    setIsValidating(true);
    try {
      const res = await fetch('/api/ai/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToValidate.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.valid) {
        setValidationStatus('valid');
        onApiKeySaved?.(keyToValidate.trim(), true);
        return true;
      } else {
        setValidationStatus('invalid');
        onApiKeySaved?.(keyToValidate.trim(), false);
        return false;
      }
    } catch {
      setValidationStatus('invalid');
      onApiKeySaved?.(keyToValidate.trim(), false);
      return false;
    } finally {
      setIsValidating(false);
    }
  };

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      handleClear();
      return;
    }

    setIsValidating(true);
    onShowToast('Testando conexão com a API Gemini...', 'info');

    const isValid = await validateKeyOnServer(trimmed);

    if (isValid) {
      try {
        localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
        setSavedKey(trimmed);
        onShowToast('Chave Gemini válida e conectada com sucesso!', 'success');
      } catch {
        onShowToast('Chave válida, mas falha ao gravar no navegador.', 'error');
      }
    } else {
      onShowToast('Chave inválida. Verifique se copiou a chave inteira do Google AI Studio.', 'error');
    }
  };

  const handleClear = () => {
    setApiKey('');
    setSavedKey('');
    setValidationStatus('idle');
    try {
      localStorage.removeItem(API_KEY_STORAGE_KEY);
      onShowToast('Chave removida.', 'info');
      onApiKeySaved?.('', false);
    } catch {}
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Symmetrical Hero Header */}
      <div className="text-center space-y-2 py-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full ios-subtle text-[11px] font-mono text-cyan-300">
          <Key className="w-3.5 h-3.5 text-cyan-400" />
          <span>Configuração da Chave Gemini</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-white">
          Conectar Inteligência Artificial
        </h1>
        <p className="text-slate-400 text-xs sm:text-sm max-w-md mx-auto leading-relaxed">
          Cole sua chave de API para habilitar a análise de vídeo do robô. O indicador no topo mostrará se ela está realmente conectada.
        </p>
      </div>

      {/* API Key Input Card with Real Validation */}
      <div className="ios-glass rounded-[28px] p-6 sm:p-7 space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
              <Key className="w-4 h-4 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Chave da API Gemini</h3>
              <span className="text-[11px] text-slate-400">Verificação ativa em tempo real</span>
            </div>
          </div>

          <div>
            {isValidating ? (
              <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-300 text-[10px] font-mono flex items-center gap-1.5">
                <Loader2 className="w-3 h-3 animate-spin" />
                Testando chave...
              </span>
            ) : validationStatus === 'valid' ? (
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                Conectada & Válida
              </span>
            ) : validationStatus === 'invalid' ? (
              <span className="px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[10px] font-mono flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                Chave Inválida
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-slate-400 text-[10px] font-mono">
                Não configurada
              </span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-300 font-medium block">
            Cole sua chave API (começa com <code className="text-cyan-300 font-mono">AIzaSy...</code>):
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setValidationStatus('idle');
              }}
              placeholder="Cole aqui sua chave: AIzaSyA1B2C3D4E5F6G7H8I9J0..."
              className="w-full bg-black/40 border border-white/10 rounded-2xl pl-4 pr-12 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {savedKey ? (
            <button
              onClick={handleClear}
              className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remover Chave</span>
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={handleSave}
            disabled={isValidating || !apiKey.trim()}
            className={`px-6 py-2.5 rounded-full text-xs font-semibold shadow-lg transition-all ios-pressable flex items-center gap-2 ${
              isValidating || !apiKey.trim()
                ? 'bg-white/10 text-slate-500 cursor-not-allowed'
                : 'bg-white text-black hover:bg-slate-100 shadow-white/10'
            }`}
          >
            {isValidating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Testando...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Salvar & Validar Chave</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tutorial: Como obter chave gratuita no AI Studio */}
      <div className="ios-glass rounded-[28px] p-6 sm:p-7 space-y-4 text-xs">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Sparkles className="w-4 h-4 text-cyan-300" />
          <span>Onde e Como Obter Sua Chave Gemini (Gratuita)</span>
        </div>

        <div className="space-y-3 pt-1">
          <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10 flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-mono text-[10px] shrink-0 mt-0.5">
              1
            </span>
            <div className="space-y-1 flex-1">
              <span className="text-white font-medium block">Acesse o Google AI Studio:</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 hover:text-cyan-200 underline font-mono text-[11px] inline-flex items-center gap-1 break-all"
              >
                https://aistudio.google.com/app/apikey
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10 flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-mono text-[10px] shrink-0 mt-0.5">
              2
            </span>
            <div className="space-y-1">
              <span className="text-white font-medium block">Faça login com sua conta Google</span>
              <p className="text-slate-300 leading-relaxed">
                Entre com seu Gmail. O serviço é liberado gratuitamente pela Google para testes e projetos.
              </p>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10 flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center font-mono text-[10px] shrink-0 mt-0.5">
              3
            </span>
            <div className="space-y-1">
              <span className="text-white font-medium block">Clique em "Create API key"</span>
              <p className="text-slate-300 leading-relaxed">
                Copie a chave gerada (começa com <code className="text-cyan-300 font-mono">AIzaSy...</code>) e cole no campo acima.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
