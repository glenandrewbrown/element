import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installIfJuceHosted } from './lib/suppressNativeContextMenu'

// Kill the host WebView's native context menu ("Reload" etc.) when running
// inside JUCE; no-op in Storybook/dev browser so DevTools stays reachable.
installIfJuceHosted()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
