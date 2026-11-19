import express, { Request, Response, NextFunction } from 'express';
import { GoogleGenAI, Type, MediaResolution, ThinkingLevel } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import { parseFolderRelativePath } from './src/utils/folderParser.ts';
import { BIOGLOW_OFFICIAL_MISSIONS } from './src/data/bioglowMissions.ts';
import { TEAM_DRIVE_GABARITO_URL } from './src/data/teamConfig.ts';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Persistent storage directory for rounds history, AI training, and cached gabarito
const dataDir = path.join(__dirname, 'data');
const trainingFilePath = path.join(dataDir, 'ai-training-feedback.json');
const roundsFilePath = path.join(dataDir, 'rounds-history.json');
const gabaritoFilePath = path.join(dataDir, 'gabarito-references.json');
fs.mkdirSync(dataDir, { recursive: true });

interface StoredTrainingExample {
  id: string;
  createdAt: string;
  missionCode: string;
  mistakeType: 'false_positive' | 'wrong_score' | 'missed_mission' | 'confused_mission' | 'other';
  aiPredictedSummary: string;
  expectedSummary: string;
  userExplanation: string;
  snapshotBase64?: string;
}

interface StoredRound {
  id: string;
  roundNumber: number;
  date: string;
  operator: string;
  strategy: string;
  totalTimeSeconds: number;
  totalScore: number;
  notes?: string;
  missionResults: any[];
  createdAt: number;
  verifiedByAi?: boolean;
}

interface AnalysisJobState {
  jobId: string;
  stage: 'queued' | 'optimizing' | 'uploading_gemini' | 'analyzing_ai' | 'done' | 'error' | 'cancelled';
  progress: number;
  message: string;
  analysis?: any;
  error?: string;
  createdAt: number;
  updatedAt?: number;
}

interface PendingUploadSession {
  uploadId: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  totalBytesReceived: number;
  createdAt: number;
}

const analysisJobs = new Map<string, AnalysisJobState>();
const pendingUploads = new Map<string, PendingUploadSession>();

// Cleanup finished jobs (>15m) and abandoned chunked uploads (>30m)
setInterval(() => {
  const jobCutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of analysisJobs.entries()) {
    if (job.createdAt < jobCutoff) {
      analysisJobs.delete(id);
    }
  }
  const uploadCutoff = Date.now() - 30 * 60 * 1000;
  for (const [uid, sess] of pendingUploads.entries()) {
    if (sess.createdAt < uploadCutoff) {
      pendingUploads.delete(uid);
      fs.promises.unlink(sess.filePath).catch(() => {});
    }
  }
}, 60 * 1000).unref();

function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function readTrainingExamples(): StoredTrainingExample[] {
  try {
    if (!fs.existsSync(trainingFilePath)) return [];
    const raw = fs.readFileSync(trainingFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTrainingItem(item: any, idx = 0): StoredTrainingExample | null {
  if (!item || (!item.expectedSummary && !item.userExplanation)) return null;
  return {
    id: String(item.id || `train_${Date.now()}_${idx}`),
    createdAt: String(item.createdAt || new Date().toISOString()),
    missionCode: String(item.missionCode || 'GERAL').toUpperCase(),
    mistakeType: item.mistakeType || 'other',
    aiPredictedSummary: String(item.aiPredictedSummary || '').slice(0, 500),
    expectedSummary: String(item.expectedSummary || '').slice(0, 500),
    userExplanation: String(item.userExplanation || '').slice(0, 1000),
    snapshotBase64:
      typeof item.snapshotBase64 === 'string' && item.snapshotBase64.length < 360_000
        ? item.snapshotBase64
        : undefined,
  };
}

function mergeAndWriteTrainingExamples(
  incomingRaw: any[],
  deletedIdsRaw: string[] = []
): StoredTrainingExample[] {
  const deletedSet = new Set(deletedIdsRaw.map(String));
  const existing = readTrainingExamples().filter((e) => !deletedSet.has(e.id));

  const byId = new Map<string, StoredTrainingExample>();
  for (const item of existing) {
    byId.set(item.id, item);
  }

  incomingRaw.forEach((raw, idx) => {
    const norm = normalizeTrainingItem(raw, idx);
    if (!norm || deletedSet.has(norm.id)) return;
    const prev = byId.get(norm.id);
    byId.set(norm.id, {
      ...norm,
      snapshotBase64: norm.snapshotBase64 || prev?.snapshotBase64,
    });
  });

  // Sort newest first, keep up to 500 text rules (never silently drop recent/valid team rules)
  const sorted = Array.from(byId.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 500);

  let snapshotsKept = 0;
  const prunedSnapshots = sorted.map((item) => {
    if (item.snapshotBase64) {
      if (snapshotsKept < 20) {
        snapshotsKept++;
        return item;
      }
      return { ...item, snapshotBase64: undefined };
    }
    return item;
  });

  writeJsonAtomic(trainingFilePath, prunedSnapshots);
  return prunedSnapshots;
}

function readStoredRounds(): StoredRound[] {
  try {
    if (!fs.existsSync(roundsFilePath)) return [];
    const raw = fs.readFileSync(roundsFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeAndWriteRounds(incomingRaw: any[], deletedIdsRaw: string[] = []): StoredRound[] {
  const deletedSet = new Set(deletedIdsRaw.map(String));
  const existing = readStoredRounds().filter((r) => !deletedSet.has(r.id));

  const byId = new Map<string, StoredRound>();
  for (const r of existing) {
    byId.set(r.id, r);
  }

  for (const raw of incomingRaw) {
    if (!raw || !raw.id || deletedSet.has(String(raw.id))) continue;
    const id = String(raw.id);
    const prev = byId.get(id);
    const createdAtNum = Number(raw.createdAt) || prev?.createdAt || Date.now();
    byId.set(id, {
      id,
      roundNumber: Number(raw.roundNumber) || prev?.roundNumber || 0,
      date: String(raw.date || prev?.date || new Date(createdAtNum).toISOString().slice(0, 16)),
      operator: String(raw.operator || prev?.operator || 'Piloto FrancoDroid').slice(0, 100),
      strategy: String(raw.strategy || prev?.strategy || 'Análise IA').slice(0, 160),
      totalTimeSeconds: Math.max(0, Math.min(600, Number(raw.totalTimeSeconds) || 0)),
      totalScore: Math.max(0, Math.min(1000, Number(raw.totalScore) || 0)),
      notes: String(raw.notes ?? prev?.notes ?? '').slice(0, 2500),
      missionResults: Array.isArray(raw.missionResults) ? raw.missionResults.slice(0, 20) : [],
      createdAt: createdAtNum,
      verifiedByAi: raw.verifiedByAi !== undefined ? Boolean(raw.verifiedByAi) : prev?.verifiedByAi,
    });
  }

  const merged = Array.from(byId.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  writeJsonAtomic(roundsFilePath, merged);
  return merged;
}

// Temp disk storage for uploaded videos/photos (supports up to 105 MB)
const uploadDir = path.join(os.tmpdir(), 'francodroid-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 105 * 1024 * 1024,
    fieldSize: 25 * 1024 * 1024,
  },
});

app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  const trainingCount = readTrainingExamples().length;
  res.json({
    status: 'ok',
    team: 'FrancoDroid FLL Analytics',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    maxUploadMb: 100,
    trainingExamplesCount: trainingCount,
  });
});

// App configuration and public URL endpoint
app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    appUrl: process.env.APP_URL || '',
  });
});

