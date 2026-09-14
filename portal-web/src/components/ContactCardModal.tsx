import type { Contact } from '../lib/contactsApi'
import { Avatar } from './Avatar'
import { Modal } from './Modal'
import styles from './ContactCardModal.module.css'

interface ContactCardModalProps {
  contact: Contact
  onClose: () => void
  onWrite: () => void
}

export function ContactCardModal({ contact, onClose, onWrite }: ContactCardModalProps) {
  return (
    <Modal title="Контакт" onClose={onClose}>
      <div className={styles.card}>
        <Avatar mxcUrl={undefined} name={contact.displayName} size={72} />
        <div className={styles.name}>{contact.displayName}</div>
        {contact.about && <div className={styles.about}>{contact.about}</div>}
        <button type="button" className={styles.writeButton} onClick={onWrite}>
          Написать
        </button>
      </div>
    </Modal>
  )
}
