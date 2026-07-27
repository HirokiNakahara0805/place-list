import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get('name')?.trim();
  if (!name) return NextResponse.json({ error: 'nameがありません' }, { status: 400 });

  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return NextResponse.json({ error: 'APIキーが未設定です' }, { status: 500 });

  try {
    const url = new URL(`https://places.googleapis.com/v1/${name}/media`);
    url.searchParams.set('key', key);
    url.searchParams.set('maxWidthPx', '600');
    url.searchParams.set('skipHttpRedirect', 'true');

    const res = await fetch(url.toString());
    const data = await res.json();

    if (!res.ok || !data?.photoUri) {
      return NextResponse.json({ error: '写真を取得できませんでした' }, { status: 200 });
    }
    // 画像そのものではなく、表示用のURLを返す（転送量を抑えるため）
    return NextResponse.json({ url: data.photoUri });
  } catch {
    return NextResponse.json({ error: '写真の取得に失敗しました' }, { status: 200 });
  }
}
