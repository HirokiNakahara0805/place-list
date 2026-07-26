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
import { createClient } from '@/lib/supabase/client';

type Place = {
  id: string;
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

type SheetState = 'closed' | 'half' | 'full';

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const COLUMNS = 'id, name, address, memo, lat, lng, visited';

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

// シートの高さ（スマホのみ有効。md以上では md:h-auto が勝つ）
const sheetHeight: Record<SheetState, string> = {
  closed: 'h-12',
  half: 'h-[45vh]',
  full: 'h-[85vh]',
};

function MapInner() {
  const [supabase] = useState(() => createClient());

  const [places, setPlaces] = useState<Place[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

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
  const [openId, setOpenId] = useState<string | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  const [sheet, setSheet] = useState<SheetState>('closed');

  // 起動時にDBから読み込む（RLSにより自分の行だけが返る）
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from('places')
        .select(COLUMNS)
        .order('created_at', { ascending: false });

      if (error) setLoadError(error.message);
      else setPlaces((data ?? []) as Place[]);
      setLoaded(true);
    };
    load();
  }, [supabase]);

  const cycleSheet = () =>
    setSheet((s) => (s === 'closed' ? 'half' : s === 'half' ? 'full' : 'closed'));

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
    setSheet('closed');
  };

  const reset = () => {
    setPending(null);
    setMemo('');
  };

  // 追加：DBに書いてから、返ってきた行を画面に足す
  const save = async () => {
    if (!pending || pending.name.trim() === '') return;
    setSaving(true);
    setNotice('');

    const { data, error } = await supabase
      .from('places')
      .insert({
        name: pending.name.trim(),
        address: pending.address,
        memo: memo.trim(),
        lat: pending.lat,
        lng: pending.lng,
        visited: false,
      })
      .select(COLUMNS)
      .single();

    setSaving(false);

    if (error) {
      setNotice(`保存に失敗しました: ${error.message}`);
      return;
    }
    if (data) setPlaces((prev) => [data as Place, ...prev]);
    reset();
  };

  // 訪問済みの切替：先に画面を変え、失敗したら戻す
  const toggleVisited = async (id: string) => {
    const target = places.find((p) => p.id === id);
    if (!target) return;
    const next = !target.visited;

    setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, visited: next } : p)));

    const { error } = await supabase.from('places').update({ visited: next }).eq('id', id);
    if (error) {
      setPlaces((prev) => prev.map((p) => (p.id === id ? { ...p, visited: !next } : p)));
      setNotice('更新に失敗しました');
    }
  };

  // 削除：先に画面から消し、失敗したら戻す
  const remove = async (id: string) => {
    const snapshot = places;
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    if (openId === id) setOpenId(null);

    const { error } = await supabase.from('places').delete().eq('id', id);
    if (error) {
      setPlaces(snapshot);
      setNotice('削除に失敗しました');
    }
  };

  const onMapClick = (e: MapMouseEvent) => {
    const c = e.detail.latLng;
    if (!c) return;
    setPending({ lat: c.lat, lng: c.lng, name: '', address: '' });
    setOpenId(null);
    setSheet('closed');
  };

  const notVisited = places.filter((p) => !p.visited).length;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden">
      <GoogleMap
        mapId="place-list-map"
        defaultCenter={TOKYO}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI={true}
        zoomControl={true}
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
              pixelOffset={[0, -14]}
              onCloseClick={() => setOpenId(null)}
            >
              <div className="text-sm">
                <strong>{p.name}</strong>
                {p.address && <div className="text-xs text-gray-600">{p.address}</div>}
                {p.memo && <div className="mt-1">{p.memo}</div>}
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

      {/* ===== 検索パネル：スマホは上部いっぱい、md以上は左上に固定幅 ===== */}
      <div className="absolute inset-x-2 top-2 z-10 rounded-lg bg-white/95 p-3 shadow-lg md:inset-x-auto md:left-4 md:top-4 md:w-72">
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
            className="flex-1 rounded bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {extracting ? '読み取り中...' : 'スクショから追加'}
          </button>
          <button
            onClick={locate}
            className="shrink-0 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white"
            title="現在地へ移動"
          >
            現在地
          </button>
        </div>

        <div className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
            placeholder="店名や場所「ラーメン 渋谷」"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch(keyword)}
          />
          <button
            onClick={() => runSearch(keyword)}
            className="shrink-0 rounded bg-green-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-40"
            disabled={searching || keyword.trim() === ''}
          >
            {searching ? '...' : '検索'}
          </button>
        </div>

        {notice && <p className="mt-2 text-xs text-gray-600">{notice}</p>}

        {searched && shops.length === 0 && (
          <p className="mt-2 text-xs text-gray-500">
            見つかりませんでした。地図を直接タップしても登録できます。
          </p>
        )}

        {shops.length > 0 && (
          <ul className="mt-2 max-h-[40vh] overflow-y-auto border-t pt-2 md:max-h-56">
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

      {/* ===== 一覧：スマホは下部シート、md以上は左下パネル ===== */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl bg-white/95 shadow-[0_-2px_12px_rgba(0,0,0,.15)] transition-[height] duration-300 ${sheetHeight[sheet]} md:inset-x-auto md:bottom-8 md:left-4 md:h-auto md:max-h-[34vh] md:w-72 md:rounded-lg md:shadow-lg`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <button
          onClick={cycleSheet}
          className="flex shrink-0 items-center justify-between px-4 py-3 text-left md:cursor-default md:px-3 md:py-2"
        >
          <span className="text-sm font-bold">
            行きたい店（未訪問 {notVisited} / 全 {places.length}）
          </span>
          <span className="text-xs text-gray-400 md:hidden">
            {sheet === 'closed' ? '▲ 開く' : sheet === 'half' ? '▲ もっと' : '▼ 閉じる'}
          </span>
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 md:px-3">
          {!loaded && <p className="text-xs text-gray-500">読み込み中...</p>}
          {loadError && <p className="text-xs text-red-600">{loadError}</p>}
          {loaded && !loadError && places.length === 0 && (
            <p className="text-xs text-gray-500">スクショか検索で追加</p>
          )}

          <ul className="space-y-2 md:space-y-1">
            {places.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={p.visited}
                  onChange={() => toggleVisited(p.id)}
                />
                <button
                  onClick={() => {
                    setPanTarget({ lat: p.lat, lng: p.lng });
                    setOpenId(p.id);
                    setSheet('closed');
                  }}
                  className={
                    p.visited
                      ? 'min-w-0 flex-1 truncate text-left text-gray-400 line-through'
                      : 'min-w-0 flex-1 truncate text-left'
                  }
                >
                  {p.name}
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="shrink-0 text-xs text-gray-400 hover:text-red-500"
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ===== 登録フォーム：スマホは下部シート、md以上は右上パネル ===== */}
      {pending && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 rounded-t-2xl bg-white p-4 shadow-[0_-2px_12px_rgba(0,0,0,.2)] md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:w-72 md:rounded-lg md:shadow-lg"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <p className="mb-2 text-sm font-bold">この場所を登録</p>
          <input
            className="mb-1 w-full rounded border px-2 py-2 text-sm md:py-1"
            placeholder="店名（必須）"
            value={pending.name}
            onChange={(e) => setPending({ ...pending, name: e.target.value })}
            autoFocus
          />
          {pending.address && <p className="mb-2 text-xs text-gray-500">{pending.address}</p>}
          <input
            className="mb-3 w-full rounded border px-2 py-2 text-sm md:py-1"
            placeholder="メモ"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={save}
              className="flex-1 rounded bg-sky-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 md:py-1.5"
              disabled={saving || pending.name.trim() === ''}
            >
              {saving ? '保存中...' : '追加'}
            </button>
            <button onClick={reset} className="rounded border px-3 py-2 text-sm md:py-1.5">
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
      <div className="flex h-[100dvh] items-center justify-center text-sm text-gray-600">
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
