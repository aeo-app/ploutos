import { useState, useEffect } from 'react';
import { canvaApi } from '../../api/canvaApi';
import { useApp } from '../../context/AppContext';
import s from './PosterPanel.module.css';

/**
 * Poster generation via OpenAI — the primary path for every user, no
 * Canva connection or account needed at all. Deliberately does nothing
 * on mount besides checking for an already-existing poster for this
 * exact day/post (a page refresh shouldn't make a generated poster
 * disappear) — the actual image generation only ever happens inside
 * handleGenerate, i.e. only when the button is clicked. Nothing here
 * runs automatically when a calendar is created.
 *
 * Canva only reappears here as a separate, admin-only "Edit in Canva"
 * action on an ALREADY-generated poster — never as a way to generate
 * one from scratch, and never visible at all to a non-admin user (see
 * state.isAdmin below — same admin flag used elsewhere in the app,
 * e.g. components/layout/TopBar.js).
 */
export function PosterPanel({ dayDate, postNumber, visualSuggestion, caption, cta, onPosterChange }) {
  const { state } = useApp();
  const [poster, setPoster] = useState(null); // null until generated (or none exists yet)
  const [checked, setChecked] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [editingInCanva, setEditingInCanva] = useState(false);
  const [syncingFromCanva, setSyncingFromCanva] = useState(false);
  const [canvaError, setCanvaError] = useState(null);

  // Only checks for an EXISTING poster (created in an earlier session) —
  // never generates one. A poster that was already created should still
  // show up after a page refresh rather than looking like it never existed.
  useEffect(() => {
    canvaApi.listPosters()
      .then(data => {
        const existing = (data?.items || []).find(p => p?.day_date === dayDate && p?.post_number === postNumber);
        setPoster(existing || null);
        if (existing) onPosterChange?.(existing, { isNewCreation: false });
      })
      .catch(() => setPoster(null))
      .finally(() => setChecked(true));
    // eslint-disable-next-line
  }, [dayDate, postNumber]);

  const handleGenerate = async () => {
    const isFirstCreation = !poster; // captured before the call - "Create Poster" vs "Regenerate" on an existing one
    setGenerating(true);
    setError(null);
    setCanvaError(null);
    try {
      const result = await canvaApi.generatePoster({
        day_date: dayDate, post_number: postNumber, visual_suggestion: visualSuggestion, caption: caption || '', cta: cta || '',
      });
      setPoster(result);
      onPosterChange?.(result, { isNewCreation: isFirstCreation });
    } catch (e) {
      setError(e.message || 'Could not generate a poster.');
    } finally {
      setGenerating(false);
    }
  };

  const handleEditInCanva = async () => {
    setEditingInCanva(true);
    setCanvaError(null);
    try {
      const result = await canvaApi.editInCanva(poster.poster_id);
      setPoster(result);
      onPosterChange?.(result, { isNewCreation: false });
      if (result.edit_url) window.open(result.edit_url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setCanvaError(e.message || 'Could not open this poster in Canva.');
    } finally {
      setEditingInCanva(false);
    }
  };

  const handleSyncFromCanva = async () => {
    setSyncingFromCanva(true);
    setCanvaError(null);
    try {
      const result = await canvaApi.syncFromCanva(poster.poster_id);
      setPoster(result);
      onPosterChange?.(result, { isNewCreation: false });
    } catch (e) {
      setCanvaError(e.message || 'Could not pull the latest edits back from Canva.');
    } finally {
      setSyncingFromCanva(false);
    }
  };

  const handleDownload = async (imageUrl) => {
    const filename = `poster-${dayDate}-${postNumber}.png`;
    try {
      // Fetch-and-blob forces a real save dialog regardless of what
      // headers the image host sends — more reliable than a plain <a
      // download> for a cross-origin URL, which many browsers will just
      // navigate to/open instead of downloading if the server doesn't
      // send its own Content-Disposition header.
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch {
      // Falls back to just opening the image in a new tab — still lets
      // the person save it manually (right-click → save image) even if
      // the fetch itself failed, e.g. because the image host doesn't
      // allow cross-origin reads.
      window.open(imageUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!checked) return <div className={s.checking}>Checking for an existing poster…</div>;

  return (
    <div className={s.panel}>
      {!poster && (
        <div className={s.emptyState}>
          <button type="button" className={s.createBtn} onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating…' : '🖼️ Create Poster'}
          </button>
          <p className={s.hint}>Generates an image from this post's visual suggestion.</p>
        </div>
      )}

      {error && <div className={s.errorBox}>{error}</div>}

      {poster && poster.poster_image_url && (
        <div className={s.result}>
          {/* Always poster_image_url now, whether it came from OpenAI or
              from a synced Canva export (sync-from-canva updates this
              field directly) — no more picking between two different
              images with potentially different aspect ratios, which was
              part of what made the old cover-fit cropping worse. */}
          <img className={s.image} src={poster.poster_image_url} alt="Generated poster" />

          <div className={s.actions}>
            <button type="button" className={s.secondaryBtn} onClick={handleGenerate} disabled={generating}>
              {generating ? 'Regenerating…' : '🔄 Regenerate'}
            </button>

            {/* Visible to every user, admin or not. */}
            <button type="button" className={s.secondaryBtn} onClick={() => handleDownload(poster.poster_image_url)}>
              ⬇️ Download image
            </button>

            {/* Canva is visible ONLY to admins, and only as an edit step
                on a poster that already has an OpenAI-generated image —
                never shown to a regular user, and never a way to
                generate a poster from scratch. */}
            {state.isAdmin && (
              <button type="button" className={s.secondaryBtn} onClick={handleEditInCanva} disabled={editingInCanva}>
                {editingInCanva ? 'Opening Canva…' : '✏️ Edit in Canva'}
              </button>
            )}

            {state.isAdmin && poster.source === 'canva' && poster.edit_url && (
              <a className={s.secondaryBtn} href={poster.edit_url} target="_blank" rel="noopener noreferrer">
                Open in Canva ↗
              </a>
            )}

            {/* Only meaningful once a poster has actually been sent to
                Canva (source === 'canva') — nothing to pull back
                otherwise. Canva's editor has no live sync of its own, so
                this explicit step is what actually brings edits made
                there into the app at all — see the backend endpoint's
                own docstring for why. */}
            {state.isAdmin && poster.source === 'canva' && (
              <button type="button" className={s.secondaryBtn} onClick={handleSyncFromCanva} disabled={syncingFromCanva}>
                {syncingFromCanva ? 'Syncing…' : '🔄 Sync edits from Canva'}
              </button>
            )}
          </div>
          {canvaError && <div className={s.errorBox}>{canvaError}</div>}
        </div>
      )}
    </div>
  );
}