// ==================== PERSISTENT ROUNDS HISTORY ENDPOINTS ====================

app.get('/api/rounds', (_req: Request, res: Response) => {
  const rounds = readStoredRounds();
  res.json({
    count: rounds.length,
    rounds,
  });
});

app.post('/api/rounds', (req: Request, res: Response): void => {
  try {
    const incoming = Array.isArray(req.body?.rounds) ? req.body.rounds : [];
    const deletedIds = Array.isArray(req.body?.deletedIds) ? req.body.deletedIds : [];
    const merged = mergeAndWriteRounds(incoming, deletedIds);
    res.json({
      success: true,
      count: merged.length,
      rounds: merged,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao sincronizar histórico de rounds.' });
  }
});

app.delete('/api/rounds/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updated = readStoredRounds().filter((r) => r.id !== id);
  writeJsonAtomic(roundsFilePath, updated);
  res.json({ success: true, count: updated.length, rounds: updated });
});

// ==================== REAL AI TRAINING MEMORY ENDPOINTS ====================

app.get('/api/ai/training', (_req: Request, res: Response) => {
  const examples = readTrainingExamples();
  res.json({
    count: examples.length,
    examples,
  });
});

app.post('/api/ai/training', (req: Request, res: Response): void => {
  try {
    const incoming = Array.isArray(req.body?.examples) ? req.body.examples : [];
    const deletedIds = Array.isArray(req.body?.deletedIds) ? req.body.deletedIds : [];
    const syncOnly = Boolean(req.body?.syncOnly);

    if (incoming.length === 0 && !syncOnly && deletedIds.length === 0) {
      res.status(400).json({ error: 'Nenhuma correção enviada para treinamento.' });
      return;
    }

    const merged = mergeAndWriteTrainingExamples(incoming, deletedIds);
    res.json({
      success: true,
      savedCount: incoming.length,
      totalCount: merged.length,
      examples: merged,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao salvar treinamento da IA.' });
  }
});

app.delete('/api/ai/training/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = readTrainingExamples();
  const updated = existing.filter((e) => e.id !== id);
  writeJsonAtomic(trainingFilePath, updated);
  res.json({ success: true, totalCount: updated.length, examples: updated });
});

// ==================== PUBLIC GOOGLE DRIVE GABARITO IMPORTER ====================

function extractDriveFolderId(input: string): string {
  const trimmed = String(input || '').trim();
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch?.[1]) return folderMatch[1];
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch?.[1]) return idMatch[1];
  if (/^[a-zA-Z0-9_-]{12,}$/.test(trimmed)) return trimmed;
  return '';
}

interface DriveEntryItem {
  id: string;
  name: string;
  isFolder: boolean;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function listPublicDriveFolderEntries(folderId: string, retries = 1): Promise<DriveEntryItem[]> {
  const url = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`;
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FrancoDroidFLL/1.0)' },
        signal: AbortSignal.timeout(15000),
      });
      if (!resp.ok) {
        if ((resp.status === 429 || resp.status >= 500) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          continue;
        }
        throw new Error(
          resp.status === 403 || resp.status === 404
            ? 'Esta pasta do Google Drive não está pública com link ("Qualquer pessoa com o link").'
            : `Erro ${resp.status} ao acessar pasta do Google Drive.`
        );
      }
      const html = await resp.text();
      if (html.includes('accounts.google.com/ServiceLogin') && !html.includes('flip-entry')) {
        throw new Error(
          'A pasta do Google Drive exige login privado. Altere o compartilhamento para "Qualquer pessoa com o link".'
        );
      }
      const blocks = html.split('class="flip-entry"').slice(1);
      return blocks
        .map((b) => {
          const id = b.match(/id="entry-([^"]+)"/)?.[1]?.trim() || '';
          const rawName = b.match(/class="flip-entry-title">([^<]+)</)?.[1]?.trim() || '';
          const name = rawName
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"');
          const isFolder = b.includes('drive/folders/');
          return { id, name, isFolder };
        })
        .filter((item) => Boolean(item.id && item.name));
    } catch (err: any) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastErr || new Error('Tempo esgotado ao ler pasta do Google Drive.');
}

async function fetchDriveThumbnailBase64(fileId: string, retries = 1): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const thumbUrl = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w480`;
      const resp = await fetch(thumbUrl, {
        signal: AbortSignal.timeout(12000),
      });
      if (!resp.ok) {
        if ((resp.status === 429 || resp.status >= 500) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }
        return '';
      }
      const mime = resp.headers.get('content-type') || 'image/jpeg';
      if (!mime.startsWith('image/')) return '';
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.byteLength < 200 || buf.byteLength > 600_000) return '';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
      return '';
    }
  }
  return '';
}

