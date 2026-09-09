import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { adminApi } from '../api/adminApi';
import { withTokenExpiry } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, SectionHeader, Empty, ErrorCard, SkeletonCard, CopyButton } from '../components/ui/UI';
import { RelocationCalendarResultView } from './RelocationCalendarPage';
import s from './AdminPage.module.css';

export function AdminPage() {
  const { toast } = useApp();
  const { goScreen, logout } = useAuth();
  const authCtx = { goScreen, logout };

  const [users, setUsers] = useState(null);
  const [usersError, setUsersError] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  const [contentType, setContentType] = useState('calendars'); // calendars | blogs

  const [items, setItems] = useState(null); // list of calendars or blogs for selectedUser
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);

  const [selected, setSelected] = useState(null); // full detail, incl. result
  const [detailLoading, setDetailLoading] = useState(false);

  const [view, setView] = useState('formatted'); // formatted | edit
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI-revise panel
  const [revising, setRevising] = useState(false);
  const [reviseInstruction, setReviseInstruction] = useState('');
  const [reviseDate, setReviseDate] = useState('');
  const [revisePostNumber, setRevisePostNumber] = useState(1);

  // Create-new-blog-for-customer panel
  const [showCreateBlog, setShowCreateBlog] = useState(false);
  const [creatingBlog, setCreatingBlog] = useState(false);
  const [newBlogTopic, setNewBlogTopic] = useState('');
  const [newBlogKeyword, setNewBlogKeyword] = useState('');
  const [newBlogInstruction, setNewBlogInstruction] = useState('');

  const loadUsers = useCallback(() => {
    setUsersError(null);
    withTokenExpiry(adminApi.listUsers(), authCtx)
      .then(d => setUsers(d.users))
      .catch(e => { if (e?.code !== 'TokenExpired') setUsersError(e.message || 'Could not load users.'); });
    // eslint-disable-next-line
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const loadItems = useCallback((user, type) => {
    setItems(null);
    setSelected(null);
    setItemsLoading(true);
    setItemsError(null);
    const call = type === 'blogs' ? adminApi.listUserBlogs(user.user_id) : adminApi.listUserCalendars(user.user_id);
    withTokenExpiry(call, authCtx)
      .then(d => setItems(d.items))
      .catch(e => { if (e?.code !== 'TokenExpired') setItemsError(e.message || 'Could not load content.'); })
      .finally(() => setItemsLoading(false));
    // eslint-disable-next-line
  }, []);

  const selectUser = (user) => {
    setSelectedUser(user);
    loadItems(user, contentType);
  };

  const switchContentType = (type) => {
    setContentType(type);
    if (selectedUser) loadItems(selectedUser, type);
  };

  const selectItem = (item) => {
    setDetailLoading(true);
    setSaveSuccess(false);
    const call = contentType === 'blogs'
      ? adminApi.getUserBlog(selectedUser.user_id, item.analysis_id)
      : adminApi.getUserCalendar(selectedUser.user_id, item.analysis_id);
    withTokenExpiry(call, authCtx)
      .then(d => {
        setSelected(d);
        setJsonText(JSON.stringify(d.result, null, 2));
        setJsonError(null);
        setView('formatted');
        setReviseInstruction('');
        if (contentType === 'calendars') {
          const firstUnlocked = (d.result.days || []).find(day => !day.locked);
          setReviseDate(firstUnlocked?.date || '');
          setRevisePostNumber(1);
        }
      })
      .catch(e => { if (e?.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not load detail.' }); })
      .finally(() => setDetailLoading(false));
  };

  const handleJsonChange = (text) => {
    setJsonText(text);
    try { JSON.parse(text); setJsonError(null); }
    catch { setJsonError('Invalid JSON — fix the syntax before saving.'); }
  };

  const save = async () => {
    let parsed;
    try { parsed = JSON.parse(jsonText); }
    catch { setJsonError('Invalid JSON — fix the syntax before saving.'); return; }
    setSaving(true);
    setSaveSuccess(false);
    try {
      const call = contentType === 'blogs'
        ? adminApi.updateUserBlog(selectedUser.user_id, selected.analysis_id, parsed)
        : adminApi.updateUserCalendar(selectedUser.user_id, selected.analysis_id, parsed);
      const updated = await withTokenExpiry(call, authCtx);
      setSelected(updated);
      setJsonText(JSON.stringify(updated.result, null, 2));
      setSaveSuccess(true);
      toast({ type: 'success', message: '✓ Saved.' });
    } catch (e) {
      if (e?.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not save changes.' });
    } finally {
      setSaving(false);
    }
  };

  const runRevise = async () => {
    if (!reviseInstruction.trim()) {
      toast({ type: 'error', message: 'Enter an instruction first.' });
      return;
    }
    setRevising(true);
    try {
      const call = contentType === 'blogs'
        ? adminApi.reviseUserBlog(selectedUser.user_id, selected.analysis_id, reviseInstruction.trim())
        : adminApi.reviseCalendarPost(selectedUser.user_id, selected.analysis_id, reviseDate, revisePostNumber, reviseInstruction.trim());
      const updated = await withTokenExpiry(call, authCtx);
      setSelected(updated);
      setJsonText(JSON.stringify(updated.result, null, 2));
      setReviseInstruction('');
      toast({ type: 'success', message: '✓ Revised with AI and saved.' });
    } catch (e) {
      if (e?.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not revise this content.' });
    } finally {
      setRevising(false);
    }
  };

  const createBlog = async () => {
    if (!newBlogTopic.trim()) {
      toast({ type: 'error', message: 'Enter a topic first.' });
      return;
    }
    setCreatingBlog(true);
    try {
      const created = await withTokenExpiry(
        adminApi.createBlogForUser(selectedUser.user_id, newBlogTopic.trim(), newBlogKeyword.trim(), newBlogInstruction.trim()),
        authCtx
      );
      setItems(prev => [{ analysis_id: created.analysis_id, user_id: selectedUser.user_id, company_name: created.company_name, created_at: created.created_at, status: created.status }, ...(prev || [])]);
      setSelected(created);
      setJsonText(JSON.stringify(created.result, null, 2));
      setView('formatted');
      setShowCreateBlog(false);
      setNewBlogTopic(''); setNewBlogKeyword(''); setNewBlogInstruction('');
      toast({ type: 'success', message: '✓ Blog created for this customer.' });
    } catch (e) {
      if (e?.code !== 'TokenExpired') toast({ type: 'error', message: e.message || 'Could not create this blog post.' });
    } finally {
      setCreatingBlog(false);
    }
  };

  const unlockedDays = contentType === 'calendars' && selected ? (selected.result.days || []).filter(d => !d.locked) : [];
  const blogPost = contentType === 'blogs' && selected ? selected.result.post : null;

  // Group users by company name — in practice ~1 account per company (the
  // domain lock ties one domain to one account), but this stays correct
  // even if that ever isn't true, rather than assuming it.
  const companiesMap = {};
  (users || []).forEach(u => {
    const key = u.company_name || '(no company set)';
    if (!companiesMap[key]) companiesMap[key] = [];
    companiesMap[key].push(u);
  });
  const companyNames = Object.keys(companiesMap).sort((a, b) => a.localeCompare(b));

  return (
    <div className={s.page}>
      <SectionHeader title="Admin" subtitle="A centralized dashboard to review and edit every user's social media calendars and blog posts." />

      <div className={s.layout}>
        <Card>
          <SectionHeader title="Companies" subtitle="Grouped by registered company name." />
          {!users && !usersError && <SkeletonCard rows={5} />}
          {usersError && <ErrorCard message={usersError} />}
          {users && users.length === 0 && <Empty icon="👤" title="No users yet" body="Registered users will show up here." />}
          {users && users.length > 0 && (
            <div className={s.userList}>
              {companyNames.map(companyName => (
                <div key={companyName} className={s.companyGroup}>
                  <div className={s.companyGroupLabel}>{companyName}</div>
                  {companiesMap[companyName].map(u => (
                    <button
                      key={u.user_id} type="button"
                      className={`${s.userRow} ${selectedUser?.user_id === u.user_id ? s.userRowActive : ''}`}
                      onClick={() => selectUser(u)}
                    >
                      <span className={s.userName}>{u.full_name || u.email}</span>
                      <span className={s.userEmail}>{u.email}</span>
                      <div className={s.userMeta}>
                        {u.is_admin && <Badge variant="brand">Admin</Badge>}
                        <Badge variant={u.is_paid ? 'success' : 'warning'}>{u.is_paid ? 'Paid' : 'Free'}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!selectedUser && (
            <Card><Empty icon="🗂️" title="Select a user" body="Pick a user on the left to review their social media calendars and blog posts." /></Card>
          )}

          {selectedUser && (
            <Card>
              <div className={s.editorToolbar}>
                <SectionHeader title={`${selectedUser.full_name || selectedUser.email}'s content`} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className={`${s.toggleBtn} ${contentType === 'calendars' ? s.toggleBtnActive : ''}`} onClick={() => switchContentType('calendars')}>
                    📅 Calendars
                  </button>
                  <button type="button" className={`${s.toggleBtn} ${contentType === 'blogs' ? s.toggleBtnActive : ''}`} onClick={() => switchContentType('blogs')}>
                    📝 Blogs
                  </button>
                  {contentType === 'blogs' && (
                    <button type="button" className={s.saveBtn} onClick={() => setShowCreateBlog(v => !v)}>
                      + New blog
                    </button>
                  )}
                </div>
              </div>

              {contentType === 'blogs' && showCreateBlog && (
                <div className={s.createBlogPanel}>
                  <input
                    className={s.reviseSelect} style={{ width: '100%', marginBottom: 8 }}
                    placeholder="Topic (required) — e.g. 'Moving to UAE from Singapore'"
                    value={newBlogTopic} onChange={e => setNewBlogTopic(e.target.value)}
                  />
                  <input
                    className={s.reviseSelect} style={{ width: '100%', marginBottom: 8 }}
                    placeholder="Target keyword (optional) — e.g. 'moving to UAE'"
                    value={newBlogKeyword} onChange={e => setNewBlogKeyword(e.target.value)}
                  />
                  <textarea
                    className={s.reviseTextarea}
                    placeholder="Extra guidance for the writer (optional) — e.g. 'Focus on the visa process and mention our 24/7 support line.'"
                    value={newBlogInstruction} onChange={e => setNewBlogInstruction(e.target.value)}
                  />
                  <button type="button" className={s.saveBtn} onClick={createBlog} disabled={creatingBlog}>
                    {creatingBlog ? 'Writing…' : 'Create for this customer'}
                  </button>
                </div>
              )}
              {itemsLoading && <SkeletonCard rows={3} />}
              {itemsError && <ErrorCard message={itemsError} />}
              {items && items.length === 0 && (
                <Empty icon={contentType === 'blogs' ? '📝' : '📅'} title="Nothing here yet" body={`This user hasn't generated any ${contentType === 'blogs' ? 'blog posts' : 'calendars'}.`} />
              )}
              {items && items.length > 0 && (
                <div className={s.calendarList}>
                  {items.map(it => (
                    <button
                      key={it.analysis_id} type="button"
                      className={`${s.calendarRow} ${selected?.analysis_id === it.analysis_id ? s.calendarRowActive : ''}`}
                      onClick={() => selectItem(it)}
                    >
                      <span>{contentType === 'blogs' ? it.company_name : it.country}</span>
                      <span className={s.calendarMeta}>{it.created_at?.slice(0, 10)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          )}

          {detailLoading && <Card><SkeletonCard rows={6} /></Card>}

          {selected && !detailLoading && (
            <>
              <Card>
                <div className={s.editorToolbar}>
                  <SectionHeader title="Detail" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className={`${s.toggleBtn} ${view === 'formatted' ? s.toggleBtnActive : ''}`} onClick={() => setView('formatted')}>Formatted</button>
                    <button type="button" className={`${s.toggleBtn} ${view === 'edit' ? s.toggleBtnActive : ''}`} onClick={() => setView('edit')}>Edit JSON</button>
                  </div>
                </div>

                {view === 'formatted' && contentType === 'calendars' && <RelocationCalendarResultView result={selected.result} />}

                {view === 'formatted' && contentType === 'blogs' && blogPost && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800 }}>{blogPost.title}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Badge variant="brand">{blogPost.content_type}</Badge>
                      <Badge variant="default">{blogPost.word_count} words</Badge>
                    </div>
                    <div><strong style={{ fontSize: 12 }}>Meta title:</strong> {blogPost.meta_title}</div>
                    <div><strong style={{ fontSize: 12 }}>Meta description:</strong> {blogPost.meta_description}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {blogPost.body} <CopyButton text={blogPost.body} />
                    </div>
                  </div>
                )}

                {view === 'edit' && (
                  <div>
                    <textarea className={`${s.jsonEditor} ${jsonError ? 'invalid' : ''}`} value={jsonText} onChange={e => handleJsonChange(e.target.value)} spellCheck={false} />
                    {jsonError && <div className={s.jsonError}>{jsonError}</div>}
                    {saveSuccess && !jsonError && <div className={s.saveSuccess}>✓ Saved.</div>}
                    <div style={{ marginTop: 10 }}>
                      <button type="button" className={s.saveBtn} onClick={save} disabled={saving || !!jsonError}>
                        {saving ? 'Saving…' : 'Save changes'}
                      </button>
                    </div>
                  </div>
                )}
              </Card>

              <Card>
                <SectionHeader title="✨ Revise with AI" subtitle="Give an instruction and Bedrock will revise this content and save it automatically." />
                {contentType === 'calendars' && (
                  <div className={s.reviseTargetRow}>
                    <select className={s.reviseSelect} value={reviseDate} onChange={e => setReviseDate(e.target.value)}>
                      {unlockedDays.length === 0 && <option value="">No unlocked days available</option>}
                      {unlockedDays.map(d => <option key={d.date} value={d.date}>{d.date} ({d.day_of_week})</option>)}
                    </select>
                    <select className={s.reviseSelect} value={revisePostNumber} onChange={e => setRevisePostNumber(Number(e.target.value))}>
                      <option value={1}>Post 1</option>
                      <option value={2}>Post 2</option>
                    </select>
                  </div>
                )}
                <textarea
                  className={s.reviseTextarea}
                  placeholder={contentType === 'blogs'
                    ? 'e.g. "Add a short section about visa requirements before the conclusion."'
                    : 'e.g. "Make the Instagram caption punchier and mention our new Dubai office."'}
                  value={reviseInstruction}
                  onChange={e => setReviseInstruction(e.target.value)}
                />
                <button
                  type="button" className={s.saveBtn} onClick={runRevise}
                  disabled={revising || (contentType === 'calendars' && !reviseDate)}
                >
                  {revising ? 'Revising…' : 'Revise & save'}
                </button>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
