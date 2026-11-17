import { create } from 'zustand';
import type { AppSettings, AppSettingsPatch } from '@contracts/appSettings';
import type { SystemStatus } from '@contracts/protocol';
import { getEngine, restartEngine } from '@app/bridge/engine';
import { EngineError } from '@app/bridge/engineClient';
import { readAppearanceMirror, writeAppearanceMirror } from '@app/theme/appearance';

export type ConnectionPhase = 'connecting' | 'ready' | 'error';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface AppState {
  connection: ConnectionPhase;
  status: SystemStatus | null;
  connectionError: string | null;
  /** Current settings. Starts from the local mirror, then replaced by the engine's stored copy. */
  settings: AppSettings;
  settingsSave: SaveState;
  settingsError: string | null;
  connect: () => Promise<void>;
  retryConnection: () => Promise<void>;
  updateSettings: (patch: AppSettingsPatch) => Promise<void>;
}

function describe(error: unknown): string {
  if (error instanceof EngineError) {
    const issue = error.issues?.[0];
    return issue ? `${error.message} (${issue.path}: ${issue.message})` : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export const useAppStore = create<AppState>()((set, get) => ({
  connection: 'connecting',
  status: null,
  connectionError: null,
  settings: readAppearanceMirror(),
  settingsSave: 'idle',
  settingsError: null,

  async connect() {
    set({ connection: 'connecting', connectionError: null });
    try {
      const engine = getEngine();
      const [status, settings] = await Promise.all([
        engine.call('system.status'),
        engine.call('settings.get'),
      ]);
      writeAppearanceMirror(settings);
      set({ connection: 'ready', status, settings });
    } catch (error) {
      set({ connection: 'error', connectionError: describe(error) });
    }
  },

  async retryConnection() {
    restartEngine();
    await get().connect();
  },

  async updateSettings(patch) {
    set({ settingsSave: 'saving', settingsError: null });
    try {
      const settings = await getEngine().call('settings.update', patch);
      writeAppearanceMirror(settings);
      set({ settings, settingsSave: 'saved' });
    } catch (error) {
      set({ settingsSave: 'error', settingsError: describe(error) });
    }
  },
}));
