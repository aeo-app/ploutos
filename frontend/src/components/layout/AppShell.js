import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar }  from './TopBar';
import s from './AppShell.module.css';

export function AppShell({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={s.shell}>
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className={s.main}>
        <TopBar onMenu={() => setOpen(v => !v)} />
        <main className={s.content}>{children}</main>
      </div>
    </div>
  );
}
