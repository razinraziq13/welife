import { useEffect, useState } from 'react';
import { CheckCircle2, Keyboard, Loader2 } from 'lucide-react';
import type {
  AppSettings,
  ContrastPreference,
  MotionPreference,
  TextScale,
  ThemePreference,
} from '@contracts/appSettings';
import { TEXT_SCALES } from '@contracts/appSettings';
import { PageHeader } from '@app/components/PageHeader';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ChoiceGroup, type Choice } from '@app/components/ui/choice-group';
import { Switch } from '@app/components/ui/switch';
import { cn } from '@app/lib/cn';
import { useAppStore } from '@app/stores/appStore';
import { useShortcutsDialogStore } from '@app/stores/uiStore';

const THEME_OPTIONS: readonly Choice<ThemePreference>[] = [
  { value: 'system', label: 'System', description: 'Follow device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const CONTRAST_OPTIONS: readonly Choice<ContrastPreference>[] = [
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'High', description: 'Stronger text and borders' },
];

const MOTION_OPTIONS: readonly Choice<MotionPreference>[] = [
  { value: 'system', label: 'System', description: 'Follow device' },
  { value: 'reduce', label: 'Reduced', description: 'Minimal animation' },
  { value: 'full', label: 'Full' },
];

const TEXT_SCALE_OPTIONS: readonly Choice<`${TextScale}`>[] = TEXT_SCALES.map((scale) => ({
  value: `${scale}` as const,
  label: `${scale}%`,
}));

function parseTextScale(value: string): TextScale {
  const found = TEXT_SCALES.find((scale) => String(scale) === value);
  return found ?? 100;
}

const SAVED_VISIBLE_MS = 2500;

/**
 * Floating save status. The live region is always mounted (so changes are announced)
 * but takes no layout space; the "Saved" confirmation fades out after a moment.
 */
function SaveIndicator() {
  const { settingsSave, settingsError, settings } = useAppStore();
  const [hiddenFor, setHiddenFor] = useState<AppSettings | null>(null);

  useEffect(() => {
    if (settingsSave !== 'saved') return;
    const timer = window.setTimeout(() => {
      setHiddenFor(settings);
    }, SAVED_VISIBLE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [settingsSave, settings]);

  const visible = settingsSave !== 'idle' && !(settingsSave === 'saved' && hiddenFor === settings);

  return (
    <div
      aria-live="polite"
      className={cn(
        'fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 rounded-full border border-border bg-surface px-4 py-2 text-sm shadow-lg transition-opacity',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {settingsSave === 'saving' && (
        <span className="inline-flex items-center gap-1.5 text-muted">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Saving…
        </span>
      )}
      {settingsSave === 'saved' && visible && (
        <span className="inline-flex items-center gap-1.5 text-success">
          <CheckCircle2 aria-hidden="true" className="size-4" /> Saved on this device
        </span>
      )}
      {settingsSave === 'error' && (
        <span role="alert" className="text-danger">
          Could not save: {settingsError}
        </span>
      )}
    </div>
  );
}

export function SettingsScreen() {
  const { settings, connection, updateSettings } = useAppStore();
  const openShortcuts = useShortcutsDialogStore((s) => s.setOpen);
  const disabled = connection !== 'ready';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Preferences for this device. They are stored locally and work offline."
      />
      {disabled && (
        <p role="status" className="text-sm text-muted">
          {connection === 'connecting'
            ? 'Loading your saved preferences…'
            : 'The game engine is not connected, so changes cannot be saved. Retry from Home.'}
        </p>
      )}
      <SaveIndicator />

      <Card title="Appearance">
        <div className="flex flex-col gap-6">
          <ChoiceGroup
            legend="Theme"
            name="theme"
            value={settings.theme}
            options={THEME_OPTIONS}
            disabled={disabled}
            onChange={(theme) => void updateSettings({ theme })}
          />
          <ChoiceGroup
            legend="Contrast"
            name="contrast"
            value={settings.contrast}
            options={CONTRAST_OPTIONS}
            disabled={disabled}
            onChange={(contrast) => void updateSettings({ contrast })}
          />
        </div>
      </Card>

      <Card title="Reading and motion">
        <div className="flex flex-col gap-6">
          <ChoiceGroup
            legend="Text size"
            description="Scales all text and controls."
            name="textScale"
            value={`${settings.textScale}`}
            options={TEXT_SCALE_OPTIONS}
            disabled={disabled}
            onChange={(value) => void updateSettings({ textScale: parseTextScale(value) })}
          />
          <ChoiceGroup
            legend="Motion"
            name="motion"
            value={settings.motion}
            options={MOTION_OPTIONS}
            disabled={disabled}
            onChange={(motion) => void updateSettings({ motion })}
          />
        </div>
      </Card>

      <Card title="Keyboard">
        <div className="flex flex-col gap-4">
          <Switch
            label="Keyboard shortcuts"
            description="Single-key shortcuts such as ? for help. Turn off if they clash with assistive technology."
            checked={settings.keyboardShortcuts}
            disabled={disabled}
            onChange={(keyboardShortcuts) => void updateSettings({ keyboardShortcuts })}
          />
          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                openShortcuts(true);
              }}
            >
              <Keyboard aria-hidden="true" className="size-4" />
              View shortcuts
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
