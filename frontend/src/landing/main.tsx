import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initAnalytics } from '@/lib/analytics';
import { LandingPage } from './LandingPage.tsx';
import './landing.css';

initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>,
);
