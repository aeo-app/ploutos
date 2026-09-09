import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { blogApi } from '../api/blogApi';
import { withTokenExpiry } from '../api/authApi';
import { AnalyseForm } from '../components/forms/AnalyseForm';
import { Card, Badge, SectionHeader, Empty, ErrorCard, CopyButton } from '../components/ui/UI';
import { LockedTeaser } from '../components/payment/LockedTeaser';
import { UnlockBanner } from '../components/payment/UnlockBanner';
import { UnlockModal } from '../components/payment/UnlockModal';
import s from './BlogTopicsPage.module.css';

export function BlogTopicsPage() {
  const { state, toast } = useApp();
  const { goScreen, logout } = useAuth();
  const authCtx = { goScreen, logout };

  const [count, setCount] = useState(8);
  const [topics, setTopics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showUnlock, setShowUnlock] = useState(false);

  const [generating, setGenerating] = useState(null); // topic title currently being written
  const [post, setPost] = useState(null); // { topic, target_keyword, post }
  const [postError, setPostError] = useState(null);

  const run = async (req) => {
    setLoading(true);
    setError(null);
    setPost(null);
    try {
      const data = await withTokenExpiry(blogApi.suggestTopics({ ...req, count }), authCtx);
      setTopics(data.topics);
    } catch (e) {
      if (e?.code === 'DomainMismatch') {
        setError(e.message);
      } else if (e?.code !== 'TokenExpired') {
        setError(e.message || 'Could not suggest topics.');
        toast({ type: 'error', message: e.message || 'Could not suggest topics.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const writePost = async (topic) => {
    setGenerating(topic.title);
    setPostError(null);
    try {
      const data = await withTokenExpiry(blogApi.generate({
        company_name: state.request.company_name,
        url: state.request.url,
        market: state.request.market,
        industry: state.request.industry,
        topic: topic.title,
        target_keyword: topic.target_keyword,
      }), authCtx);
      setPost(data);
      toast({ type: 'success', message: '✓ Blog post ready.' });
    } catch (e) {
      if (e?.code !== 'TokenExpired') {
        setPostError(e.message || 'Could not write this post.');
        toast({ type: 'error', message: e.message || 'Could not write this post.' });
      }
    } finally {
      setGenerating(null);
    }
  };

  const lockedCount = topics ? topics.filter(t => t.locked).length : 0;

  return (
    <div className={s.page}>
      <SectionHeader title="Blog Topics" subtitle="SEO-informed topic ideas for your company, with a full ready-to-publish post for whichever ones you pick." />

      <AnalyseForm onSubmit={run} loading={loading} buttonLabel="Suggest Topics" compact={!!topics} />

      <div className={s.countRow}>
        <span className={s.countLabel}>Number of topics</span>
        <select className={s.countSelect} value={count} onChange={e => setCount(Number(e.target.value))}>
          {[5, 8, 10, 12, 15].map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {loading && <div className={s.loadingRow}><span className={s.spinner} /><span>Thinking of topics…</span></div>}
      {error && !loading && <ErrorCard message={error} />}

      {topics && !loading && (
        <>
          <div className={s.topicGrid}>
            {topics.map((t, i) => (
              t.locked ? (
                <Card key={i} className={s.topicCard}>
                  <LockedTeaser previewText="A full topic idea and target keyword are ready — unlock to view." onUnlock={() => setShowUnlock(true)} />
                </Card>
              ) : (
                <Card key={i} className={s.topicCard}>
                  <div className={s.topicTitle}>{t.title}</div>
                  <div className={s.topicAngle}>{t.angle}</div>
                  <span className={s.topicKeyword}>{t.target_keyword}</span>
                  <button
                    type="button" className={s.writeBtn}
                    disabled={generating === t.title}
                    onClick={() => writePost(t)}
                  >
                    {generating === t.title ? 'Writing…' : 'Write this post'}
                  </button>
                </Card>
              )
            ))}
          </div>
          {lockedCount > 0 && (
            <UnlockBanner count={lockedCount} label="topic" onUnlock={() => setShowUnlock(true)} />
          )}
        </>
      )}

      {!topics && !loading && !error && (
        <Empty icon="📝" title="No topics yet" body="Fill in the company details above and click Suggest Topics to get SEO-informed blog ideas." />
      )}

      {postError && <ErrorCard message={postError} />}

      {post && (
        <Card style={{ marginTop: 20 }}>
          <div className={s.postHeader}>
            <span className={s.postTitle}>{post.post.title}</span>
            <div className={s.postMetaRow}>
              <Badge variant="brand">{post.post.content_type}</Badge>
              <Badge variant="default">{post.post.word_count} words</Badge>
              <Badge variant="default">{post.post.tone}</Badge>
            </div>
          </div>

          <div className={s.postSection}>
            <div className={s.postSectionLabel}>Meta title</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>{post.post.meta_title}</span>
              <CopyButton text={post.post.meta_title} />
            </div>
          </div>
          <div className={s.postSection}>
            <div className={s.postSectionLabel}>Meta description</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13 }}>{post.post.meta_description}</span>
              <CopyButton text={post.post.meta_description} />
            </div>
          </div>
          <div className={s.postSection}>
            <div className={s.postSectionLabel}>URL slug</div>
            <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>/{post.post.url_slug}</span>
          </div>

          <div className={s.postSection}>
            <div className={s.postSectionLabel}>Headings</div>
            {(post?.post?.headings || []).map((h, i) => (
              <div key={i} style={{ fontSize: 13, color: 'var(--c-slate-600)' }}>{h.level}: {h.text}</div>
            ))}
          </div>

          <div className={s.postSection}>
            <div className={s.postSectionLabel}>Body <CopyButton text={post.post.body} /></div>
            <div className={s.postBody}>{post.post.body}</div>
          </div>

          <div className={s.postSection}>
            <div className={s.postSectionLabel}>Primary CTA</div>
            <span style={{ fontSize: 13 }}>{post.post.primary_cta}</span>
          </div>

          <div className={s.postSection}>
            <div className={s.postSectionLabel}>SEO notes</div>
            <div className={s.noteList}>
              {(post?.post?.seo_optimization_notes || []).map((n, i) => <div key={i}>• {n}</div>)}
            </div>
          </div>
        </Card>
      )}

      {showUnlock && (
        <UnlockModal
          title="Unlock every topic"
          subtitle="Your free preview covers a couple of topics. Choose a plan to unlock the rest instantly."
          onClose={() => setShowUnlock(false)}
          onUnlocked={() => { setShowUnlock(false); run(state.request); }}
        />
      )}
    </div>
  );
}
