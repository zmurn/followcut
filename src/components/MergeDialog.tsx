import type { DatasetCandidate, MergePreview } from '../lib/types';
import { formatDate } from '../lib/selectors';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface MergeDialogProps {
  open: boolean;
  candidate: DatasetCandidate | null;
  preview: MergePreview | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export function MergeDialog({ open, candidate, preview, onCancel, onConfirm }: MergeDialogProps) {
  if (!candidate || !preview) return null;
  return (
    <Modal
      id="merge"
      open={open}
      onClose={onCancel}
      title="Replace your snapshot?"
      description="The new export becomes the source of truth. Decisions are matched by exact username only."
      wide
      footer={
        <>
          <span class="rail-note">Nothing is sent to Instagram.</span>
          <span class="spacer" />
          <button type="button" class="btn" onClick={onCancel}>Keep current snapshot</button>
          <button type="button" class="btn btn--ink" onClick={onConfirm}>Replace snapshot</button>
        </>
      }
    >
      <div class="merge-stats">
        <div><b>{preview.oldFollowing.toLocaleString()} → {preview.newFollowing.toLocaleString()}</b><span>Following</span></div>
        <div><b>+{preview.added.toLocaleString()}</b><span>New follows</span></div>
        <div><b>−{preview.removed.toLocaleString()}</b><span>No longer followed</span></div>
        <div><b>{preview.decisionsPreserved.toLocaleString()}</b><span>Decisions kept</span></div>
      </div>
      <div class="meta-list">
        <div><span>Old snapshot</span><span>{preview.oldExportedAt ? formatDate(preview.oldExportedAt) : 'date unknown'}</span></div>
        <div><span>New snapshot</span><span>{preview.newExportedAt ? formatDate(preview.newExportedAt) : 'date unknown'}</span></div>
        <div><span>Decisions dropped</span><span>{preview.decisionsDropped.toLocaleString()}</span></div>
        <div><span>Confirmations kept</span><span>{preview.confirmationsPreserved.toLocaleString()}</span></div>
        <div><span>Confirmations archived</span><span>{preview.confirmationsArchived.toLocaleString()}</span></div>
        <div><span>Data set</span><span>{candidate.label}</span></div>
      </div>
      {preview.warnings.length > 0 ? (
        <div class="callout callout--warn">
          <Icon name="alert" size={18} />
          <div>
            {preview.warnings.map(warning => <p key={warning} style={{ marginBottom: '6px' }}>{warning}</p>)}
          </div>
        </div>
      ) : null}
      <p class="rail-note">
        Usernames are provisional identities. FOLLOW/CUT never guesses that an old account and a new account with a different
        username are the same person; a rename loses the old decision rather than moving it to a stranger.
      </p>
    </Modal>
  );
}
