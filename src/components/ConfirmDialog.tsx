import type { ComponentChildren } from 'preact';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  id: string;
  open: boolean;
  title: string;
  description?: string;
  children?: ComponentChildren;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  id,
  open,
  title,
  description,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  return (
    <Modal
      id={id}
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" class="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" class={`btn ${danger ? 'btn--danger' : 'btn--ink'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