function readStoredGabarito(): Record<string, any> {
  try {
    if (!fs.existsSync(gabaritoFilePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(gabaritoFilePath, 'utf-8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

app.get('/api/gabarito', (_req: Request, res: Response) => {
  const references = readStoredGabarito();
  res.json({
    missionCount: Object.keys(references).length,
    references,
    teamDriveUrl: TEAM_DRIVE_GABARITO_URL,
  });
});

app.post('/api/gabarito', (req: Request, res: Response): void => {
  try {
    const references =
      req.body?.references && typeof req.body.references === 'object' ? req.body.references : {};
    writeJsonAtomic(gabaritoFilePath, references);
    res.json({ success: true, missionCount: Object.keys(references).length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao salvar gabarito no servidor.' });
  }
});

app.post('/api/gabarito/import-drive-link', async (req: Request, res: Response): Promise<void> => {
  try {
    const driveUrl = String(req.body?.driveUrl || TEAM_DRIVE_GABARITO_URL).trim();
    const folderId = extractDriveFolderId(driveUrl);
    if (!folderId) {
      res.status(400).json({
        error: 'Link do Google Drive inválido. Cole o link completo da pasta compartilhada.',
      });
      return;
    }

    const rootEntries = await listPublicDriveFolderEntries(folderId);
    const missionFolders = rootEntries.filter((e) => e.isFolder);
    if (missionFolders.length === 0) {
      res.status(400).json({
        error:
          'Nenhuma subpasta de missão (M01..M15) encontrada nesta pasta do Drive ou a pasta não está pública.',
      });
      return;
    }

    const references: Record<string, any> = {};
    const rejectedPaths: string[] = [];
    const warnings: string[] = [];
    let totalPhotosImported = 0;

    // Step 1: Read mission folders with bounded concurrency (avoids Google Drive throttling)
    const missionSubListings = await mapWithConcurrency(missionFolders, 4, async (mf) => {
      try {
        const subs = await listPublicDriveFolderEntries(mf.id);
        return { missionFolder: mf, subs };
      } catch (err: any) {
        warnings.push(`Falha ao ler ${mf.name}: ${err?.message || 'timeout'}`);
        return { missionFolder: mf, subs: [] as DriveEntryItem[] };
      }
    });

    // Step 2: List image files in every subfolder with bounded concurrency
    const tierListingTasks: Array<{
      missionName: string;
      tierName: string;
      tierFolderId: string;
    }> = [];

    for (const { missionFolder, subs } of missionSubListings) {
      for (const sub of subs) {
        if (sub.isFolder) {
          tierListingTasks.push({
            missionName: missionFolder.name,
            tierName: sub.name,
            tierFolderId: sub.id,
          });
        } else if (/\.(jpg|jpeg|png|webp|bmp|heic)$/i.test(sub.name)) {
          rejectedPaths.push(`${missionFolder.name}/${sub.name}`);
        }
      }
    }

    const tierResults = await mapWithConcurrency(tierListingTasks, 5, async (task) => {
      try {
        const files = await listPublicDriveFolderEntries(task.tierFolderId);
        const images = files.filter(
          (f) => !f.isFolder && /\.(jpg|jpeg|png|webp|bmp|heic)$/i.test(f.name)
        );
        return { ...task, images };
      } catch (err: any) {
        warnings.push(`Falha ao ler ${task.missionName}/${task.tierName}: ${err?.message || 'timeout'}`);
        return { ...task, images: [] as DriveEntryItem[] };
      }
    });

    // Step 3: Validate & fetch up to 2 compact JPEG thumbnails per tier with bounded concurrency
    const downloadJobs: Array<{
      missionCode: string;
      state: 'completa' | 'parcial' | 'incompleta';
      points: number;
      tierLabel: string;
      tierKey: string;
      fileName: string;
      fileId: string;
    }> = [];

    for (const tr of tierResults) {
      if (tr.images.length === 0) continue;
      const sampleRelPath = `Drive/${tr.missionName}/${tr.tierName}/${tr.images[0].name}`;
      const parsed = parseFolderRelativePath(sampleRelPath);
      if (!parsed.isValid) {
        rejectedPaths.push(`${tr.missionName}/${tr.tierName}`);
        continue;
      }

      const officialMeta = BIOGLOW_OFFICIAL_MISSIONS.find((m) => m.code === parsed.missionCode);
      const pts =
        parsed.points !== undefined
          ? parsed.points
          : parsed.state === 'completa'
          ? officialMeta?.maxScore || 30
          : parsed.state === 'parcial'
          ? officialMeta?.partialScore || 15
          : 0;

      // Take up to 2 crisp reference photos per tier to stay lightweight & fast
      tr.images.slice(0, 2).forEach((imgFile) => {
        downloadJobs.push({
          missionCode: parsed.missionCode,
          state: parsed.state,
          points: pts,
          tierLabel: parsed.tierLabel,
          tierKey: parsed.tierKey,
          fileName: imgFile.name,
          fileId: imgFile.id,
        });
      });
    }

    const downloaded = await mapWithConcurrency(downloadJobs, 6, async (job) => ({
      ...job,
      base64: await fetchDriveThumbnailBase64(job.fileId),
    }));

    for (const item of downloaded) {
      if (!item.base64) continue;
      if (!references[item.missionCode]) {
        references[item.missionCode] = {
          missionCode: item.missionCode,
          completaFiles: [],
          parcialFiles: [],
          incompletaFiles: [],
          pointTiers: {},
        };
      }
      const missionRef = references[item.missionCode];
      if (!missionRef.pointTiers[item.tierKey]) {
        missionRef.pointTiers[item.tierKey] = {
          label: item.tierLabel,
          points: item.points,
          files: [],
        };
      }
      const photoObj = {
        name: item.fileName,
        url: item.base64,
        base64: item.base64,
        points: item.points,
        tierLabel: item.tierLabel,
      };
      missionRef.pointTiers[item.tierKey].files.push(photoObj);
      if (item.state === 'completa') missionRef.completaFiles.push(photoObj);
      else if (item.state === 'parcial') missionRef.parcialFiles.push(photoObj);
      else missionRef.incompletaFiles.push(photoObj);
      totalPhotosImported++;
    }

    const missionCount = Object.keys(references).length;
    if (missionCount === 0) {
      res.status(400).json({
        error:
          'Não foi possível importar fotos válidas desta pasta do Drive. Confira se a pasta está pública ("Qualquer pessoa com o link") e organizada como M01/completa, M02/20 pontos, etc.',
      });
      return;
    }

    writeJsonAtomic(gabaritoFilePath, references);

    res.json({
      success: true,
      missionCount,
      photoCount: totalPhotosImported,
      rejectedPaths,
      warnings,
      references,
      sourceUrl: driveUrl,
    });
  } catch (err: any) {
    res.status(500).json({
      error: err?.message || 'Falha ao carregar gabarito do Google Drive.',
    });
  }
});

// ==================== DYNAMIC GEMINI MODEL DISCOVERY & FAST KEY VALIDATION ====================

const discoveredModelsCache = new Map<string, { models: string[]; fetchedAt: number }>();

function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
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
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-3.1-flash',
];

function rankAndFilterGeminiModels(rawModels: any[]): string[] {
  const validNames: string[] = [];

  for (const m of rawModels || []) {
    const methods: string[] = Array.isArray(m?.supportedGenerationMethods)
      ? m.supportedGenerationMethods
      : [];
    if (!methods.includes('generateContent')) continue;

    const cleanName = String(m?.name || '')
      .replace(/^models\//, '')
      .trim();
    if (!cleanName || !cleanName.startsWith('gemini-')) continue;

    const lower = cleanName.toLowerCase();
    if (EXCLUDED_MODEL_KEYWORDS.some((kw) => lower.includes(kw))) continue;

    validNames.push(cleanName);
  }

  const deduped = Array.from(new Set(validNames));

  deduped.sort((a, b) => {
    const ia = PREFERRED_MODEL_ORDER.indexOf(a);
    const ib = PREFERRED_MODEL_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    const aFlash = a.includes('flash') ? 0 : 1;
    const bFlash = b.includes('flash') ? 0 : 1;
    if (aFlash !== bFlash) return aFlash - bFlash;
    return b.localeCompare(a);
  });

  return deduped;
}

async function discoverAvailableGeminiModels(apiKey: string): Promise<string[]> {
  const cacheKey = hashApiKey(apiKey);
  const cached = discoveredModelsCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < 10 * 60 * 1000 && cached.models.length > 0) {
    return cached.models.slice(0, 2);
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(
        apiKey
      )}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(6000),
      }
    );
    if (resp.ok) {
      const data: any = await resp.json().catch(() => ({}));
      const ranked = rankAndFilterGeminiModels(data?.models || []);
      if (ranked.length > 0) {
        discoveredModelsCache.set(cacheKey, { models: ranked, fetchedAt: Date.now() });
        console.log('[FrancoDroid AI] Modelos rápidos descobertos:', ranked.slice(0, 2));
        return ranked.slice(0, 2);
      }
    }
  } catch (err: any) {
    console.warn('[FrancoDroid AI] Aviso ao listar modelos:', err?.message || err);
  }

  return ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
}

app.post('/api/ai/validate-key', async (req: Request, res: Response): Promise<void> => {
  try {
    const { apiKey } = req.body;
    const keyToTest = (apiKey && String(apiKey).trim()) || '';
    if (!keyToTest) {
      res.status(400).json({ valid: false, message: 'Nenhuma chave fornecida.' });
      return;
    }

    // Fast metadata check (< 400ms, zero token cost) + pre-warms available models cache
    const checkRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${encodeURIComponent(
        keyToTest
      )}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(6000),
      }
    );

    if (checkRes.ok) {
      const data: any = await checkRes.json().catch(() => ({}));
      const ranked = rankAndFilterGeminiModels(data?.models || []);
      if (ranked.length > 0) {
        discoveredModelsCache.set(hashApiKey(keyToTest), {
          models: ranked,
          fetchedAt: Date.now(),
        });
      }
      res.json({
        valid: true,
        message: 'Chave Gemini válida e conectada!',
      });
      return;
    }

    const errData: any = await checkRes.json().catch(() => ({}));
    const errMsg = String(errData?.error?.message || '');

    if (checkRes.status === 429 || errMsg.includes('RESOURCE_EXHAUSTED')) {
      res.json({
        valid: true,
        quotaWarning: true,
        message: 'Chave válida! Cota temporariamente ocupada; você já pode salvar e usar.',
      });
      return;
    }

    res.status(401).json({
      valid: false,
      message: errMsg || 'Chave de API inválida ou sem permissão.',
    });
  } catch (error: any) {
    console.warn('Erro ao validar chave:', error?.message || error);
    res.status(500).json({
      valid: false,
      message: error?.message || 'Erro ao conectar à API do Google.',
    });
  }
});

// ==================== SERVER-SIDE FFPROBE & FFMPEG VIDEO PIPELINE ====================

interface VideoProbeInfo {
  hasVideo: boolean;
  durationSec: number;
  width: number;
  height: number;
  codecName: string;
}

function formatSecShort(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

async function probeVideoWithFfprobe(inputPath: string): Promise<VideoProbeInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-show_entries',
        'stream=codec_type,codec_name,width,height',
        '-of',
        'json',
        inputPath,
      ],
      { timeout: 12000 }
    );
    const parsed = JSON.parse(stdout || '{}');
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    const durationSec = Number(parsed?.format?.duration) || 0;

    return {
      hasVideo: Boolean(videoStream),
      durationSec: isFinite(durationSec) && durationSec > 0 ? durationSec : 0,
      width: Number(videoStream?.width) || 0,
      height: Number(videoStream?.height) || 0,
      codecName: String(videoStream?.codec_name || ''),
    };
  } catch (err: any) {
    console.warn('[FrancoDroid FFprobe] Falha ao inspecionar vídeo:', err?.message);
    return null;
  }
}

