import { usePath } from './lib/nav'
import Draft from './pages/Draft'
import Home from './pages/Home'
import Join from './pages/Join'
import Room from './pages/Room'

export default function App() {
  const [, section, id] = usePath().split('/')

  if (section === 'draft' && id) return <Draft key={id} draftId={id} />
  if (section === 'join') return <Join key={id ?? ''} initialCode={id ?? ''} />
  if (section === 'room' && id) return <Room key={id} roomId={id} />
  return <Home />
}
