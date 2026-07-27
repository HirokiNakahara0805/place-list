import { NextRequest, NextResponse } from 'next/server';

// Place Photos は Essentials（月10,000回）。余裕をみて上限を設ける。
const MONTHLY_LIMIT = Number(process.env.PLACE_PHOTO_MONTHLY_LIMIT ?? 8000);

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
  const name = req.nextUrl.searchParams.get('name')?.trim();
  if (!name) return NextResponse.json({ error: 'nameがありません' });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: 'APIキーが未設定です' });

  if (!tryConsume()) return NextResponse.json({ error: '写真の取得上限に達しました' });

  try {
    const url = new URL(`https://places.googleapis.com/v1/${name}/media`);
    url.searchParams.set('key', key);
    url.searchParams.set('maxWidthPx', '600');
    url.searchParams.set('skipHttpRedirect', 'true');

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok || !data?.photoUri) {
      return NextResponse.json({ error: '写真を取得できませんでした' });
    }
    return NextResponse.json({ url: data.photoUri });
  } catch {
    return NextResponse.json({ error: '写真の取得に失敗しました' });
  }
}