async function optimizeVideoWithFfmpeg(
  inputPath: string,
  durationSec = 0
): Promise<{ outputPath: string; sizeBytes: number } | null> {
  const outputPath = `${inputPath}_opt.mp4`;
  // Short clips (< 6s) use 6fps; normal clips use 3fps @ 720px ultrafast -> ~5x fewer tokens, super fast Gemini response
  const targetFps = durationSec > 0 && durationSec < 6 ? 6 : 3;
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        inputPath,
        '-vf',
        `scale='min(720,iw)':-2,fps=${targetFps}`,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '28',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        outputPath,
      ],
      { timeout: 35000 }
    );
    const stat = await fs.promises.stat(outputPath);
    if (stat.size > 1000) {
      return { outputPath, sizeBytes: stat.size };
    }
    return null;
  } catch (err: any) {
    console.warn('[FrancoDroid FFmpeg] Aviso ao otimizar vídeo, usando original:', err?.message);
    fs.promises.unlink(outputPath).catch(() => {});
    return null;
  }
}

interface VideoSegmentSpec {
  index: number;
  startSec: number;
  endSec: number;
  filePath: string;
  sizeBytes: number;
}

async function splitVideoIntoSegmentsWithFfmpeg(
  inputPath: string,
  totalDurationSec: number,
  maxSegmentSec = 30,
  overlapSec = 2
): Promise<VideoSegmentSpec[]> {
  const safeDuration = Math.max(2, totalDurationSec);
  const maxParts = 4;
  // Dynamically widen segment duration if video is super long so we never exceed 4 fast parts
  const minRequiredLen = Math.ceil((safeDuration + overlapSec * (maxParts - 1)) / maxParts);
  const segLen = Math.max(maxSegmentSec, minRequiredLen);
  const step = Math.max(8, segLen - overlapSec);

  const windows: Array<{ index: number; startSec: number; endSec: number }> = [];
  let cursor = 0;
  while (cursor < safeDuration && windows.length < maxParts) {
    const end = Math.min(safeDuration, cursor + segLen);
    windows.push({ index: windows.length, startSec: cursor, endSec: end });
    if (end >= safeDuration - 0.5) break;
    cursor += step;
  }

  const encoded = await mapWithConcurrency(windows, 2, async (w) => {
    const segPath = `${inputPath}_part${w.index + 1}.mp4`;
    const clipLen = Math.max(1.5, w.endSec - w.startSec);
    try {
      await execFileAsync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          w.startSec.toFixed(2),
          '-i',
          inputPath,
          '-t',
          clipLen.toFixed(2),
          '-vf',
          "scale='min(720,iw)':-2,fps=2",
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '29',
          '-pix_fmt',
          'yuv420p',
          '-an',
          '-movflags',
          '+faststart',
          segPath,
        ],
        { timeout: 30000 }
      );
      const stat = await fs.promises.stat(segPath);
      if (stat.size > 1000) {
        return {
          index: w.index,
          startSec: w.startSec,
          endSec: w.endSec,
          filePath: segPath,
          sizeBytes: stat.size,
        } as VideoSegmentSpec;
      }
      fs.promises.unlink(segPath).catch(() => {});
      return null;
    } catch (err: any) {
      console.warn(`[FrancoDroid FFmpeg] Falha ao gerar parte ${w.index + 1}:`, err?.message);
      fs.promises.unlink(segPath).catch(() => {});
      return null;
    }
  });

  return encoded
    .filter((s): s is VideoSegmentSpec => Boolean(s))
    .sort((a, b) => a.index - b.index);
}

function buildReferenceImagesFromStored(
  storedGab: Record<string, any>,
  allowedCodes: string[]
): Array<{ missionCode: string; tierLabel: string; points: number; base64: string }> {
  const result: Array<{ missionCode: string; tierLabel: string; points: number; base64: string }> = [];
  for (const code of Object.keys(storedGab || {}).sort()) {
    if (allowedCodes.length > 0 && !allowedCodes.includes(code.toUpperCase())) continue;
    const item = storedGab[code];
    if (!item?.pointTiers) continue;
    for (const tierVal of Object.values(item.pointTiers) as any[]) {
      const sample = Array.isArray(tierVal?.files)
        ? tierVal.files.find((f: any) => typeof f?.base64 === 'string' && f.base64.length > 50)
        : null;
      if (sample) {
        result.push({
          missionCode: code.toUpperCase(),
          tierLabel: String(tierVal.label || ''),
          points: Number(tierVal.points) || 0,
          base64: sample.base64,
        });
      }
    }
  }
  return result;
}

async function waitForGeminiFileActive(ai: GoogleGenAI, fileName: string, timeoutMs = 75000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const fileInfo = await ai.files.get({ name: fileName });
    if (fileInfo.state === 'ACTIVE') {
      return fileInfo;
    }
    if (fileInfo.state === 'FAILED') {
      throw new Error('O Google Gemini não conseguiu decodificar este formato de vídeo.');
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error('Tempo esgotado aguardando processamento do vídeo na API do Gemini.');
}

// ==================== STRICT OUTPUT SANITIZER ====================

function sanitizeAnalysisOutput(
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
    if (rawStatus === 'not_attempted' && informedCodes.length === 0) {
      continue;
    }

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
        String(item?.evidenceDescription || '').trim() ||
        'Estado identificado na análise visual.',
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
      : 'Análise feita sem fotos de gabarito (apenas com o Livro de Regras BIOGLOW). Confira e corrija qualquer erro antes de salvar ou treinar a IA.',
  };
}

