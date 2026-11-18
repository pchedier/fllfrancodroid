
import express, { Request, Response, NextFunction } from 'express';
import { GoogleGenAI, Type, MediaResolution, ThinkingLevel } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const allowedOrigin = 'https://pchedier.github.io';

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

const dataDir = path.join(__dirname, 'data');
const trainingFilePath = path.join(dataDir, 'ai-training-feedback.json');
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

interface AnalysisJobState {
  jobId: string;
  stage: 'queued' | 'optimizing' | 'uploading_gemini' | 'analyzing_ai' | 'done' | 'error' | 'cancelled';
  progress: number;
  message: string;
  analysis?: any;
  error?: string;
  createdAt: number;
}

const analysisJobs = new Map<string, AnalysisJobState>();

setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [id, job] of analysisJobs.entries()) {
    if (job.createdAt < cutoff) {
      analysisJobs.delete(id);
    }
  }
}, 60 * 1000).unref();

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

function writeTrainingExamples(examples: StoredTrainingExample[]): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(trainingFilePath, JSON.stringify(examples, null, 2), 'utf-8');
}

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

app.get('/api/health', (_req: Request, res: Response) => {
  const trainingCount = readTrainingExamples().length;
  res.json({
    status: 'ok',
    team: 'FrancoDroid FLL Analytics',
    geminiConfigured: false,
    userApiKeyRequired: true,
    maxUploadMb: 100,
    trainingExamplesCount: trainingCount,
  });
});

app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    appUrl: process.env.APP_URL || '',
  });
});

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
    if (incoming.length === 0) {
      res.status(400).json({ error: 'Nenhuma correção enviada para treinamento.' });
      return;
    }

    const existing = readTrainingExamples();
    const normalizedNew: StoredTrainingExample[] = incoming
      .filter((item: any) => item && (item.expectedSummary || item.userExplanation))
      .map((item: any, idx: number) => ({
        id: String(item.id || `train_${Date.now()}_${idx}`),
        createdAt: String(item.createdAt || new Date().toISOString()),
        missionCode: String(item.missionCode || 'GERAL').toUpperCase(),
        mistakeType: item.mistakeType || 'other',
        aiPredictedSummary: String(item.aiPredictedSummary || '').slice(0, 300),
        expectedSummary: String(item.expectedSummary || '').slice(0, 300),
        userExplanation: String(item.userExplanation || '').slice(0, 500),
        snapshotBase64:
          typeof item.snapshotBase64 === 'string' && item.snapshotBase64.length < 350_000
            ? item.snapshotBase64
            : undefined,
      }));

    const merged = [...normalizedNew, ...existing].slice(0, 40);
    let snapshotsKept = 0;
    const pruned = merged.map((item) => {
      if (item.snapshotBase64) {
        if (snapshotsKept < 6) {
          snapshotsKept++;
          return item;
        }
        return { ...item, snapshotBase64: undefined };
      }
      return item;
    });

    writeTrainingExamples(pruned);
    res.json({
      success: true,
      savedCount: normalizedNew.length,
      totalCount: pruned.length,
      examples: pruned,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Erro ao salvar treinamento da IA.' });
  }
});

app.delete('/api/ai/training/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const existing = readTrainingExamples();
  const updated = existing.filter((e) => e.id !== id);
  writeTrainingExamples(updated);
  res.json({ success: true, totalCount: updated.length, examples: updated });
});

