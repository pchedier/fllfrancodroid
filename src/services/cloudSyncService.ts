import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { AiTrainingExample, Round } from '../types/fll';
import { StorageService } from './storageService';
import { hasBackendServer } from './clientAiEngine';

const VALID_MISTAKE_TYPES = new Set([
  'false_positive',
  'wrong_score',
  'missed_mission',
  'confused_mission',
  'other',
]);

export function toSafeFirestoreId(rawId: string, prefix = 'item'): string {
  const cleaned = String(rawId || '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .slice(0, 128);
  return cleaned.length > 0 ? cleaned : `${prefix}_${Date.now()}`;
}

function buildFirestoreRoundPayload(round: Round, ownerId: string) {
  const safeId = toSafeFirestoreId(round.id, 'round');
  const safeMissionResults = Array.isArray(round.missionResults)
    ? round.missionResults.slice(0, 20).map((mr) => ({
        missionId: String(mr.missionId || `m_${mr.missionCode || 'x'}`),
        missionCode: String(mr.missionCode || 'M01').slice(0, 16),
        status: String(mr.status || 'completed'),
        score: Math.max(0, Number(mr.score) || 0),
        attempts: Math.max(1, Number(mr.attempts) || 1),
        timeSpentSeconds: Math.max(0, Number(mr.timeSpentSeconds) || 0),
        notes: mr.notes ? String(mr.notes).slice(0, 500) : '',
      }))
    : [];

  return {
    id: safeId,
    ownerId,
    roundNumber: Math.max(0, Math.min(100000, Number(round.roundNumber) || 0)),
    date: String(round.date || new Date().toISOString().slice(0, 16)).slice(0, 64),
    operator: String(round.operator || 'Piloto FrancoDroid').slice(0, 100),
    strategy: String(round.strategy || 'Análise IA').slice(0, 160),
    totalTimeSeconds: Math.max(0, Math.min(600, Number(round.totalTimeSeconds) || 0)),
    totalScore: Math.max(0, Math.min(1000, Number(round.totalScore) || 0)),
    notes: String(round.notes || '').slice(0, 2500),
    missionResults: safeMissionResults,
    recordedAtMs: Math.max(0, Number(round.createdAt) || Date.now()),
    verifiedByAi: Boolean(round.verifiedByAi),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function buildFirestoreTrainingPayload(ex: AiTrainingExample, ownerId: string) {
  const safeId = toSafeFirestoreId(ex.id, 'train');
  const mistakeType = VALID_MISTAKE_TYPES.has(ex.mistakeType) ? ex.mistakeType : 'other';

  const basePayload: Record<string, any> = {
    id: safeId,
    ownerId,
    missionCode: String(ex.missionCode || 'GERAL').toUpperCase().slice(0, 16),
    mistakeType,
    aiPredictedSummary: String(ex.aiPredictedSummary || '').slice(0, 500),
    expectedSummary: String(ex.expectedSummary || '').slice(0, 500),
    userExplanation: String(ex.userExplanation || '').slice(0, 1000),
    ruleCreatedAtIso: String(ex.createdAt || new Date().toISOString()).slice(0, 64),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (
    typeof ex.snapshotBase64 === 'string' &&
    ex.snapshotBase64.length > 0 &&
    ex.snapshotBase64.length <= 360000
  ) {
    basePayload.snapshotBase64 = ex.snapshotBase64;
  }

  return basePayload;
}

function mapFirestoreDocToRound(data: any): Round | null {
  if (!data || !data.id) return null;
  return {
    id: String(data.id),
    roundNumber: Number(data.roundNumber) || 1,
    date: String(data.date || ''),
    operator: String(data.operator || 'Piloto FrancoDroid'),
    strategy: String(data.strategy || 'Análise IA'),
    totalTimeSeconds: Number(data.totalTimeSeconds) || 0,
    totalScore: Number(data.totalScore) || 0,
    notes: String(data.notes || ''),
    missionResults: Array.isArray(data.missionResults) ? data.missionResults : [],
    createdAt: Number(data.recordedAtMs) || Date.now(),
    verifiedByAi: Boolean(data.verifiedByAi),
  };
}

function mapFirestoreDocToTraining(data: any): AiTrainingExample | null {
  if (!data || !data.id) return null;
  return {
    id: String(data.id),
    createdAt: String(data.ruleCreatedAtIso || new Date().toISOString()),
    missionCode: String(data.missionCode || 'GERAL'),
    mistakeType: VALID_MISTAKE_TYPES.has(data.mistakeType) ? data.mistakeType : 'other',
    aiPredictedSummary: String(data.aiPredictedSummary || ''),
    expectedSummary: String(data.expectedSummary || ''),
    userExplanation: String(data.userExplanation || ''),
    snapshotBase64: typeof data.snapshotBase64 === 'string' ? data.snapshotBase64 : undefined,
  };
}

export const CloudSyncService = {
  subscribeAuth(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },

  async signInWithGoogle(): Promise<User> {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  },

  async signOutCloud(): Promise<void> {
    await signOut(auth);
  },

  async pushRoundsToServer(rounds: Round[], deletedIds: string[] = []): Promise<Round[]> {
    try {
      if (!(await hasBackendServer())) return rounds;
      const res = await fetch('./api/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rounds, deletedIds }),
      });
      if (!res.ok) return rounds;
      const data = await res.json();
      return Array.isArray(data?.rounds) ? data.rounds : rounds;
    } catch {
      return rounds;
    }
  },

  async pushTrainingToServer(
    examples: AiTrainingExample[],
    deletedIds: string[] = []
  ): Promise<AiTrainingExample[]> {
    try {
      if (!(await hasBackendServer())) return examples;
      const res = await fetch('./api/ai/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examples, deletedIds, syncOnly: true }),
      });
      if (!res.ok) return examples;
      const data = await res.json();
      return Array.isArray(data?.examples) ? data.examples : examples;
    } catch {
      return examples;
    }
  },

  /**
   * Non-destructive startup sync between browser localStorage and server disk JSON.
   * Ensures neither resets the other even after deploys or reloads.
   */
  async bootstrapServerSync(): Promise<{
    rounds: Round[];
    training: AiTrainingExample[];
  }> {
    const localRounds = StorageService.getRounds();
    const localTraining = StorageService.getAiTraining();
    const deletedRounds = StorageService.getDeletedRoundIds();
    const deletedTraining = StorageService.getDeletedTrainingIds();

    if (!(await hasBackendServer())) {
      return { rounds: localRounds, training: localTraining };
    }

    let finalRounds = localRounds;
    let finalTraining = localTraining;

    try {
      const [roundsRes, trainRes] = await Promise.all([
        fetch('./api/rounds'),
        fetch('./api/ai/training'),
      ]);

      if (roundsRes.ok) {
        const rd = await roundsRes.json();
        const serverRounds: Round[] = Array.isArray(rd?.rounds) ? rd.rounds : [];
        finalRounds = StorageService.mergeRounds(localRounds, serverRounds);
        StorageService.saveRounds(finalRounds);
        if (finalRounds.length > serverRounds.length || deletedRounds.length > 0) {
          finalRounds = await this.pushRoundsToServer(finalRounds, deletedRounds);
          finalRounds = StorageService.mergeRounds(finalRounds, []);
          StorageService.saveRounds(finalRounds);
        }
      }

      if (trainRes.ok) {
        const td = await trainRes.json();
        const serverTraining: AiTrainingExample[] = Array.isArray(td?.examples) ? td.examples : [];
        finalTraining = StorageService.mergeAiTraining(localTraining, serverTraining);
        StorageService.saveAiTraining(finalTraining);
        if (finalTraining.length > serverTraining.length || deletedTraining.length > 0) {
          finalTraining = await this.pushTrainingToServer(finalTraining, deletedTraining);
          finalTraining = StorageService.mergeAiTraining(finalTraining, []);
          StorageService.saveAiTraining(finalTraining);
        }
      }
    } catch (err) {
      console.warn('Falha ao sincronizar com servidor local:', err);
    }

    return { rounds: finalRounds, training: finalTraining };
  },

  async saveRoundEverywhere(round: Round, user: User | null): Promise<{
    updated: Round[];
    newRound: Round;
  }> {
    const { updated, newRound } = StorageService.addRound(round);
    await this.pushRoundsToServer([newRound], StorageService.getDeletedRoundIds());

    if (user && user.emailVerified) {
      const safeId = toSafeFirestoreId(newRound.id, 'round');
      const path = `rounds/${safeId}`;
      try {
        await setDoc(doc(db, 'rounds', safeId), buildFirestoreRoundPayload(newRound, user.uid));
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }

    return { updated, newRound };
  },

  async deleteRoundEverywhere(id: string, user: User | null): Promise<Round[]> {
    const updated = StorageService.deleteRound(id);
    if (await hasBackendServer()) {
      fetch(`./api/rounds/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
    }

    if (user && user.emailVerified) {
      const safeId = toSafeFirestoreId(id, 'round');
      const path = `rounds/${safeId}`;
      try {
        await deleteDoc(doc(db, 'rounds', safeId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }

    return updated;
  },

  async saveTrainingEverywhere(
    newExamples: Array<Omit<AiTrainingExample, 'id' | 'createdAt'>>,
    user: User | null
  ): Promise<AiTrainingExample[]> {
    let incomingExamples: AiTrainingExample[] = newExamples.map((ex, idx) => ({
      id: `train_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      missionCode: String(ex.missionCode || 'GERAL').toUpperCase(),
      mistakeType: VALID_MISTAKE_TYPES.has(ex.mistakeType) ? ex.mistakeType : 'other',
      aiPredictedSummary: String(ex.aiPredictedSummary || ''),
      expectedSummary: String(ex.expectedSummary || ''),
      userExplanation: String(ex.userExplanation || ''),
      snapshotBase64: ex.snapshotBase64,
    }));

    if (await hasBackendServer()) {
      const res = await fetch('./api/ai/training', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examples: newExamples }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Falha ao salvar correção.');
      }
      if (Array.isArray(data?.examples)) {
        incomingExamples = data.examples;
      }
    }

    const merged = StorageService.mergeAiTraining(StorageService.getAiTraining(), incomingExamples);
    StorageService.saveAiTraining(merged);

    if (user && user.emailVerified) {
      // Upload newest examples (top items from merged matching our batch) to Firestore
      const toUpload = merged.slice(0, Math.max(newExamples.length + 2, 5));
      for (const item of toUpload) {
        const safeId = toSafeFirestoreId(item.id, 'train');
        const path = `aiTraining/${safeId}`;
        try {
          await setDoc(doc(db, 'aiTraining', safeId), buildFirestoreTrainingPayload(item, user.uid));
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      }
    }

    return merged;
  },

  async deleteTrainingEverywhere(id: string, user: User | null): Promise<AiTrainingExample[]> {
    const localUpdated = StorageService.deleteAiTraining(id);
    if (await hasBackendServer()) {
      try {
        await fetch(`./api/ai/training/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {}
    }

    if (user && user.emailVerified) {
      const safeId = toSafeFirestoreId(id, 'train');
      const path = `aiTraining/${safeId}`;
      try {
        await deleteDoc(doc(db, 'aiTraining', safeId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    }

    return localUpdated;
  },

  async pushAllLocalToCloud(
    rounds: Round[],
    training: AiTrainingExample[],
    user: User
  ): Promise<void> {
    if (!user.emailVerified) return;

    for (const r of rounds) {
      const safeId = toSafeFirestoreId(r.id, 'round');
      const path = `rounds/${safeId}`;
      try {
        await setDoc(doc(db, 'rounds', safeId), buildFirestoreRoundPayload(r, user.uid));
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }

    for (const t of training) {
      const safeId = toSafeFirestoreId(t.id, 'train');
      const path = `aiTraining/${safeId}`;
      try {
        await setDoc(doc(db, 'aiTraining', safeId), buildFirestoreTrainingPayload(t, user.uid));
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    }
  },

  /**
   * Real-time Firestore listener for signed-in user.
   * Performs non-destructive union merge: pulls cloud records down AND pushes missing local records up.
   */
  subscribeCloudCollections(
    user: User,
    callbacks: {
      onRoundsSynced: (mergedRounds: Round[]) => void;
      onTrainingSynced: (mergedTraining: AiTrainingExample[]) => void;
    }
  ): () => void {
    const uploadedRoundIds = new Set<string>();
    const uploadedTrainingIds = new Set<string>();

    const roundsQuery = query(collection(db, 'rounds'), where('ownerId', '==', user.uid));
    const unsubRounds = onSnapshot(
      roundsQuery,
      async (snapshot) => {
        const deletedIds = new Set(StorageService.getDeletedRoundIds());
        const cloudRounds: Round[] = [];
        const cloudIds = new Set<string>();

        snapshot.docs.forEach((d) => {
          const mapped = mapFirestoreDocToRound(d.data());
          if (mapped) {
            cloudIds.add(mapped.id);
            if (!deletedIds.has(mapped.id)) {
              cloudRounds.push(mapped);
            }
          }
        });

        // Clean up any tombstoned items on Firestore
        for (const delId of deletedIds) {
          const safeDel = toSafeFirestoreId(delId, 'round');
          if (cloudIds.has(safeDel)) {
            deleteDoc(doc(db, 'rounds', safeDel)).catch(() => {});
          }
        }

        const localRounds = StorageService.getRounds();
        const merged = StorageService.mergeRounds(localRounds, cloudRounds);
        StorageService.saveRounds(merged);
        callbacks.onRoundsSynced(merged);
        void this.pushRoundsToServer(merged, Array.from(deletedIds));

        // Upload any local-only rounds to Firestore so nothing stays trapped locally
        if (user.emailVerified) {
          for (const localItem of merged) {
            const safeId = toSafeFirestoreId(localItem.id, 'round');
            if (!cloudIds.has(safeId) && !uploadedRoundIds.has(safeId)) {
              uploadedRoundIds.add(safeId);
              const path = `rounds/${safeId}`;
              try {
                await setDoc(doc(db, 'rounds', safeId), buildFirestoreRoundPayload(localItem, user.uid));
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, path);
              }
            }
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'rounds');
      }
    );

    const trainingQuery = query(collection(db, 'aiTraining'), where('ownerId', '==', user.uid));
    const unsubTraining = onSnapshot(
      trainingQuery,
      async (snapshot) => {
        const deletedIds = new Set(StorageService.getDeletedTrainingIds());
        const cloudTraining: AiTrainingExample[] = [];
        const cloudIds = new Set<string>();

        snapshot.docs.forEach((d) => {
          const mapped = mapFirestoreDocToTraining(d.data());
          if (mapped) {
            cloudIds.add(mapped.id);
            if (!deletedIds.has(mapped.id)) {
              cloudTraining.push(mapped);
            }
          }
        });

        for (const delId of deletedIds) {
          const safeDel = toSafeFirestoreId(delId, 'train');
          if (cloudIds.has(safeDel)) {
            deleteDoc(doc(db, 'aiTraining', safeDel)).catch(() => {});
          }
        }

        const localTraining = StorageService.getAiTraining();
        const merged = StorageService.mergeAiTraining(localTraining, cloudTraining);
        StorageService.saveAiTraining(merged);
        callbacks.onTrainingSynced(merged);
        void this.pushTrainingToServer(merged, Array.from(deletedIds));

        if (user.emailVerified) {
          for (const localItem of merged) {
            const safeId = toSafeFirestoreId(localItem.id, 'train');
            if (!cloudIds.has(safeId) && !uploadedTrainingIds.has(safeId)) {
              uploadedTrainingIds.add(safeId);
              const path = `aiTraining/${safeId}`;
              try {
                await setDoc(
                  doc(db, 'aiTraining', safeId),
                  buildFirestoreTrainingPayload(localItem, user.uid)
                );
              } catch (err) {
                handleFirestoreError(err, OperationType.WRITE, path);
              }
            }
          }
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'aiTraining');
      }
    );

    return () => {
      unsubRounds();
      unsubTraining();
    };
  },
};
