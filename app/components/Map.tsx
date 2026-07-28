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
  place_id: string | null;
  lat: number;
  lng: number;
  name: string;
  address: string;
  memo: string;
  url: string;
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
type SortKey = 'new' | 'near' | 'name';
type Tag = { id: string; name: string };

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const COLUMNS = 'id, place_id, name, address, memo, url, lat, lng, visited';

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

// 現在のズームを親に伝える（引きすぎたときにラベルを隠すため）
function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const update = () => {
      const z = map.getZoom();
      if (typeof z === 'number') onZoom(z);
    };
    update();
    const listener = map.addListener('zoom_changed', update);
    return () => listener.remove();
  }, [map, onZoom]);
  return null;
}

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

// 2点間の距離（メートル）。地球を半径6371kmの球とみなす簡易計算
const distanceM = (
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) => {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

const formatDistance = (m: number) =>
  m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;

// 郵便番号や番地は地図を見れば分かるので、町名までに短くする
const shortAddress = (a: string) => {
  const t = a
    .replace(/^日本、?\s*/, '')
    .replace(/〒?\s*\d{3}-?\d{4}\s*/, '')
    .trim();
  const m = t.match(/^[^0-9０-９]+/);
  return (m ? m[0] : t).trim();
};

// http(s) で始まるものだけリンクとして扱う
const isHttp = (u: string) => /^https?:\/\//i.test(u.trim());

// Googleマップで開くためのURL。place_id があれば店を正確に指定できる
const mapsUrl = (p: Place) => {
  const base = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  return p.place_id ? `${base}&query_place_id=${encodeURIComponent(p.place_id)}` : base;
};

// 地図の実体を親に渡す（表示範囲を検索に使うため）
function CaptureMap({ onMap }: { onMap: (m: google.maps.Map | null) => void }) {
  const map = useMap();
  useEffect(() => {
    onMap(map);
  }, [map, onMap]);
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

// シートの高さ。iOSでは vh が実表示領域より大きくなるため dvh を使う
const sheetHeight: Record<SheetState, string> = {
  closed: 'h-14',
  half: 'h-[45dvh]',
  full: 'h-[80dvh]',
};

// 登録・編集フォームのタグ選択（選ぶだけ。作成は一覧の「タグを作成・削除」から）
function TagPicker({
  tags,
  selected,
  onToggle,
  onCreate,
  counts,
}: {
  tags: Tag[];
  selected: string[];
  onToggle: (id: string) => void;
  onCreate: (name: string) => Promise<void>;
  counts?: Record<string, number>;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const n = name.trim();
    if (n === '' || busy) return;
    setBusy(true);
    await onCreate(n);
    setBusy(false);
    setName('');
  };

  return (
    <div className="mb-3">
      <p className="mb-1 text-[11px] text-gray-500">タグ</p>

      {tags.length > 0 && (
        <ul className="mb-1 max-h-32 overflow-y-auto overscroll-contain rounded border">
          {tags.map((t) => (
            <li key={t.id} className="border-b last:border-b-0">
              <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={selected.includes(t.id)}
                  onChange={() => onToggle(t.id)}
                />
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="shrink-0 text-xs text-gray-400">{counts?.[t.id] ?? 0}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1">
        <input
          className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
          placeholder="新しいタグ（例: ラーメン）"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && create()}
        />
        <button
          onClick={create}
          disabled={busy || name.trim() === ''}
          className="shrink-0 rounded border px-3 py-1.5 text-sm text-gray-700 disabled:opacity-40"
        >
          {busy ? '...' : '作成'}
        </button>
      </div>
    </div>
  );
}

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
    placeId: string | null;
  } | null>(null);
  const [memo, setMemo] = useState('');
  const [panTarget, setPanTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [myPos, setMyPos] = useState<{ lat: number; lng: number } | null>(null);

  const [sheet, setSheet] = useState<SheetState>('closed');
  const [mapObj, setMapObj] = useState<google.maps.Map | null>(null);
  const [zoom, setZoom] = useState(13);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [editing, setEditing] = useState<Place | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [tags, setTags] = useState<Tag[]>([]);
  const [placeTags, setPlaceTags] = useState<Record<string, string[]>>({});
  const [pendingTagIds, setPendingTagIds] = useState<string[]>([]);
  const [editTagIds, setEditTagIds] = useState<string[]>([]);

  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [manageTags, setManageTags] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [confirmTagId, setConfirmTagId] = useState<string | null>(null);

  const [sortKey, setSortKey] = useState<SortKey>('new');
  const [onlyUnvisited, setOnlyUnvisited] = useState(false);
  const [originOpen, setOriginOpen] = useState(false);
  const [originQuery, setOriginQuery] = useState('');
  const [originBusy, setOriginBusy] = useState(false);
  const [origin, setOrigin] = useState<{ label: string; lat: number; lng: number } | null>(null);
  // 同じ店の評価を何度も取りに行かないためのキャッシュ（セッション内）
  const [ratings, setRatings] = useState<
    Record<string, { rating: number | null; count: number | null; photo?: string | null }>
  >({});

  const [poi, setPoi] = useState<{
    id: string;
    name: string;
    address: string;
    lat: number;
    lng: number;
    rating: number | null;
    ratingCount: number | null;
    photoName?: string | null;
  } | null>(null);

  // 起動時にDBから読み込む（RLSにより自分の行だけが返る）
  useEffect(() => {
    const load = async () => {
      const [placeRes, tagRes, linkRes] = await Promise.all([
        supabase.from('places').select(COLUMNS).order('created_at', { ascending: false }),
        supabase.from('tags').select('id, name').order('name'),
        supabase.from('place_tags').select('place_id, tag_id'),
      ]);

      if (placeRes.error) setLoadError(placeRes.error.message);
      else setPlaces((placeRes.data ?? []) as Place[]);

      if (tagRes.error) setNotice(`タグの読み込みに失敗: ${tagRes.error.message}`);
      else setTags((tagRes.data ?? []) as Tag[]);

      if (linkRes.error) {
        setNotice(`タグの紐付けの読み込みに失敗: ${linkRes.error.message}`);
      } else {
        const map: Record<string, string[]> = {};
        for (const row of (linkRes.data ?? []) as { place_id: string; tag_id: string }[]) {
          (map[row.place_id] ||= []).push(row.tag_id);
        }
        setPlaceTags(map);
      }

      setLoaded(true);
    };
    load();
  }, [supabase]);

  // タグだけをDBから取り直す
  const reloadTags = async () => {
    const { data, error } = await supabase.from('tags').select('id, name').order('name');
    if (error) {
      setNotice(`タグを取得できませんでした: ${error.message}`);
      return;
    }
    setTags((data ?? []) as Tag[]);
  };

  // タグを新規作成する。作成できたらそのIDを返す
  const createTag = async (rawName: string): Promise<string | null> => {
    const name = rawName.trim();
    if (name === '') return null;

    const exist = tags.find((t) => t.name === name);
    if (exist) return exist.id;

    const { data, error } = await supabase
      .from('tags')
      .insert({ name })
      .select('id, name')
      .single();

    if (error) {
      // 23505 = 同名タグがすでにDBにある（画面が古い可能性が高い）
      if (error.code === '23505') {
        setNotice(`「${name}」はすでにあります。一覧を取り直しました。`);
        await reloadTags();
        return null;
      }
      setNotice(`タグを作成できませんでした: ${error.message}`);
      return null;
    }
    if (!data) {
      setNotice('タグを作成できませんでした');
      return null;
    }

    const created = data as Tag;
    setTags((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'ja')));
    return created.id;
  };

  // タグそのものを削除する（全店から外れる）
  const deleteTag = async (id: string) => {
    const snapshotTags = tags;
    const snapshotLinks = placeTags;
    setTags((prev) => prev.filter((t) => t.id !== id));
    setPlaceTags((prev) => {
      const next: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(prev)) next[k] = v.filter((x) => x !== id);
      return next;
    });
    setSelectedTagIds((prev) => prev.filter((x) => x !== id));

    const { error } = await supabase.from('tags').delete().eq('id', id);
    if (error) {
      setTags(snapshotTags);
      setPlaceTags(snapshotLinks);
      setNotice('タグを削除できませんでした');
    }
  };

  // 吹き出しを開いたとき、その店の評価をまだ持っていなければ取得する
  useEffect(() => {
    const target =
      (openId ? places.find((x) => x.id === openId)?.place_id : null) ?? poi?.id ?? null;
    if (!target || ratings[target]) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/place?id=${encodeURIComponent(target)}`);
        const data = await res.json();
        if (cancelled || !data.place) return;

        let photo: string | null = null;
        if (data.place.photoName) {
          const pr = await fetch(`/api/photo?name=${encodeURIComponent(data.place.photoName)}`);
          const pd = await pr.json();
          photo = pd.url ?? null;
        }
        if (cancelled) return;

        setRatings((prev) => ({
          ...prev,
          [target]: { rating: data.place.rating, count: data.place.ratingCount, photo },
        }));
      } catch {
        // 取得できなくても表示しないだけなので黙って無視する
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [openId, poi, places, ratings]);

  const openMore = () => setSheet((s) => (s === 'closed' ? 'half' : 'full'));
  const closeMore = () => setSheet((s) => (s === 'full' ? 'half' : 'closed'));

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

  // 検索結果が全部見えるように地図を合わせる
  const fitToShops = (list: Shop[]) => {
    if (!mapObj || list.length === 0) return;
    if (list.length === 1) {
      mapObj.panTo({ lat: list[0].lat, lng: list[0].lng });
      mapObj.setZoom(16);
      return;
    }
    const lats = list.map((x) => x.lat);
    const lngs = list.map((x) => x.lng);
    mapObj.fitBounds(
      {
        north: Math.max(...lats),
        south: Math.min(...lats),
        east: Math.max(...lngs),
        west: Math.min(...lngs),
      },
      80
    );
  };

  // 一覧の並べ替え基準にする地点を、地名から決める
  const applyOrigin = async () => {
    const q = originQuery.trim();
    if (q === '' || originBusy) return;
    setOriginBusy(true);

    try {
      const res = await fetch(`/api/search?keyword=${encodeURIComponent(q)}`);
      const data = await res.json();
      const first = (data.shops ?? [])[0];

      if (!first) {
        setNotice(`「${q}」が見つかりませんでした`);
        setOriginBusy(false);
        return;
      }

      setOrigin({ label: q, lat: first.lat, lng: first.lng });
      setSortKey('near');
      setPanTarget({ lat: first.lat, lng: first.lng });
      setOriginOpen(false);
      setNotice('');
    } catch {
      setNotice('場所を取得できませんでした');
    }
    setOriginBusy(false);
  };

  const clearOrigin = () => {
    setOrigin(null);
    setOriginQuery('');
    setOriginOpen(false);
  };

  const runSearch = async (q: string) => {
    if (q.trim() === '') return;
    setOpenId(null);
    setPoi(null);
    setSearching(true);
    setSearched(false);
    try {
      const params = new URLSearchParams({ keyword: q });

      // いま見ている範囲を優先して探す（短い店名が全国の候補に埋もれるのを防ぐ）
      const b = mapObj?.getBounds();
      if (b) {
        const sw = b.getSouthWest();
        const ne = b.getNorthEast();
        params.set('swLat', String(sw.lat()));
        params.set('swLng', String(sw.lng()));
        params.set('neLat', String(ne.lat()));
        params.set('neLng', String(ne.lng()));
      }

      const res = await fetch(`/api/search?${params.toString()}`);
      const data = await res.json();
      if (data.error) setNotice(`検索エラー: ${data.error}`);

      const found: Shop[] = data.shops ?? [];
      setShops(found);
      fitToShops(found);
    } catch {
      setShops([]);
    }
    setSearching(false);
    setSearched(true);
  };

  const handleFile = async (file: File) => {
    setOpenId(null);
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

  // 検索結果を選ぶ：地図を移動して吹き出しを出す（登録は吹き出しのボタンから）
  const pickShop = (s: Shop) => {
    setOpenId(null);
    setPending(null);
    setEditing(null);
    setNotice('');
    setSheet('closed');
    setShops([]);
    setSearched(false);
    setPoi({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      rating: ratings[s.id]?.rating ?? null,
      ratingCount: ratings[s.id]?.count ?? null,
    });
    setPanTarget({ lat: s.lat, lng: s.lng });
  };

  const reset = () => {
    setPending(null);
    setMemo('');
    setUrl('');
    setPendingTagIds([]);
  };

  const openEdit = (p: Place) => {
    setEditing({ ...p });
    setEditTagIds(placeTags[p.id] ?? []);
    setOpenId(null);
    setPoi(null);
    setPending(null);
  };

  // 編集を保存する
  const saveEdit = async () => {
    if (!editing || editing.name.trim() === '') return;
    setEditSaving(true);

    const patch = {
      name: editing.name.trim(),
      memo: editing.memo.trim(),
      url: editing.url.trim(),
    };

    const { error } = await supabase.from('places').update(patch).eq('id', editing.id);
    setEditSaving(false);

    if (error) {
      setNotice(`更新に失敗しました: ${error.message}`);
      return;
    }
    setPlaces((prev) => prev.map((p) => (p.id === editing.id ? { ...p, ...patch } : p)));

    // タグは差分だけを追加・削除する
    const before = placeTags[editing.id] ?? [];
    const added = editTagIds.filter((t) => !before.includes(t));
    const removed = before.filter((t) => !editTagIds.includes(t));

    if (added.length > 0) {
      await supabase
        .from('place_tags')
        .insert(added.map((tag_id) => ({ place_id: editing.id, tag_id })));
    }
    if (removed.length > 0) {
      await supabase
        .from('place_tags')
        .delete()
        .eq('place_id', editing.id)
        .in('tag_id', removed);
    }
    setPlaceTags((prev) => ({ ...prev, [editing.id]: editTagIds }));

    setEditing(null);
  };

  // 追加：DBに書いてから、返ってきた行を画面に足す
  const save = async () => {
    if (!pending || pending.name.trim() === '') return;
    setSaving(true);
    setNotice('');

    const { data, error } = await supabase
      .from('places')
      .insert({
        place_id: pending.placeId,
        name: pending.name.trim(),
        address: pending.address,
        memo: memo.trim(),
        url: url.trim(),
        lat: pending.lat,
        lng: pending.lng,
        visited: false,
      })
      .select(COLUMNS)
      .single();

    setSaving(false);

    if (error) {
      // 23505 = 一意制約違反（同じ店を二重に登録しようとした）
      setNotice(
        error.code === '23505'
          ? 'この店はすでに登録されています'
          : `保存に失敗しました: ${error.message}`
      );
      return;
    }
    if (data) {
      const created = data as Place;
      setPlaces((prev) => [created, ...prev]);

      if (pendingTagIds.length > 0) {
        const rows = pendingTagIds.map((tag_id) => ({ place_id: created.id, tag_id }));
        const { error: linkError } = await supabase.from('place_tags').insert(rows);
        if (linkError) setNotice('タグの保存に失敗しました');
        else setPlaceTags((prev) => ({ ...prev, [created.id]: pendingTagIds }));
      }
    }
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
      return;
    }
    setPlaceTags((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // 地図タップ：店舗アイコンのときだけ登録に進む。何もない場所は無視する
  const onMapClick = async (e: MapMouseEvent) => {
    const placeId = e.detail.placeId;
    if (!placeId) {
      setPoi(null);
      setOpenId(null);
      return;
    }

    // Google標準の吹き出しが出るのを抑える
    if (e.stoppable && e.stop) e.stop();

    setOpenId(null);
    setShops([]);
    setSearched(false);
    setNotice('店舗情報を取得中...');
    setSheet('closed');

    try {
      const res = await fetch(`/api/place?id=${encodeURIComponent(placeId)}`);
      const data = await res.json();

      if (data.error || !data.place) {
        setNotice(data.error ?? '店舗情報を取得できませんでした');
        return;
      }

      setNotice('');
      setPoi(data.place);
      let photo: string | null = null;
      if (data.place.photoName) {
        const pr = await fetch(`/api/photo?name=${encodeURIComponent(data.place.photoName)}`);
        const pd = await pr.json();
        photo = pd.url ?? null;
      }
      setRatings((prev) => ({
        ...prev,
        [data.place.id]: {
          rating: data.place.rating,
          count: data.place.ratingCount,
          photo,
        },
      }));
    } catch {
      setNotice('店舗情報の取得に失敗しました');
    }
  };

  // 吹き出しの「この場所を登録」から登録フォームへ
  const registerPoi = () => {
    if (!poi) return;
    setPending({
      lat: poi.lat,
      lng: poi.lng,
      name: poi.name,
      address: poi.address,
      placeId: poi.id,
    });
    setPanTarget({ lat: poi.lat, lng: poi.lng });
    setPoi(null);
    setMemo('');
    setUrl('');
    setShops([]);
    setSearched(false);
    setKeyword('');
  };

  // 見つからなかった店を、地図の中心に手動で登録する
  const addManually = () => {
    const c = mapObj?.getCenter();
    if (!c) return;
    setOpenId(null);
    setShops([]);
    setSearched(false);
    setPending({ lat: c.lat(), lng: c.lng(), name: keyword.trim(), address: '', placeId: null });
    setSheet('closed');
  };


  // 絞り込み → 並べ替え の順に適用する
  const visible = places
    .filter((p) => (onlyUnvisited ? !p.visited : true))
    .filter((p) => {
      if (selectedTagIds.length === 0) return true;
      const own = placeTags[p.id] ?? [];
      return selectedTagIds.every((t) => own.includes(t)); // 選んだタグを全部持つもの
    })
    .slice()
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ja');
      const base = origin ?? myPos;
      if (sortKey === 'near' && base) {
        return distanceM(base, a) - distanceM(base, b);
      }
      return 0; // 'new' は読み込み順（新しい順）のまま
    });
  const registered = new Set(places.map((p) => p.place_id).filter(Boolean) as string[]);
  const filterCount = selectedTagIds.length;

  // タグごとの登録件数
  const tagCounts: Record<string, number> = {};
  for (const ids of Object.values(placeTags)) {
    for (const id of ids) tagCounts[id] = (tagCounts[id] ?? 0) + 1;
  }
  const distanceBase = origin ?? myPos;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <GoogleMap
        mapId="place-list-map"
        defaultCenter={TOKYO}
        defaultZoom={13}
        gestureHandling="greedy"
        disableDefaultUI={true}
        zoomControl={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        onClick={onMapClick}
        style={{ width: '100%', height: '100%' }}
      >
        <CaptureMap onMap={setMapObj} />
        <ZoomWatcher onZoom={setZoom} />
        <PanTo target={panTarget} />

        {places.map((p) => (
          <AdvancedMarker
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            onClick={() => setOpenId(p.id)}
            zIndex={openId === p.id ? 8 : 1}
          >
            {/* 丸ポチだけを座標に合わせ、ラベルは真下に浮かせる */}
            <div style={{ position: 'relative', width: 18, height: 18 }}>
              <div style={dotStyle(p.visited)} />
              {/* Googleの店名（白地に黒）と区別できるよう、色を反転させる */}
              {/* 引きすぎるとラベルが重なって読めないので隠す */}
              {zoom >= 13 && (
              <span
                style={{
                  position: 'absolute',
                  top: 22,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  maxWidth: '8.5rem',
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: p.visited ? '#6b7280' : '#dc2626',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  border: '1.5px solid #fff',
                  boxShadow: '0 1px 4px rgba(0,0,0,.35)',
                  pointerEvents: 'none',
                }}
              >
                {p.name}
              </span>
              )}
            </div>
          </AdvancedMarker>
        ))}

        {places
          .filter((p) => p.id === openId)
          .map((p) => (
            <InfoWindow
              key={`iw-${p.id}`}
              position={{ lat: p.lat, lng: p.lng }}
              pixelOffset={[0, -14]}
              shouldFocus={false}
              headerContent={<span className="text-sm font-bold">{p.name}</span>}
              onCloseClick={() => setOpenId(null)}
            >
              <div className="pt-0.5 text-sm">
                {p.place_id && ratings[p.place_id]?.photo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ratings[p.place_id].photo!}
                    alt=""
                    className="mb-1 h-24 w-full rounded object-cover"
                  />
                )}
                {p.place_id && ratings[p.place_id]?.rating != null && (
                  <div className="text-xs text-gray-700">
                    <span className="text-amber-500">★</span>{' '}
                    {ratings[p.place_id].rating!.toFixed(1)}
                    {ratings[p.place_id].count != null && (
                      <span className="ml-1 text-gray-500">
                        （{ratings[p.place_id].count!.toLocaleString('ja-JP')}件）
                      </span>
                    )}
                  </div>
                )}
                {p.address && (
                  <div className="text-xs text-gray-600">{shortAddress(p.address)}</div>
                )}
                {p.memo && <div className="mt-1 whitespace-pre-wrap">{p.memo}</div>}
                <div className="mt-2 flex flex-col items-start gap-1">
                  {isHttp(p.url) && (
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 underline"
                    >
                      保存したリンクを開く
                    </a>
                  )}
                  <a
                    href={mapsUrl(p)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline"
                  >
                    Googleマップで開く
                  </a>
                  <button
                    onClick={() => openEdit(p)}
                    className="text-xs text-gray-600 underline"
                  >
                    編集
                  </button>
                </div>
              </div>
            </InfoWindow>
          ))}

        {shops.map((s) => (
          <AdvancedMarker
            key={`shop-${s.id}`}
            position={{ lat: s.lat, lng: s.lng }}
            onClick={() => pickShop(s)}
            zIndex={5}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: registered.has(s.id) ? '#d1d5db' : '#f59e0b',
                border: '3px solid #fff',
                boxShadow: '0 1px 4px rgba(0,0,0,.4)',
              }}
            />
          </AdvancedMarker>
        ))}

        {poi && (
          <InfoWindow
            position={{ lat: poi.lat, lng: poi.lng }}
            pixelOffset={[0, -14]}
            shouldFocus={false}
            headerContent={<span className="text-sm font-bold">{poi.name}</span>}
            onCloseClick={() => setPoi(null)}
          >
            <div className="pt-0.5 text-sm">
              {ratings[poi.id]?.photo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ratings[poi.id].photo!}
                  alt=""
                  className="mb-1 h-24 w-full rounded object-cover"
                />
              )}
              {ratings[poi.id]?.rating != null && (
                <div className="text-xs text-gray-700">
                  <span className="text-amber-500">★</span>{' '}
                  {ratings[poi.id].rating!.toFixed(1)}
                  {ratings[poi.id].count != null && (
                    <span className="ml-1 text-gray-500">
                      （{ratings[poi.id].count!.toLocaleString('ja-JP')}件）
                    </span>
                  )}
                </div>
              )}
              {poi.address && (
                <div className="text-xs text-gray-600">{shortAddress(poi.address)}</div>
              )}
              {registered.has(poi.id) ? (
                <p className="mt-2 text-xs text-gray-500">この店はすでに登録済みです</p>
              ) : (
                <button
                  onClick={registerPoi}
                  className="mt-2 rounded bg-sky-500 px-3 py-1.5 text-xs font-medium text-white"
                >
                  この場所を登録
                </button>
              )}
            </div>
          </InfoWindow>
        )}

        {pending && (
          <AdvancedMarker position={{ lat: pending.lat, lng: pending.lng }} zIndex={10}>
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
          <div className="mt-2 text-xs text-gray-500">
            <p>見つかりませんでした。</p>
            <button
              onClick={addManually}
              className="mt-1 rounded border px-2 py-1 text-gray-700"
            >
              地図の中心に手動で登録
            </button>
          </div>
        )}

        {shops.length > 0 && (
          <ul className="mt-2 max-h-[40dvh] overflow-y-auto overscroll-contain border-t pt-2 md:max-h-56">
            {shops.map((s) => {
              const already = registered.has(s.id);
              return (
                <li key={s.id}>
                  <button
                    onClick={() => pickShop(s)}
                    disabled={already}
                    className="w-full rounded px-1 py-1.5 text-left text-sm hover:bg-gray-100 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className={already ? 'font-medium text-gray-400' : 'font-medium'}>
                      {s.name}
                    </span>
                    {already && (
                      <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
                        登録済み
                      </span>
                    )}
                    <br />
                    <span className="text-xs text-gray-500">{s.address}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ===== 一覧：スマホは下部シート、md以上は左下パネル ===== */}
      <div
        className={`absolute inset-x-0 bottom-0 z-10 flex flex-col rounded-t-2xl bg-white shadow-[0_-2px_12px_rgba(0,0,0,.15)] transition-[height] duration-300 ${sheetHeight[sheet]} md:inset-x-auto md:bottom-6 md:left-4 md:h-auto md:max-h-[62dvh] md:w-[26rem] md:rounded-lg md:bg-white/95 md:shadow-lg`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4 md:h-auto md:px-3 md:py-2">
          <span className="min-w-0 flex-1 truncate text-sm font-bold">
            行きたいお店（未訪問 {visible.filter((p) => !p.visited).length} / {visible.length}件
            {visible.length !== places.length ? ` / 全${places.length}` : ''}）
          </span>
          <div className="ml-2 flex shrink-0 gap-1 md:hidden">
            <button
              onClick={closeMore}
              disabled={sheet === 'closed'}
              aria-label="下げる"
              className="rounded border px-3 py-1 text-sm text-gray-600 disabled:opacity-30"
            >
              ↓
            </button>
            <button
              onClick={openMore}
              disabled={sheet === 'full'}
              aria-label="上げる"
              className="rounded border px-3 py-1 text-sm text-gray-600 disabled:opacity-30"
            >
              ↑
            </button>
          </div>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:px-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {loaded && !loadError && (
            <div className="mb-2 flex flex-col gap-1 border-b pb-2 text-xs">
              {places.length > 0 && (
              <div className="flex gap-1">
                {(
                  [
                    ['new', '新しい順'],
                    ['near', '近い順'],
                    ['name', '名前順'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setSortKey(key);
                      if (key === 'near') {
                        setOriginOpen(true);
                        if (!myPos && !origin) locate();
                      } else {
                        setOriginOpen(false);
                      }
                    }}
                    className={
                      sortKey === key
                        ? 'flex-1 rounded bg-gray-800 px-2 py-1 text-white'
                        : 'flex-1 rounded border px-2 py-1 text-gray-600'
                    }
                  >
                    {key === 'near' && origin ? `近い順：${origin.label}` : label}
                  </button>
                ))}
              </div>
              )}

              {sortKey === 'near' && originOpen && (
                <div className="rounded border bg-gray-50 p-2">
                  <p className="mb-1 text-[11px] text-gray-500">距離の基準</p>
                  <div className="mb-1 flex gap-1">
                    <button
                      onClick={clearOrigin}
                      className={
                        origin === null
                          ? 'rounded bg-gray-800 px-2 py-1 text-white'
                          : 'rounded border bg-white px-2 py-1 text-gray-600'
                      }
                    >
                      現在地
                    </button>
                    {origin && (
                      <span className="inline-flex items-center rounded bg-gray-800 px-2 py-1 text-white">
                        {origin.label}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <input
                      className="min-w-0 flex-1 rounded border bg-white px-2 py-1 text-xs"
                      placeholder="場所を指定（例: 新宿駅）"
                      value={originQuery}
                      onChange={(e) => setOriginQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && applyOrigin()}
                    />
                    <button
                      onClick={applyOrigin}
                      disabled={originBusy || originQuery.trim() === ''}
                      className="shrink-0 rounded border bg-white px-2 py-1 text-xs text-gray-700 disabled:opacity-40"
                    >
                      {originBusy ? '...' : '設定'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-1">
                {places.length > 0 && (
                <button
                  onClick={() => setOnlyUnvisited((v) => !v)}
                  className={
                    onlyUnvisited
                      ? 'flex-1 rounded bg-gray-800 px-2 py-1 text-white'
                      : 'flex-1 rounded border px-2 py-1 text-gray-600'
                  }
                >
                  未訪問のみ
                </button>
                )}
                <button
                  onClick={() => {
                    const next = !filterOpen;
                    setFilterOpen(next);
                    if (next) reloadTags();
                  }}
                  className={
                    filterCount > 0
                      ? 'flex-1 rounded bg-gray-800 px-2 py-1 text-white'
                      : 'flex-1 rounded border px-2 py-1 text-gray-600'
                  }
                >
                  絞り込み{filterCount > 0 ? `（${filterCount}）` : ''} {filterOpen ? '▲' : '▼'}
                </button>
              </div>

              {filterOpen && (
                <div className="w-full rounded border bg-gray-50 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] text-gray-500">タグ（すべて含むもの）</p>
                    <button
                      onClick={() => setManageTags((v) => !v)}
                      className="text-[11px] text-gray-500 underline"
                    >
                      {manageTags ? '完了' : 'タグを作成・削除'}
                    </button>
                  </div>

                  {manageTags && (
                    <div className="mb-2 flex gap-1">
                      <input
                        className="min-w-0 flex-1 rounded border bg-white px-2 py-1 text-xs"
                        placeholder="新しいタグ（例: ラーメン）"
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' &&
                          createTag(newTagName).then(() => setNewTagName(''))
                        }
                      />
                      <button
                        onClick={() => createTag(newTagName).then(() => setNewTagName(''))}
                        disabled={newTagName.trim() === ''}
                        className="shrink-0 rounded border bg-white px-2 py-1 text-xs text-gray-700 disabled:opacity-40"
                      >
                        作成
                      </button>
                    </div>
                  )}

                  {tags.length > 0 && (
                    <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto overscroll-contain md:max-h-32">
                      {tags.map((t) => (
                        <span key={t.id} className="inline-flex items-center">
                          <button
                            onClick={() =>
                              setSelectedTagIds((prev) =>
                                prev.includes(t.id)
                                  ? prev.filter((x) => x !== t.id)
                                  : [...prev, t.id]
                              )
                            }
                            className={
                              selectedTagIds.includes(t.id)
                                ? 'rounded-full bg-gray-800 px-2.5 py-1 text-white'
                                : 'rounded-full border bg-white px-2.5 py-1 text-gray-600'
                            }
                          >
                            {t.name}
                            <span className="ml-1 opacity-60">{tagCounts[t.id] ?? 0}</span>
                          </button>
                          {manageTags && (
                            <button
                              onClick={() => setConfirmTagId(t.id)}
                              aria-label={`${t.name}を削除`}
                              className="ml-0.5 text-[11px] text-red-500"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {confirmTagId && (
                    <div className="mt-2 rounded border border-red-200 bg-red-50 p-2">
                      <p className="mb-1 text-[11px] text-red-700">
                        タグ「{tags.find((t) => t.id === confirmTagId)?.name}」を削除します。
                        付けている店からも外れます。
                      </p>
                      <div className="flex gap-1">
                        <button
                          onClick={() => {
                            deleteTag(confirmTagId);
                            setConfirmTagId(null);
                          }}
                          className="rounded bg-red-600 px-2 py-1 text-[11px] text-white"
                        >
                          削除
                        </button>
                        <button
                          onClick={() => setConfirmTagId(null)}
                          className="rounded border bg-white px-2 py-1 text-[11px] text-gray-600"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}

                  {(filterCount > 0 || onlyUnvisited) && (
                    <button
                      onClick={() => {
                        setSelectedTagIds([]);
                        setOnlyUnvisited(false);
                      }}
                      className="mt-2 font-medium text-red-600 underline"
                    >
                      すべてクリア
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {sortKey === 'near' && !myPos && !origin && (
            <p className="mb-2 text-xs text-gray-500">
              現在地を取得しています。許可されていない場合は「現在地」を押してください。
            </p>
          )}

          {!loaded && <p className="text-xs text-gray-500">読み込み中...</p>}
          {loadError && <p className="text-xs text-red-600">{loadError}</p>}
          {loaded && !loadError && places.length === 0 && (
            <div className="space-y-1 text-xs text-gray-500">
              <p>
                上の「スクショから追加」での文字の読み取りか検索でお店を登録できます。
                地図上のお店をタップしても登録できます。
              </p>
              <p>
                「絞り込み」→「タグを作成・削除」から、
                ラーメン・デートなど自由なタグを作れます。
                作ったタグはお店の登録・編集画面で選べます。
              </p>
            </div>
          )}
          {loaded && !loadError && places.length > 0 && visible.length === 0 && (
            <p className="text-xs text-gray-500">条件に合う店がありません</p>
          )}

          <ul className="space-y-2 md:space-y-1">
            {visible.map((p) => (
              <li key={p.id} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0"
                  checked={p.visited}
                  onChange={() => toggleVisited(p.id)}
                />
                <button
                  onClick={() => {
                    // 別の吹き出しやフォームが残っていると表示が競合するので閉じる
                    setPoi(null);
                    setPending(null);
                    setEditing(null);
                    setShops([]);
                    setSearched(false);
                    setPanTarget({ lat: p.lat, lng: p.lng });
                    setOpenId(p.id);
                    // 全開のときだけ中段に下げる。中段ならそのまま保つ
                    setSheet((cur) => (cur === 'full' ? 'half' : cur));
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <span
                    className={
                      p.visited
                        ? 'block truncate text-gray-400 line-through'
                        : 'block truncate'
                    }
                  >
                    {p.name}
                  </span>
                  <span className="block truncate text-xs text-gray-500">
                    {distanceBase && (
                      <span className="mr-2 text-gray-400">
                        {formatDistance(distanceM(distanceBase, p))}
                      </span>
                    )}
                    {(placeTags[p.id] ?? []).map((tid) => {
                      const t = tags.find((x) => x.id === tid);
                      return t ? (
                        <span key={tid} className="mr-1 text-gray-400">
                          #{t.name}
                        </span>
                      ) : null;
                    })}
                    {p.memo}
                  </span>
                </button>
                <button
                  onClick={() => openEdit(p)}
                  aria-label="編集"
                  className="mt-0.5 shrink-0 text-xs text-gray-400 hover:text-sky-600"
                >
                  編集
                </button>
                {confirmId === p.id ? (
                  <span className="mt-0.5 flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => {
                        remove(p.id);
                        setConfirmId(null);
                      }}
                      className="rounded bg-red-600 px-2 py-0.5 text-xs text-white"
                    >
                      削除
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      className="rounded border px-2 py-0.5 text-xs text-gray-600"
                    >
                      取消
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmId(p.id)}
                    className="mt-0.5 shrink-0 text-xs text-gray-400 hover:text-red-500"
                  >
                    削除
                  </button>
                )}
              </li>
            ))}
          </ul>

          {loaded && !loadError && (
            <p className="mt-4 text-center text-[11px] text-gray-400">
              あなただけの素敵なお店リストになりますように。
            </p>
          )}

          {loaded && !loadError && (
            <p className="mt-3 text-center text-[10px] text-gray-300">
              <a href="/terms" className="underline hover:text-gray-500">
                利用規約
              </a>
              <span className="mx-1">·</span>
              <a href="/privacy" className="underline hover:text-gray-500">
                プライバシーポリシー
              </a>
            </p>
          )}

          {sheet !== 'closed' && (
            <button
              onClick={() => supabase.auth.signOut()}
              className="mt-6 text-[11px] text-gray-400 underline"
            >
              ログアウト
            </button>
          )}
          <button
            onClick={() => supabase.auth.signOut()}
            className="mt-4 hidden text-[11px] text-gray-400 underline md:block"
          >
            ログアウト
          </button>
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
          {pending.address && (
            <p className="mb-2 text-xs text-gray-500">{shortAddress(pending.address)}</p>
          )}
          <input
            className="mb-2 w-full rounded border px-2 py-2 text-sm md:py-1"
            placeholder="メモ"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <input
            className="mb-3 w-full rounded border px-2 py-2 text-sm md:py-1"
            placeholder="リンク（InstagramのURLなど）"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <TagPicker
            tags={tags}
            selected={pendingTagIds}
            counts={tagCounts}
            onToggle={(id) =>
              setPendingTagIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
              )
            }
            onCreate={async (name) => {
              const id = await createTag(name);
              if (id) setPendingTagIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
            }}
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

      {/* ===== 編集パネル ===== */}
      {editing && (
        <div
          className="absolute inset-x-0 bottom-0 z-20 rounded-t-2xl bg-white p-4 shadow-[0_-2px_12px_rgba(0,0,0,.2)] md:inset-x-auto md:bottom-auto md:right-4 md:top-4 md:w-72 md:rounded-lg md:shadow-lg"
          style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
        >
          <p className="mb-2 text-sm font-bold">編集</p>
          <input
            className="mb-1 w-full rounded border px-2 py-2 text-sm md:py-1"
            placeholder="店名（必須）"
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            autoFocus
          />
          {editing.address && (
            <p className="mb-2 text-xs text-gray-500">{shortAddress(editing.address)}</p>
          )}
          <textarea
            className="mb-2 w-full resize-none rounded border px-2 py-2 text-sm"
            rows={3}
            placeholder="メモ"
            value={editing.memo}
            onChange={(e) => setEditing({ ...editing, memo: e.target.value })}
          />
          <input
            className="mb-3 w-full rounded border px-2 py-2 text-sm md:py-1"
            placeholder="リンク（InstagramのURLなど）"
            inputMode="url"
            value={editing.url}
            onChange={(e) => setEditing({ ...editing, url: e.target.value })}
          />
          <TagPicker
            tags={tags}
            selected={editTagIds}
            counts={tagCounts}
            onToggle={(id) =>
              setEditTagIds((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
              )
            }
            onCreate={async (name) => {
              const id = await createTag(name);
              if (id) setEditTagIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              className="flex-1 rounded bg-sky-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-40 md:py-1.5"
              disabled={editSaving || editing.name.trim() === ''}
            >
              {editSaving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={() => setEditing(null)}
              className="rounded border px-3 py-2 text-sm md:py-1.5"
            >
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