function formatFriendlyGeminiError(err: any): string {
  const msg = String(err?.message || err || '');
  const lower = msg.toLowerCase();

  if (lower.includes('api_key_invalid') || lower.includes('permission_denied') || msg.includes('401') || msg.includes('403')) {
    return 'Sua chave da API Gemini parece inválida ou sem permissão. Verifique-a na aba "Configurar IA".';
  }
  if (lower.includes('resource_exhausted') || msg.includes('429') || lower.includes('quota')) {
    return 'Cota gratuita da API Gemini temporariamente atingida. Aguarde ~20 segundos ou corte o trecho para usar menos tokens.';
  }
  if (lower.includes('payload size exceeds') || lower.includes('token count') || lower.includes('too large') || msg.includes('413')) {
    return 'Os dados enviados (vídeo + fotos do gabarito) excederam o limite de tokens da API gratuita. Tente informar as missões feitas ou cortar um trecho menor.';
  }
  if (lower.includes('tempo limite')) {
    return msg;
  }
  return msg || 'Falha ao processar análise com a IA.';
}

// ==================== MULTI-PART RESULT MERGER ====================

function mergePartAnalyses(
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
        // Prefer higher achieved score; on tie, prefer later part (final board state) or higher confidence
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
  const totalScore = mergedMissions.reduce(
    (sum, m) => sum + (Number(m.estimatedScore) || 0),
    0
  );
  const avgConf =
    partResults.length > 0
      ? Math.round(
          partResults.reduce((s, p) => s + (Number(p.sanitized?.overallConfidence) || 70), 0) /
            partResults.length
        )
      : 70;

  const finalSec = totalDurationSec > 0 ? Math.round(totalDurationSec) : 0;
  const partSummaries = partResults
    .map(
      (p, i) =>
        `Parte ${i + 1} (${formatSecShort(p.startSec)}–${formatSecShort(p.endSec)}): ${
          p.sanitized?.summary || 'analisada'
        }`
    )
    .join(' | ');

  return {
    estimatedTotalScore: totalScore,
    totalTimeFormatted: formatSecShort(finalSec),
    totalTimeSeconds: finalSec,
    overallConfidence: avgConf,
    summary: `Análise consolidada em ${partResults.length} partes — ${partSummaries}`.slice(0, 1200),
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
      : 'Análise em partes feita sem fotos de gabarito (apenas com o Livro de Regras BIOGLOW). Confira e corrija qualquer erro antes de salvar.',
  };
}

// ==================== ASYNC ANALYSIS RUNNER ====================

