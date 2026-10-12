import { useEffect, useState } from 'react';
import { getConnectProgress } from '../utils/oauthReturn';

/** { platform: timestamp } of connections that started but did not complete. Updates live. */
export function useConnectProgress() {
  const [m, setM] = useState(getConnectProgress);
  useEffect(() => {
    const on = () => setM(getConnectProgress());
    window.addEventListener('aeo-connect-progress', on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener('aeo-connect-progress', on); window.removeEventListener('storage', on); };
  }, []);
  return m;
}
