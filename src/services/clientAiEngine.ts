import { GoogleGenAI, MediaResolution, ThinkingLevel, Type } from '@google/genai';
import type { FolderMissionReference, ReferencePhotoItem } from '../components/FolderReferenceView';
import { BIOGLOW_OFFICIAL_MISSIONS } from '../data/bioglowMissions';
import { parseFolderRelativePath } from '../utils/folderParser';
import type { AiTrainingExample } from '../types/fll';

let backendAvailablePromise: Promise<boolean> | null = null;

/**
 * Checks whether the Express backend (/api/*) is active.
 * On GitHub Pages or static hosting, returns false quickly and caches the result.
 */
export async function hasBackendServer(forceRefresh = false): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol === 'file:') return false;

  if (!backendAvailablePromise || forceRefresh) {
    backendAvailablePromise = (async () => {
      try {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 1800);
        const res = await fetch('./api/health', {
          method: 'GET',
          cache: 'no-store',
          signal: ctrl.signal,
        });
        window.clearTimeout(timer);

        const ctype = (res.headers.get('content-type') || '').toLowerCase();
        if (!res.ok || !ctype.includes('application/json')) {
          return false;
        }
        const data = await res.json();
        return data?.status === 'ok';
      } catch {
        return false;
      }
    })();
  }

  return backendAvailablePromise;
}

const EXCLUDED_MODEL_KEYWORDS = [
  'embedding',
  'tts',
  'transcribe',
  'live',
  'image',
  'banana',
  'lyria',
  'veo',
  'omni',
  'decision',
  'deep-research',
  'robotics',
  'computer-use',
  'gemma',
  'learnlm',
  'aqa',
  'bison',
  'gecko',
  'gemini-1.0',
  'gemini-1.5',
  'gemini-2.0',
  'gemini-2.5',
  'thinking',
  '-pro',
  'carbon',
  'neon',
  'argon',
];

const PREFERRED_MODEL_ORDER = [
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-3-flash',
];

function scoreModelRank(name: string): number {
  const idx = PREFERRED_MODEL_ORDER.indexOf(name);
  if (idx !== -1) return idx;
  if (name.includes('flash-lite')) return 15;
  if (name.includes('flash')) return 20;
  return 60;
}

async function discoverFlashModelsDirect(apiKey: string): Promise<string[]> {
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`,
      { signal: ctrl.signal }
    );
    window.clearTimeout(timer);

    if (!res.ok) {
      return [...PREFERRED_MODEL_ORDER].slice(0, 2);
    }

    const data = await res.json();
    const models: any[] = Array.isArray(data?.models) ? data.models : [];

    const valid = models
      .filter((m) => {
        const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
          ? m.supportedGenerationMethods
          : [];
        if (!methods.includes('generateContent')) return false;
        const shortName = String(m?.name || '')
          .replace(/^models\//, '')
          .toLowerCase();
        if (!shortName.startsWith('gemini-')) return false;
        return !EXCLUDED_MODEL_KEYWORDS.some((kw) => shortName.includes(kw));
      })
      .map((m) => String(m.name).replace(/^models\//, ''));

    const ranked = Array.from(new Set(valid)).sort(
      (a, b) => scoreModelRank(a) - scoreModelRank(b)
    );
    return ranked.length > 0 ? ranked.slice(0, 2) : ['gemini-4-hydrogen', 'gemini-3.8-flash'];
  } catch {
    return ['gemini-4-hydrogen', 'gemini-3.8-flash'];
  }
}

export async function validateGeminiKeyDirect(
  rawKey: string
): Promise<{ valid: boolean; message: string; quotaWarning?: boolean }> {
  const apiKey = rawKey.trim();
  if (!apiKey) {
    return { valid: false, message: 'Chave da API não fornecida.' };
  }
  if (!apiKey.startsWith('AIza') || apiKey.length < 30) {
    return {
      valid: false,
      message: 'Formato inválido. Chaves do Google AI Studio começam com "AIza...".',
    };
  }

  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 6500);
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=20&key=${encodeURIComponent(apiKey)}`,
      { signal: ctrl.signal }
    );
    window.clearTimeout(timer);

    if (resp.ok) {
      return {
        valid: true,
        message: 'Chave Gemini validada e conectada com sucesso!',
      };
    }

    const errJson = await resp.json().catch(() => ({}));
    const rawMsg = String(errJson?.error?.message || `HTTP ${resp.status}`);
    const lower = rawMsg.toLowerCase();

    if (resp.status === 429 || lower.includes('quota') || lower.includes('resource_exhausted')) {
      return {
        valid: true,
        quotaWarning: true,
        message:
          'Chave conectada! (A cota gratuita está momentaneamente cheia, aguarde ~20s se ocorrer erro ao analisar).',
      };
    }

    if (resp.status === 400 || resp.status === 401 || resp.status === 403 || lower.includes('api_key_invalid')) {
      return {
        valid: false,
        message: 'Chave inválida ou bloqueada. Copie a chave correta no Google AI Studio.',
      };
    }

    return { valid: false, message: `Erro na chave Gemini: ${rawMsg}` };
  } catch {
    return {
      valid: false,
      message: 'Não foi possível alcançar a API do Google Gemini. Confira sua internet.',
    };
  }
}

