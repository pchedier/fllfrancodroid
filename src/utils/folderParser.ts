/**
 * Parses webkitRelativePath or file path to extract Mission Code, Point Tier / State, and File Name
 * Examples supported:
 * "Tapete/M02/3 sementes completa/foto1.jpg" -> { missionCode: 'M02', points: 30, tierLabel: '3 sementes completa (30 pts)', state: 'completa' }
 * "Tapete/M02/2 sementes 20 pontos/foto2.jpg" -> { missionCode: 'M02', points: 20, tierLabel: '2 sementes (20 pts)', state: 'parcial' }
 * "Tapete/M02/1 semente 10 pontos/foto3.jpg" -> { missionCode: 'M02', points: 10, tierLabel: '1 semente (10 pts)', state: 'parcial' }
 * "Tapete/M02/0 incompleta/foto4.jpg" -> { missionCode: 'M02', points: 0, tierLabel: '0 incompleta (0 pts)', state: 'incompleta' }
 * "Tapete/M01/20 pontos/drone_up.jpg" -> { missionCode: 'M01', points: 20, tierLabel: '20 pontos', state: 'parcial' }
 * "Tapete/M01/completa/tudo.jpg" -> { missionCode: 'M01', points: 30, tierLabel: 'Completa', state: 'completa' }
 */
export interface ParsedFolderFile {
  missionCode: string;
  state: 'completa' | 'parcial' | 'incompleta';
  points?: number;
  tierLabel: string;
  tierKey: string;
  fileName: string;
}

export function parseFolderRelativePath(relativePath: string): ParsedFolderFile {
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/');
  const fileName = parts[parts.length - 1] || 'imagem.jpg';

  let missionCode = 'Geral';
  let state: 'completa' | 'parcial' | 'incompleta' = 'completa';
  let points: number | undefined = undefined;
  let tierLabel = 'Geral';
  let tierKey = 'completa';

  // Find mission code in path or filename
  for (const part of parts) {
    const mMatch = part.match(/\b(M\d{1,2})\b/i);
    if (mMatch) {
      missionCode = mMatch[1].toUpperCase();
      break;
    }
    const missaoMatch = part.match(/\bMiss[aã]o[\s_-]?(\d{1,2})\b/i);
    if (missaoMatch) {
      missionCode = `M${missaoMatch[1].padStart(2, '0')}`;
      break;
    }
  }

  // Find the most specific subfolder name (usually the immediate parent of fileName)
  const immediateFolder = parts.length > 1 ? parts[parts.length - 2] : '';
  const lowerPath = normalized.toLowerCase();
  const lowerFolder = immediateFolder.toLowerCase();

  // Check for explicit points: e.g. "20 pontos", "10 pts", "30pts", "40p"
  const ptsMatch = lowerFolder.match(/(\d+)\s*(pontos|ponto|pts|pt|p)\b/);
  if (ptsMatch) {
    points = parseInt(ptsMatch[1], 10);
  } else {
    // Check path for point patterns if not in immediate folder
    const pathPtsMatch = lowerPath.match(/(\d+)\s*(pontos|ponto|pts|pt)\b/);
    if (pathPtsMatch) {
      points = parseInt(pathPtsMatch[1], 10);
    }
  }

  // Determine state & tier label
  if (
    lowerFolder.startsWith('0 ') ||
    lowerFolder === '0' ||
    lowerPath.includes('/incomplet') ||
    lowerPath.includes('_incomplet') ||
    lowerPath.includes('/falh') ||
    lowerPath.includes('/fail')
  ) {
    state = 'incompleta';
    tierKey = 'incompleta';
    tierLabel = immediateFolder || 'Incompleta (0 pts)';
    if (points === undefined) points = 0;
  } else if (
    lowerPath.includes('/complet') ||
    lowerPath.includes('_complet') ||
    lowerPath.includes('/concluid') ||
    lowerFolder.includes('completa') ||
    points === 30 ||
    points === 40
  ) {
    state = 'completa';
    tierKey = points !== undefined ? `${points}pts` : 'completa';
    tierLabel = immediateFolder || 'Completa';
  } else if (
    points !== undefined ||
    lowerPath.includes('/parcial') ||
    lowerPath.includes('_parcial') ||
    lowerFolder.includes('semente') ||
    lowerFolder.includes('metade')
  ) {
    state = 'parcial';
    tierKey = points !== undefined ? `${points}pts` : 'parcial';
    tierLabel = immediateFolder || (points !== undefined ? `${points} Pontos` : 'Parcial');
  } else {
    state = 'completa';
    tierKey = 'completa';
    tierLabel = immediateFolder || 'Referência';
  }

  // Standardize tierKey
  if (points !== undefined) {
    tierKey = `${points}pts`;
  }

  return { missionCode, state, points, tierLabel, tierKey, fileName };
}
