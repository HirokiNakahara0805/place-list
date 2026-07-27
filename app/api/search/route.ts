import { NextRequest, NextResponse } from 'next/server';

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryTypeDisplayName?: { text?: string };
};

type SearchBody = {
  textQuery: string;
  languageCode: string;
  regionCode: string;
  maxResultCount: number;
  locationBias?: {
    rectangle: {
      low: { latitude: number; longitude: number };
      high: { latitude: number; longitude: number };
    };
  };
};

// Text Search は Pro（月5,000回）。余裕をみて上限を設ける。
const MONTHLY_LIMIT = Number(process.env.TEXT_SEARCH_MONTHLY_LIMIT ?? 4000);

let counter = { month: '', count: 0 };
const currentMonth = () => new Date().toISOString().slice(0, 7);

function tryConsume(): boolean {
  const m = currentMonth();
  if (counter.month !== m) counter = { month: m, count: 0 };
  if (counter.count >= MONTHLY_LIMIT) return false;
  counter.count += 1;
  return true;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const keyword = sp.get('keyword')?.trim();
  if (!keyword) return NextResponse.json({ shops: [] });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ shops: [], error: 'GOOGLE_PLACES_API_KEY が未設定です' });
  }

  if (!tryConsume()) {
    return NextResponse.json({
      shops: [],
      error: '本日の検索上限に達しました。時間をおいてお試しください。',
    });
  }

  const body: SearchBody = {
    textQuery: keyword,
    languageCode: 'ja',
    regionCode: 'JP',
    maxResultCount: 20,
  };

  // 地図の表示範囲を「この辺を優先して探す」というヒントとして渡す
  const swLat = Number(sp.get('swLat'));
  const swLng = Number(sp.get('swLng'));
  const neLat = Number(sp.get('neLat'));
  const neLng = Number(sp.get('neLng'));
  const hasBias = [swLat, swLng, neLat, neLng].every((v) => Number.isFinite(v));

  if (hasBias && swLat < neLat && swLng < neLng) {
    body.locationBias = {
      rectangle: {
        low: { latitude: swLat, longitude: swLng },
        high: { latitude: neLat, longitude: neLng },
      },
    };
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.primaryTypeDisplayName',
        ].join(','),
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({
        shops: [],
        error: `${res.status} / ${data?.error?.message ?? 'Places APIエラー'}`,
      });
    }

    const raw: GooglePlace[] = data?.places ?? [];

    const shops = raw
      .filter((p) => p.location)
      .map((p) => ({
        id: p.id,
        name: p.displayName?.text ?? '(名称不明)',
        address: p.formattedAddress ?? '',
        lat: p.location!.latitude,
        lng: p.location!.longitude,
        genre: p.primaryTypeDisplayName?.text ?? '',
      }));

    return NextResponse.json({ shops });
  } catch {
    return NextResponse.json({ shops: [], error: '検索に失敗しました' });
  }
}