export async function loadStaticTeamGabarito(): Promise<{
  missionCount: number;
  photoCount: number;
  references: Record<string, FolderMissionReference>;
}> {
  const res = await fetch('./team-gabarito.json', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Arquivo estático do gabarito da equipe não encontrado.');
  }
  const raw = await res.json();
  const rawRefs: Record<string, any> = raw?.references || {};
  const hydrated: Record<string, FolderMissionReference> = {};
  let totalPhotos = 0;

  for (const code of Object.keys(rawRefs)) {
    const src = rawRefs[code];
    const ref: FolderMissionReference = {
      missionCode: code,
      completaFiles: [],
      parcialFiles: [],
      incompletaFiles: [],
      pointTiers: {},
    };

    const tiers = src?.pointTiers || {};
    for (const tierKey of Object.keys(tiers)) {
      const t = tiers[tierKey];
      const files: ReferencePhotoItem[] = (Array.isArray(t?.files) ? t.files : []).map((f: any) => ({
        name: String(f.name || 'foto.jpg'),
        url: String(f.base64 || f.url || ''),
        base64: f.base64 ? String(f.base64) : undefined,
        points: typeof f.points === 'number' ? f.points : Number(t?.points) || 0,
        tierLabel: String(f.tierLabel || t?.label || tierKey),
      }));

      ref.pointTiers![tierKey] = {
        label: String(t?.label || tierKey),
        points: Number(t?.points) || 0,
        files,
      };

      const parsed = parseFolderRelativePath(`Drive/${code}/${t?.label || tierKey}/foto.jpg`);
      const state = parsed.isValid
        ? parsed.state
        : Number(t?.points) === 0
        ? 'incompleta'
        : 'completa';

      if (state === 'completa') ref.completaFiles.push(...files);
      else if (state === 'parcial') ref.parcialFiles.push(...files);
      else ref.incompletaFiles.push(...files);

      totalPhotos += files.length;
    }

    hydrated[code] = ref;
  }

  return {
    missionCount: Object.keys(hydrated).length,
    photoCount: totalPhotos,
    references: hydrated,
  };
}

function formatSecShort(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function fileToBase64Raw(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const idx = result.indexOf(';base64,');
      resolve(idx >= 0 ? result.slice(idx + 8) : result);
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo no navegador.'));
    reader.readAsDataURL(file);
  });
}

function probeBrowserVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const url = URL.createObjectURL(file);
    const done = (dur: number) => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(dur) && dur > 0 ? dur : 0);
    };
    video.onloadedmetadata = () => done(video.duration);
    video.onerror = () => done(0);
    window.setTimeout(() => done(0), 5000);
    video.src = url;
  });
}

/**
 * Extracts crisp 720p JPEG keyframes with exact timestamps from a local File inside the browser.
 * Allows analyzing even large 60-100 MB videos on static GitHub Pages without FFmpeg!
 */
