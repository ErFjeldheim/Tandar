"use client";

import { useEffect, useRef, useState } from "react";

export interface GeocodeFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
}

const COORD_RE = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
const DEBOUNCE_MS = 250;

export default function LocationSearch({
  token,
  onSelect,
  onUseMyLocation,
}: {
  token: string;
  onSelect: (coord: [number, number], name: string) => void;
  onUseMyLocation: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GeocodeFeature[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = "tandar-search-results";

  useEffect(() => {
    // Empty / placeholder state: nothing to look up.
    if (!query.trim() || query === selectedName) {
      // Synchronous setState here is fine - it's the body's exit branch
      // (no async work, no side effect, just clearing local UI state).
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const coordMatch = query.match(COORD_RE);
      if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lng = parseFloat(coordMatch[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
          setResults([
            {
              id: "coord",
              place_name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              text: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
              center: [lng, lat],
            },
          ]);
          setOpen(true);
          setActiveIdx(0);
        } else {
          setResults([]);
        }
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`,
        );
        url.searchParams.set("access_token", token);
        url.searchParams.set("limit", "5");
        url.searchParams.set("language", "en");
        const res = await fetch(url.toString(), { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { features?: GeocodeFeature[] };
        setResults(data.features ?? []);
        setOpen(true);
        setActiveIdx(data.features?.length ? 0 : -1);
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, token, selectedName]);

  function pick(feature: GeocodeFeature) {
    setSelectedName(feature.place_name);
    setQuery(feature.place_name);
    setOpen(false);
    setResults([]);
    setActiveIdx(-1);
    onSelect(feature.center, feature.place_name);
    inputRef.current?.blur();
  }

  function clearSelection() {
    setSelectedName(null);
    setQuery("");
    setResults([]);
    setOpen(false);
    onUseMyLocation();
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (results[activeIdx]) {
        e.preventDefault();
        pick(results[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  }

  return (
    // pointer-events-auto so clicks land here even if a parent sets
    // pointer-events-none (the map page does this to keep the map draggable
    // under the surrounding chrome).
    <div className="relative w-full max-w-md pointer-events-auto">
      <div className="flex items-stretch overflow-hidden rounded-full bg-white shadow ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-sky-500">
        <input
          ref={inputRef}
          type="text"
          inputMode="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Search a place, or paste lat, lng…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedName(null);
          }}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        {selectedName && (
          <button
            type="button"
            onClick={clearSelection}
            aria-label="Use my current location"
            className="px-3 text-xs text-slate-500 hover:text-slate-900"
          >
            ↺
          </button>
        )}
        {loading && (
          <div className="flex items-center pr-3 text-xs text-slate-400">
            …
          </div>
        )}
      </div>
      {open && results.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-auto rounded-lg bg-white py-1 shadow-lg ring-1 ring-slate-200"
        >
          {results.map((f, i) => (
            <li
              key={f.id}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(f);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`cursor-pointer px-4 py-2 text-sm ${
                i === activeIdx
                  ? "bg-sky-50 text-sky-900"
                  : "text-slate-800 hover:bg-slate-50"
              }`}
            >
              <div className="truncate">{f.text}</div>
              {f.place_name !== f.text && (
                <div className="truncate text-xs text-slate-500">
                  {f.place_name}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
