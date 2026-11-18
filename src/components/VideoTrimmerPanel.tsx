import React, { useState, useRef, useEffect } from 'react';
import {
  Scissors,
  Play,
  Square,
  Check,
  X,
  Sparkles,
  Loader2,
  Gauge,
  AlertTriangle,
} from 'lucide-react';

interface VideoTrimmerPanelProps {
  file: File;
  previewUrl: string;
  duration: number;
  width: number;
  height: number;
  onApplyTrimmed: (
    trimmedFile: File,
    info: { originalSizeMb: number; newSizeMb: number; startSec: number; endSec: number }
  ) => void;
  onCancel: () => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const formatSec = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
};

export const VideoTrimmerPanel: React.FC<VideoTrimmerPanelProps> = ({
  file,
  previewUrl,
  duration,
  width,
  height,
  onApplyTrimmed,
  onCancel,
  onShowToast,
}) => {
  const safeDuration = Math.max(1, duration || 1);
  const [startSec, setStartSec] = useState<number>(0);
  const [endSec, setEndSec] = useState<number>(Math.min(safeDuration, 45));
  const [quality, setQuality] = useState<'720p' | '480p'>(
    file.size > 40 * 1024 * 1024 ? '480p' : '720p'
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState('');

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const cancelFlagRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  useEffect(() => {
    setStartSec(0);
    setEndSec(safeDuration > 45 ? 45 : safeDuration);
  }, [safeDuration]);

  const clipDuration = Math.max(1, endSec - startSec);
  const originalSizeMb = file.size / (1024 * 1024);
  const estimatedBitrateMbps = quality === '720p' ? 1.1 : 0.65;
  const estimatedOutputMb = Math.max(0.3, (clipDuration * estimatedBitrateMbps) / 8);

  const handleStartChange = (val: number) => {
    const clamped = Math.min(Math.max(0, val), Math.max(0, endSec - 1));
    setStartSec(clamped);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = clamped;
    }
  };

  const handleEndChange = (val: number) => {
    const clamped = Math.max(Math.min(safeDuration, val), Math.min(safeDuration, startSec + 1));
    setEndSec(clamped);
    if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = clamped;
    }
  };

  const applyPreset = (type: 'first30' | 'last30' | 'full') => {
    if (type === 'first30') {
      setStartSec(0);
      setEndSec(Math.min(safeDuration, 30));
      if (previewVideoRef.current) previewVideoRef.current.currentTime = 0;
    } else if (type === 'last30') {
      const s = Math.max(0, safeDuration - 30);
      setStartSec(s);
      setEndSec(safeDuration);
      if (previewVideoRef.current) previewVideoRef.current.currentTime = s;
    } else {
      setStartSec(0);
      setEndSec(safeDuration);
      if (previewVideoRef.current) previewVideoRef.current.currentTime = 0;
    }
  };

  const handleAbortProcessing = () => {
    cancelFlagRef.current = true;
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch {
      // ignore
    }
    setIsProcessing(false);
    setProgress(0);
    onShowToast('Corte cancelado.', 'info');
  };

  const handleProcessTrim = async () => {
    if (typeof MediaRecorder === 'undefined') {
      onShowToast(
        'Seu navegador não suporta corte de vídeo integrado. Tente cortar no celular ou usar Chrome/Edge.',
        'error'
      );
      return;
    }

    cancelFlagRef.current = false;
    setIsProcessing(true);
    setProgress(2);
    setStatusLabel('Preparando motor de vídeo...');

    const workVideo = document.createElement('video');
    workVideo.muted = true;
    workVideo.playsInline = true;
    workVideo.preload = 'auto';
    workVideo.src = previewUrl;

    try {
      await new Promise<void>((resolve, reject) => {
        workVideo.onloadeddata = () => resolve();
        workVideo.onerror = () => reject(new Error('Falha ao carregar vídeo para corte.'));
      });

      const srcW = workVideo.videoWidth || width || 1280;
      const srcH = workVideo.videoHeight || height || 720;
      const maxDim = quality === '720p' ? 1280 : 854;
      const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
      // Ensure even dimensions for hardware encoders
      const targetW = Math.max(2, Math.floor((srcW * scale) / 2) * 2);
      const targetH = Math.max(2, Math.floor((srcH * scale) / 2) * 2);

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Contexto gráfico indisponível no navegador.');

      const mimeCandidates = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ];
      const chosenMime =
        mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

      const stream = canvas.captureStream(20);
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: quality === '720p' ? 1_100_000 : 650_000,
      };
      if (chosenMime) recorderOptions.mimeType = chosenMime;

      const recorder = new MediaRecorder(stream, recorderOptions);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data);
        }
      };

      const recordingDone = new Promise<Blob>((resolve, reject) => {
        recorder.onstop = () => {
          if (cancelFlagRef.current) {
            reject(new Error('CANCELLED'));
            return;
          }
          const finalMime = recorder.mimeType || chosenMime || 'video/webm';
          resolve(new Blob(chunks, { type: finalMime }));
        };
        recorder.onerror = () => reject(new Error('Erro durante a gravação do trecho.'));
      });

      // Seek to start time
      workVideo.currentTime = startSec;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          workVideo.removeEventListener('seeked', onSeeked);
          resolve();
        };
        workVideo.addEventListener('seeked', onSeeked);
      });

      recorder.start(250);
      setStatusLabel(`Gravando trecho (${formatSec(clipDuration)})...`);
      await workVideo.play();

      let rafId = 0;
      const drawFrame = () => {
        if (cancelFlagRef.current) {
          workVideo.pause();
          return;
        }

        ctx.drawImage(workVideo, 0, 0, targetW, targetH);
        const elapsed = Math.max(0, workVideo.currentTime - startSec);
        const pct = Math.min(98, Math.round((elapsed / clipDuration) * 100));
        setProgress(pct);
        setStatusLabel(
          `Cortando trecho: ${formatSec(elapsed)} / ${formatSec(clipDuration)} (${pct}%)`
        );

        if (workVideo.currentTime >= endSec || workVideo.ended) {
          workVideo.pause();
          if (recorder.state !== 'inactive') {
            recorder.stop();
          }
          return;
        }
        rafId = requestAnimationFrame(drawFrame);
      };

      rafId = requestAnimationFrame(drawFrame);

      const blob = await recordingDone;
      cancelAnimationFrame(rafId);

      const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const trimmedFile = new File([blob], `${baseName}_corte_${quality}.${ext}`, {
        type: blob.type || 'video/webm',
      });

      const newSizeMb = trimmedFile.size / (1024 * 1024);
      setProgress(100);
      setStatusLabel('Pronto!');

      onApplyTrimmed(trimmedFile, {
        originalSizeMb,
        newSizeMb,
        startSec,
        endSec,
      });
    } catch (err: any) {
      if (err?.message !== 'CANCELLED') {
        console.error('Video trim error:', err);
        onShowToast(
          err?.message || 'Não foi possível cortar o vídeo neste navegador.',
          'error'
        );
      }
    } finally {
      workVideo.pause();
      workVideo.src = '';
      recorderRef.current = null;
      setIsProcessing(false);
    }
  };

  return (
    <div className="fd-card rounded-2xl p-4 sm:p-5 border border-cyan-500/35 bg-slate-950/85 space-y-4 fd-fade-up text-left">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
            <Scissors className="w-4 h-4 text-cyan-300" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">Cortar e Otimizar Vídeo</h4>
            <p className="text-[11px] text-slate-400">
              Recorte apenas a saída do robô ou reduza o peso para envio ultra-rápido à IA
            </p>
          </div>
        </div>
        {!isProcessing && (
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar cortador"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Scrub Preview Video */}
      <div className="rounded-xl overflow-hidden bg-black border border-white/10">
        <video
          ref={previewVideoRef}
          src={previewUrl}
          controls={!isProcessing}
          className="w-full max-h-52 object-contain mx-auto"
        />
      </div>

      {/* Quick Presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-400 font-medium mr-1">Atalhos:</span>
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => applyPreset('first30')}
          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 font-mono transition-colors disabled:opacity-40"
        >
          Primeiros 30s
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => applyPreset('last30')}
          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 font-mono transition-colors disabled:opacity-40"
        >
          Últimos 30s
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={() => applyPreset('full')}
          className="px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/10 border border-white/10 text-[11px] text-slate-200 font-mono transition-colors disabled:opacity-40"
        >
          Vídeo inteiro ({formatSec(safeDuration)})
        </button>
      </div>

      {/* Dual Range Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/[0.02] p-3.5 rounded-xl border border-white/10">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">Início do Corte</span>
            <span className="font-mono text-cyan-300 font-bold">{formatSec(startSec)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(0, Math.floor(safeDuration) - 1)}
            step={1}
            value={Math.floor(startSec)}
            disabled={isProcessing}
            onChange={(e) => handleStartChange(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-300 font-medium">Fim do Corte</span>
            <span className="font-mono text-emerald-300 font-bold">{formatSec(endSec)}</span>
          </div>
          <input
            type="range"
            min={1}
            max={Math.ceil(safeDuration)}
            step={1}
            value={Math.ceil(endSec)}
            disabled={isProcessing}
            onChange={(e) => handleEndChange(Number(e.target.value))}
            className="w-full accent-emerald-400 cursor-pointer"
          />
        </div>
      </div>

      {/* Quality & Output Estimation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/[0.02] p-3.5 rounded-xl border border-white/10">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs text-slate-300 font-medium">Qualidade:</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setQuality('720p')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all ${
                quality === '720p'
                  ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/50'
                  : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white'
              }`}
            >
              720p Nitidez
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => setQuality('480p')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold transition-all ${
                quality === '480p'
                  ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/50'
                  : 'bg-white/5 text-slate-400 border border-white/10 hover:text-white'
              }`}
            >
              480p Ultra-Leve
            </button>
          </div>
        </div>

        <div className="text-[11px] font-mono text-slate-300 flex items-center gap-2">
          <span>Trecho: <strong className="text-white">{formatSec(clipDuration)}</strong></span>
          <span className="text-slate-600">·</span>
          <span>
            Estimado: <strong className="text-emerald-300">~{estimatedOutputMb.toFixed(1)} MB</strong>{' '}
            <span className="text-slate-500">(antes {originalSizeMb.toFixed(1)} MB)</span>
          </span>
        </div>
      </div>

      {/* Real-time trim progress */}
      {isProcessing ? (
        <div className="space-y-2.5 p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-cyan-200 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              {statusLabel}
            </span>
            <span className="text-cyan-300 font-bold">{progress}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full fd-shimmer-bar transition-all duration-200 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-amber-300 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              Mantenha esta aba visível durante o corte.
            </span>
            <button
              type="button"
              onClick={handleAbortProcessing}
              className="px-3 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-semibold flex items-center gap-1 border border-rose-500/30"
            >
              <Square className="w-3 h-3" />
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Usar vídeo original
          </button>

          <button
            type="button"
            onClick={handleProcessTrim}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-2 hover:brightness-105 shadow-lg shadow-cyan-500/20"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Aplicar Corte e Otimizar ({formatSec(clipDuration)})</span>
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!isProcessing && (
        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-cyan-400 shrink-0" />
          <span>
            O corte acontece em tempo real no navegador ({formatSec(clipDuration)} de duração) e reduz drasticamente falhas de rede e uso de cota na API gratuita.
          </span>
        </p>
      )}
    </div>
  );
};