async function extractVideoSegmentKeyframes(
  file: File,
  startSec: number,
  endSec: number,
  maxFrames = 10,
  signal?: AbortSignal
): Promise<Array<{ timestampSec: number; base64Data: string }>> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    const objectUrl = URL.createObjectURL(file);
    const frames: Array<{ timestampSec: number; base64Data: string }> = [];

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute('src');
      video.load();
    };

    if (signal?.aborted) {
      cleanup();
      reject(new Error('ABORTED'));
      return;
    }

    const abortHandler = () => {
      cleanup();
      reject(new Error('ABORTED'));
    };
    signal?.addEventListener('abort', abortHandler, { once: true });

    video.onerror = () => {
      signal?.removeEventListener('abort', abortHandler);
      cleanup();
      reject(new Error('O navegador não conseguiu decodificar este vídeo. Tente converter para MP4 padrão.'));
    };

    video.onloadeddata = async () => {
      try {
        const safeDur = Math.max(1, video.duration || endSec || 30);
        const clampedStart = Math.max(0, Math.min(startSec, safeDur - 0.5));
        const clampedEnd = Math.max(clampedStart + 0.5, Math.min(endSec, safeDur));
        const span = clampedEnd - clampedStart;

        const targetCount = Math.max(3, Math.min(maxFrames, Math.ceil(span / 2.2) + 1));
        const step = targetCount > 1 ? span / (targetCount - 1) : 0;

        const srcW = video.videoWidth || 640;
        const srcH = video.videoHeight || 360;
        const targetW = Math.min(720, srcW);
        const targetH = Math.max(2, Math.round((srcH * targetW) / srcW));

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas indisponível para extrair quadros.');

        for (let i = 0; i < targetCount; i++) {
          if (signal?.aborted) throw new Error('ABORTED');
          const t = Math.min(safeDur - 0.15, clampedStart + i * step);

          await new Promise<void>((resSeek) => {
            const onSeeked = () => {
              video.removeEventListener('seeked', onSeeked);
              resSeek();
            };
            video.addEventListener('seeked', onSeeked, { once: true });
            video.currentTime = t;
            window.setTimeout(resSeek, 900);
          });

          ctx.drawImage(video, 0, 0, targetW, targetH);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.76);
          const b64 = dataUrl.split(';base64,')[1] || '';
          if (b64) {
            frames.push({ timestampSec: t, base64Data: b64 });
          }
        }

        signal?.removeEventListener('abort', abortHandler);
        cleanup();
        resolve(frames);
      } catch (err) {
        signal?.removeEventListener('abort', abortHandler);
        cleanup();
        reject(err);
      }
    };

    video.src = objectUrl;
  });
}

function sanitizeClientAnalysisOutput(
  rawParsed: any,
  allowedMissions: Array<{ code: string; maxScore: number; validScores?: number[] }>,
  hasGabarito: boolean,
  trainingRulesApplied: number,
  informedCodes: string[]
) {
  const missionMap = new Map(allowedMissions.map((m) => [m.code.toUpperCase(), m]));
  const rawList = Array.isArray(rawParsed?.missionsDetected) ? rawParsed.missionsDetected : [];
  const deduped = new Map<string, any>();

  for (const item of rawList) {
    const code = String(item?.missionCode || '').trim().toUpperCase();
    if (!missionMap.has(code)) continue;

    const rawStatus = String(item?.status || '').toLowerCase();
    const rawScore = Number(item?.estimatedScore) || 0;
    if (rawStatus === 'not_attempted' && informedCodes.length === 0) continue;

    const meta = missionMap.get(code)!;
    let clampedScore = Math.max(0, Math.min(meta.maxScore || 40, Math.round(rawScore)));
    if (
      Array.isArray(meta.validScores) &&
      meta.validScores.length > 0 &&
      !meta.validScores.includes(clampedScore)
    ) {
      clampedScore = meta.validScores.reduce((prev, curr) =>
        Math.abs(curr - clampedScore) < Math.abs(prev - clampedScore) ? curr : prev
      );
    }

    const confidence = Math.max(
      0,
      Math.min(100, Math.round(Number(item?.confidence) || (hasGabarito ? 75 : 55)))
    );

    let status: 'completed' | 'partial' | 'failed' | 'not_attempted' = 'failed';
    if (clampedScore <= 0) {
      status = rawStatus === 'not_attempted' ? 'not_attempted' : 'failed';
    } else if (meta.maxScore > 0 && clampedScore >= meta.maxScore) {
      status = 'completed';
    } else {
      status = 'partial';
    }

    const candidate = {
      missionCode: code,
      status,
      estimatedScore: clampedScore,
      timestampEstimate: item?.timestampEstimate ? String(item.timestampEstimate) : undefined,
      evidenceDescription:
        String(item?.evidenceDescription || '').trim() || 'Estado identificado na análise visual.',
      confidence,
    };

    const prev = deduped.get(code);
    if (!prev || candidate.confidence > prev.confidence) {
      deduped.set(code, candidate);
    }
  }

  const sanitizedMissions = Array.from(deduped.values()).sort((a, b) =>
    a.missionCode.localeCompare(b.missionCode)
  );
  const computedTotalScore = sanitizedMissions.reduce(
    (sum, m) => sum + (Number(m.estimatedScore) || 0),
    0
  );
  const totalTimeSeconds = Math.max(
    0,
    Math.min(300, Math.round(Number(rawParsed?.totalTimeSeconds) || 0))
  );

  return {
    estimatedTotalScore: computedTotalScore,
    totalTimeFormatted: String(rawParsed?.totalTimeFormatted || '00:00'),
    totalTimeSeconds,
    overallConfidence: Math.max(
      0,
      Math.min(100, Math.round(Number(rawParsed?.overallConfidence) || (hasGabarito ? 78 : 58)))
    ),
    summary: String(rawParsed?.summary || 'Análise concluída.'),
    trajectoryNotes: String(rawParsed?.trajectoryNotes || ''),
    mechanismNotes: String(rawParsed?.mechanismNotes || ''),
    missionsDetected: sanitizedMissions,
    usedGabarito: hasGabarito,
    trainingRulesApplied,
    gabaritoWarning: hasGabarito
      ? undefined
      : 'Análise feita sem fotos de gabarito (apenas com o Livro de Regras BIOGLOW). Confira e corrija qualquer erro antes de salvar.',
  };
}

