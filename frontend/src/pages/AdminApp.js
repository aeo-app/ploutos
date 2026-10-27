import React, { useState } from 'react';
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
  const [page, setPage] = useState(back?.page || 'dashboard'); // dashboard | calendars | blogs
  const [selectedUser, setSelectedUser] = useState(back?.user || null);

  const handleSelectUserFromDashboard = (user) => {
    setSelectedUser(user);
    setPage('calendars');
  };

  return (
    <AdminShell page={page} onNavigate={setPage} onExitToUserView={onExitToUserView}>
      {page === 'dashboard' && <AdminDashboardPage onSelectUser={handleSelectUserFromDashboard} onReview={(u) => { setSelectedUser(u); setPage('blogs'); }} />}
      {page === 'analysis' && <AdminAeoAnalysisPage selectedUser={selectedUser} onSelectUser={setSelectedUser} />}
      {page === 'calendars' && <AdminAeoCalendarPage selectedUser={selectedUser} onSelectUser={setSelectedUser} />}
      {page === 'blogs' && <AdminAeoBlogsPage selectedUser={selectedUser} onSelectUser={setSelectedUser} />}
    </AdminShell>
  );
}
