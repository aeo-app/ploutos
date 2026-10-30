import { useEffect, useState } from 'react';
import { getConnectProgress } from '../utils/oauthReturn';
import { isActingAs } from '../api/seoApi';

/** { platform: timestamp } of connections that started but did not complete. Updates live. */
export function useConnectProgress() {
  // "Connection in progress" is remembered in this browser, so it belongs to the signed-in admin, never to a customer.
  const read = () => (isActingAs() ? {} : getConnectProgress());
  const [m, setM] = useState(read);
  useEffect(() => {
    const on = () => setM(read());
    window.addEventListener('aeo-connect-progress', on);
    window.addEventListener('storage', on);
    return () => { window.removeEventListener('aeo-connect-progress', on); window.removeEventListener('storage', on); };
  }, []);
  return m;
}
