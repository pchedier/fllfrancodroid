import React, { useState, useEffect } from 'react';
import { Download, Share2, X, Smartphone, Sparkles, Check, ExternalLink } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [copiedLink, setCopiedLink] = useState(false);
  const [shareableUrl, setShareableUrl] = useState('');

  useEffect(() => {
    // Generate clean public shareable URL
    // Replace ais-dev- with ais-pre- so anyone can access without 403 / permission error
    const current = window.location.href;
    const cleanPublic = current.replace('ais-dev-', 'ais-pre-');
    setShareableUrl(cleanPublic);
  }, []);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    const urlToCopy = shareableUrl || window.location.href;
    navigator.clipboard.writeText(urlToCopy);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="ios-glass rounded-[32px] p-6 sm:p-7 max-w-md w-full space-y-5 animate-in zoom-in-95 duration-200 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-2xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Instalar no Celular ou PC</h3>
              <span className="text-[11px] text-slate-400">iOS, Android, Mac & PC</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="space-y-3 text-xs">
          {/* iOS Safari Instructions */}
          <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-white font-medium">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-[10px] font-mono">
                1
              </span>
              <span>No iPhone ou iPad (Safari)</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed pl-7">
              Abra no <strong>Safari</strong> do seu iPhone, toque no botão <strong>Compartilhar</strong> (ícone de quadrado com seta para cima ⎋) e escolha <strong>"Adicionar à Tela de Início"</strong>.
            </p>
          </div>

          {/* Android / Chrome Instructions */}
          <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10 space-y-2">
            <div className="flex items-center gap-2 text-white font-medium">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[10px] font-mono">
                2
              </span>
              <span>No Android ou Computador (Chrome / Edge)</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed pl-7">
              Toque no menu de 3 pontinhos do navegador e clique em <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela principal"</strong>.
            </p>

            {isInstallable && (
              <div className="pl-7 pt-1">
                <button
                  onClick={() => {
                    install();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-full bg-cyan-400 text-black font-semibold text-xs shadow-lg shadow-cyan-400/20 ios-pressable flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Instalar Agora Direto</span>
                </button>
              </div>
            )}
          </div>

          {/* Public Link Share */}
          <div className="p-3.5 rounded-2xl bg-white/[0.035] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white font-medium block">Link de Acesso Livre</span>
              <span className="text-[10px] text-emerald-400 font-mono">Sem erro 403</span>
            </div>
            <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-black/40 border border-white/5">
              <span className="text-[11px] text-slate-300 font-mono truncate max-w-[240px] block">
                {shareableUrl || window.location.href}
              </span>
              <button
                onClick={handleCopyLink}
                className="px-3 py-1 rounded-full bg-white text-black font-semibold text-[11px] flex items-center gap-1.5 ios-pressable shrink-0"
              >
                {copiedLink ? <Check className="w-3 h-3 text-emerald-600" /> : <Share2 className="w-3 h-3" />}
                <span>{copiedLink ? 'Copiado!' : 'Copiar'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-all ios-pressable"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
