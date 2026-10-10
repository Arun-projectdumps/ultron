import { createRoot } from 'react-dom/client';
import './fonts';
import './theme/base.css';
import { App } from './App';
import { IS_TAURI } from './backend';

// Native window: transparent overlay title bar, so leave room for the traffic lights.
if (IS_TAURI) document.documentElement.style.setProperty('--traffic-lights', '78px');

createRoot(document.getElementById('root')!).render(<App />);
