import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Increase payload limit for high-res competition mat photos
app.use(express.json({ limit: '30mb' }));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    team: 'FrancoDroid FLL Analytics',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// App configuration and public URL endpoint
app.get('/api/config', (_req: Request, res: Response) => {
  const publicUrl = process.env.APP_URL || '';
  res.json({
    appUrl: publicUrl,
  });
});

// Real AI Key Validation Endpoint (tests key directly against Gemini API)
app.post('/api/ai/validate-key', async (req: Request, res: Response): Promise<void> => {
  try {
    const { apiKey } = req.body;
    const keyToTest = (apiKey && apiKey.trim()) || '';
    if (!keyToTest) {
      res.status(400).json({ valid: false, message: 'Nenhuma chave fornecida.' });
      return;
    }

    // Direct REST verification against gemini-3.5-flash-lite
    const validationUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(keyToTest)}`;
    const testRes = await fetch(validationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
    });

    const data = await testRes.json();

    if (testRes.ok) {
      res.json({ valid: true, message: 'Chave Gemini válida e conectada!' });
      return;
    }

    // If 3.5-flash-lite is busy, test with gemini-3.5-flash
    const backupUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${encodeURIComponent(keyToTest)}`;
    const backupRes = await fetch(backupUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'ping' }] }] }),
    });

    if (backupRes.ok) {
      res.json({ valid: true, message: 'Chave Gemini válida e conectada!' });
      return;
    }

    res.status(401).json({
      valid: false,
      message: data.error?.message || 'Chave de API inválida ou sem permissão.',
    });
  } catch (error: any) {
    console.warn('Erro ao validar chave:', error?.message || error);
    res.status(500).json({
      valid: false,
      message: error?.message || 'Erro ao conectar à API do Google.',
    });
  }
});

