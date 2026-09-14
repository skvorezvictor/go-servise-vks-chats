import { Modal } from './Modal'
import styles from './ConfirmModal.module.css'

interface ConfirmModalProps {
  title: string
  text: string
  confirmLabel?: string
  onConfirm: () => void
  onClose: () => void
}

/** Общее подтверждение перед разрушительным действием, защита от случайного нажатия. */
export function ConfirmModal({ title, text, confirmLabel = 'Удалить', onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className={styles.text}>{text}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onClose}>
          Отмена
        </button>
        <button type="button" className={styles.confirm} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
