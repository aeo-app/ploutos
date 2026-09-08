import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { adminApi } from '../api/adminApi';
import { withTokenExpiry } from '../api/authApi';
import { useAuth } from '../context/AuthContext';
import { Card, Badge, SectionHeader, Empty, ErrorCard, SkeletonCard, CopyButton } from '../components/ui/UI';
import { RelocationCalendarResultView } from './RelocationCalendarPage';
import { SocialPublishPanel } from '../components/canva/SocialPublishPanel';
import { ScheduledPostsList } from '../components/canva/ScheduledPostsList';
import s from './AdminPage.module.css';

/**
 * Shared implementation for both the "Social Media Calendars" and "Blogs"
 * admin nav items — `contentType` fixes which one this instance shows.
 * `selectedUser`/`onSelectUser` are lifted to AdminApp so the choice
 * survives switching between nav items (pick a user on Calendars, flip to
 * Blogs, they're still selected).
 */
export function AdminContentPage({ contentType, selectedUser, onSelectUser }) {
  const { toast } = useApp();
  const { goScreen, logout } = useAuth();
  const authCtx = { goScreen, logout };

  const [users, setUsers] = useState(null);
  const [usersError, setUsersError] = useState(null);
  const [query, setQuery] = useState('');

  const [items, setItems] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [view, setView] = useState('formatted');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [revising, setRevising] = useState(false);
  const [reviseInstruction, setReviseInstruction] = useState('');
  const [reviseDate, setReviseDate] = useState('');
  const [revisePostNumber, setRevisePostNumber] = useState(1);

  const [showCreateBlog, setShowCreateBlog] = useState(false);
  const [creatingBlog, setCreatingBlog] = useState(false);
  const [newBlogTopic, setNewBlogTopic] = useState('');
  const [newBlogKeyword, setNewBlogKeyword] = useState('');
  const [newBlogInstruction, setNewBlogInstruction] = useState('');

  const [showCreateCalendar, setShowCreateCalendar] = useState(false);
  const [creatingCalendar, setCreatingCalendar] = useState(false);
  const [newCalCountry, setNewCalCountry] = useState('');
  const [newCalStartDate, setNewCalStartDate] = useState('');
  const [newCalEndDate, setNewCalEndDate] = useState('');
  const [newCalContentSuggestions, setNewCalContentSuggestions] = useState('');

  useEffect(() => {
    withTokenExpiry(adminApi.listUsers(), authCtx)
      .then(d => setUsers(d?.users || []))
      .catch(e => { if (e?.code !== 'TokenExpired') setUsersError(e.message || 'Could not load users.'); });
    // eslint-disable-next-line
  }, []);

  const loadItems = useCallback((user) => {
    if (!user?.user_id) return;
    setItems(null);
    setSelected(null);
    setItemsLoading(true);
    setItemsError(null);
    const call = contentType === 'blogs' ? adminApi.listUserBlogs(user.user_id) : adminApi.listUserCalendars(user.user_id);
    withTokenExpiry(call, authCtx)
      .then(d => setItems(d?.items || []))
      .catch(e => { if (e?.code !== 'TokenExpired') setItemsError(e.message || 'Could not load content.'); })
      .finally(() => setItemsLoading(false));
    // eslint-disable-next-line
  }, [contentType]);

  useEffect(() => { if (selectedUser) loadItems(selectedUser); }, [selectedUser, loadItems]);

  const selectItem = (item) => {
    if (!selectedUser?.user_id || !item?.analysis_id) return;
    setDetailLoading(true);
    setSaveSuccess(false);
    const call = contentType === 'blogs'
      ? adminApi.getUserBlog(selectedUser.user_id, item.analysis_id)
      : adminApi.getUserCalendar(selectedUser.user_id, item.analysis_id);
    withTokenExpiry(call, authCtx)
      .then(d => {
        setSelected(d);
        setJsonText(JSON.stringify(d?.result ?? {}, null, 2));
        setJsonError(null);
        setView('formatted');
        setReviseInstruction('');
        if (contentType === 'calendars') {
          const firstUnlocked = (d?.result?.days || []).find(day => !day?.locked);
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
    if (!selectedUser?.user_id || !selected?.analysis_id) return;
    setSaving(true);
    setSaveSuccess(false);
    try {
      const call = contentType === 'blogs'
        ? adminApi.updateUserBlog(selectedUser.user_id, selected.analysis_id, parsed)
        : adminApi.updateUserCalendar(selectedUser.user_id, selected.analysis_id, parsed);
      const updated = await withTokenExpiry(call, authCtx);
      setSelected(updated);
      setJsonText(JSON.stringify(updated?.result ?? {}, null, 2));
      setSaveSuccess(true);
      toast({ type: 'success', message: '✓ Saved.' });
    } catch (e) {
      if (e?.code !== 'TokenExpired') toast({ type: 'error', message: e?.message || 'Could not save changes.' });
    } finally {
      setSaving(false);
    }
  };

  const runRevise = async () => {
    if (!reviseInstruction.trim()) { toast({ type: 'error', message: 'Enter an instruction first.' }); return; }
    if (!selectedUser?.user_id || !selected?.analysis_id) return;
    setRevising(true);
    try {
      const call = contentType === 'blogs'
        ? adminApi.reviseUserBlog(selectedUser.user_id, selected.analysis_id, reviseInstruction.trim())
        : adminApi.reviseCalendarPost(selectedUser.user_id, selected.analysis_id, reviseDate, revisePostNumber, reviseInstruction.trim());
      const updated = await withTokenExpiry(call, authCtx);
      setSelected(updated);
      setJsonText(JSON.stringify(updated?.result ?? {}, null, 2));
      setReviseInstruction('');
      toast({ type: 'success', message: '✓ Revised with AI and saved.' });
    } catch (e) {
      if (e?.code !== 'TokenExpired') toast({ type: 'error', message: e?.message || 'Could not revise this content.' });
    } finally {
      setRevising(false);
    }
  };

  const createBlog = async () => {
    if (!newBlogTopic.trim()) { toast({ type: 'error', message: 'Enter a topic first.' }); return; }
    if (!selectedUser?.user_id) return;
    setCreatingBlog(true);
    try {
      const created = await withTokenExpiry(
        adminApi.createBlogForUser(selectedUser.user_id, newBlogTopic.trim(), newBlogKeyword.trim(), newBlogInstruction.trim()),
        authCtx
      );
      setItems(prev => [
        { analysis_id: created?.analysis_id, user_id: selectedUser.user_id, company_name: created?.company_name, created_at: created?.created_at, status: created?.status },
        ...(prev || []),
      ]);
      setSelected(created);
      setJsonText(JSON.stringify(created?.result ?? {}, null, 2));
      setView('formatted');
      setShowCreateBlog(false);
      setNewBlogTopic(''); setNewBlogKeyword(''); setNewBlogInstruction('');
      toast({ type: 'success', message: '✓ Blog created for this customer.' });
    } catch (e) {
      if (e?.code !== 'TokenExpired') toast({ type: 'error', message: e?.message || 'Could not create this blog post.' });
    } finally {
      setCreatingBlog(false);
    }
  };

  const createCalendar = async () => {
    if (!newCalCountry.trim()) { toast({ type: 'error', message: 'Enter a destination country first.' }); return; }
    if (!newCalStartDate || !newCalEndDate) { toast({ type: 'error', message: 'Pick a start and end date first.' }); return; }
    if (!selectedUser?.user_id) return;
    setCreatingCalendar(true);
    try {
      const created = await withTokenExpiry(
        adminApi.createCalendarForUser(selectedUser.user_id, {
          country: newCalCountry.trim(), start_date: newCalStartDate, end_date: newCalEndDate,
          content_suggestions: newCalContentSuggestions.trim(),
        }),
        authCtx
      );
      setItems(prev => [
        { analysis_id: created?.analysis_id, user_id: selectedUser.user_id, country: created?.country, created_at: created?.created_at, status: created?.status },
        ...(prev || []),
      ]);
      setSelected(created);
      setJsonText(JSON.stringify(created?.result ?? {}, null, 2));
      setView('formatted');
      setShowCreateCalendar(false);
      setNewCalCountry(''); setNewCalStartDate(''); setNewCalEndDate(''); setNewCalContentSuggestions('');
      toast({ type: 'success', message: '✓ Calendar created for this customer.' });
    } catch (e) {
      if (e?.code !== 'TokenExpired') toast({ type: 'error', message: e?.message || 'Could not create this calendar.' });
    } finally {
      setCreatingCalendar(false);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u?.company_name || '').toLowerCase().includes(q) ||
      (u?.full_name || '').toLowerCase().includes(q) ||
      (u?.email || '').toLowerCase().includes(q)
    );
  }, [users, query]);

  const companiesMap = {};
  filteredUsers.forEach(u => {
    const key = u?.company_name || '(no company set)';
    if (!companiesMap[key]) companiesMap[key] = [];
    companiesMap[key].push(u);
  });
  const companyNames = Object.keys(companiesMap).sort((a, b) => a.localeCompare(b));

  const unlockedDays = contentType === 'calendars' && selected ? (selected?.result?.days || []).filter(d => !d?.locked) : [];

  const adminSocialApi = useMemo(() => {
    if (!selectedUser?.user_id) return null;
    const userId = selectedUser.user_id;
    return {
      status: () => adminApi.socialStatus(userId),
      uploadMedia: (file) => adminApi.socialUploadMedia(userId, file),
      publish: (payload) => adminApi.socialPublish(userId, payload),
      schedule: (payload) => adminApi.socialSchedule(userId, payload),
      listScheduled: () => adminApi.socialListScheduled(userId),
      retryScheduled: (scheduleId) => adminApi.socialRetryScheduled(userId, scheduleId),
      cancelScheduled: (scheduleId) => adminApi.socialCancelScheduled(userId, scheduleId),
      // Deliberately no `connect` — an admin can't OAuth-authorize Facebook/
      // Instagram on a customer's behalf, that has to be the actual account
      // owner. SocialPublishPanel shows "Not connected by customer" instead
      // of a Connect button when this is absent.
    };
  }, [selectedUser?.user_id]);
  const blogPost = contentType === 'blogs' ? selected?.result?.post : null;
  const label = contentType === 'blogs' ? 'blog posts' : 'social media calendars';

  return (
    <div className={s.page}>
      <SectionHeader
        title={contentType === 'blogs' ? 'Blogs' : 'Social Media Calendars'}
        subtitle={`All registered customers' ${label}, filterable by company or user name.`}
      />

      <div className={s.layout}>
        <Card>
          <SectionHeader title="Companies" />
          <input
            className={s.searchBox}
            placeholder="Filter by company or user name…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {!users && !usersError && <SkeletonCard rows={5} />}
          {usersError && <ErrorCard message={usersError} />}
          {users && companyNames.length === 0 && <Empty icon="🔍" title="No matches" body="No company or user matches that search." />}
          {users && companyNames.length > 0 && (
            <div className={s.userList}>
              {companyNames.map(companyName => (
                <div key={companyName} className={s.companyGroup}>
                  <div className={s.companyGroupLabel}>{companyName}</div>
                  {companiesMap[companyName]?.map(u => (
                    <button
                      key={u?.user_id} type="button"
                      className={`${s.userRow} ${selectedUser?.user_id === u?.user_id ? s.userRowActive : ''}`}
                      onClick={() => u?.user_id && onSelectUser?.(u)}
                    >
                      <span className={s.userName}>{u?.full_name || u?.email || 'Unknown user'}</span>
                      <span className={s.userEmail}>{u?.email}</span>
                      <div className={s.userMeta}>
                        {u?.is_admin && <Badge variant="brand">Admin</Badge>}
                        <Badge variant={u?.is_paid ? 'success' : 'warning'}>{u?.is_paid ? 'Paid' : 'Free'}</Badge>
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
            <Card><Empty icon="🗂️" title="Select a customer" body={`Pick a company/user on the left to review their ${label}.`} /></Card>
          )}

          {selectedUser && (
            <Card>
              <div className={s.editorToolbar}>
                <SectionHeader title={`${selectedUser?.full_name || selectedUser?.email || 'This customer'}'s ${label}`} />
                {contentType === 'blogs' && (
                  <button type="button" className={s.saveBtn} onClick={() => setShowCreateBlog(v => !v)}>+ New blog</button>
                )}
                {contentType === 'calendars' && (
                  <button type="button" className={s.saveBtn} onClick={() => setShowCreateCalendar(v => !v)}>+ New calendar</button>
                )}
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
                    placeholder="Target keyword (optional)"
                    value={newBlogKeyword} onChange={e => setNewBlogKeyword(e.target.value)}
                  />
                  <textarea
                    className={s.reviseTextarea}
                    placeholder="Extra guidance for the writer (optional)"
                    value={newBlogInstruction} onChange={e => setNewBlogInstruction(e.target.value)}
                  />
                  <button type="button" className={s.saveBtn} onClick={createBlog} disabled={creatingBlog}>
                    {creatingBlog ? 'Writing…' : 'Create for this customer'}
                  </button>
                </div>
              )}

              {contentType === 'calendars' && showCreateCalendar && (
                <div className={s.createBlogPanel}>
                  <input
                    className={s.reviseSelect} style={{ width: '100%', marginBottom: 8 }}
                    placeholder="Destination country (required) — e.g. 'Canada'"
                    value={newCalCountry} onChange={e => setNewCalCountry(e.target.value)}
                  />
                  <div className={s.reviseTargetRow}>
                    <input
                      type="date" className={s.reviseSelect}
                      value={newCalStartDate} onChange={e => setNewCalStartDate(e.target.value)}
                    />
                    <input
                      type="date" className={s.reviseSelect}
                      value={newCalEndDate} onChange={e => setNewCalEndDate(e.target.value)}
                    />
                  </div>
                  <textarea
                    className={s.reviseTextarea}
                    placeholder="Content suggestions (optional) — themes, angles, offers to weave into this calendar"
                    value={newCalContentSuggestions} onChange={e => setNewCalContentSuggestions(e.target.value)}
                  />
                  <button type="button" className={s.saveBtn} onClick={createCalendar} disabled={creatingCalendar} style={{ marginTop: 8 }}>
                    {creatingCalendar ? 'Generating…' : 'Create for this customer'}
                  </button>
                </div>
              )}

              {itemsLoading && <SkeletonCard rows={3} />}
              {itemsError && <ErrorCard message={itemsError} />}
              {items && items.length === 0 && (
                <Empty icon={contentType === 'blogs' ? '📝' : '📅'} title="Nothing here yet" body={`This customer hasn't generated any ${label}.`} />
              )}
              {items && items.length > 0 && (
                <div className={s.calendarList}>
                  {items.map(it => (
                    <button
                      key={it?.analysis_id} type="button"
                      className={`${s.calendarRow} ${selected?.analysis_id === it?.analysis_id ? s.calendarRowActive : ''}`}
                      onClick={() => selectItem(it)}
                    >
                      <span>{contentType === 'blogs' ? (it?.company_name || '—') : (it?.country || '—')}</span>
                      <span className={s.calendarMeta}>{it?.created_at?.slice(0, 10) || '—'}</span>
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

                {view === 'formatted' && contentType === 'calendars' && selected?.result && <RelocationCalendarResultView result={selected.result} socialApi={adminSocialApi} />}

                {view === 'formatted' && contentType === 'blogs' && blogPost && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800 }}>{blogPost?.title || 'Untitled'}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Badge variant="brand">{blogPost?.content_type || '—'}</Badge>
                      <Badge variant="default">{blogPost?.word_count ?? 0} words</Badge>
                    </div>
                    <div><strong style={{ fontSize: 12 }}>Meta title:</strong> {blogPost?.meta_title}</div>
                    <div><strong style={{ fontSize: 12 }}>Meta description:</strong> {blogPost?.meta_description}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                      {blogPost?.body} <CopyButton text={blogPost?.body || ''} />
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
                      {unlockedDays.map(d => <option key={d?.date} value={d?.date}>{d?.date} ({d?.day_of_week})</option>)}
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

              {contentType === 'calendars' && reviseDate && adminSocialApi && (
                <>
                  <ScheduledPostsList api={adminSocialApi} />
                  <Card>
                    <SocialPublishPanel
                      api={adminSocialApi}
                      dayDate={reviseDate}
                      posterId={null}
                      defaultCaption={_dayPostCaption(selected, reviseDate, revisePostNumber)}
                    />
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function _dayPostCaption(selected, dayDate, postNumber) {
  const day = (selected?.result?.days || []).find(d => d?.date === dayDate);
  const post = (day?.schedule?.posts || []).find(p => p?.post_number === postNumber);
  return post?.captions?.instagram || post?.cta || '';
}