// AI Video & Mat Analysis Endpoint (Receives Video or Photo + Folder Reference Base)
app.post('/api/ai/analyze-mat', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      video,
      image,
      mimeType: rawMimeType,
      missions = [],
      referenceBase = [],
      customPrompt = '',
      videoTimestamp = '',
      userApiKey = '',
    } = req.body;

    const mediaInput = video || image;
    if (!mediaInput) {
      res.status(400).json({ error: 'Nenhum vídeo ou foto foi enviado para análise.' });
      return;
    }

    const apiKey = (userApiKey && userApiKey.trim()) || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.status(503).json({
        error: 'Nenhuma chave Gemini API configurada. Cole sua chave na aba "Configurar IA" ou configure GEMINI_API_KEY.',
      });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    // Parse base64 and mime type
    let mimeType = rawMimeType || 'image/jpeg';
    let base64Data = mediaInput;

    if (mediaInput.includes(';base64,')) {
      const parts = mediaInput.split(';base64,');
      mimeType = parts[0].replace('data:', '') || mimeType;
      base64Data = parts[1];
    }

    const mediaPart = {
      inlineData: {
        mimeType,
        data: base64Data,
      },
    };

    // Extract active mission codes present in the team's loaded reference base
    const loadedReferenceCodes = Array.isArray(referenceBase)
      ? referenceBase.map((r: any) => r.missionCode).filter(Boolean)
      : [];

    const activeMissionsToAnalyze =
      loadedReferenceCodes.length > 0
        ? missions.filter((m: any) => loadedReferenceCodes.includes(m.code))
        : missions;

    const allowedCodesList =
      loadedReferenceCodes.length > 0
        ? loadedReferenceCodes
        : missions.map((m: any) => m.code);

    const promptText = `
Você é o juiz de arbitragem e especialista de telemetria da equipe FIRST LEGO League FrancoDroid.
Você está analisando um VÍDEO ou FOTO da execução do robô na mesa de competição oficial da FLL (Temporada BIOGLOW).

GABARITO OFICIAL CARREGADO PELA EQUIPE (PASTAS DE REFERÊNCIA ATIVAS):
${JSON.stringify(referenceBase, null, 2)}

MISSÕES PERMITIDAS PARA IDENTIFICAÇÃO NESTA ANÁLISE:
${JSON.stringify(activeMissionsToAnalyze, null, 2)}

*** REGRA CRÍTICA E ABSOLUTA DE ARBITRAGEM ***:
1. Você SÓ PODE IDENTIFICAR as missões que constam EXPLICITAMENTE na lista de missões permitidas acima: [${allowedCodesList.join(', ')}].
2. NUNCA invente, presuma ou declare missões que NÃO estejam no gabarito carregado da equipe! Se a equipe enviou fotos apenas de M01 e M02, você NUNCA deve incluir M08, M10, etc.
3. Se a equipe gravou uma missão específica como a Missão 02 (M02 - Sementes Explosivas):
   - M02 é a flor com 3 sementes/bolinhas no topo da haste.
   - NÃO confunda M02 com M08 (Emaranhado).
   - Analise o estado físico do mecanismo comparando EXATAMENTE com as fotos de cada pasta:
     * "3 sementes completa" = 30 pontos (completed)
     * "2 sementes 20 pontos" = 20 pontos (partial)
     * "1 semente 10 pontos" = 10 pontos (partial)
     * "0 incompleta" = 0 pontos (failed / incompleta)
4. Para a Missão 01 (M01 - Drone):
   - Drone fora do tapete = 20 pts (parcial).
   - Drone fora do tapete + marcador vermelho dentro da caixinha = 30 pts (completa).
   - Se o marcador vermelho estiver fora da caixinha: OBRIGATORIAMENTE 20 pontos (parcial).

Observações/foco do operador: "${customPrompt}"
${videoTimestamp ? `Timestamp de referência informado: ${videoTimestamp}` : ''}

SUA TAREFA DE ARBITRAGEM:
1. Examine cuidadosamente o vídeo ou imagem do robô atuando na mesa.
2. Identifique o TEMPO TOTAL do round (quando o robô sai da base até parar).
3. Para CADA missão detectada (SOMENTE dentre as permitidas: ${allowedCodesList.join(', ')}):
   - Defina o missionCode exatamente como um dos códigos permitidos.
   - Verifique em qual pasta/nível de referência o estado do vídeo se encaixa.
   - Atribua a pontuação exata daquele nível (ex: 10, 20 ou 30).
   - Indique o timestamp estimado (ex: "00:25").
   - Na evidência física (evidenceDescription), cite qual nível do gabarito correspondeu (ex: "Corresponde ao gabarito de 2 sementes soltas (20 pts)").
   - Nível de confiança (0 a 100).
4. Calcule o estimatedTotalScore somando exclusivamente as missões identificadas.
5. Forneça diagnóstico construtivo de rota e atuadores mecânicos.
`;

    const textPart = { text: promptText };

    // Robust model execution with fast, active models and timeout protection
    // Prioritize gemini-3.5-flash and gemini-3.5-flash-lite which are active and fast on user API key
    const modelsToTry = ['gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'];
    let lastError: any = null;
    let parsedData: any = null;
    let successfulModel = '';

    for (const modelCandidate of modelsToTry) {
      try {
        console.log(`[FrancoDroid AI] Analisando round com modelo ${modelCandidate}...`);
        
        // Timeout of 45 seconds per attempt to avoid hanging
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Tempo limite excedido no modelo ${modelCandidate}`)), 45000)
        );

        const generatePromise = ai.models.generateContent({
          model: modelCandidate,
          contents: { parts: [mediaPart, textPart] },
          config: {
            systemInstruction:
              `Você é o juiz de telemetria da equipe FrancoDroid FLL. Analise o vídeo/imagem da mesa e retorne estritamente um JSON. REGRA OBRIGATÓRIA: identifique APENAS missões pertencentes a: [${allowedCodesList.join(', ')}]. Jamais retorne missões que não estejam nesta lista.`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                estimatedTotalScore: { type: Type.NUMBER, description: 'Pontuação total somada de todas as missões concluídas' },
                totalTimeFormatted: { type: Type.STRING, description: 'Tempo total de execução formatado (ex: "02:15")' },
                totalTimeSeconds: { type: Type.NUMBER, description: 'Tempo total em segundos' },
                overallConfidence: { type: Type.NUMBER, description: 'Confiança média geral de 0 a 100' },
                summary: { type: Type.STRING, description: 'Resumo direto do round e do desempenho do robô' },
                trajectoryNotes: { type: Type.STRING, description: 'Análise de rota, retas e desvios de alinhamento' },
                mechanismNotes: { type: Type.STRING, description: 'Diagnóstico de garras, atuadores e engrenagens' },
                missionsDetected: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      missionCode: {
                        type: Type.STRING,
                        description: `Código da missão. DEVE ser estritamente um dos seguintes: ${allowedCodesList.join(', ')}`,
                      },
                      status: {
                        type: Type.STRING,
                        description: 'completed, partial, failed, ou not_attempted',
                      },
                      estimatedScore: { type: Type.NUMBER, description: 'Pontos obtidos' },
                      timestampEstimate: { type: Type.STRING, description: 'Minuto e segundo no vídeo em que a missão ocorreu (ex: "00:35")' },
                      evidenceDescription: { type: Type.STRING, description: 'Evidência física vista no vídeo/imagem comparada com as fotos do gabarito' },
                      confidence: { type: Type.NUMBER, description: 'Nível de confiança de 0 a 100' },
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
          },
        });

        const response: any = await Promise.race([generatePromise, timeoutPromise]);
        const rawJson = response.text || '{}';
        parsedData = JSON.parse(rawJson);
        successfulModel = modelCandidate;
        console.log(`[FrancoDroid AI] Sucesso com modelo ${modelCandidate}!`);
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[FrancoDroid AI] Falha no modelo ${modelCandidate}:`, err?.message || err);
      }
    }

    if (!parsedData) {
      throw lastError || new Error('Os modelos de visão com IA estão temporariamente indisponíveis. Tente novamente em instantes.');
    }

    res.json({
      success: true,
      analysis: {
        id: `ai_${Date.now()}`,
        analyzedAt: new Date().toISOString(),
        modelUsed: successfulModel,
        ...parsedData,
      },
    });
  } catch (error: unknown) {
    console.error('Erro na análise por IA:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro interno ao processar visão computacional';
    res.status(500).json({ error: errorMessage });
  }
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
    console.log(`FrancoDroid FLL Analytics rodando na porta ${PORT} [env=${isProd ? 'prod' : 'dev'}]`);
  });
}

startServer();
