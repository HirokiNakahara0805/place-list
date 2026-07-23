'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Place = {
  id: number;
  lat: number;
  lng: number;
  name: string;
  memo: string;
  visited: boolean;
};

const STORAGE_KEY = 'place-list:places';

// 未訪問=赤、訪問済=グレー
const makeIcon = (visited: boolean) =>
  L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:${
      visited ? '#9ca3af' : '#ef4444'
    };border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  });

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function Map() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);
  const [name, setName] = useState('');
  const [memo, setMemo] = useState('');

  // 起動時に読み込む
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPlaces(JSON.parse(raw));
    } catch {
      // 壊れていたら空で始める
    }
    setLoaded(true);
  }, []);

  // 変わるたびに保存する
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  }, [places, loaded]);

  const reset = () => {
    setPending(null);
    setName('');
    setMemo('');
  };

  const save = () => {
    if (!pending || name.trim() === '') return;
    setPlaces((prev) => [
      ...prev,
      {
        id: Date.now(),
        lat: pending.lat,
        lng: pending.lng,
        name: name.trim(),
        memo: memo.trim(),
        visited: false,
      },
    ]);
    reset();
  };

  const toggleVisited = (id: number) =>
    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, visited: !p.visited } : p)));

  const remove = (id: number) => setPlaces((prev) => prev.filter((p) => p.id !== id));

  return (
    <div className="relative h-screen w-full">
      <MapContainer center={[35.6812, 139.7671]} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onClick={(lat, lng) => setPending({ lat, lng })} />

        {places.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={makeIcon(p.visited)}>
            <Popup>
              <strong>{p.name}</strong>
              {p.memo && (
                <>
                  <br />
                  {p.memo}
                </>
              )}
            </Popup>
          </Marker>
        ))}

        {pending && (
          <Marker position={[pending.lat, pending.lng]} icon={makeIcon(false)} opacity={0.5} />
        )}
      </MapContainer>

      {/* 一覧 */}
      <div className="absolute left-4 top-4 z-[1000] max-h-[45vh] w-64 overflow-y-auto rounded-lg bg-white/95 p-3 shadow-lg">
        <p className="mb-2 text-sm font-bold">
          行きたい店（残り {places.filter((p) => !p.visited).length} / {places.length}）
        </p>
        {places.length === 0 && (
          <p className="text-xs text-gray-500">地図をクリックして追加してください</p>
        )}
        <ul className="space-y-1">
          {places.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={p.visited} onChange={() => toggleVisited(p.id)} />
              <span className={p.visited ? 'flex-1 text-gray-400 line-through' : 'flex-1'}>
                {p.name}
              </span>
              <button
                onClick={() => remove(p.id)}
                className="text-xs text-gray-400 hover:text-red-500"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 登録フォーム */}
      {pending && (
        <div className="absolute right-4 top-4 z-[1000] w-72 rounded-lg bg-white p-4 shadow-lg">
          <p className="mb-2 text-sm font-bold">この場所を登録</p>
          <input
            className="mb-2 w-full rounded border px-2 py-1 text-sm"
            placeholder="店名（必須）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          <input
            className="mb-3 w-full rounded border px-2 py-1 text-sm"
            placeholder="メモ"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              className="flex-1 rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-40"
              disabled={name.trim() === ''}
            >
              追加
            </button>
            <button onClick={reset} className="rounded border px-3 py-1.5 text-sm">
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  );
}