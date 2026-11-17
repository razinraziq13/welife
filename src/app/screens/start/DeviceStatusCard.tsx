import { useState, type ReactNode } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  Loader2,
  ShieldCheck,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { useStorageInfo, type PersistOutcome } from '@app/hooks/useStorageInfo';
import { formatBytes } from '@app/lib/format';
import { useAppStore } from '@app/stores/appStore';
import { isIosSafari, usePwaStore } from '@app/stores/pwaStore';

/** Warn before storage gets tight (spec §5: monitor estimates, warn before quota). */
export const STORAGE_WARNING_RATIO = 0.8;

function StatusRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
  // <dl> may only contain <div> groups of <dt>/<dd>, so the icon lives inside the <dt>.
  return (
    <div className="py-3">
      <dt className="flex items-center gap-3 text-sm font-semibold text-fg">
        <span className="text-muted">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1 pl-8 text-sm text-muted">{children}</dd>
    </div>
  );
}

function EngineStatus() {
  const { connection, status, connectionError, retryConnection } = useAppStore();
  if (connection === 'connecting') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Loader2 aria-hidden="true" className="size-4 animate-spin" /> Connecting…
      </span>
    );
  }
  if (connection === 'error') {
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-danger">Not connected: {connectionError}</span>
        <Button size="sm" variant="secondary" onClick={() => void retryConnection()}>
          Retry
        </Button>
      </span>
    );
  }
  return (
    <span data-testid="engine-status">
      Connected · engine v{status?.engineVersion} · storage schema v{status?.dbSchemaVersion}
    </span>
  );
}

const PERSIST_MESSAGES: Record<PersistOutcome, string> = {
  granted: 'Your browser will keep WeLife data unless you clear it yourself.',
  denied:
    'Your browser declined for now. Installing WeLife or using it regularly often allows this later.',
  unsupported: 'This browser does not support protecting stored data.',
};

function StorageStatus() {
  const { info, requestPersistence } = useStorageInfo();
  const [outcome, setOutcome] = useState<PersistOutcome | null>(null);
  const [busy, setBusy] = useState(false);

  if (info === null) return <span>Checking…</span>;
  if (!info.supported) return <span>This browser does not report storage usage.</span>;
  const nearlyFull =
    info.usage !== null &&
    info.quota !== null &&
    info.quota > 0 &&
    info.usage / info.quota >= STORAGE_WARNING_RATIO;

  return (
    <span className="flex flex-col gap-2">
      <span data-testid="storage-usage">
        Using {formatBytes(info.usage ?? 0)}
        {info.quota !== null && ` of ${formatBytes(info.quota)} available`}.
      </span>
      {nearlyFull && (
        <span role="alert" className="inline-flex items-center gap-1.5 text-danger">
          <TriangleAlert aria-hidden="true" className="size-4" /> Storage is almost full. Export
          saves you want to keep, or delete timelines you no longer need.
        </span>
      )}
      {info.persisted === true ? (
        <span className="inline-flex items-center gap-1.5 text-success">
          <ShieldCheck aria-hidden="true" className="size-4" /> Protected from automatic cleanup.
        </span>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <span>The browser may clear data when the device is low on space.</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void requestPersistence()
                .then(setOutcome)
                .finally(() => {
                  setBusy(false);
                });
            }}
          >
            Protect my data
          </Button>
        </span>
      )}
      {outcome !== null && outcome !== 'granted' && (
        <span role="status">{PERSIST_MESSAGES[outcome]}</span>
      )}
    </span>
  );
}

function OfflineStatus() {
  const offlineReady = usePwaStore((s) => s.offlineReady);
  const offlineError = usePwaStore((s) => s.offlineError);
  if (!('serviceWorker' in navigator)) return <span>This browser cannot run WeLife offline.</span>;
  if (offlineError !== null) {
    return (
      <span data-testid="offline-status">
        Offline mode could not be set up in this browser, so WeLife needs a connection to load. Your
        saved data is not affected.
      </span>
    );
  }
  return offlineReady ? (
    <span data-testid="offline-status" className="inline-flex items-center gap-1.5 text-success">
      <CheckCircle2 aria-hidden="true" className="size-4" /> Ready to play without a connection.
    </span>
  ) : (
    <span data-testid="offline-status">Preparing offline mode…</span>
  );
}

function InstallStatus() {
  const { installPrompt, installed, setInstallPrompt, markInstalled } = usePwaStore();
  if (installed) return <span>Installed on this device.</span>;
  if (installPrompt !== null) {
    return (
      <Button
        size="sm"
        onClick={() => {
          void installPrompt.prompt().then(async () => {
            const choice = await installPrompt.userChoice;
            if (choice.outcome === 'accepted') markInstalled();
            else setInstallPrompt(null);
          });
        }}
      >
        <Download aria-hidden="true" className="size-4" /> Install WeLife
      </Button>
    );
  }
  if (isIosSafari()) return <span>In Safari, tap Share, then “Add to Home Screen”.</span>;
  return <span>Use your browser’s menu to install WeLife as an app.</span>;
}

export function DeviceStatusCard() {
  return (
    <Card title="This device" description="Everything WeLife needs runs and is stored locally.">
      <dl className="divide-y divide-border">
        <StatusRow icon={<Cpu aria-hidden="true" className="size-5" />} label="Game engine">
          <EngineStatus />
        </StatusRow>
        <StatusRow icon={<HardDrive aria-hidden="true" className="size-5" />} label="Storage">
          <StorageStatus />
        </StatusRow>
        <StatusRow icon={<WifiOff aria-hidden="true" className="size-5" />} label="Offline play">
          <OfflineStatus />
        </StatusRow>
        <StatusRow icon={<Download aria-hidden="true" className="size-5" />} label="Install">
          <InstallStatus />
        </StatusRow>
      </dl>
    </Card>
  );
}
