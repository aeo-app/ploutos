import React, { useState, useEffect } from 'react';
import { canvaApi } from '../../api/canvaApi';
import { useApp } from '../../context/AppContext';
import { rememberPageBeforeOAuthRedirect } from '../../utils/oauthReturn';
import s from './CanvaPosterPanel.module.css';

/**
 * Lets a user turn one calendar post into a real Canva poster (via a Brand
 * Template + Autofill), then replace any/all of its images and regenerate.
 * Canva's autofill always produces a NEW design per job — there's no
 * "edit this exact image in place" operation — so "replace + recreate" is
 * implemented as "re-run the same job with new image field values", which
 * is exactly how Canva's own autofill model works.
 */
export function CanvaPosterPanel({ dayDate, postNumber, defaultText, onPosterChange }) {
  const { state } = useApp();
  const [connected, setConnected] = useState(null); // null = checking
  const [connectError, setConnectError] = useState(null);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);

  const [templates, setTemplates] = useState(null);
  const [picking, setPicking] = useState(false);

  const [selectedTemplate, setSelectedTemplate] = useState(null); // {id, title}
  const [fields, setFields] = useState(null); // [{name, type}]
  const [fieldValues, setFieldValues] = useState({}); // name -> text value (text fields)
  const [fieldFiles, setFieldFiles] = useState({}); // name -> File (image fields, pending upload)

  const [poster, setPoster] = useState(null);
  const [stage, setStage] = useState('idle'); // idle | loading_dataset | creating | ready | replacing
  const [error, setError] = useState(null);

  useEffect(() => {
    canvaApi.status()
      .then(d => setConnected(d.connected))
      .catch(() => setConnected(false));
  }, []);

  // If a poster was already created for THIS exact day/post (in an earlier
  // session, or by an admin — see AdminContentPage.js), show it instead of
  // starting from the empty "Create poster" state. Previously this panel
  // never checked for existing posters at all, so reconnecting Canva (or
  // just revisiting a day you'd already made a poster for) always looked
  // like nothing had ever been created, even though it was saved.
  useEffect(() => {
    if (connected !== true) return;
    canvaApi.listPosters()
      .then(data => {
        const existing = (data?.items || []).find(p => p?.day_date === dayDate && p?.post_number === postNumber);
        if (!existing) return null;
        setPoster(existing);
        setThumbnailFailed(false);
        onPosterChange?.(existing);
        // Needed so the "replace image" inputs render correctly for a
        // rehydrated poster — imageFields/textFieldsList below are derived
        // from `fields`, which normally only gets populated when the user
        // picks a template themselves.
        return canvaApi.brandTemplateDataset(existing.brand_template_id)
          .then(({ fields: f }) => setFields(f));
      })
      .catch(err => console.warn('[CanvaPosterPanel] existing-poster rehydration failed:', err?.message || err));
    // eslint-disable-next-line
  }, [connected, dayDate, postNumber]);

  const handleConnect = async () => {
    setConnectError(null);
    try {
      const { authorize_url } = await canvaApi.connect();
      rememberPageBeforeOAuthRedirect(state.page);
      window.location.href = authorize_url; // full-page redirect to Canva's OAuth consent screen
    } catch (e) {
      setConnectError(e.message || 'Could not start Canva connection.');
    }
  };

  const openTemplatePicker = async () => {
    setPicking(true);
    setError(null);
    if (!templates) {
      try {
        const list = await canvaApi.brandTemplates();
        setTemplates(list);
      } catch (e) {
        setError(e.message || 'Could not load your Canva brand templates.');
      }
    }
  };

  const selectTemplate = async (tpl) => {
    setSelectedTemplate(tpl);
    setPicking(false);
    setStage('loading_dataset');
    setError(null);
    try {
      const { fields: f } = await canvaApi.brandTemplateDataset(tpl.id);
      setFields(f);
      const initialValues = {};
      f.forEach(field => {
        if (field.type === 'text') initialValues[field.name] = defaultText || '';
      });
      setFieldValues(initialValues);
      setStage('idle');
    } catch (e) {
      setError(e.message || "Could not load this template's fields.");
      setStage('idle');
    }
  };

  const createPoster = async () => {
    setStage('creating');
    setError(null);
    try {
      // Upload any chosen image files first, collecting asset_ids.
      const imageAssetIds = {};
      for (const [fieldName, file] of Object.entries(fieldFiles)) {
        const { asset_id } = await canvaApi.uploadAsset(file);
        imageAssetIds[fieldName] = asset_id;
      }
      const textFields = Object.fromEntries(
        Object.entries(fieldValues).filter(([name]) => fields.find(f => f.name === name)?.type === 'text')
      );
      const created = await canvaApi.createPoster({
        day_date: dayDate,
        post_number: postNumber,
        brand_template_id: selectedTemplate.id,
        text_fields: textFields,
        image_urls: {},
        image_asset_ids: imageAssetIds,
      });
      setPoster(created);
      setThumbnailFailed(false);
      onPosterChange?.(created);
      setFieldFiles({});
      setStage('ready');
    } catch (e) {
      setError(e.message || 'Could not create the poster.');
      setStage('idle');
    }
  };

  const replaceImagesAndRegenerate = async () => {
    setStage('replacing');
    setError(null);
    try {
      const imageAssetIds = {};
      for (const [fieldName, file] of Object.entries(fieldFiles)) {
        const { asset_id } = await canvaApi.uploadAsset(file);
        imageAssetIds[fieldName] = asset_id;
      }
      if (Object.keys(imageAssetIds).length === 0) {
        setError('Choose at least one replacement image first.');
        setStage('ready');
        return;
      }
      const updated = await canvaApi.regeneratePoster(poster.poster_id, {
        text_fields: {},
        image_urls: {},
        image_asset_ids: imageAssetIds,
      });
      setPoster(updated);
      setThumbnailFailed(false);
      onPosterChange?.(updated);
      setFieldFiles({});
      setStage('ready');
    } catch (e) {
      setError(e.message || 'Could not regenerate the poster.');
      setStage('ready');
    }
  };

  const imageFields = fields?.filter(f => f.type === 'image') || [];
  const textFieldsList = fields?.filter(f => f.type === 'text') || [];

  if (connected === null) return null; // still checking, avoid a layout flash

  if (!connected) {
    return (
      <div className={s.wrap}>
        <div className={s.headRow}>
          <span className={s.title}>🎨 Canva poster</span>
          <button type="button" className={s.connectBtn} onClick={handleConnect}>Connect Canva</button>
        </div>
        {connectError && <div className={s.errorText}>{connectError}</div>}
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className={s.headRow}>
        <span className={s.title}>🎨 Canva poster {selectedTemplate && `— ${selectedTemplate.title}`}</span>
        {!poster && !selectedTemplate && (
          <button type="button" className={s.createBtn} onClick={openTemplatePicker} disabled={picking}>
            Create poster
          </button>
        )}
      </div>

      {picking && (
        <div className={s.templateGrid}>
          {!templates && <span className={s.loadingRow}><span className={s.spinner} />Loading templates…</span>}
          {templates && templates.length === 0 && (
            <div className={s.noTemplatesMessage}>
              No Brand Templates found in your connected Canva account. Brand Templates can't be
              created via this app — create a design in Canva, add autofill data fields to it
              (Canva's Bulk Create / data field tool), then publish it as a Brand Template for
              your team. Also double-check you connected the Canva account that's actually a
              member of the Enterprise team the templates belong to.
            </div>
          )}
          {templates?.map(t => (
            <button key={t.id} type="button" className={s.templateCard} onClick={() => selectTemplate(t)}>
              {t.thumbnail_url && <img className={s.templateThumb} src={t.thumbnail_url} alt={t.title} />}
              <div className={s.templateTitle}>{t.title}</div>
            </button>
          ))}
        </div>
      )}

      {stage === 'loading_dataset' && <span className={s.loadingRow}><span className={s.spinner} />Loading template fields…</span>}

      {selectedTemplate && !poster && stage === 'idle' && fields && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          {textFieldsList.map(f => (
            <div key={f.name} className={s.fieldRow}>
              <span className={s.fieldLabel}>{f.name}</span>
              <input
                className={s.textInput}
                value={fieldValues[f.name] || ''}
                onChange={e => setFieldValues(v => ({ ...v, [f.name]: e.target.value }))}
              />
            </div>
          ))}
          {imageFields.map(f => (
            <div key={f.name} className={s.fieldRow}>
              <span className={s.fieldLabel}>{f.name}</span>
              <input
                type="file" accept="image/*" className={s.fileInput}
                onChange={e => setFieldFiles(v => ({ ...v, [f.name]: e.target.files?.[0] }))}
              />
            </div>
          ))}
          <button type="button" className={s.createBtn} onClick={createPoster} style={{ alignSelf: 'flex-start' }}>
            Generate poster
          </button>
        </div>
      )}

      {stage === 'creating' && <span className={s.loadingRow}><span className={s.spinner} />Generating your poster in Canva…</span>}

      {poster && (
        <div className={s.posterResult}>
          {thumbnailFailed ? (
            <div className={s.posterThumbFallback}>
              Preview unavailable<br />
              <span className={s.posterThumbFallbackHint}>Canva thumbnail links expire after 15 minutes</span>
            </div>
          ) : (
            <img
              className={s.posterThumb} src={poster.thumbnail_url} alt="Poster preview"
              onError={() => setThumbnailFailed(true)}
            />
          )}
          <div className={s.posterActions}>
            <a className={s.editLink} href={poster.edit_url} target="_blank" rel="noreferrer">Edit in Canva ↗</a>

            {imageFields.map(f => (
              <div key={f.name} className={s.fieldRow}>
                <span className={s.fieldLabel}>Replace {f.name}</span>
                <input
                  type="file" accept="image/*" className={s.fileInput}
                  onChange={e => setFieldFiles(v => ({ ...v, [f.name]: e.target.files?.[0] }))}
                />
              </div>
            ))}
            <button type="button" className={s.regenBtn} onClick={replaceImagesAndRegenerate} disabled={stage === 'replacing'}>
              {stage === 'replacing' ? 'Regenerating…' : 'Replace images & recreate'}
            </button>
          </div>
        </div>
      )}

      {error && <div className={s.errorText}>{error}</div>}
    </div>
  );
}
