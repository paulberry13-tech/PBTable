import { Icon } from './Sprite'
import { Reveal } from './Reveal'

// The "Pending" empty state, ported from the site's empty() helper.
export function Empty({ word, detail }: { word: string; detail: string }) {
  return (
    <Reveal className="empty">
      <Icon name="i-paddle" />
      <span className="word">{word}</span>{detail}
    </Reveal>
  )
}
