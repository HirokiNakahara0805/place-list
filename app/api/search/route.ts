import { NextRequest, NextResponse } from 'next/server';

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  primaryTypeDisplayName?: { text?: string };
};

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword')?.trim();
  if (!keyword) return NextResponse.json({ shops: [] });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    return NextResponse.json({ shops: [], error: 'GOOGLE_PLACES_API_KEY が未設定です' });
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
      body: JSON.stringify({
        textQuery: keyword,
        languageCode: 'ja',
        regionCode: 'JP',
        maxResultCount: 20,
      }),
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