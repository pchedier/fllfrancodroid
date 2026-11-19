/**
 * Parses and strictly validates webkitRelativePath for FLL Reference Folders.
 * Required structure:
 *   Pasta_Raiz / M01..M15 / <estado ou pontuação> / arquivo.jpg
 *
 * Valid subfolder examples:
 *   - completa / 3 sementes completa / 30 pontos
 *   - 20 pontos / 2 sementes 20 pontos / parcial
 *   - 10 pontos / 1 semente 10 pontos
 *   - incompleta / 0 incompleta / 0 pontos
 */

export interface ParsedFolderFile {
  missionCode: string;
  state: 'completa' | 'parcial' | 'incompleta';
  points?: number;
  tierLabel: string;
  tierKey: string;
  fileName: string;
  isValid: boolean;
  errorReason?: string;
}

export interface MissionReferenceValidation {
  isValid: boolean;
  hasMinimumTiers: boolean;
  tierCount: number;
  photoCount: number;
  warnings: string[];
}

const VALID_MISSION_RANGE = /^M(0[1-9]|1[0-5])$/;

export function parseFolderRelativePath(relativePath: string): ParsedFolderFile {
  const normalized = relativePath.replace(/\\/g, '/').trim();
  const parts = normalized.split('/').filter(Boolean);
  const fileName = parts[parts.length - 1] || 'imagem.jpg';
  const folderParts = parts.slice(0, -1);

  let missionCode = '';
  let missionFolderIndex = -1;

  // Step 1: Identify exact mission folder (M01..M15 or Missao 01..15)
  for (let i = 0; i < folderParts.length; i++) {
    const part = folderParts[i].trim();
    const mMatch = part.match(/^(M\d{1,2})$/i);
    if (mMatch) {
      const num = parseInt(mMatch[1].slice(1), 10);
      const formatted = `M${String(num).padStart(2, '0')}`;
      if (VALID_MISSION_RANGE.test(formatted)) {
        missionCode = formatted;
        missionFolderIndex = i;
        break;
      } else {
        return {
          missionCode: part.toUpperCase(),
          state: 'incompleta',
          tierLabel: 'Inválida',
          tierKey: 'invalid',
          fileName,
          isValid: false,
          errorReason: `Código "${part}" fora do intervalo oficial M01 a M15.`,
        };
      }
    }

    const missaoMatch = part.match(/^Miss[aã]o[\s_-]?(\d{1,2})$/i);
    if (missaoMatch) {
      const num = parseInt(missaoMatch[1], 10);
      const formatted = `M${String(num).padStart(2, '0')}`;
      if (VALID_MISSION_RANGE.test(formatted)) {
        missionCode = formatted;
        missionFolderIndex = i;
        break;
      }
    }
  }

  if (!missionCode) {
    return {
      missionCode: 'Inválida',
      state: 'incompleta',
      tierLabel: 'Sem pasta de missão',
      tierKey: 'invalid',
      fileName,
      isValid: false,
      errorReason: 'Pasta da missão não identificada. Crie subpastas exatas como M01, M02, ..., M15.',
    };
  }

  // Step 2: Check immediate subfolder inside the mission folder
  if (missionFolderIndex === folderParts.length - 1) {
    return {
      missionCode,
      state: 'incompleta',
      tierLabel: 'Sem subpasta',
      tierKey: 'invalid',
      fileName,
      isValid: false,
      errorReason: `A imagem "${fileName}" está solta direto dentro de "${missionCode}". Coloque dentro de uma subpasta (ex: completa, 20 pontos, 10 pontos, incompleta).`,
    };
  }

  const immediateFolder = folderParts[folderParts.length - 1].trim();
  const lowerFolder = immediateFolder.toLowerCase();

  let state: 'completa' | 'parcial' | 'incompleta' = 'completa';
  let points: number | undefined = undefined;
  let tierLabel = immediateFolder;
  let tierKey = '';

  // Match explicit point numbers like "20 pontos", "10 pts", "30 pontos", "0 pontos"
  const ptsMatch = lowerFolder.match(/\b(\d+)\s*(pontos?|pts?|p)\b/);
  if (ptsMatch) {
    points = parseInt(ptsMatch[1], 10);
  }

  const isIncompleta =
    lowerFolder === '0' ||
    /^0\s+incomplet/.test(lowerFolder) ||
    /\bincomplet[ao]s?\b/.test(lowerFolder) ||
    /\bfalh(a|ou)\b/.test(lowerFolder) ||
    /\bfail(ed)?\b/.test(lowerFolder) ||
    points === 0;

  const isCompleta =
    !isIncompleta &&
    (/\bcomplet[ao]s?\b/.test(lowerFolder) ||
      /\bconclu[ií]d[ao]s?\b/.test(lowerFolder));

  const isParcial =
    !isIncompleta &&
    !isCompleta &&
    (/\bparcial(mente)?\b/.test(lowerFolder) || /\bmetade\b/.test(lowerFolder));

  const hasValidPoints = points !== undefined && points >= 0 && points <= 50;

  if (!isIncompleta && !isCompleta && !isParcial && !hasValidPoints) {
    return {
      missionCode,
      state: 'incompleta',
      tierLabel: immediateFolder,
      tierKey: 'invalid',
      fileName,
      isValid: false,
      errorReason: `Subpasta "${missionCode}/${immediateFolder}" não identifica estado nem pontuação válida. Use "completa", "incompleta" ou "<número> pontos" (ex: "20 pontos", "10 pontos").`,
    };
  }

  if (isIncompleta) {
    state = 'incompleta';
    if (points === undefined) points = 0;
    tierKey = '0pts';
    tierLabel = immediateFolder || 'Incompleta (0 pts)';
  } else if (isCompleta) {
    state = 'completa';
    tierKey = points !== undefined ? `${points}pts` : 'completa';
    tierLabel = immediateFolder;
  } else if (hasValidPoints) {
    state = 'parcial';
    tierKey = `${points}pts`;
    tierLabel = immediateFolder;
  } else {
    state = 'parcial';
    tierKey = 'parcial';
    tierLabel = immediateFolder;
  }

  return {
    missionCode,
    state,
    points,
    tierLabel,
    tierKey,
    fileName,
    isValid: true,
  };
}

