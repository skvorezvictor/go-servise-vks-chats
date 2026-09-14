import styles from './MentionAutocomplete.module.css'

interface MentionAutocompleteProps {
  names: string[]
  onPick: (name: string) => void
}

export function MentionAutocomplete({ names, onPick }: MentionAutocompleteProps) {
  if (names.length === 0) return null

  return (
    <div className={styles.list}>
      {names.map((name) => (
        <button key={name} type="button" className={styles.item} onClick={() => onPick(name)}>
          {name}
        </button>
      ))}
    </div>
  )
}
