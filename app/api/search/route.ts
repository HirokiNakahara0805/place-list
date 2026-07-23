import { NextRequest, NextResponse } from 'next/server';

type HotPepperShop = {
  id: string;
  name: string;
  address: string;
  lat: string;
  lng: string;
  genre?: { name?: string };
};

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get('keyword')?.trim();
  if (!keyword) return NextResponse.json({ shops: [] });

  const key = process.env.HOTPEPPER_API_KEY;
  if (!key) return NextResponse.json({ error: 'APIキーが未設定です' }, { status: 500 });

  const url = new URL('https://webservice.recruit.co.jp/hotpepper/gourmet/v1/');
  url.searchParams.set('key', key);
  url.searchParams.set('keyword', keyword);
  url.searchParams.set('count', '20');
  url.searchParams.set('format', 'json');

  try {
    const res = await fetch(url.toString());
    const data = await res.json();
    const raw: HotPepperShop[] = data?.results?.shop ?? [];

    const shops = raw.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
      lat: Number(s.lat),
      lng: Number(s.lng),
      genre: s.genre?.name ?? '',
    }));

    return NextResponse.json({ shops });
  } catch {
    return NextResponse.json({ error: '検索に失敗しました' }, { status: 500 });
  }
}