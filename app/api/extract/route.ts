import { NextRequest, NextResponse } from 'next/server';

// 混雑時に上から順に試すモデル
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

const PROMPT = `この画像は飲食店のSNS投稿のスクリーンショットです。
写っている飲食店の店名と、分かる場合は所在地（市区町村や駅名）を抽出してください。

次のJSON形式のみで返答し、前後に説明やコードブロックを付けないでください。
{"name": "店名", "area": "エリア"}

店名が読み取れない場合は {"name": "", "area": ""} を返してください。`;

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'GEMINI_API_KEY が未設定です' }, { status: 500 });
  }

  let imageBase64: string | undefined;
  let mimeType: string | undefined;
  try {
    const body = await req.json();
    imageBase64 = body.imageBase64;
    mimeType = body.mimeType;
  } catch {
    return NextResponse.json({ error: 'リクエストの形式が不正です' }, { status: 400 });
  }

  if (!imageBase64) {
    return NextResponse.json({ error: '画像がありません' }, { status: 400 });
  }

  const callGemini = (model: string) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': key,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: mimeType || 'image/png', data: imageBase64 } },
            ],
          },
        ],
      }),
    });

  let ok: Response | null = null;
  let lastError = '';

  for (const model of MODELS) {
    for (let i = 0; i < 3; i++) {
      try {
        const res = await callGemini(model);
        if (res.ok) {
          ok = res;
          break;
        }
        const errBody = await res.json().catch(() => null);
        lastError = `${model} / ${res.status} / ${errBody?.error?.message ?? ''}`;

        // 混雑・レート超過以外は待っても無駄なので次のモデルへ
        if (res.status !== 503 && res.status !== 429) break;

        await new Promise((resolve) => setTimeout(resolve, (i + 1) * 1500));
      } catch {
        lastError = `${model} / ネットワークエラー`;
      }
    }
    if (ok) break;
  }

  if (!ok) {
    return NextResponse.json({ name: '', area: '', error: lastError });
  }

  const data = await ok.json();

  // Gemini 3系は思考パートを混ぜて返すことがあるため除外して結合する
  const parts: Array<{ text?: string; thought?: boolean }> =
    data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');

  // ```json ... ``` で囲まれて返ることがあるので剥がす
  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return NextResponse.json({ name: parsed.name ?? '', area: parsed.area ?? '' });
  } catch {
    return NextResponse.json({ name: '', area: '', raw: cleaned });
  }
}