export function validateMissionReference(ref: {
  missionCode: string;
  completaFiles: Array<unknown>;
  parcialFiles: Array<unknown>;
  incompletaFiles: Array<unknown>;
  pointTiers?: Record<string, { label: string; points: number; files: Array<unknown> }>;
}): MissionReferenceValidation {
  const tierEntries = ref.pointTiers ? Object.values(ref.pointTiers) : [];
  const tierCount = tierEntries.length;
  const photoCount =
    ref.completaFiles.length + ref.parcialFiles.length + ref.incompletaFiles.length;

  const warnings: string[] = [];

  if (photoCount < 2) {
    warnings.push('Adicione pelo menos 2 fotos de referência para a IA conseguir comparar.');
  }

  if (tierCount < 2) {
    warnings.push(
      'Falta o número mínimo de pastas (mínimo 2 estados/níveis, ex: "completa" e "incompleta" ou "20 pontos" e "10 pontos").'
    );
  } else {
    const hasComplete = ref.completaFiles.length > 0 || tierEntries.some((t) => t.points >= 20);
    const hasNonComplete =
      ref.incompletaFiles.length > 0 ||
      ref.parcialFiles.length > 0 ||
      tierEntries.some((t) => t.points < 20);

    if (!hasComplete) {
      warnings.push('Falta a pasta de referência concluída (ex: "completa" ou "30 pontos").');
    }
    if (!hasNonComplete) {
      warnings.push('Falta a pasta de referência parcial ou zero (ex: "incompleta", "20 pontos" ou "10 pontos").');
    }
  }

  return {
    isValid: warnings.length === 0,
    hasMinimumTiers: tierCount >= 2,
    tierCount,
    photoCount,
    warnings,
  };
}
