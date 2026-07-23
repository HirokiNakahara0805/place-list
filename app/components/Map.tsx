'use client';

import { useEffect, useRef, useState } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  useMap,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';

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
const TOKYO = { lat: 35.6812, lng: 139.7671 };

// 画像を縮小してbase64にする（送信量を抑えるため）
const fileToCompressedBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas未対応'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('画像の読み込みに失敗'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('ファイルの読み込みに失敗'));
    reader.readAsDataURL(file);
  });

// 地図を指定座標へ寄せる
function PanTo({ target }: { target: { lat: number; lng: number } | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && target) {
      map.panTo(target);
      map.setZoom(17);
    }
  }, [map, target]);
  return null;
}

const dotStyle = (visited: boolean): React.CSSProperties => ({
  width: 18,
  height: 18,
  borderRadius: '50%',
  background: visited ? '#9ca3af' : '#ef4444',
  border: '3px solid #fff',
  boxShadow: '0 1px 4px rgba(0,0,0,.4)',
});

function MapInner() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [keyword, setKeyword] = useState('');
  const [shops, setShops] = useState<Shop[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  const [extracting, setExtracting] = useState(false);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const [pending, setPending] = useState<{
    lat: number;
    lng: number;
    name: string;
    address: string;
  } | null>(null);
  const [memo, setMemo] = useState('');
  const [panTarget, setPanTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

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

  const locate = () => {
    if (!navigator.geolocation) {
      setNotice('この端末では現在地を取得できません');
      return;
    }
    setNotice('現在地を取得中...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMyPos(p);
        setPanTarget(p);
        setNotice('');
      },
      () => setNotice('現在地を取得できませんでした（位置情報の許可を確認してください）'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const runSearch = async (q: string) => {
    if (q.trim() === '') return;
    setSearching(true);
    setSearched(false);
    try {
      const res = await fetch(`/api/search?keyword=${encodeURIComponent(q)}`);
      const data = await res.json();
      setShops(data.shops ?? []);
    } catch {
      setShops([]);
    }
    setSearching(false);
    setSearched(true);
  };

  const handleFile = async (file: File) => {
    setExtracting(true);
    setNotice('');
    setShops([]);
    setSearched(false);
    try {
      const { base64, mimeType } = await fileToCompressedBase64(file);
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();

      if (!data.name) {
        setNotice('店名を読み取れませんでした。手入力で検索してください。');
      } else {
        const q = [data.name, data.area].filter(Boolean).join(' ');
        setKeyword(q);
        setNotice(`「${data.name}」を読み取りました`);
        await runSearch(q);
      }
    } catch {
      setNotice('画像の処理に失敗しました。');
    }
    setExtracting(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const pickShop = (s: Shop) => {
    setPending({ lat: s.lat, lng: s.lng, name: s.name, address: s.address });
    setPanTarget({ lat: s.lat, lng: s.lng });
    setMemo('');
    setShops([]);
    setSearched(false);
    setKeyword('');
    setNotice('');
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

  const onMapClick = (e: MapMouseEvent) => {
    const c = e.detail.latLng;
    if (!c) return;
    setPending({ lat: c.lat, lng: c.lng, name: '', address: '' });
    setOpenId(null);
  };

  return (
    <div className="relative h-screen w-full">
      <GoogleMap
        mapId="place-list-map"
        defaultCenter={TOKYO}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        onClick={onMapClick}
        style={{ width: '100%', height: '100%' }}
      >
        <PanTo target={panTarget} />

        {places.map((p) => (
          <AdvancedMarker
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            onClick={() => setOpenId(p.id)}
          >
            <div style={dotStyle(p.visited)} />
          </AdvancedMarker>
        ))}

        {places
          .filter((p) => p.id === openId)
          .map((p) => (
            <InfoWindow
              key={`iw-${p.id}`}
              position={{ lat: p.lat, lng: p.lng }}
              onCloseClick={() => setOpenId(null)}
            >
              <div className="text-sm">
                <strong>{p.name}</strong>
                {p.address && <div className="text-xs text-gray-600">{p.address}</div>}
                {p.memo && <div>{p.memo}</div>}
              </div>
            </InfoWindow>
          ))}

        {pending && (
          <AdvancedMarker position={{ lat: pending.lat, lng: pending.lng }}>
            <div style={{ ...dotStyle(false), opacity: 0.5 }} />
          </AdvancedMarker>
        )}

        {myPos && (
          <AdvancedMarker position={myPos}>
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#2563eb',
                border: '3px solid #fff',
                boxShadow: '0 1px 4px rgba(0,0,0,.4)',
              }}
            />
          </AdvancedMarker>
        )}
      </GoogleMap>

      {/* 検索パネル */}
      <div className="absolute left-4 top-4 z-10 w-72 rounded-lg bg-white/95 p-3 shadow-lg">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="mb-2 flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={extracting}
            className="flex-1 rounded bg-red-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {extracting ? '読み取り中...' : 'スクショから追加'}
          </button>
          <button
            onClick={locate}
            className="rounded border px-3 py-2 text-sm"
            title="現在地へ移動"
          >
            現在地
          </button>
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 rounded border px-2 py-1 text-sm"
            placeholder="店名や「渋谷 ラーメン」"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(keyword)}
          />
          <button
            onClick={() => runSearch(keyword)}
            className="rounded bg-black px-3 py-1 text-sm text-white disabled:opacity-40"
            disabled={searching || keyword.trim() === ''}
          >
            {searching ? '...' : '検索'}
          </button>
        </div>

        {notice && <p className="mt-2 text-xs text-gray-600">{notice}</p>}

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
      <div className="absolute bottom-8 left-4 z-10 max-h-[34vh] w-72 overflow-y-auto rounded-lg bg-white/95 p-3 shadow-lg">
        <p className="mb-2 text-sm font-bold">
          行きたい店（残り {places.filter((p) => !p.visited).length} / {places.length}）
        </p>
        {places.length === 0 && <p className="text-xs text-gray-500">スクショか検索で追加</p>}
        <ul className="space-y-1">
          {places.map((p) => (
            <li key={p.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={p.visited} onChange={() => toggleVisited(p.id)} />
              <button
                onClick={() => {
                  setPanTarget({ lat: p.lat, lng: p.lng });
                  setOpenId(p.id);
                }}
                className={
                  p.visited ? 'flex-1 text-left text-gray-400 line-through' : 'flex-1 text-left'
                }
              >
                {p.name}
              </button>
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
        <div className="absolute right-4 top-4 z-10 w-72 rounded-lg bg-white p-4 shadow-lg">
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
    </div>
  );
}

export default function Map() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  if (!apiKey) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-600">
        NEXT_PUBLIC_GOOGLE_MAPS_KEY が設定されていません
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <MapInner />
    </APIProvider>
  );
}
