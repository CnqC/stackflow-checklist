import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AccountApp } from './components/account/AccountApp'
import { appearanceService } from './infrastructure/appearance/appearanceService'
import { updateService } from './infrastructure/updates/updateService'

appearanceService.start()
updateService.start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {import.meta.env.VITE_ACCOUNT_V3 === 'true' ? <AccountApp /> : <App />}
  </StrictMode>,
)
