import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'idがありません' });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY が未設定です' });

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`);
    url.searchParams.set('languageCode', 'ja');
    url.searchParams.set('regionCode', 'JP');

    const res = await fetch(url.toString(), {
      headers: {
        'X-Goog-Api-Key': key,
        // rating / userRatingCount は Enterprise SKU を発動させる（店舗タップ時のみ使用）
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,rating,userRatingCount',
      },
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({
        error: `${res.status} / ${data?.error?.message ?? 'Places APIエラー'}`,
      });
    }

    if (!data?.location) return NextResponse.json({ error: '場所を取得できませんでした' });

    return NextResponse.json({
      place: {
        id: data.id ?? id,
        name: data.displayName?.text ?? '',
        address: data.formattedAddress ?? '',
        lat: data.location.latitude,
        lng: data.location.longitude,
        rating: typeof data.rating === 'number' ? data.rating : null,
        ratingCount: typeof data.userRatingCount === 'number' ? data.userRatingCount : null,
      },
    });
  } catch {
    return NextResponse.json({ error: '取得に失敗しました' });
  }
}
