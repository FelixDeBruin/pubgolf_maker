import { forgetGame } from '../lib/game'
import { navigate } from '../lib/nav'

export default function ExitButton({ label, className }: { label: string; className: string }) {
  return (
    <button
      className={className}
      onClick={() => {
        forgetGame()
        navigate('/')
      }}
    >
      {label}
    </button>
  )
}
