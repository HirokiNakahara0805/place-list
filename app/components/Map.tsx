'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type Place = {
  id: number;
  lat: number;
  lng: number;
  name: string;
  address: string;
  memo: string;
  visited: boolean;
};

type Shop = {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  genre: string;
};

const STORAGE_KEY = 'place-list:places';

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

function FlyTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], 17);
  }, [target, map]);
  return null;
}

export default function Map() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [shops, setShops] = useState<Shop[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [pending, setPending] = useState<{ lat: number; lng: number; name: string; address: string } | null>(null);
  const [memo, setMemo] = useState('');
  const [flyTarget, setFlyTarget] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setPlaces(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(places));
  }, [places, loaded]);

  const search = async () => {
    if (keyword.trim() === '') return;
    setSearching(true);
    setSearched(false);
    try {
      const res = await fetch(`/api/search?keyword=${encodeURIComponent(keyword)}`);
      const data = await res.json();
      setShops(data.shops ?? []);
    } catch {
      setShops([]);
    }
    setSearching(false);
    setSearched(true);
  };

  const pickShop = (s: Shop) => {
    setPending({ lat: s.lat, lng: s.lng, name: s.name, address: s.address });
    setFlyTarget({ lat: s.lat, lng: s.lng });
    setMemo('');
    setShops([]);
    setSearched(false);
    setKeyword('');
  };

  const reset = () => {
    setPending(null);
    setMemo('');
  };

  const save = () => {
    if (!pending) return;
    setPlaces((prev) => [
      ...prev,
      {
        id: Date.now(),
        lat: pending.lat,
        lng: pending.lng,
        name: pending.name,
        address: pending.address,
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
        <ClickHandler
          onClick={(lat, lng) => setPending({ lat, lng, name: '', address: '' })}
        />
        <FlyTo target={flyTarget} />

        {places.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={makeIcon(p.visited)}>
            <Popup>
              <strong>{p.name}</strong>
              {p.address && <><br /><span className="text-xs">{p.address}</span></>}
              {p.memo && <><br />{p.memo}</>}
            </Popup>
          </Marker>
        ))}

        {pending && (
          <Marker position={[pending.lat, pending.lng]} icon={makeIcon(false)} opacity={0.5} />
        )}
      </MapContainer>

      {/* 検索 */}
      <div className="absolute left-4 top-4 z-[1000] w-72 rounded-lg bg-white/95 p-3 shadow-lg">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-2 py-1 text-sm"
            placeholder="店名や「渋谷 ラーメン」"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
          />
          <button
            onClick={search}
            className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-40"
            disabled={searching || keyword.trim() === ''}
          >
            {searching ? '...' : '検索'}
          </button>
        </div>

        {searched && shops.length === 0 && (
          <p className="mt-2 text-xs text-gray-500">
            見つかりませんでした。地図を直接クリックしても登録できます。
          </p>
        )}

        {shops.length > 0 && (
          <ul className="mt-2 max-h-56 overflow-y-auto border-t pt-2">
            {shops.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => pickShop(s)}
                  className="w-full rounded px-1 py-1.5 text-left text-sm hover:bg-gray-100"
                >
                  <span className="font-medium">{s.name}</span>
                  <br />
                  <span className="text-xs text-gray-500">{s.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 一覧 */}
      <div className="absolute bottom-8 left-4 z-[1000] max-h-[38vh] w-72 overflow-y-auto rounded-lg bg-white/95 p-3 shadow-lg">
        <p className="mb-2 text-sm font-bold">
          行きたい店（残り {places.filter((p) => !p.visited).length} / {places.length}）
        </p>
        {places.length === 0 && <p className="text-xs text-gray-500">検索するか地図をクリック</p>}
        <ul className="space-y-1">
          {places.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={p.visited} onChange={() => toggleVisited(p.id)} />
              <button
                onClick={() => setFlyTarget({ lat: p.lat, lng: p.lng })}
                className={p.visited ? 'flex-1 text-left text-gray-400 line-through' : 'flex-1 text-left'}
              >
                {p.name}
              </button>
              <button onClick={() => remove(p.id)} className="text-xs text-gray-400 hover:text-red-500">
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
            className="mb-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="店名（必須）"
            value={pending.name}
            onChange={(e) => setPending({ ...pending, name: e.target.value })}
            autoFocus
          />
          {pending.address && <p className="mb-2 text-xs text-gray-500">{pending.address}</p>}
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
              disabled={pending.name.trim() === ''}
            >
              追加
            </button>
            <button onClick={reset} className="rounded border px-3 py-1.5 text-sm">
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* クレジット表記（利用規約で必須） */}
      <div className="absolute bottom-1 left-1/2 z-[1000] -translate-x-1/2 rounded bg-white/80 px-2 py-0.5 text-[10px]">
        <a href="http://webservice.recruit.co.jp/" target="_blank" rel="noopener noreferrer" className="underline">
          Powered by ホットペッパーグルメ Webサービス
        </a>
      </div>
    </div>
  );
}