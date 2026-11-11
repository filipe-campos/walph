import { createRoot } from 'react-dom/client'
import '@vscode/codicons/dist/codicon.css'
// Design system fonts, bundled (the CSP does not allow remote fonts): Geist in the UI, JetBrains Mono in code.
import '@fontsource/geist/latin-400.css'
import '@fontsource/geist/latin-500.css'
import '@fontsource/geist/latin-600.css'
import '@fontsource/geist/latin-700.css'
import '@fontsource/jetbrains-mono/latin-400.css'
import '@fontsource/jetbrains-mono/latin-400-italic.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import '@xterm/xterm/css/xterm.css'
import './styles.css'
import { App } from './App'
import { bootstrap } from './bootstrap'

// The WorkspaceBar is also the title bar: the CSS reserves the traffic lights space only on macOS.
document.documentElement.dataset.platform = window.api.platform

// Before the first render: the theme is already applied.
bootstrap()

// No StrictMode on purpose: CodeMirror and xterm are imperative and the strict mode double mount
// would discard the terminal's initial output.
// The bundled fonts load before the first render: xterm measures the cell only once, on creation, and would measure
// the fallback font. They are local files (milliseconds); the timeout only guards against a load failure.
const FONTS = ['400 13px "Geist"', '600 13px "Geist"', '400 13px "JetBrains Mono"']
void Promise.race([
  Promise.all(FONTS.map((font) => document.fonts.load(font))),
  new Promise((resolve) => setTimeout(resolve, 1500))
])
  .catch(() => {})
  .then(() => {
    const root = document.getElementById('root')!
    createRoot(root).render(<App />)
    // The `index.html` splash goes away with the first render; the fade-in depends on this class.
    root.removeAttribute('aria-busy')
    document.documentElement.classList.add('app-ready')
  })
