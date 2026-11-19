import React, { useState, useEffect } from 'react';
import {
  Key,
  ExternalLink,
  Check,
  AlertCircle,
  Sparkles,
  Eye,
  EyeOff,
  Trash2,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { hasBackendServer, validateGeminiKeyDirect } from '../services/clientAiEngine';

interface ApiSettingsViewProps {
  isAiReady?: boolean;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  onApiKeySaved?: (key: string, isValid: boolean) => void;
}

export const API_KEY_STORAGE_KEY = 'francodroid_user_gemini_api_key';

export const ApiSettingsView: React.FC<ApiSettingsViewProps> = ({
  isAiReady = false,
  onShowToast,
  onApiKeySaved,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState<'idle' | 'valid' | 'invalid'>(
    isAiReady ? 'valid' : 'idle'
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem(API_KEY_STORAGE_KEY) || '';
      if (stored) {
        setSavedKey(stored);
        setApiKey(stored);
        if (isAiReady) {
          setValidationStatus('valid');
        } else {
          void validateKeyOnServer(stored);
        }
      }
    } catch {
      // localStorage fallback
    }
  }, [isAiReady]);

  const validateKeyOnServer = async (
    keyToValidate: string
  ): Promise<{ valid: boolean; message?: string; quotaWarning?: boolean }> => {
    if (!keyToValidate.trim()) {
      setValidationStatus('idle');
      return { valid: false };
    }

    setIsValidating(true);
    try {
      let data: { valid: boolean; message?: string; quotaWarning?: boolean };
      if (await hasBackendServer()) {
        const res = await fetch('./api/ai/validate-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: keyToValidate.trim() }),
        });
        data = await res.json();
        if (!res.ok && !data?.valid) {
          setValidationStatus('invalid');
          onApiKeySaved?.(keyToValidate.trim(), false);
          return { valid: false, message: data?.message };
        }
      } else {
        data = await validateGeminiKeyDirect(keyToValidate.trim());
      }

      if (data.valid) {
        setValidationStatus('valid');
        onApiKeySaved?.(keyToValidate.trim(), true);
        return { valid: true, message: data.message, quotaWarning: Boolean(data.quotaWarning) };
      } else {
        setValidationStatus('invalid');
        onApiKeySaved?.(keyToValidate.trim(), false);
        return { valid: false, message: data.message };
      }
    } catch {
      setValidationStatus('invalid');
      onApiKeySaved?.(keyToValidate.trim(), false);
      return { valid: false, message: 'Erro de rede ao validar chave.' };
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

    const validation = await validateKeyOnServer(trimmed);

    if (validation.valid) {
      try {
        localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
        setSavedKey(trimmed);
        onShowToast(
          validation.message || 'Chave Gemini válida e conectada com sucesso!',
          validation.quotaWarning ? 'info' : 'success'
        );
      } catch {
        onShowToast('Chave válida, mas falha ao gravar no navegador.', 'error');
      }
    } else {
      onShowToast(
        validation.message || 'Chave inválida. Verifique se copiou a chave inteira do Google AI Studio.',
        'error'
      );
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
    <div className="max-w-3xl mx-auto space-y-6 fd-fade-up">
      {/* Clean Header */}
      <div className="text-center space-y-2 py-1">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
          Conectar Inteligência Artificial
        </h1>
        <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
          Cole sua chave gratuita do Google AI Studio para ativar a análise de vídeo e comparação visual com o gabarito.
        </p>
      </div>

      {/* API Key Input Card */}
      <div className="fd-panel rounded-3xl p-6 sm:p-7 space-y-5">
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
              <Key className="w-4 h-4 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Chave da API Gemini</h3>
              <span className="text-xs text-slate-400">Verificação em tempo real</span>
            </div>
          </div>

          <div className="text-xs font-mono">
            {isValidating ? (
              <span className="text-cyan-300 flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Testando...
              </span>
            ) : validationStatus === 'valid' ? (
              <span className="text-emerald-300 flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Conectada
              </span>
            ) : validationStatus === 'invalid' ? (
              <span className="text-rose-300 flex items-center gap-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 text-rose-400" />
                Inválida
              </span>
            ) : (
              <span className="text-slate-400">Não configurada</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs text-slate-300 font-medium block">
            Cole sua chave de API:
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setValidationStatus('idle');
              }}
              placeholder="Cole aqui sua chave do Google AI Studio..."
              className="w-full bg-black/50 border border-white/15 rounded-xl pl-4 pr-12 py-3 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 font-mono transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-white transition-colors"
              aria-label={showKey ? 'Ocultar chave' : 'Mostrar chave'}
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
            className={`px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
              isValidating || !apiKey.trim()
                ? 'bg-white/10 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 hover:brightness-105 shadow-lg shadow-cyan-500/20'
            }`}
          >
            {isValidating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Testando...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Salvar e Validar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tutorial */}
      <div className="fd-panel rounded-3xl p-6 sm:p-7 space-y-4 text-xs">
        <div className="flex items-center gap-2 text-white font-semibold text-sm">
          <Sparkles className="w-4 h-4 text-cyan-300" />
          <span>Como obter sua chave gratuita do Google Gemini</span>
        </div>

        <div className="space-y-2.5">
          <div className="fd-card rounded-2xl p-4 flex items-start gap-3">
            <span className="font-mono font-bold text-cyan-300 shrink-0">01.</span>
            <div className="space-y-1 flex-1">
              <span className="text-white font-semibold block">Acesse o Google AI Studio</span>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-300 hover:text-cyan-200 underline font-mono inline-flex items-center gap-1 break-all"
              >
                https://aistudio.google.com/app/apikey
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
            </div>
          </div>

          <div className="fd-card rounded-2xl p-4 flex items-start gap-3">
            <span className="font-mono font-bold text-cyan-300 shrink-0">02.</span>
            <div className="space-y-1">
              <span className="text-white font-semibold block">Entre com sua conta Google</span>
              <p className="text-slate-300 leading-relaxed">
                O acesso gratuito permite que cada membro da equipe crie sua própria chave para escanear os rounds.
              </p>
            </div>
          </div>

          <div className="fd-card rounded-2xl p-4 flex items-start gap-3">
            <span className="font-mono font-bold text-cyan-300 shrink-0">03.</span>
            <div className="space-y-1">
              <span className="text-white font-semibold block">Clique em "Create API key"</span>
              <p className="text-slate-300 leading-relaxed">
                Copie a chave gerada e cole no campo acima para liberar as análises imediatamente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