async function runAnalysisJob(
  jobId: string,
  params: {
    uploadedFile?: { path: string; originalname: string; mimetype: string; size: number };
    legacyMediaInput?: string;
    rawMimeType?: string;
    missions: any[];
    informedMissions: string[];
    referenceBase: any[];
    referenceImages: any[];
    useServerGabarito?: boolean;
    splitMode?: 'auto' | 'parts' | 'single';
    clientTrainingExamples?: any[];
    apiKey: string;
  }
) {
  const job = analysisJobs.get(jobId);
  if (!job) return;

  const tempFilesToCleanup: string[] = [];
  if (params.uploadedFile?.path) tempFilesToCleanup.push(params.uploadedFile.path);
  const remoteFilesToDelete: string[] = [];

  const aiClient = new GoogleGenAI({
    apiKey: params.apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const updateJob = (patch: Partial<AnalysisJobState>) => {
    const current = analysisJobs.get(jobId);
    if (!current || current.stage === 'cancelled') return;
    analysisJobs.set(jobId, { ...current, ...patch, updatedAt: Date.now() });
  };

  try {
    let detectedMime = params.rawMimeType || params.uploadedFile?.mimetype || 'video/mp4';
    const isVideoUpload = Boolean(params.uploadedFile) && detectedMime.startsWith('video/');

    const cleanedInformed: string[] = Array.isArray(params.informedMissions)
      ? params.informedMissions.map((c: any) => String(c).trim().toUpperCase()).filter(Boolean)
      : [];

    const activeMissionsToAnalyze =
      cleanedInformed.length > 0
        ? params.missions.filter((m: any) =>
            cleanedInformed.includes(String(m.code).toUpperCase())
          )
        : params.missions;

    const allowedCodesList: string[] = activeMissionsToAnalyze.map((m: any) =>
      String(m.code).toUpperCase()
    );

    // Resolve gabarito photos from request or disk cache; cap concisely to keep latency & tokens fast
    let rawRefImages = Array.isArray(params.referenceImages) ? params.referenceImages : [];
    if (rawRefImages.length === 0 && params.useServerGabarito !== false) {
      rawRefImages = buildReferenceImagesFromStored(readStoredGabarito(), allowedCodesList);
    }

    const refImageCap = cleanedInformed.length > 0 ? 8 : 5;
    const relevantRefImages = rawRefImages
      .filter((r: any) => allowedCodesList.includes(String(r?.missionCode || '').toUpperCase()))
      .slice(0, refImageCap);

    const referenceParts: any[] = [];
    if (relevantRefImages.length > 0) {
      referenceParts.push({
        text: 'FOTOS DO GABARITO DA EQUIPE (use para comparar o estado final):',
      });

      for (const refImg of relevantRefImages) {
        if (!refImg?.base64) continue;
        let refMime = 'image/jpeg';
        let refData = String(refImg.base64);
        if (refData.includes(';base64,')) {
          const split = refData.split(';base64,');
          refMime = split[0].replace('data:', '') || 'image/jpeg';
          refData = split[1];
        }
        referenceParts.push({
          text: `[GABARITO] ${refImg.missionCode} | Pasta: "${refImg.tierLabel}" | Pontos: ${refImg.points}`,
        });
        referenceParts.push({
          inlineData: {
            mimeType: refMime,
            data: refData,
          },
        });
      }
    }

    const hasGabarito = relevantRefImages.length > 0;

    // Load REAL persisted team training feedback
    const allTraining =
      Array.isArray(params.clientTrainingExamples) && params.clientTrainingExamples.length > 0
        ? mergeAndWriteTrainingExamples(params.clientTrainingExamples)
        : readTrainingExamples();
    const relevantTraining = allTraining
      .filter(
        (t) =>
          t.missionCode === 'GERAL' || allowedCodesList.includes(t.missionCode.toUpperCase())
      )
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
      trainingPromptSection = `
*** APRENDIZADO DA EQUIPE (OBRIGATÓRIO) ***:
${lines.join('\n')}
`;

      let visualSnapsAdded = 0;
      for (const t of relevantTraining) {
        if (t.snapshotBase64 && visualSnapsAdded < 1) {
          let snapMime = 'image/jpeg';
          let snapData = t.snapshotBase64;
          if (snapData.includes(';base64,')) {
            const sp = snapData.split(';base64,');
            snapMime = sp[0].replace('data:', '') || 'image/jpeg';
            snapData = sp[1];
          }
          trainingParts.push({
            text: `[EXEMPLO DE CORREÇÃO] ${t.missionCode}: ${t.expectedSummary}. ${t.userExplanation}`,
          });
          trainingParts.push({
            inlineData: {
              mimeType: snapMime,
              data: snapData,
            },
          });
          visualSnapsAdded++;
        }
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

    // Compact 1-line-per-mission rules summary (~8x smaller token footprint -> faster AI response)
    const compactMissionsGuide = activeMissionsToAnalyze
      .map(
        (m: any) =>
          `${m.code} (${m.name}, válidos:[${(m.validScores || [0, m.maxScore]).join(',')}]): ${
            m.visualGuide || m.description || ''
          }`
      )
      .join('\n');

    const buildPromptForMedia = (segmentNote = '') => `
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

    // Helper: build Gemini mediaPart (inlineData <= 10 MB, Files API > 10 MB)
    const buildMediaPartFromFile = async (
      filePath: string,
      sizeBytes: number,
      mimeType: string,
      displayName: string
    ) => {
      if (sizeBytes <= 10 * 1024 * 1024) {
        const buf = await fs.promises.readFile(filePath);
        return {
          inlineData: {
            mimeType,
            data: buf.toString('base64'),
          },
        };
      }

      const remoteFile = await aiClient.files.upload({
        file: filePath,
        config: {
          mimeType,
          displayName,
        },
      });
      if (!remoteFile?.name) {
        throw new Error('Falha ao registrar vídeo na API de Arquivos do Gemini.');
      }
      remoteFilesToDelete.push(remoteFile.name);
      const activeFile = await waitForGeminiFileActive(aiClient, remoteFile.name, 60000);
      return {
        fileData: {
          fileUri: activeFile.uri,
          mimeType: activeFile.mimeType || mimeType,
        },
      };
    };

    // Helper: run Gemini inference with fast timeouts, pinned model support, and clean 400 fallback
    const runGeminiOnMediaPart = async (
      mediaPart: any,
      promptText: string,
      progressBase: number,
      stepPrefix: string,
      options: { isMultiPart?: boolean; pinnedModel?: string } = {}
    ): Promise<{ parsedData: any; successfulModel: string }> => {
      const multimodalParts = [
        ...referenceParts,
        ...trainingParts,
        { text: 'MÍDIA DO ROUND:' },
        mediaPart,
        { text: promptText },
      ];

      const discovered = await discoverAvailableGeminiModels(params.apiKey);
      const modelsToTry = options.pinnedModel
        ? [options.pinnedModel, ...discovered.filter((m) => m !== options.pinnedModel)].slice(0, 2)
        : discovered;

      const perModelTimeoutMs = options.isMultiPart ? 38000 : 50000;
      let lastError: any = null;
      const attemptErrors: string[] = [];

      for (let i = 0; i < modelsToTry.length; i++) {
        if (analysisJobs.get(jobId)?.stage === 'cancelled') {
          throw new Error('ABORTED');
        }

        const modelCandidate = modelsToTry[i];
        updateJob({
          stage: 'analyzing_ai',
          progress: Math.min(95, progressBase + i * 2),
          message: `${stepPrefix} (${modelCandidate})...`,
        });

        const buildRequestConfig = (includeAdvancedParams: boolean) => {
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

          if (includeAdvancedParams) {
            const targetRes = options.isMultiPart
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
            setTimeout(
              () => reject(new Error(`Tempo limite (${Math.round(perModelTimeoutMs / 1000)}s) no modelo ${modelCandidate}`)),
              perModelTimeoutMs
            )
          );

          let response: any;
          try {
            const generatePromise = aiClient.models.generateContent({
              model: modelCandidate,
              contents: { parts: multimodalParts },
              config: buildRequestConfig(true),
            });
            response = await Promise.race([generatePromise, timeoutPromise]);
          } catch (firstErr: any) {
            const firstMsg = String(firstErr?.message || '');
            const isArgError =
              firstMsg.includes('INVALID_ARGUMENT') ||
              firstMsg.includes('400') ||
              firstMsg.toLowerCase().includes('thinking') ||
              firstMsg.toLowerCase().includes('mediaresolution');

            if (!isArgError) throw firstErr;

            const retryPromise = aiClient.models.generateContent({
              model: modelCandidate,
              contents: { parts: multimodalParts },
              config: buildRequestConfig(false),
            });
            response = await Promise.race([retryPromise, timeoutPromise]);
          }

          const rawJson = (response.text ?? '{}').trim();
          const parsedData = JSON.parse(rawJson);
          console.log(`[FrancoDroid AI] Sucesso (${stepPrefix}) com ${modelCandidate}!`);
          return { parsedData, successfulModel: modelCandidate };
        } catch (err: any) {
          lastError = err;
          const msg = String(err?.message || err || '');
          attemptErrors.push(`${modelCandidate}: ${msg}`);
          console.warn(`[FrancoDroid AI] Falha (${stepPrefix}) ${modelCandidate}:`, msg);
          if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
            break;
          }
        }
      }

      if (attemptErrors.length > 1) {
        const non404 = attemptErrors.find((e) => !e.includes('404') && !e.includes('NOT_FOUND'));
        if (non404) {
          throw new Error(non404);
        }
      }
      throw lastError || new Error('Falha ao analisar mídia com a IA.');
    };

    const allowedSanitizeList = activeMissionsToAnalyze.map((m: any) => ({
      code: String(m.code),
      maxScore: Number(m.maxScore) || 30,
      validScores: Array.isArray(m.validScores) ? m.validScores : undefined,
    }));

    let finalAnalysisPayload: any = null;

    if (params.uploadedFile) {
      let probedDuration = 0;

      if (isVideoUpload) {
        updateJob({
          stage: 'optimizing',
          progress: 30,
          message: 'Verificando integridade e duração do vídeo...',
        });
        const probe = await probeVideoWithFfprobe(params.uploadedFile.path);
        if (!probe || !probe.hasVideo) {
          throw new Error(
            'Este arquivo não possui trilha de vídeo válida ou está corrompido. Regrave em MP4 padrão.'
          );
        }
        probedDuration = probe.durationSec || 0;
      }

      const splitMode = params.splitMode || 'auto';
      const shouldSplitInitially =
        isVideoUpload &&
        probedDuration > 18 &&
        (splitMode === 'parts' || (splitMode === 'auto' && probedDuration > 40));

      const analyzeInParts = async (targetDurationSec: number) => {
        updateJob({
          stage: 'optimizing',
          progress: 36,
          message: `Dividindo vídeo (${formatSecShort(targetDurationSec)}) em partes leves...`,
        });

        const segLen = targetDurationSec <= 45 ? Math.max(15, Math.ceil(targetDurationSec / 2) + 2) : 30;
        const segments = await splitVideoIntoSegmentsWithFfmpeg(
          params.uploadedFile!.path,
          targetDurationSec,
          segLen,
          2
        );
        segments.forEach((s) => tempFilesToCleanup.push(s.filePath));

        if (segments.length === 0) {
          throw new Error(
            'Não foi possível dividir este formato de vídeo no servidor. Tente cortar um trecho pelo Cortador Integrado.'
          );
        }

        const partResults: Array<{ startSec: number; endSec: number; sanitized: any }> = [];
        let lastModelUsed = '';
        let partialInterruptionMsg = '';

        const processOneSegment = async (seg: VideoSegmentSpec, pinnedModel?: string) => {
          const partLabel = `Parte ${seg.index + 1}/${segments.length} (${formatSecShort(seg.startSec)}–${formatSecShort(seg.endSec)})`;
          const progressBase = 44 + Math.round((seg.index / segments.length) * 46);
          const segMediaPart = await buildMediaPartFromFile(
            seg.filePath,
            seg.sizeBytes,
            'video/mp4',
            `part_${seg.index + 1}.mp4`
          );

          const { parsedData, successfulModel } = await runGeminiOnMediaPart(
            segMediaPart,
            buildPromptForMedia(
              `${partLabel} de ${formatSecShort(targetDurationSec)}.`
            ),
            progressBase,
            `Analisando ${partLabel}`,
            { isMultiPart: true, pinnedModel }
          );

          const sanitized = sanitizeAnalysisOutput(
            parsedData,
            allowedSanitizeList,
            hasGabarito,
            relevantTraining.length,
            cleanedInformed
          );
          return {
            successfulModel,
            result: { startSec: seg.startSec, endSec: seg.endSec, sanitized },
          };
        };

        // Run Part 1 first to discover and pin the fastest working Gemini model
        const firstRes = await processOneSegment(segments[0]);
        lastModelUsed = firstRes.successfulModel;
        partResults.push(firstRes.result);

        // Run remaining Parts 2..N in pairs (2x faster!) with pinned model & graceful partial recovery
        const remainingSegments = segments.slice(1);
        for (let b = 0; b < remainingSegments.length; b += 2) {
          if (analysisJobs.get(jobId)?.stage === 'cancelled') return null;
          const batch = remainingSegments.slice(b, b + 2);
          updateJob({
            stage: 'analyzing_ai',
            progress: Math.min(92, 52 + Math.round(((b + 1) / segments.length) * 40)),
            message: `Analisando Parte ${batch[0].index + 1}${
              batch.length > 1 ? ` e ${batch[1].index + 1}` : ''
            } de ${segments.length} (${lastModelUsed})...`,
          });

          const batchOutcomes = await Promise.allSettled(
            batch.map((seg) => processOneSegment(seg, lastModelUsed))
          );

          for (const outcome of batchOutcomes) {
            if (outcome.status === 'fulfilled') {
              lastModelUsed = outcome.value.successfulModel;
              partResults.push(outcome.value.result);
            } else {
              const errMsg = formatFriendlyGeminiError(outcome.reason);
              partialInterruptionMsg = `Partes analisadas: ${partResults.length}/${segments.length} (trecho interrompido: ${errMsg})`;
              console.warn('[FrancoDroid AI] Parte falhou após partes anteriores:', errMsg);
            }
          }
        }

        partResults.sort((a, b) => a.startSec - b.startSec);
        const merged = mergePartAnalyses(
          partResults,
          targetDurationSec,
          hasGabarito,
          relevantTraining.length
        );
        if (partialInterruptionMsg) {
          merged.gabaritoWarning = merged.gabaritoWarning
            ? `${partialInterruptionMsg} · ${merged.gabaritoWarning}`
            : partialInterruptionMsg;
        }

        return {
          modelUsed: lastModelUsed || 'gemini-3.8-flash',
          merged,
        };
      };

      if (shouldSplitInitially) {
        const resParts = await analyzeInParts(probedDuration);
        if (!resParts) return;
        finalAnalysisPayload = {
          id: `ai_${Date.now()}`,
          analyzedAt: new Date().toISOString(),
          modelUsed: resParts.modelUsed,
          ...resParts.merged,
        };
      } else {
        let activeFilePath = params.uploadedFile.path;
        let activeSizeBytes = params.uploadedFile.size;

        if (isVideoUpload && (activeSizeBytes > 800 * 1024 || detectedMime !== 'video/mp4')) {
          updateJob({
            stage: 'optimizing',
            progress: 38,
            message: `Otimizando vídeo (${(activeSizeBytes / (1024 * 1024)).toFixed(1)} MB) para envio rápido...`,
          });

          const opt = await optimizeVideoWithFfmpeg(activeFilePath, probedDuration);
          if (analysisJobs.get(jobId)?.stage === 'cancelled') return;

          if (opt && opt.sizeBytes < activeSizeBytes * 0.95) {
            tempFilesToCleanup.push(opt.outputPath);
            activeFilePath = opt.outputPath;
            activeSizeBytes = opt.sizeBytes;
            detectedMime = 'video/mp4';
            console.log(
              `[FrancoDroid FFmpeg] Vídeo otimizado: ${(params.uploadedFile.size / (1024 * 1024)).toFixed(1)} MB -> ${(activeSizeBytes / (1024 * 1024)).toFixed(2)} MB`
            );
          }
        }

        if (activeSizeBytes > 10 * 1024 * 1024) {
          updateJob({
            stage: 'uploading_gemini',
            progress: 50,
            message: `Enviando vídeo (${(activeSizeBytes / (1024 * 1024)).toFixed(1)} MB) para a API Gemini...`,
          });
        }

        const mediaPart = await buildMediaPartFromFile(
          activeFilePath,
          activeSizeBytes,
          detectedMime,
          params.uploadedFile.originalname || 'fll_round_media'
        );

        try {
          const { parsedData, successfulModel } = await runGeminiOnMediaPart(
            mediaPart,
            buildPromptForMedia(),
            60,
            'Analisando vídeo com IA'
          );

          const sanitized = sanitizeAnalysisOutput(
            parsedData,
            allowedSanitizeList,
            hasGabarito,
            relevantTraining.length,
            cleanedInformed
          );

          if (probedDuration > 0 && sanitized.totalTimeSeconds === 0) {
            sanitized.totalTimeSeconds = Math.round(probedDuration);
            sanitized.totalTimeFormatted = formatSecShort(probedDuration);
          }

          finalAnalysisPayload = {
            id: `ai_${Date.now()}`,
            analyzedAt: new Date().toISOString(),
            modelUsed: successfulModel,
            ...sanitized,
          };
        } catch (singleErr: any) {
          const msgLower = String(singleErr?.message || '').toLowerCase();
          const canAutoFallbackSplit =
            isVideoUpload &&
            probedDuration >= 10 &&
            splitMode !== 'single' &&
            !msgLower.includes('api_key_invalid') &&
            !msgLower.includes('permission_denied') &&
            (msgLower.includes('token') ||
              msgLower.includes('payload') ||
              msgLower.includes('too large') ||
              msgLower.includes('413') ||
              msgLower.includes('tempo limite') ||
              msgLower.includes('resource_exhausted') ||
              msgLower.includes('429'));

          if (!canAutoFallbackSplit) {
            throw singleErr;
          }

          console.log('[FrancoDroid AI] Fallback automático: dividindo vídeo em partes menores...');
          const resParts = await analyzeInParts(probedDuration);
          if (!resParts) return;
          finalAnalysisPayload = {
            id: `ai_${Date.now()}`,
            analyzedAt: new Date().toISOString(),
            modelUsed: resParts.modelUsed,
            ...resParts.merged,
          };
        }
      }
    } else if (params.legacyMediaInput) {
      let base64Data = String(params.legacyMediaInput);
      if (base64Data.includes(';base64,')) {
        const parts = base64Data.split(';base64,');
        detectedMime = parts[0].replace('data:', '') || detectedMime;
        base64Data = parts[1];
      }
      const mediaPart = {
        inlineData: {
          mimeType: detectedMime,
          data: base64Data,
        },
      };
      const { parsedData, successfulModel } = await runGeminiOnMediaPart(
        mediaPart,
        buildPromptForMedia(),
        60,
        'Analisando imagem com IA'
      );
      const sanitized = sanitizeAnalysisOutput(
        parsedData,
        allowedSanitizeList,
        hasGabarito,
        relevantTraining.length,
        cleanedInformed
      );
      finalAnalysisPayload = {
        id: `ai_${Date.now()}`,
        analyzedAt: new Date().toISOString(),
        modelUsed: successfulModel,
        ...sanitized,
      };
    }

    if (analysisJobs.get(jobId)?.stage === 'cancelled') return;

    updateJob({
      stage: 'done',
      progress: 100,
      message: 'Análise concluída!',
      analysis: finalAnalysisPayload,
    });
  } catch (err: any) {
    if (err?.message === 'ABORTED') return;
    console.error('[FrancoDroid AI Job Error]:', err);
    updateJob({
      stage: 'error',
      progress: 0,
      message: 'Erro na análise',
      error: formatFriendlyGeminiError(err),
    });
  } finally {
    for (const f of tempFilesToCleanup) {
      fs.promises.unlink(f).catch(() => {});
    }
    for (const rf of remoteFilesToDelete) {
      aiClient.files.delete({ name: rf }).catch(() => {});
    }
  }
}

// ==================== CHUNKED UPLOAD ENDPOINTS (BYPASSES PROXY BODY LIMITS) ====================

app.post('/api/ai/upload/init', (req: Request, res: Response): void => {
  try {
    const fileName = String(req.body?.fileName || 'video.mp4').slice(0, 140);
    const mimeType = String(req.body?.mimeType || 'video/mp4').slice(0, 80);
    const uploadId = `upl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const filePath = path.join(uploadDir, `${uploadId}.bin`);
    fs.writeFileSync(filePath, Buffer.alloc(0));

    pendingUploads.set(uploadId, {
      uploadId,
      filePath,
      fileName,
      mimeType,
      totalBytesReceived: 0,
      createdAt: Date.now(),
    });

    res.json({ success: true, uploadId });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao preparar envio em partes.' });
  }
});

app.post(
  '/api/ai/upload/chunk',
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('chunk')(req, res, (err: any) => {
      if (err) {
        res.status(400).json({ error: err?.message || 'Erro ao receber pedaço do vídeo.' });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response): Promise<void> => {
    const tempChunkPath = req.file?.path;
    try {
      const uploadId = String(req.body?.uploadId || '').trim();
      const session = pendingUploads.get(uploadId);
      if (!session || !req.file) {
        if (tempChunkPath) fs.promises.unlink(tempChunkPath).catch(() => {});
        res.status(400).json({ error: 'Sessão de envio inválida ou expirada.' });
        return;
      }

      const chunkBuf = await fs.promises.readFile(req.file.path);
      await fs.promises.appendFile(session.filePath, chunkBuf);
      session.totalBytesReceived += chunkBuf.byteLength;
      if (tempChunkPath) fs.promises.unlink(tempChunkPath).catch(() => {});

      res.json({
        success: true,
        receivedBytes: session.totalBytesReceived,
      });
    } catch (err: any) {
      if (tempChunkPath) fs.promises.unlink(tempChunkPath).catch(() => {});
      res.status(500).json({ error: err?.message || 'Falha ao gravar parte do vídeo.' });
    }
  }
);

// Multer middleware wrapper for direct small uploads
const handleMediaUpload = (req: Request, res: Response, next: NextFunction) => {
  if (req.is('multipart/form-data')) {
    upload.single('media')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error:
              'O arquivo ultrapassa o limite de 100 MB. Use o Cortador de Vídeo integrado para recortar um trecho.',
          });
          return;
        }
        res.status(400).json({ error: err.message || 'Erro ao receber arquivo de mídia.' });
        return;
      }
      next();
    });
  } else {
    next();
  }
};

