'use client';

import * as React from 'react';

type AppSplashGateProps = {
  minimumVisibleMs?: number;
  completeAfterMs?: number;
};

export function AppSplashGate({
  minimumVisibleMs = 600,
  completeAfterMs = 240,
}: AppSplashGateProps) {
  React.useEffect(() => {
    let completeTimer: number | null = null;

    document.body.dataset.appSplash = 'active';

    const readyTimer = window.setTimeout(() => {
      document.body.dataset.appSplash = 'ready';

      completeTimer = window.setTimeout(() => {
        document.body.dataset.appSplash = 'complete';
      }, completeAfterMs);
    }, minimumVisibleMs);

    return () => {
      window.clearTimeout(readyTimer);

      if (completeTimer !== null) {
        window.clearTimeout(completeTimer);
      }
    };
  }, [completeAfterMs, minimumVisibleMs]);

  return null;
}
