/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initAnalytics } from '@/lib/analytics';
import PublicTrackingPage from './pages/PublicTrackingPage.tsx';
import './index.css';

initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PublicTrackingPage />
  </StrictMode>
);