// Start Async AI Analysis Job (returns jobId immediately -> never hits 60s HTTP gateway timeout!)
app.post('/api/ai/analyze-mat', handleMediaUpload, (req: Request, res: Response): void => {
  let bodyPayload: any = req.body || {};
  if (typeof req.body?.payload === 'string') {
    try {
      bodyPayload = JSON.parse(req.body.payload);
    } catch {
      if (req.file?.path) fs.promises.unlink(req.file.path).catch(() => {});
      res.status(400).json({ error: 'Metadados da análise inválidos.' });
      return;
    }
  }

  const {
    uploadId = '',
    video,
    image,
    mimeType: rawMimeType,
    missions = [],
    informedMissions = [],
    referenceBase = [],
    referenceImages = [],
    useServerGabarito = true,
    splitMode = 'auto',
    clientTrainingExamples = [],
    userApiKey = '',
  } = bodyPayload;

  let resolvedFile:
    | { path: string; originalname: string; mimetype: string; size: number }
    | undefined = req.file
    ? {
        path: req.file.path,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      }
    : undefined;

  if (!resolvedFile && uploadId) {
    const sess = pendingUploads.get(String(uploadId));
    if (sess && fs.existsSync(sess.filePath) && sess.totalBytesReceived > 0) {
      pendingUploads.delete(sess.uploadId);
      resolvedFile = {
        path: sess.filePath,
        originalname: sess.fileName,
        mimetype: sess.mimeType,
        size: sess.totalBytesReceived,
      };
    }
  }

  const legacyMediaInput = video || image;

  if (!resolvedFile && !legacyMediaInput) {
    res.status(400).json({ error: 'Nenhum vídeo ou foto foi enviado para análise.' });
    return;
  }

  const apiKey = (userApiKey && String(userApiKey).trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (resolvedFile?.path) fs.promises.unlink(resolvedFile.path).catch(() => {});
    res.status(503).json({
      error: 'Nenhuma chave Gemini API configurada. Cole sua chave acima para analisar.',
    });
    return;
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  analysisJobs.set(jobId, {
    jobId,
    stage: 'queued',
    progress: 28,
    message: 'Arquivo recebido! Preparando análise...',
    createdAt: Date.now(),
  });

  void runAnalysisJob(jobId, {
    uploadedFile: resolvedFile,
    legacyMediaInput,
    rawMimeType,
    missions,
    informedMissions,
    referenceBase,
    referenceImages,
    useServerGabarito,
    splitMode,
    clientTrainingExamples,
    apiKey,
  });

  res.status(202).json({
    success: true,
    jobId,
    stage: 'queued',
  });
});

// Poll Async AI Analysis Job Status
app.get('/api/ai/jobs/:jobId', (req: Request, res: Response): void => {
  const job = analysisJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Trabalho de análise não encontrado ou expirado.' });
    return;
  }
  res.json(job);
});

// Cancel Async AI Analysis Job
app.delete('/api/ai/jobs/:jobId', (req: Request, res: Response): void => {
  const job = analysisJobs.get(req.params.jobId);
  if (job) {
    analysisJobs.set(req.params.jobId, {
      ...job,
      stage: 'cancelled',
      message: 'Análise cancelada pelo usuário.',
    });
  }
  res.json({ success: true });
});

// Configure Vite middleware in development or serve static in production
async function startServer() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, () => {
    console.log(
      `FrancoDroid FLL Analytics rodando na porta ${PORT} [env=${isProd ? 'prod' : 'dev'}]`
    );
  });
}

startServer();