app.post('/api/ai/validate-key', async (req: Request, res: Response): Promise<void> => {
  try {
    const keyToTest = String(req.body?.apiKey || '').trim();

    if (!keyToTest) {
      res.status(400).json({ valid: false, message: 'Nenhuma chave fornecida.' });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey: keyToTest,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const validationModels = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
    let lastError: any = null;

    for (const model of validationModels) {
      try {
        await ai.models.generateContent({
          model,
          contents: 'ping',
        });
        res.json({ valid: true, message: 'Chave Gemini válida e conectada!', model });
        return;
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        const status = err?.status || err?.code;

        if (status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
          res.json({
            valid: true,
            quotaWarning: true,
            message:
              'Chave válida! A cota gratuita está ocupada no momento; tente novamente em instantes.',
          });
          return;
        }

        if (
          status === 400 ||
          status === 401 ||
          status === 403 ||
          msg.includes('API_KEY_INVALID') ||
          msg.includes('PERMISSION_DENIED')
        ) {
          break;
        }
      }
    }

    res.status(401).json({
      valid: false,
      message: lastError?.message || 'Chave de API inválida ou sem permissão.',
    });
  } catch (error: any) {
    console.warn('Erro ao validar chave:', error?.message || error);
    res.status(500).json({
      valid: false,
      message: error?.message || 'Erro ao conectar à API do Google.',
    });
  }
});

async function optimizeVideoWithFfmpeg(
  inputPath: string
): Promise<{ outputPath: string; sizeBytes: number } | null> {
  const outputPath = `${inputPath}_opt.mp4`;

  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        inputPath,
        '-vf',
        "scale='min(960,iw)':-2,fps=8",
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '27',
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

  if (
    lower.includes('api_key_invalid') ||
    lower.includes('permission_denied') ||
    msg.includes('401') ||
    msg.includes('403')
  ) {
    return 'Sua chave da API Gemini parece inválida ou sem permissão. Verifique-a na aba "Configurar IA".';
  }

  if (lower.includes('resource_exhausted') || msg.includes('429') || lower.includes('quota')) {
    return 'Cota gratuita da API Gemini temporariamente atingida. Aguarde ~20 segundos ou corte o trecho para usar menos tokens.';
  }

  if (
    lower.includes('payload size exceeds') ||
    lower.includes('token count') ||
    lower.includes('too large') ||
    msg.includes('413')
  ) {
    return 'Os dados enviados (vídeo + fotos do gabarito) excederam o limite de tokens da API gratuita. Tente informar as missões feitas ou cortar um trecho menor.';
  }

  if (lower.includes('tempo limite')) {
    return msg;
  }

  return msg || 'Falha ao processar análise com a IA.';
}

async function runAnalysisJob(
  jobId: string,
  params: {
    uploadedFile?: Express.Multer.File;
    legacyMediaInput?: string;
    rawMimeType?: string;
    missions: any[];
    informedMissions: string[];
    referenceBase: any[];
    referenceImages: any[];
    apiKey: string;
  }
) {
  const job = analysisJobs.get(jobId);
  if (!job) return;

  let tempOriginalPath: string | null = params.uploadedFile?.path || null;
  let tempOptimizedPath: string | null = null;
  let uploadedRemoteFileName: string | null = null;

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
    analysisJobs.set(jobId, { ...current, ...patch });
  };

  try {
    let mediaPart: any = null;
    let detectedMime = params.rawMimeType || params.uploadedFile?.mimetype || 'video/mp4';

    if (params.uploadedFile) {
      let activeFilePath = params.uploadedFile.path;
      let activeSizeBytes = params.uploadedFile.size;
      const isVideoUpload = detectedMime.startsWith('video/');

      if (isVideoUpload && (activeSizeBytes > 1 * 1024 * 1024 || detectedMime !== 'video/mp4')) {
        updateJob({
          stage: 'optimizing',
          progress: 35,
          message: `Otimizando vídeo (${(activeSizeBytes / (1024 * 1024)).toFixed(1)} MB) para análise rápida...`,
        });

        const opt = await optimizeVideoWithFfmpeg(activeFilePath);
        if (analysisJobs.get(jobId)?.stage === 'cancelled') return;

        if (opt && opt.sizeBytes < activeSizeBytes * 0.95) {
          tempOptimizedPath = opt.outputPath;
          activeFilePath = opt.outputPath;
          activeSizeBytes = opt.sizeBytes;
          detectedMime = 'video/mp4';

          console.log(
            `[FrancoDroid FFmpeg] Vídeo otimizado: ${(params.uploadedFile.size / (1024 * 1024)).toFixed(1)} MB -> ${(activeSizeBytes / (1024 * 1024)).toFixed(2)} MB`
          );
        }
      }

      if (activeSizeBytes <= 10 * 1024 * 1024) {
        const buf = await fs.promises.readFile(activeFilePath);

        mediaPart = {
          inlineData: {
            mimeType: detectedMime,
            data: buf.toString('base64'),
          },
        };
      } else {
        updateJob({
          stage: 'uploading_gemini',
          progress: 50,
          message: `Enviando vídeo (${(activeSizeBytes / (1024 * 1024)).toFixed(1)} MB) para a API Gemini...`,
        });

        const remoteFile = await aiClient.files.upload({
          file: activeFilePath,
          config: {
            mimeType: detectedMime,
            displayName: params.uploadedFile.originalname || 'fll_round_media',
          },
        });

        if (!remoteFile?.name) {
          throw new Error('Falha ao registrar vídeo na API de Arquivos do Gemini.');
        }

        uploadedRemoteFileName = remoteFile.name;

        const activeFile = await waitForGeminiFileActive(aiClient, remoteFile.name, 75000);

        mediaPart = {
          fileData: {
            fileUri: activeFile.uri,
            mimeType: activeFile.mimeType || detectedMime,
          },
        };
      }
    } else if (params.legacyMediaInput) {
      let base64Data = String(params.legacyMediaInput);

      if (base64Data.includes(';base64,')) {
        const parts = base64Data.split(';base64,');
        detectedMime = parts[0].replace('data:', '') || detectedMime;
        base64Data = parts[1];
      }

      mediaPart = {
        inlineData: {
          mimeType: detectedMime,
          data: base64Data,
        },
      };
    }

    if (analysisJobs.get(jobId)?.stage === 'cancelled') return;

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

    const relevantRefImages = Array.isArray(params.referenceImages)
      ? params.referenceImages
          .filter((r: any) => allowedCodesList.includes(String(r?.missionCode || '').toUpperCase()))
          .slice(0, 10)
      : [];

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

    const allTraining = readTrainingExamples();
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
          `${i + 1}. [${t.missionCode}] Erro anterior: "${t.aiPredictedSummary}" -> Correto: "${t.expectedSummary}"${
            t.userExplanation ? ` | Regra: ${t.userExplanation}` : ''
          }`
      );

      trainingPromptSection = `
*** APRENDIZADO REAL DA EQUIPE (NÃO REPITA ESTES ERROS) ***:
${lines.join('\n')}
`;

      let visualSnapsAdded = 0;

      for (const t of relevantTraining) {
        if (t.snapshotBase64 && visualSnapsAdded < 2) {
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
        ? `O OPERADOR INFORMOU QUE O ROBÔ TENTOU FAZER APENAS: [${cleanedInformed.join(', ')}].
Avalie EXCLUSIVAMENTE estas missões [${cleanedInformed.join(', ')}]. Nunca adicione outra missão.`
        : `MODO AUTOMÁTICO:
REGRA ANTI-ALUCINAÇÃO CRÍTICA:
1. Todos os 15 modelos LEGO ficam no tapete. Ver um modelo parado ao fundo NÃO significa que a missão foi feita!
2. SÓ inclua uma missão em "missionsDetected" se o robô REALMENTE se aproximou/tocou aquele modelo específico no vídeo E você viu mudança física ou resultado claro após o contato!
3. NUNCA inclua M10 (Micro-habitats) automaticamente — ela já começa montada no início.`;

    const gabaritoNote = hasGabarito
      ? `GABARITO ATIVO (${relevantRefImages.length} fotos anexadas). Compare o estado final com essas fotos para definir exatamente 0, parcial ou completa.`
      : `SEM GABARITO: Avalie pelo Livro de Regras BIOGLOW e Guia Visual abaixo. Seja conservador e não dê bônus sem evidência visível clara.`;

    const promptText = `
Você é o árbitro da FIRST LEGO League (Temporada BIOGLOW).

${scopeInstruction}
${gabaritoNote}
${trainingPromptSection}

REGRAS E GUIA VISUAL DAS MISSÕES:
${JSON.stringify(activeMissionsToAnalyze)}

REGRAS CHAVE:
- M01 (Drone): Drone fora do tapete = 20 pts; + peça vermelha do LiDAR dentro da caixinha = 30 pts. Se peça vermelha fora da caixinha, máx 20 pts.
- M02 (Sementes Explosivas): Haste verde curva no centro-esquerda (NÃO confundir com M08 trepadeira na árvore grande). 1 semente=10, 2=20, 3=30.
- Descreva em evidenceDescription exatamente o que o robô fez e o estado final da peça.
`;

    const multimodalParts = [
      ...referenceParts,
      ...trainingParts,
      { text: 'MÍDIA DO ROUND PARA ANALISAR:' },
      mediaPart,
      { text: promptText },
    ];

    const modelsToTry = ['gemini-4-hydrogen', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
    let lastError: any = null;
    let parsedData: any = null;
    let successfulModel = '';

    for (let i = 0; i < modelsToTry.length; i++) {
      if (analysisJobs.get(jobId)?.stage === 'cancelled') return;

      const modelCandidate = modelsToTry[i];

      updateJob({
        stage: 'analyzing_ai',
        progress: Math.min(90, 62 + i * 10),
        message: `Analisando vídeo com ${modelCandidate}...`,
      });

      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`Tempo limite excedido no modelo ${modelCandidate}`)),
            75000
          )
        );

        const baseConfig: any = {
          systemInstruction: `Você é um árbitro rigoroso da FLL (BIOGLOW). Retorne estritamente JSON válido. Nunca invente missões que o robô não realizou no vídeo. Códigos permitidos: [${allowedCodesList.join(', ')}].`,
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

        if (modelCandidate === 'gemini-4-hydrogen') {
          baseConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          baseConfig.mediaResolution = MediaResolution.MEDIA_RESOLUTION_MEDIUM;
        } else if (modelCandidate === 'gemini-3.1-flash-lite') {
          baseConfig.thinkingConfig = { thinkingLevel: ThinkingLevel.MINIMAL };
          baseConfig.mediaResolution = MediaResolution.MEDIA_RESOLUTION_MEDIUM;
        }

        const generatePromise = aiClient.models.generateContent({
          model: modelCandidate,
          contents: { parts: multimodalParts },
          config: baseConfig,
        });

        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        const rawJson = (response.text ?? '{}').trim();

        parsedData = JSON.parse(rawJson);
        successfulModel = modelCandidate;

        console.log(`[FrancoDroid AI] Sucesso com modelo ${modelCandidate}!`);
        break;
      } catch (err: any) {
        lastError = err;

        console.warn(`[FrancoDroid AI] Falha no modelo ${modelCandidate}:`, err?.message || err);

        const msg = String(err?.message || '');

        if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED')) {
          break;
        }
      }
    }

    if (analysisJobs.get(jobId)?.stage === 'cancelled') return;

    if (!parsedData) {
      throw new Error(formatFriendlyGeminiError(lastError));
    }

    const sanitized = sanitizeAnalysisOutput(
      parsedData,
      activeMissionsToAnalyze.map((m: any) => ({
        code: String(m.code),
        maxScore: Number(m.maxScore) || 30,
        validScores: Array.isArray(m.validScores) ? m.validScores : undefined,
      })),
      hasGabarito,
      relevantTraining.length,
      cleanedInformed
    );

    updateJob({
      stage: 'done',
      progress: 100,
      message: 'Análise concluída!',
      analysis: {
        id: `ai_${Date.now()}`,
        analyzedAt: new Date().toISOString(),
        modelUsed: successfulModel,
        ...sanitized,
      },
    });
  } catch (err: any) {
    console.error('[FrancoDroid AI Job Error]:', err);

    updateJob({
      stage: 'error',
      progress: 0,
      message: 'Erro na análise',
      error: formatFriendlyGeminiError(err),
    });
  } finally {
    if (tempOriginalPath) {
      fs.promises.unlink(tempOriginalPath).catch(() => {});
    }

    if (tempOptimizedPath) {
      fs.promises.unlink(tempOptimizedPath).catch(() => {});
    }

    if (uploadedRemoteFileName) {
      aiClient.files.delete({ name: uploadedRemoteFileName }).catch(() => {});
    }
  }
}

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
    video,
    image,
    mimeType: rawMimeType,
    missions = [],
    informedMissions = [],
    referenceBase = [],
    referenceImages = [],
    userApiKey = '',
  } = bodyPayload;

  const uploadedFile = req.file;
  const legacyMediaInput = video || image;

  if (!uploadedFile && !legacyMediaInput) {
    res.status(400).json({ error: 'Nenhum vídeo ou foto foi enviado para análise.' });
    return;
  }

  const apiKey = String(userApiKey || '').trim();

  if (!apiKey) {
    if (uploadedFile?.path) fs.promises.unlink(uploadedFile.path).catch(() => {});

    res.status(400).json({
      error: 'Informe sua chave Gemini na aba "Configurar IA".',
    });

    return;
  }

  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  analysisJobs.set(jobId, {
    jobId,
    stage: 'queued',
    progress: 25,
    message: 'Arquivo recebido! Preparando análise...',
    createdAt: Date.now(),
  });

  void runAnalysisJob(jobId, {
    uploadedFile,
    legacyMediaInput,
    rawMimeType,
    missions,
    informedMissions,
    referenceBase,
    referenceImages,
    apiKey,
  });

  res.status(202).json({
    success: true,
    jobId,
    stage: 'queued',
  });
});

app.get('/api/ai/jobs/:jobId', (req: Request, res: Response): void => {
  const job = analysisJobs.get(req.params.jobId);

  if (!job) {
    res.status(404).json({ error: 'Trabalho de análise não encontrado ou expirado.' });
    return;
  }

  res.json(job);
});

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
