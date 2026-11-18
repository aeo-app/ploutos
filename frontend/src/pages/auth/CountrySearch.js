import React, { useEffect, useId, useRef, useState } from 'react';
import { placesApi } from '../../api/placesApi';
import s from './Auth.module.css';

const SEARCH_DELAY_MS = 250;

// Google bills the searches and the final pick as one "session" when they share a token.
function newSession() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function countryName(code) {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code;
  } catch (_) {
    return code;
  }
}

/**
 * Type-to-search country box (Google Places, countries only). `value` and `onChange` use the
 * 2-letter country code ("IN"), the same value the old dropdown saved. Typing clears the value
 * until a country is picked from the list.
 */
export function CountrySearch({ value, onChange, onBlur, invalid, disabled }) {
  const listId = useId();
  const [text, setText] = useState(() => (value ? countryName(value) : ''));
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState({ query: '', countries: [] });
  const [active, setActive] = useState(-1);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const session = useRef(newSession());

  const query = text.trim();
  const options = results.countries;
  const showList = open && !!query && !error;

  useEffect(() => {
    if (!open || !query) return undefined;
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const data = await placesApi.searchCountries(query, session.current);
        if (stale) return;
        setResults({ query, countries: data.countries || [] });
        setActive(data.countries?.length ? 0 : -1);
      } catch (e) {
        if (!stale) setError(e.message);
      }
    }, SEARCH_DELAY_MS);
    return () => { stale = true; clearTimeout(timer); };
  }, [query, open]);

  const type = (e) => {
    setText(e.target.value);
    setOpen(true);
    setError('');
    if (value) onChange('');
  };

  const pick = async (option) => {
    setPicking(true);
    try {
      const country = await placesApi.countryOf(option.place_id, session.current);
      session.current = newSession();
      setText(country.name);
      setOpen(false);
      setResults({ query: '', countries: [] });
      onChange(country.code);
    } catch (e) {
      setError(e.message);
    } finally {
      setPicking(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && options.length) {
      e.preventDefault();
      setOpen(true);
      setActive(i => (i + 1) % options.length);
    } else if (e.key === 'ArrowUp' && options.length) {
      e.preventDefault();
      setActive(i => (i <= 0 ? options.length - 1 : i - 1));
    } else if (e.key === 'Enter' && showList) {
      e.preventDefault();       // Enter picks a country here; it must not submit the sign-up form
      if (results.query === query && options[active]) pick(options[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const note = options.length ? null : results.query === query ? 'No country found' : 'Searching…';

  return (
    <div className={s.countryWrap}>
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="Start typing your country"
        value={text}
        className={`${s.input} ${invalid ? s.inputError : ''}`}
        onChange={type}
        onFocus={() => { if (query && !value) setOpen(true); }}
        onBlur={() => { setOpen(false); onBlur?.(); }}
        onKeyDown={onKeyDown}
        readOnly={picking}
        disabled={disabled}
      />
      {showList && (
        <ul id={listId} role="listbox" className={s.countryList}>
          {note && <li className={s.countryNote}>{note}</li>}
          {options.map((option, i) => (
            <li
              key={option.place_id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={`${s.countryOption} ${i === active ? s.countryOptionActive : ''}`}
              onMouseDown={e => e.preventDefault()}      // keep focus in the input so blur doesn't close the list first
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(option)}
            >
              {option.name}
            </li>
          ))}
        </ul>
      )}
      {error && <div className={s.fieldErr}>⚠ {error}</div>}
    </div>
  );
}
