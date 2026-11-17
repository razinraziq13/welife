import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Copy, Download, FileUp, GitBranch, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { SaveListItem } from '@contracts/saves';
import { Logo } from '@app/components/Logo';
import { PageHeader } from '@app/components/PageHeader';
import { Avatar } from '@app/components/avatar/Avatar';
import { Button, buttonVariants } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { ConfirmDialog, PromptDialog } from '@app/components/ui/confirm-dialog';
import { describeError } from '@app/bridge/errors';
import { countryName, formatMonth } from '@app/i18n/format';
import { t } from '@app/i18n/en';
import { formatBytes } from '@app/lib/format';
import { useAppStore } from '@app/stores/appStore';
import { useSavesStore } from '@app/stores/savesStore';
import { DeviceStatusCard } from './start/DeviceStatusCard';

function SaveCard({
  save,
  onRename,
  onDelete,
}: {
  save: SaveListItem;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { duplicate, exportSave } = useSavesStore();
  const [message, setMessage] = useState<string | null>(null);
  const s = save.summary;
  const run = (label: string, action: () => Promise<void>) => {
    setMessage(null);
    void action()
      .then(() => {
        setMessage(label);
      })
      .catch((error: unknown) => {
        setMessage(describeError(error));
      });
  };
  return (
    <li
      className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
      data-testid="save-card"
    >
      <div className="flex items-start gap-3">
        <Avatar
          appearance={s.appearance}
          stage={s.stage}
          ageYears={s.ageYears}
          className="size-14"
        />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-fg">{save.displayName}</h3>
          <p className="text-sm text-muted">
            {s.characterName} ·{' '}
            {s.lifeStatus === 'alive'
              ? `age ${String(s.ageYears)}`
              : `died at ${String(s.ageYears)}`}{' '}
            · {countryName(s.countryCode)}
          </p>
          <p className="text-sm text-muted">
            {formatMonth(s.clock)} · {t(`difficulty.${save.difficulty}`)} ·{' '}
            <span className="inline-flex items-center gap-1">
              <GitBranch aria-hidden="true" className="size-3.5" />
              {save.currentBranchName}
              {save.branchCount > 1 && ` (${String(save.branchCount)} timelines)`}
            </span>{' '}
            · {formatBytes(save.bytes)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link
          to={`/play/${save.id}/life`}
          className={buttonVariants({ size: 'sm' })}
          aria-label={`Continue ${save.displayName}`}
        >
          <Play aria-hidden="true" className="size-4" /> Continue
        </Link>
        <Button
          size="sm"
          variant="secondary"
          onClick={onRename}
          aria-label={`Rename ${save.displayName}`}
        >
          <Pencil aria-hidden="true" className="size-4" /> Rename
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Duplicate ${save.displayName}`}
          onClick={() => {
            run('Copy created.', () => duplicate(save.id));
          }}
        >
          <Copy aria-hidden="true" className="size-4" /> Duplicate
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Export ${save.displayName}`}
          onClick={() => {
            run('Save file downloaded.', () => exportSave(save.id));
          }}
        >
          <Download aria-hidden="true" className="size-4" /> Export
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          aria-label={`Delete ${save.displayName}`}
        >
          <Trash2 aria-hidden="true" className="size-4" /> Delete
        </Button>
      </div>
      {message && (
        <p role="status" className="mt-2 text-sm text-muted">
          {message}
        </p>
      )}
    </li>
  );
}

export function StartScreen() {
  const navigate = useNavigate();
  const connection = useAppStore((s) => s.connection);
  const { saves, phase, error, refresh, rename, remove, importFile } = useSavesStore();
  const [renaming, setRenaming] = useState<SaveListItem | null>(null);
  const [deleting, setDeleting] = useState<SaveListItem | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const importId = useId();

  useEffect(() => {
    if (connection === 'ready') void refresh();
  }, [connection, refresh]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-4">
        <Logo className="size-16 shrink-0" />
        <div className="flex-1">
          <PageHeader
            title="WeLife"
            documentTitle={null}
            description="One Life. Endless Generations."
          />
        </div>
      </div>

      <section aria-labelledby="lives-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="lives-heading" className="text-xl font-semibold text-fg">
            Your lives
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link to="/new" className={buttonVariants()}>
              <Plus aria-hidden="true" className="size-4" /> New life
            </Link>
            <Button
              variant="secondary"
              disabled={connection !== 'ready'}
              onClick={() => fileInput.current?.click()}
            >
              <FileUp aria-hidden="true" className="size-4" /> Import a save
            </Button>
            <input
              id={importId}
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a WeLife save file to import"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                setImportMessage('Checking the save file…');
                void importFile(file)
                  .then((saveId) => {
                    setImportMessage('Save imported.');
                    void navigate(`/play/${saveId}/life`);
                  })
                  .catch((err: unknown) => {
                    setImportMessage(`Import failed: ${describeError(err)}`);
                  });
              }}
            />
          </div>
        </div>
        {importMessage && (
          <p role="status" className="text-sm text-muted">
            {importMessage}
          </p>
        )}
        {phase === 'error' && (
          <p role="alert" className="text-sm text-danger">
            Could not load your saves: {error}
          </p>
        )}
        {phase === 'ready' && saves.length === 0 && (
          <Card>
            <p className="text-fg">No lives yet. Start a new life to begin your story.</p>
          </Card>
        )}
        {saves.length > 0 && (
          <ul className="grid gap-3 md:grid-cols-2">
            {saves.map((save) => (
              <SaveCard
                key={save.id}
                save={save}
                onRename={() => {
                  setRenaming(save);
                }}
                onDelete={() => {
                  setDeleting(save);
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <DeviceStatusCard />

      <PromptDialog
        open={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
        title="Rename save"
        label="Save name"
        initialValue={renaming?.displayName ?? ''}
        maxLength={80}
        confirmLabel="Rename"
        onConfirm={async (value) => {
          if (renaming) await rename(renaming.id, value);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Delete this save?"
        confirmLabel="Delete permanently"
        tone="danger"
        onConfirm={async () => {
          if (deleting) await remove(deleting.id);
        }}
      >
        <p>
          “{deleting?.displayName}” and all of its timelines will be deleted from this device. This
          cannot be undone. Export it first if you might want it back.
        </p>
      </ConfirmDialog>
    </div>
  );
}
