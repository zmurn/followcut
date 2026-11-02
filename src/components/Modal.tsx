import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ComponentChildren;
  footer?: ComponentChildren;
  wide?: boolean;
  id?: string;
}

export function Modal({ open, onClose, title, description, children, footer, wide = false, id = 'modal' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef<string>('');

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previousOverflow.current = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      return () => {
        document.body.style.overflow = previousOverflow.current;
        if (dialog.open) dialog.close();
      };
    }
    if (!open && dialog.open) {
      dialog.close();
      document.body.style.overflow = previousOverflow.current;
    }
  }, [open]);

  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  return (
    <dialog
      ref={ref}
      class={`modal${wide ? ' modal--wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      onClick={event => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div class="modal__inner">
        <div class="modal__head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descId}>{description}</p> : null}
          </div>
          <button type="button" class="modal__close" onClick={onClose} aria-label="Close dialog">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div class="modal__body">{children}</div>
        {footer ? <div class="modal__foot">{footer}</div> : null}
      </div>
    </dialog>
  );
}