function mergeClientPartAnalyses(
  partResults: Array<{ startSec: number; endSec: number; sanitized: any }>,
  totalDurationSec: number,
  hasGabarito: boolean,
  trainingRulesApplied: number
) {
  const mergedMap = new Map<string, any>();

  partResults.forEach(({ startSec, endSec, sanitized }, idx) => {
    const tag = `[Parte ${idx + 1}: ${formatSecShort(startSec)}–${formatSecShort(endSec)}]`;
    const list = Array.isArray(sanitized?.missionsDetected) ? sanitized.missionsDetected : [];

    for (const m of list) {
      const code = String(m.missionCode || '').toUpperCase();
      if (!code) continue;

      const candidate = {
        ...m,
        timestampEstimate: m.timestampEstimate ? `${tag} ${m.timestampEstimate}` : tag,
      };

      const prev = mergedMap.get(code);
      if (!prev) {
        mergedMap.set(code, candidate);
      } else {
        const prevScore = Number(prev.estimatedScore) || 0;
        const currScore = Number(candidate.estimatedScore) || 0;
        if (
          currScore > prevScore ||
          (currScore === prevScore && Number(candidate.confidence || 0) >= Number(prev.confidence || 0))
        ) {
          const combinedEvidence =
            prev.evidenceDescription && candidate.evidenceDescription !== prev.evidenceDescription
              ? `${candidate.evidenceDescription} (${prev.timestampEstimate}: ${prev.evidenceDescription})`
              : candidate.evidenceDescription;
          mergedMap.set(code, {
            ...candidate,
            evidenceDescription: combinedEvidence.slice(0, 450),
          });
        }
      }
    }
  });

  const mergedMissions = Array.from(mergedMap.values()).sort((a, b) =>
    a.missionCode.localeCompare(b.missionCode)
  );
  const totalScore = mergedMissions.reduce((s, m) => s + (Number(m.estimatedScore) || 0), 0);
  const avgConf =
    partResults.length > 0
      ? Math.round(
          partResults.reduce((s, p) => s + (Number(p.sanitized?.overallConfidence) || 70), 0) /
            partResults.length
        )
      : 70;
  const finalSec = totalDurationSec > 0 ? Math.round(totalDurationSec) : 0;

  return {
    estimatedTotalScore: totalScore,
    totalTimeFormatted: formatSecShort(finalSec),
    totalTimeSeconds: finalSec,
    overallConfidence: avgConf,
    summary: `Análise consolidada em ${partResults.length} partes (modo navegador) — ${partResults
      .map((p, i) => `Parte ${i + 1}: ${p.sanitized?.summary || 'analisada'}`)
      .join(' | ')}`.slice(0, 1200),
    trajectoryNotes: partResults
      .map((p) => p.sanitized?.trajectoryNotes)
      .filter(Boolean)
      .join(' ')
      .slice(0, 600),
    mechanismNotes: partResults
      .map((p) => p.sanitized?.mechanismNotes)
      .filter(Boolean)
      .join(' ')
      .slice(0, 600),
    missionsDetected: mergedMissions,
    usedGabarito: hasGabarito,
    trainingRulesApplied,
    partsAnalyzed: partResults.length,
    gabaritoWarning: hasGabarito
      ? undefined
      : 'Análise feita sem fotos de gabarito (apenas com o Livro de Regras BIOGLOW). Confira e corrija qualquer erro antes de salvar.',
  };
}

