import React, { useState } from 'react';
import { AdminShell } from '../components/layout/AdminShell';
import { AdminDashboardPage } from './AdminDashboardPage';
import { AdminContentPage } from './AdminContentPage';

/**
 * Completely separate from the regular user app (App.js's <AppShell>
 * <AppRouter/></AppShell> tree) — its own shell, its own tiny router, no
 * shared navigation with the normal user experience. See App.js's Root()
 * for where this is chosen over the regular shell for admin accounts.
 */
export function AdminApp({ onExitToUserView }) {
  const [page, setPage] = useState('dashboard'); // dashboard | calendars | blogs
  const [selectedUser, setSelectedUser] = useState(null);

  const handleSelectUserFromDashboard = (user) => {
    setSelectedUser(user);
    setPage('calendars');
  };

  return (
    <AdminShell page={page} onNavigate={setPage} onExitToUserView={onExitToUserView}>
      {page === 'dashboard' && <AdminDashboardPage onSelectUser={handleSelectUserFromDashboard} />}
      {page === 'calendars' && (
        <AdminContentPage contentType="calendars" selectedUser={selectedUser} onSelectUser={setSelectedUser} />
      )}
      {page === 'blogs' && (
        <AdminContentPage contentType="blogs" selectedUser={selectedUser} onSelectUser={setSelectedUser} />
      )}
    </AdminShell>
  );
}
