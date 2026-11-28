import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { UpdateBanner } from './UpdateBanner.tsx'
import './styles.css'
import { setupPwa } from './pwa.ts'

setupPwa()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateBanner />
  </StrictMode>,
)
