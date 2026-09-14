import EmojiPicker, { type EmojiClickData } from 'emoji-picker-react'
import { useEffect, useRef } from 'react'
import styles from './EmojiPickerPopover.module.css'

interface EmojiPickerPopoverProps {
  onPick: (emoji: string) => void
  onClose: () => void
  /** 'right', прижать правый край попапа к кнопке-триггеру (нужно, когда
   * та стоит у правого края чата: свои сообщения, эмодзи в композере), иначе
   * попап растёт вправо и вылезает за границы окна. По умолчанию 'left'. */
  align?: 'left' | 'right'
  /** 'down', открывать вниз от кнопки, а не вверх (нужно, когда кнопка стоит
   * у самого верха экрана и сверху попросту некуда открываться, например
   * аватар чата в шапке). По умолчанию 'up'. */
  direction?: 'up' | 'down'
}

/** Открывающийся попап с emoji-picker-react, закрывается по клику снаружи. */
export function EmojiPickerPopover({ onPick, onClose, align = 'left', direction = 'up' }: EmojiPickerPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  function handleEmojiClick(data: EmojiClickData) {
    onPick(data.emoji)
  }

  const className = [styles.popover, align === 'right' && styles.alignRight, direction === 'down' && styles.openDown]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={ref} className={className}>
      <EmojiPicker onEmojiClick={handleEmojiClick} />
    </div>
  )
}
