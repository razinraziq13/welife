import { create } from 'zustand';
import type { NewLifeInput } from '@engine/characters/create';
import type { SaveListItem } from '@contracts/saves';
import { getEngine } from '@app/bridge/engine';
import { describeError } from '@app/bridge/errors';
import { downloadText } from '@app/lib/download';

interface SavesState {
  saves: SaveListItem[];
  phase: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: NewLifeInput, displayName: string | null) => Promise<string>;
  rename: (saveId: string, displayName: string) => Promise<void>;
  duplicate: (saveId: string) => Promise<void>;
  remove: (saveId: string) => Promise<void>;
  exportSave: (saveId: string) => Promise<void>;
  importFile: (file: File) => Promise<string>;
}

export const useSavesStore = create<SavesState>()((set, get) => ({
  saves: [],
  phase: 'idle',
  error: null,

  async refresh() {
    set((s) => ({ phase: s.saves.length === 0 ? 'loading' : s.phase, error: null }));
    try {
      set({ saves: await getEngine().call('saves.list'), phase: 'ready' });
    } catch (error) {
      set({ phase: 'error', error: describeError(error) });
    }
  },

  async create(input, displayName) {
    const { saveId } = await getEngine().call('saves.create', { input, displayName });
    await get().refresh();
    return saveId;
  },

  async rename(saveId, displayName) {
    await getEngine().call('saves.rename', { saveId, displayName });
    await get().refresh();
  },

  async duplicate(saveId) {
    await getEngine().call('saves.duplicate', { saveId });
    await get().refresh();
  },

  async remove(saveId) {
    await getEngine().call('saves.delete', { saveId });
    await get().refresh();
  },

  async exportSave(saveId) {
    const { fileName, json } = await getEngine().call('saves.export', { saveId });
    downloadText(fileName, json, 'application/json');
  },

  async importFile(file) {
    const json = await file.text();
    const { saveId } = await getEngine().call('saves.import', { json });
    await get().refresh();
    return saveId;
  },
}));
