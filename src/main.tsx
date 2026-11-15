import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { AccountApp } from './components/account/AccountApp'
import { appearanceService } from './infrastructure/appearance/appearanceService'
import { updateService } from './infrastructure/updates/updateService'

appearanceService.start()
updateService.start()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccountApp />
  </StrictMode>,
)
