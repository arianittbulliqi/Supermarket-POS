import { useEffect, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { fiscal, store } from './app/state';
import { keepData } from './store/persist';
import { Till } from './till/Till';
import { Office } from './office/Office';
import { ApprovalProvider, ToastProvider } from './ui/kit';

export function App() {
  const [ready, setReady] = useState(store.ready);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (store.ready) return;
    store
      .load()
      .then(() => {
        setReady(true);
        fiscal.start();
        void keepData();
      })
      .catch((e) => setErr(String(e)));
  }, []);
  if (err) return <div style={{ padding: 40, fontFamily: 'Inter,system-ui' }}>The till could not open its data: {err}</div>;
  if (!ready) return <div style={{ padding: 40, fontFamily: 'Inter,system-ui', color: '#5B665F' }}>Opening…</div>;
  return (
    <ToastProvider>
      <ApprovalProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<Till />} />
            <Route path="/office/*" element={<Office />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </HashRouter>
      </ApprovalProvider>
    </ToastProvider>
  );
}
