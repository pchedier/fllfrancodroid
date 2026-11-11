import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { DriveReferenceFile } from '../types/fll';

// Mandatory SCOPES array
export const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        // Token was cleared on page reload or not yet acquired via popup
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Não foi possível obter o token de acesso do Google Drive.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Erro de login no Google Drive:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

/**
 * Extracts folder ID from a Google Drive URL or returns the ID as is
 */
export function extractFolderIdFromUrl(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // Match https://drive.google.com/drive/folders/{folderId}
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }
  // Match https://drive.google.com/open?id={folderId} or id={folderId}
  const idMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }
  return trimmed;
}

/**
 * Lists user's folders in Google Drive
 */
export async function listDriveFolders(accessToken: string): Promise<{ id: string; name: string }[]> {
  try {
    const q = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&fields=files(id,name)&pageSize=30&orderBy=name`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Falha ao listar pastas do Google Drive');
    }

    const data = await res.json();
    return data.files || [];
  } catch (e: any) {
    console.error('Erro ao listar pastas:', e);
    throw e;
  }
}

/**
 * Lists image files in a specific Google Drive folder
 */
export async function listFilesInFolder(
  accessToken: string,
  folderId: string
): Promise<DriveReferenceFile[]> {
  try {
    const cleanFolderId = extractFolderIdFromUrl(folderId);
    let q = "trashed = false and mimeType contains 'image/'";
    if (cleanFolderId) {
      q = `'${cleanFolderId}' in parents and ${q}`;
    }

    const fields = 'files(id,name,mimeType,thumbnailLink,webViewLink,createdTime)';
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      q
    )}&fields=${encodeURIComponent(fields)}&pageSize=50&orderBy=createdTime desc`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Falha ao buscar imagens na pasta do Google Drive');
    }

    const data = await res.json();
    const files = data.files || [];

    return files.map((f: any) => {
      // Heuristic auto-tagging from filename (e.g. M01_concluida.jpg)
      let detectedMission: string | undefined = undefined;
      const mMatch = f.name.match(/\b(M\d{1,2})\b/i);
      if (mMatch) detectedMission = mMatch[1].toUpperCase();

      let detectedState: 'completed' | 'partial' | 'failed' = 'completed';
      const lower = f.name.toLowerCase();
      if (lower.includes('parcial') || lower.includes('half') || lower.includes('metade')) {
        detectedState = 'partial';
      } else if (lower.includes('falh') || lower.includes('incompleta') || lower.includes('fail')) {
        detectedState = 'failed';
      }

      return {
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        thumbnailLink: f.thumbnailLink,
        webViewLink: f.webViewLink,
        missionCode: detectedMission,
        state: detectedState,
      };
    });
  } catch (e: any) {
    console.error('Erro ao listar imagens na pasta do Drive:', e);
    throw e;
  }
}

/**
 * Downloads a Google Drive image file and converts to base64 for Gemini AI analysis
 */
export async function downloadDriveImageBase64(
  accessToken: string,
  fileId: string
): Promise<{ base64: string; mimeType: string }> {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error('Falha ao baixar imagem do Google Drive');
    }

    const blob = await res.blob();
    const mimeType = blob.type || 'image/jpeg';

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const fullResult = reader.result as string;
        // strip data:*/*;base64,
        const base64 = fullResult.includes(',') ? fullResult.split(',')[1] : fullResult;
        resolve({ base64, mimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e: any) {
    console.error('Erro ao baixar arquivo do Drive:', e);
    throw e;
  }
}
