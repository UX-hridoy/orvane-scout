import { createRoot } from 'react-dom/client';
import App from '@/components/App';
import { claudeTransport } from './transport';

createRoot(document.getElementById('root')!).render(<App transport={claudeTransport()} />);
