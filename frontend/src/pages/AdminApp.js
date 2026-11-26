import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { PagePickerModal } from '../components/canva/PagePickerModal';
import { peekAdminConnect, clearAdminConnect, setPendingAdminPage } from '../utils/oauthReturn';
import { AdminShell } from '../components/layout/AdminShell';
import { AdminDashboardPage } from './AdminDashboardPage';
import { AdminAeoBlogsPage } from './adminAeo/AdminAeoBlogsPage';
import { AdminAeoCalendarPage } from './adminAeo/AdminAeoCalendarPage';
import { AdminAeoAnalysisPage } from './adminAeo/AdminAeoAnalysisPage';

/**
 * Completely separate from the regular user app (App.js's <AppShell>
 * <AppRouter/></AppShell> tree) — its own shell, its own tiny router, no
 * shared navigation with the normal user experience. See App.js's Root()
 * for where this is chosen over the regular shell for admin accounts.
 */
export function AdminApp({ onExitToUserView }) {
  // After a Canva sign-in the browser comes back to the app root — restore where the admin was.
  const back = (() => { try { const v = JSON.parse(sessionStorage.getItem('admin_return') || 'null'); sessionStorage.removeItem('admin_return'); return v; } catch { return null; } })();
  // An admin who sent a customer's social connection to the provider comes back here: reopen that customer.
  const connectBack = useRef(undefined);
  if (connectBack.current === undefined) {
    const m = peekAdminConnect();
    const sp = new URLSearchParams(window.location.search);
    connectBack.current = m && m.uid && sp.get('social_publish') ? { uid: m.uid, page: m.page, result: sp.get('social_publish'), token: sp.get('invite_token') } : null;
  }
  const cb = connectBack.current;
  const { toast } = useApp();
  const [pickerToken, setPickerToken] = useState(cb && cb.result === 'pages_ready' ? cb.token : null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!cb) { if (peekAdminConnect() && !new URLSearchParams(window.location.search).get('social_publish')) clearAdminConnect(); return undefined; }
    setPendingAdminPage(cb.page);
    if (cb.result === 'connected') toast({ type: 'success', message: "Connected on the customer's behalf." });
    else if (cb.result === 'error') toast({ type: 'error', message: 'The connection did not complete. Check the account you signed in with and try again.' });
    const t = setTimeout(clearAdminConnect, 0);   // after the user shell has seen it and stepped aside
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, []);
  const [page, setPage] = useState(cb ? 'analysis' : (back?.page || 'dashboard')); // dashboard | calendars | blogs
  const [selectedUser, setSelectedUser] = useState(cb ? { user_id: cb.uid } : (back?.user || null));

  const handleSelectUserFromDashboard = (user) => {
    setSelectedUser(user);
    setPage('analysis');
  };

  return (
    <AdminShell page={page} onNavigate={setPage} onExitToUserView={onExitToUserView} bleed={page === 'analysis' && !!selectedUser}>
      {page === 'dashboard' && <AdminDashboardPage onSelectUser={handleSelectUserFromDashboard} onReview={(u) => { setSelectedUser(u); setPage('blogs'); }} />}
      {page === 'analysis' && <AdminAeoAnalysisPage key={refresh} selectedUser={selectedUser} onSelectUser={setSelectedUser} />}
      {page === 'calendars' && <AdminAeoCalendarPage selectedUser={selectedUser} onSelectUser={setSelectedUser} />}
      {page === 'blogs' && <AdminAeoBlogsPage selectedUser={selectedUser} onSelectUser={setSelectedUser} />}
      {pickerToken && (
        <PagePickerModal
          inviteToken={pickerToken}
          onDone={(result) => {
            setPickerToken(null);
            if (result?.success) {
              toast({ type: 'success', message: `✓ Connected for the customer — ${result.label}${result.meta ? (result.instagram ? ' (Facebook + Instagram)' : ' (Facebook only: no Instagram account is linked to this Page)') : ''}` });
              if (cb) setPendingAdminPage(cb.page);   // the customer view reloads its connections, on the same page
              setRefresh(n => n + 1);
            }
          }}
        />
      )}
    </AdminShell>
  );
}
