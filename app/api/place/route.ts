import { NextRequest, NextResponse } from 'next/server';

// Enterprise SKU（評価つき Place Details）の無料枠は月1,000回。
// 余裕をみて上限を設け、超えたら評価・写真の取得を自動で止める。
const MONTHLY_LIMIT = Number(process.env.PLACE_DETAILS_MONTHLY_LIMIT ?? 800);

// 月ごとの呼び出し回数（インスタンス内で保持する簡易カウンタ）
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
  const id = req.nextUrl.searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'idがありません' });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: 'GOOGLE_PLACES_API_KEY が未設定です' });

  // 上限超過時は、評価・写真なしの軽い応答に切り替える（課金を止める）
  const withDetails = tryConsume();

  const fields = withDetails
    ? 'id,displayName,formattedAddress,location,rating,userRatingCount,photos'
    : 'id,displayName,formattedAddress,location';

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`);
    url.searchParams.set('languageCode', 'ja');
    url.searchParams.set('regionCode', 'JP');

    const res = await fetch(url.toString(), {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fields,
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
        photoName: data.photos?.[0]?.name ?? null,
      },
      limited: !withDetails,
    });
  } catch {
    return NextResponse.json({ error: '取得に失敗しました' });
  }
}
