import { NextRequest, NextResponse } from 'next/server';

// Place Details（Enterprise SKU）の無料枠は月1,000回。
// 評価・写真と共用なので、レビュー要約用に別枠を設けて使いすぎを防ぐ。
const MONTHLY_LIMIT = Number(process.env.REVIEW_SUMMARY_MONTHLY_LIMIT ?? 300);

let counter = { month: '', count: 0 };
const currentMonth = () => new Date().toISOString().slice(0, 7);

function tryConsume(): boolean {
  const m = currentMonth();
  if (counter.month !== m) counter = { month: m, count: 0 };
  if (counter.count >= MONTHLY_LIMIT) return false;
  counter.count += 1;
  return true;
}

const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

const PROMPT = `あなたは飲食店の口コミを整理する係です。
以下はある店舗の口コミ情報です。これをもとに、訪問を検討している人が判断できる形に整理してください。

次のJSON形式のみで返答し、前後に説明やコードブロックを付けないでください。
{"good": ["良い点1", "良い点2"], "bad": ["気になる点1", "気になる点2"], "note": "一言"}

ルール:
- good と bad はそれぞれ最大3件、各30文字程度
- bad は必ず探してください。低評価の指摘、待ち時間、接客、価格など、少しでも不満が読み取れれば書く
- 本当に見当たらない場合のみ bad を空配列にする
- 口コミの原文をそのまま引用せず、要約した表現にする
- note は全体の傾向を40文字程度で。情報が少なければ「口コミが少なく判断材料は限られます」など正直に書く`;

export async function POST(req: NextRequest) {
  const placesKey = process.env.GOOGLE_PLACES_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!placesKey || !geminiKey) {
    return NextResponse.json({ error: 'APIキーが未設定です' });
  }

  let placeId: string | undefined;
  try {
    const body = await req.json();
    placeId = body.placeId;
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' });
  }
  if (!placeId) return NextResponse.json({ error: 'この店舗は口コミを取得できません' });

  if (!tryConsume()) {
    return NextResponse.json({ error: '今月の取得上限に達しました。来月またお試しください。' });
  }

  // 1. Google からレビュー情報を取得
  let raw: {
    summary: string;
    reviews: { rating: number; text: string }[];
    rating: number | null;
    count: number | null;
  };

  try {
    const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
    url.searchParams.set('languageCode', 'ja');
    url.searchParams.set('regionCode', 'JP');

    const res = await fetch(url.toString(), {
      headers: {
        'X-Goog-Api-Key': placesKey,
        'X-Goog-FieldMask': 'rating,userRatingCount,reviews,reviewSummary',
      },
    });
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({
        error: `口コミを取得できませんでした（${res.status}）`,
      });
    }

    type GReview = { rating?: number; text?: { text?: string } };
    const reviews: GReview[] = data?.reviews ?? [];

    raw = {
      summary: data?.reviewSummary?.text?.text ?? '',
      reviews: reviews
        .filter((r) => r.text?.text)
        .map((r) => ({ rating: r.rating ?? 0, text: r.text!.text! })),
      rating: typeof data?.rating === 'number' ? data.rating : null,
      count: typeof data?.userRatingCount === 'number' ? data.userRatingCount : null,
    };
  } catch {
    return NextResponse.json({ error: '口コミの取得に失敗しました' });
  }

  if (raw.summary === '' && raw.reviews.length === 0) {
    return NextResponse.json({ error: 'この店舗にはまだ口コミがありません' });
  }

  // 2. Gemini で観点ごとに整理
  const material = [
    raw.rating !== null ? `平均評価: ${raw.rating}（${raw.count ?? '?'}件）` : '',
    raw.summary ? `全体の要約:\n${raw.summary}` : '',
    raw.reviews.length > 0
      ? `個別の口コミ:\n${raw.reviews.map((r) => `- ★${r.rating} ${r.text}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const callGemini = (model: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${PROMPT}\n\n---\n${material}` }] }],
      }),
    });

  let ok: Response | null = null;
  for (const model of GEMINI_MODELS) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await callGemini(model);
        if (res.ok) {
          ok = res;
          break;
        }
        if (res.status !== 503 && res.status !== 429) break;
        await new Promise((r) => setTimeout(r, (i + 1) * 1200));
      } catch {
        break;
      }
    }
    if (ok) break;
  }

  if (!ok) return NextResponse.json({ error: '要約の生成に失敗しました' });

  const data = await ok.json();
  const parts: Array<{ text?: string; thought?: boolean }> =
    data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');

  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return NextResponse.json({
      summary: {
        good: Array.isArray(parsed.good) ? parsed.good.slice(0, 3) : [],
        bad: Array.isArray(parsed.bad) ? parsed.bad.slice(0, 3) : [],
        note: typeof parsed.note === 'string' ? parsed.note : '',
        rating: raw.rating,
        count: raw.count,
      },
    });
  } catch {
    return NextResponse.json({ error: '要約を読み取れませんでした' });
  }
}
