import { X } from 'lucide-react'
import styles from './ImageLightbox.module.css'

interface ImageLightboxProps {
  src: string
  alt: string
  onClose: () => void
}

/** Просмотр картинки во весь экран по клику, закрывается по клику вне картинки или на крестик. */
export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <button type="button" className={styles.close} onClick={onClose} title="Закрыть">
        <X size={22} />
      </button>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <img src={src} alt={alt} className={styles.image} onClick={(e) => e.stopPropagation()} />
    </div>
  )
}
