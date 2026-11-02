import { useState } from 'preact/hooks';
import type { DatasetCandidate, MergePreview } from '../lib/types';
import { store } from '../lib/store';
import { useStore } from '../lib/hooks';
import { ImportPanel } from './ImportPanel';
import { MergeDialog } from './MergeDialog';

interface ImportFlowProps {
  compact?: boolean;
  onImported?: (candidate: DatasetCandidate, merged: boolean) => void;
}

export function ImportFlow({ compact = false, onImported }: ImportFlowProps) {
  const state = useStore();
  const [candidate, setCandidate] = useState<DatasetCandidate | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [mergeOpen, setMergeOpen] = useState(false);

  function handleCandidate(next: DatasetCandidate) {
    if (state.dataset) {
      setCandidate(next);
      setPreview(store.previewMerge(next));
      setMergeOpen(true);
      return;
    }
    store.importDataset(next);
    store.setNotice('success', `Imported ${next.accounts.length.toLocaleString()} following accounts. Nothing left this device.`);
    onImported?.(next, false);
  }

  function confirmMerge() {
    if (!candidate) return;
    const result = store.mergeDataset(candidate);
    store.setNotice(
      'success',
      `Snapshot replaced. ${result.decisionsPreserved.toLocaleString()} decisions were kept.`
    );
    setMergeOpen(false);
    setCandidate(null);
    setPreview(null);
    onImported?.(candidate, true);
  }

  return (
    <>
      <ImportPanel onCandidate={handleCandidate} compact={compact} />
      <MergeDialog
        open={mergeOpen}
        candidate={candidate}
        preview={preview}
        onCancel={() => {
          setMergeOpen(false);
          setCandidate(null);
          setPreview(null);
        }}
        onConfirm={confirmMerge}
      />
    </>
  );
}