export async function analyzeMediaClientSide(params: {
  mediaFile: File;
  isVideo: boolean;
  videoDuration: number;
  informedMissions: string[];
  references: Record<string, FolderMissionReference>;
  trainingExamples: AiTrainingExample[];
  splitMode: 'auto' | 'parts' | 'single';
  apiKey: string;
  signal?: AbortSignal;
  onProgress: (percent: number, message: string) => void;
}) {
  const {
    mediaFile,
    isVideo,
    informedMissions,
    references,
    trainingExamples,
    splitMode,
    apiKey,
    signal,
    onProgress,
  } = params;

  const cleanedInformed = informedMissions.map((c) => c.trim().toUpperCase()).filter(Boolean);
  const activeMissions =
    cleanedInformed.length > 0
      ? BIOGLOW_OFFICIAL_MISSIONS.filter((m) => cleanedInformed.includes(m.code.toUpperCase()))
      : BIOGLOW_OFFICIAL_MISSIONS;
  const allowedCodesList = activeMissions.map((m) => m.code.toUpperCase());

  // Build concise gabarito reference parts
  const refImages: Array<{ missionCode: string; tierLabel: string; points: number; base64: string }> = [];
  for (const code of Object.keys(references).sort()) {
    if (!allowedCodesList.includes(code)) continue;
    const item = references[code];
    if (item?.pointTiers) {
      for (const tier of Object.values(item.pointTiers)) {
        const sample = tier.files.find((f) => Boolean(f.base64));
        if (sample?.base64) {
          refImages.push({
            missionCode: code,
            tierLabel: tier.label,
            points: tier.points,
            base64: sample.base64,
          });
        }
      }
    }
  }

  const refCap = cleanedInformed.length > 0 ? 8 : 5;
  const relevantRefImages = refImages.slice(0, refCap);
  const hasGabarito = relevantRefImages.length > 0;

  const referenceParts: any[] = [];
  if (hasGabarito) {
    referenceParts.push({ text: 'FOTOS DO GABARITO DA EQUIPE (compare o estado final):' });
    for (const refImg of relevantRefImages) {
      let refMime = 'image/jpeg';
      let refData = refImg.base64;
      if (refData.includes(';base64,')) {
        const sp = refData.split(';base64,');
        refMime = sp[0].replace('data:', '') || 'image/jpeg';
        refData = sp[1];
      }
      referenceParts.push({
        text: `[GABARITO] ${refImg.missionCode} | Pasta: "${refImg.tierLabel}" | Pontos: ${refImg.points}`,
      });
      referenceParts.push({ inlineData: { mimeType: refMime, data: refData } });
    }
  }

  // Training feedback rules
  const relevantTraining = trainingExamples
    .filter((t) => t.missionCode === 'GERAL' || allowedCodesList.includes(t.missionCode.toUpperCase()))
    .slice(0, 12);
  const trainingParts: any[] = [];
  let trainingPromptSection = '';

  if (relevantTraining.length > 0) {
    const lines = relevantTraining.map(
      (t, i) =>
        `${i + 1}. [${t.missionCode}] Erro: "${t.aiPredictedSummary}" -> Correto: "${t.expectedSummary}"${
          t.userExplanation ? ` | Regra: ${t.userExplanation}` : ''
        }`
    );
    trainingPromptSection = `\n*** APRENDIZADO DA EQUIPE (OBRIGATÓRIO) ***:\n${lines.join('\n')}\n`;
    const snapEx = relevantTraining.find((t) => Boolean(t.snapshotBase64));
    if (snapEx?.snapshotBase64) {
      const sp = snapEx.snapshotBase64.split(';base64,');
      const snapMime = sp[0].replace('data:', '') || 'image/jpeg';
      const snapData = sp[1] || snapEx.snapshotBase64;
      trainingParts.push({
        text: `[EXEMPLO DE CORREÇÃO] ${snapEx.missionCode}: ${snapEx.expectedSummary}. ${snapEx.userExplanation}`,
      });
      trainingParts.push({ inlineData: { mimeType: snapMime, data: snapData } });
    }
  }

  const scopeInstruction =
    cleanedInformed.length > 0
      ? `O OPERADOR INFORMOU APENAS: [${cleanedInformed.join(', ')}]. Avalie EXCLUSIVAMENTE estas missões.`
      : `MODO AUTOMÁTICO ANTI-ALUCINAÇÃO:
1. Todos os 15 modelos LEGO ficam no tapete. Modelo parado ao fundo NÃO conta!
2. SÓ inclua em "missionsDetected" se o robô REALMENTE tocou/alterou aquele modelo no vídeo.
3. NUNCA inclua M10 automaticamente.`;

  const gabaritoNote = hasGabarito
    ? `GABARITO ATIVO (${relevantRefImages.length} fotos anexadas): compare estado final com as fotos.`
    : `SEM GABARITO: avalie pelo guia abaixo sem dar bônus sem evidência visível.`;

  const compactMissionsGuide = activeMissions
    .map(
      (m) =>
        `${m.code} (${m.name}, válidos:[${(m.validScores || [0, m.maxScore]).join(',')}]): ${
          m.visualGuide || m.description || ''
        }`
    )
    .join('\n');

  const buildPrompt = (segmentNote = '') => `
Árbitro FLL (Temporada BIOGLOW).
${segmentNote ? `TRECHO: ${segmentNote}\n` : ''}${scopeInstruction}
${gabaritoNote}
${trainingPromptSection}
REGRAS DAS MISSÕES:
${compactMissionsGuide}

DETALHES CRÍTICOS:
- M01: Drone fora do tapete = 20 pts; + peça vermelha LiDAR dentro da caixinha = 30 pts.
- M02: Haste verde curva centro-esquerda (NÃO confundir com M08 trepadeira). 1=10, 2=20, 3=30 pts.
`;

  const aiClient = new GoogleGenAI({ apiKey });
  const discoveredModels = await discoverFlashModelsDirect(apiKey);

  const runGeminiDirect = async (
    mediaParts: any[],
    promptText: string,
    progressPct: number,
    stepLabel: string,
    opts: { isMultiPart?: boolean; pinnedModel?: string } = {}
  ): Promise<{ parsedData: any; successfulModel: string }> => {
    const modelsToTry = opts.pinnedModel
      ? [opts.pinnedModel, ...discoveredModels.filter((m) => m !== opts.pinnedModel)].slice(0, 2)
      : discoveredModels;

    const multimodalParts = [
      ...referenceParts,
      ...trainingParts,
      { text: 'MÍDIA DO ROUND:' },
      ...mediaParts,
      { text: promptText },
    ];

    const perModelTimeoutMs = opts.isMultiPart ? 40000 : 52000;
    let lastErr: any = null;

    for (let i = 0; i < modelsToTry.length; i++) {
      if (signal?.aborted) throw new Error('ABORTED');
      const modelCandidate = modelsToTry[i];
      onProgress(Math.min(95, progressPct + i * 2), `${stepLabel} (${modelCandidate})...`);

      const buildCfg = (includeAdvanced: boolean) => {
        const cfg: any = {
          systemInstruction: `Você é um árbitro rigoroso da FLL (BIOGLOW). Retorne estritamente JSON válido. Nunca invente missões não executadas no vídeo. Códigos permitidos: [${allowedCodesList.join(', ')}].`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              estimatedTotalScore: { type: Type.NUMBER },
              totalTimeFormatted: { type: Type.STRING },
              totalTimeSeconds: { type: Type.NUMBER },
              overallConfidence: { type: Type.NUMBER },
              summary: { type: Type.STRING },
              trajectoryNotes: { type: Type.STRING },
              mechanismNotes: { type: Type.STRING },
              missionsDetected: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    missionCode: { type: Type.STRING },
                    status: { type: Type.STRING },
                    estimatedScore: { type: Type.NUMBER },
                    timestampEstimate: { type: Type.STRING },
                    evidenceDescription: { type: Type.STRING },
                    confidence: { type: Type.NUMBER },
                  },
                  required: ['missionCode', 'status', 'estimatedScore', 'evidenceDescription'],
                },
              },
            },
            required: [
              'estimatedTotalScore',
              'totalTimeFormatted',
              'totalTimeSeconds',
              'overallConfidence',
              'summary',
              'trajectoryNotes',
              'mechanismNotes',
              'missionsDetected',
            ],
          },
        };
        if (includeAdvanced) {
          const targetRes = opts.isMultiPart
            ? MediaResolution.MEDIA_RESOLUTION_LOW
            : MediaResolution.MEDIA_RESOLUTION_MEDIUM;
          if (modelCandidate === 'gemini-4-hydrogen' || modelCandidate === 'gemini-3.8-flash') {
            cfg.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
            cfg.mediaResolution = targetRes;
          } else if (modelCandidate === 'gemini-3.1-flash-lite') {
            cfg.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
            cfg.mediaResolution = targetRes;
          }
        }
        return cfg;
      };

      try {
        const timeoutPromise = new Promise((_, reject) =>
          window.setTimeout(
            () =>
              reject(
                new Error(
                  `Tempo limite (${Math.round(perModelTimeoutMs / 1000)}s) no modelo ${modelCandidate}`
                )
              ),
            perModelTimeoutMs
          )
        );

        let response: any;
        try {
          response = await Promise.race([
            aiClient.models.generateContent({
              model: modelCandidate,
              contents: { parts: multimodalParts },
              config: buildCfg(true),
            }),
            timeoutPromise,
          ]);
        } catch (firstErr: any) {
          const msg = String(firstErr?.message || '');
          if (
            msg.includes('INVALID_ARGUMENT') ||
            msg.includes('400') ||
            msg.toLowerCase().includes('thinking') ||
            msg.toLowerCase().includes('mediaresolution')
          ) {
            response = await Promise.race([
              aiClient.models.generateContent({
                model: modelCandidate,
                contents: { parts: multimodalParts },
                config: buildCfg(false),
              }),
              timeoutPromise,
            ]);
          } else {
            throw firstErr;
          }
        }

        const parsedData = JSON.parse((response.text ?? '{}').trim());
        return { parsedData, successfulModel: modelCandidate };
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || '');
        if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) break;
      }
    }

    throw lastErr || new Error('Falha ao analisar mídia na API Gemini.');
  };

  const allowedSanitizeList = activeMissions.map((m) => ({
    code: m.code,
    maxScore: m.maxScore || 30,
    validScores: m.validScores,
  }));

  if (!isVideo) {
    onProgress(35, 'Preparando foto da mesa...');
    const b64 = await fileToBase64Raw(mediaFile);
    const { parsedData, successfulModel } = await runGeminiDirect(
      [{ inlineData: { mimeType: mediaFile.type || 'image/jpeg', data: b64 } }],
      buildPrompt(),
      55,
      'Analisando foto com IA'
    );
    return {
      ...sanitizeClientAnalysisOutput(
        parsedData,
        allowedSanitizeList,
        hasGabarito,
        relevantTraining.length,
        cleanedInformed
      ),
      modelUsed: successfulModel,
    };
  }

  // Video in static/GitHub Pages mode
  onProgress(22, 'Verificando duração do vídeo no navegador...');
  const probedDur = params.videoDuration > 0 ? params.videoDuration : await probeBrowserVideoDuration(mediaFile);
  const effectiveDuration = Math.max(2, probedDur || 30);
  const fileMb = mediaFile.size / (1024 * 1024);

  const shouldUseParts =
    splitMode === 'parts' ||
    fileMb > 12 ||
    (splitMode === 'auto' && effectiveDuration > 40);

  if (!shouldUseParts && fileMb <= 12) {
    onProgress(40, 'Preparando vídeo direto para IA...');
    const b64 = await fileToBase64Raw(mediaFile);
    const { parsedData, successfulModel } = await runGeminiDirect(
      [{ inlineData: { mimeType: mediaFile.type || 'video/mp4', data: b64 } }],
      buildPrompt(),
      60,
      'Analisando vídeo com IA'
    );
    return {
      ...sanitizeClientAnalysisOutput(
        parsedData,
        allowedSanitizeList,
        hasGabarito,
        relevantTraining.length,
        cleanedInformed
      ),
      modelUsed: successfulModel,
    };
  }

  // Split into <= 4 segments and extract crisp keyframes directly in browser canvas
  const maxParts = 4;
  const partCount =
    effectiveDuration <= 22 ? 2 : Math.min(maxParts, Math.max(2, Math.ceil(effectiveDuration / 30)));
  const segLen = effectiveDuration / partCount;
  const segments: Array<{ index: number; startSec: number; endSec: number }> = [];
  for (let i = 0; i < partCount; i++) {
    const startSec = Math.max(0, i * segLen - (i > 0 ? 1.5 : 0));
    const endSec = Math.min(effectiveDuration, (i + 1) * segLen);
    segments.push({ index: i, startSec, endSec });
  }

  const partResults: Array<{ startSec: number; endSec: number; sanitized: any }> = [];
  let pinnedModel = '';
  let partialWarning = '';

  const runSegment = async (seg: { index: number; startSec: number; endSec: number }, modelPin?: string) => {
    const label = `${formatSecShort(seg.startSec)}–${formatSecShort(seg.endSec)}`;
    const basePct = 28 + Math.round((seg.index / segments.length) * 62);
    onProgress(basePct, `Extraindo quadros Parte ${seg.index + 1}/${segments.length} (${label})...`);

    const frames = await extractVideoSegmentKeyframes(mediaFile, seg.startSec, seg.endSec, 9, signal);
    const frameParts: any[] = [];
    for (const f of frames) {
      frameParts.push({ text: `[Quadro em ${formatSecShort(f.timestampSec)}]` });
      frameParts.push({ inlineData: { mimeType: 'image/jpeg', data: f.base64Data } });
    }

    const promptText = buildPrompt(
      `Parte ${seg.index + 1}/${segments.length} (${label} de ${formatSecShort(effectiveDuration)}). Avalie apenas ações visíveis nestes quadros.`
    );

    const { parsedData, successfulModel } = await runGeminiDirect(
      frameParts,
      promptText,
      basePct + 6,
      `Analisando Parte ${seg.index + 1}/${segments.length} (${label})`,
      { isMultiPart: true, pinnedModel: modelPin }
    );

    return {
      startSec: seg.startSec,
      endSec: seg.endSec,
      successfulModel,
      sanitized: sanitizeClientAnalysisOutput(
        parsedData,
        allowedSanitizeList,
        hasGabarito,
        relevantTraining.length,
        cleanedInformed
      ),
    };
  };

  // Part 1 discovers & pins working model
  const first = await runSegment(segments[0]);
  pinnedModel = first.successfulModel;
  partResults.push({ startSec: first.startSec, endSec: first.endSec, sanitized: first.sanitized });

  for (let i = 1; i < segments.length; i += 2) {
    if (signal?.aborted) throw new Error('ABORTED');
    const batch = segments.slice(i, i + 2);
    const settled = await Promise.allSettled(batch.map((s) => runSegment(s, pinnedModel)));

    let batchErr: any = null;
    for (const outcome of settled) {
      if (outcome.status === 'fulfilled') {
        const v = outcome.value;
        partResults.push({ startSec: v.startSec, endSec: v.endSec, sanitized: v.sanitized });
      } else if (!batchErr) {
        batchErr = outcome.reason;
      }
    }
    if (batchErr) {
      const msg = String(batchErr?.message || '');
      if (msg === 'ABORTED') throw batchErr;
      partialWarning = `Partes analisadas: ${partResults.length}/${segments.length}. Uma parte seguinte atingiu limite da API (${msg.slice(0, 120)}). Resultado parcial mantido.`;
      break;
    }
  }

  const merged = mergeClientPartAnalyses(
    partResults,
    effectiveDuration,
    hasGabarito,
    relevantTraining.length
  );
  if (partialWarning) {
    merged.gabaritoWarning = partialWarning;
  }

  return {
    ...merged,
    modelUsed: pinnedModel,
  };
}
