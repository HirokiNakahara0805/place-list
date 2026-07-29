'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type AuthLikeError = { message?: string; code?: string; status?: number };

// Supabaseの英語メッセージを日本語に置き換える
const toJa = (e: AuthLikeError): string => {
  const msg = e.message ?? '';
  const code = e.code ?? '';

  const wait = msg.match(/after (\d+) seconds?/i);
  if (wait) return `送信の間隔が短すぎます。あと${wait[1]}秒ほど待ってからお試しください。`;

  if (code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(msg)) {
    return 'メールの送信回数が上限に達しました。しばらく時間をおいてからお試しください。';
  }
  if (code === 'over_request_rate_limit' || e.status === 429) {
    return 'リクエストが多すぎます。少し時間をおいてからお試しください。';
  }
  if (code === 'otp_expired' || /expired|invalid/i.test(msg)) {
    return 'コードが正しくないか、期限が切れています。再送してお試しください。';
  }
  if (code === 'validation_failed' || /invalid.*email|email.*invalid/i.test(msg)) {
    return 'メールアドレスの形式が正しくないようです。';
  }
  if (code === 'otp_disabled' || /signups not allowed|user not found/i.test(msg)) {
    return 'このメールアドレスは登録されていません。';
  }
  if (/failed to fetch|network/i.test(msg)) {
    return '通信に失敗しました。電波状況を確認してお試しください。';
  }
  return `送信できませんでした（${msg}）`;
};

const waitSecondsOf = (e: AuthLikeError): number => {
  const m = (e.message ?? '').match(/after (\d+) seconds?/i);
  return m ? Number(m[1]) : 0;
};

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setChecking(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const sendCode = async () => {
    const addr = email.trim();
    if (addr === '') return;
    setBusy(true);
    setError('');
    setNotice('');

    const { error } = await supabase.auth.signInWithOtp({ email: addr });
    setBusy(false);

    if (error) {
      setError(toJa(error));
      setCooldown(waitSecondsOf(error));
      return;
    }
    setStep('code');
    setNotice('メールにコードを送りました');
    setCooldown(30);
  };

  const verify = async () => {
    const token = code.trim();
    if (token === '') return;
    setBusy(true);
    setError('');

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    });
    setBusy(false);

    if (error) {
      setError(toJa(error));
      return;
    }
  };

  const backToEmail = () => {
    setStep('email');
    setCode('');
    setError('');
    setNotice('');
  };

  if (checking) {
    return (
      <div className="flex h-[100dvh] items-center justify-center text-sm text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[100dvh] flex-col bg-gray-50">
        <header className="flex shrink-0 items-center gap-2 border-b bg-white px-4 py-3 shadow-sm">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm text-white"
          >
            📍
          </span>
          <span className="text-base font-bold text-gray-800">行きたいお店リスト</span>
          <span className="ml-auto text-[11px] text-gray-400">ikitai-omise.com</span>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-6">
          <div className="mx-auto w-full max-w-sm">
            {/* 何ができるアプリかを先に見せる */}
            <div className="mb-5 text-center">
              <h1 className="mb-2 text-lg font-bold leading-snug text-gray-900">
                インスタで見たお店、
                <br />
                忘れる前に地図へ。
              </h1>
              <p className="text-xs leading-relaxed text-gray-600">
                スクショを送るだけで、AIが店名を読み取って保存します。
              </p>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/preview.jpg"
              alt="保存したお店が地図に並んでいる画面"
              className="mb-5 w-full rounded-lg border shadow-sm"
            />

            <ul className="mb-6 space-y-2 text-xs text-gray-700">
              <li className="flex gap-2">
                <span aria-hidden>📷</span>
                <span>スクショを送るだけ。店名も住所も自動で入ります</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden>📍</span>
                <span>「近い順」で、今いる場所の近くのお店が出てきます</span>
              </li>
              <li className="flex gap-2">
                <span aria-hidden>🏷</span>
                <span>ラーメン・デートなど、自由なタグで分類できます</span>
              </li>
            </ul>

            <div className="rounded-lg bg-white p-5 shadow">
              {step === 'email' ? (
                <>
                  <p className="mb-3 text-xs text-gray-500">
                    無料で使えます。メールアドレスにログイン用のコードを送ります。
                    パスワードは不要です。
                  </p>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    className="mb-3 w-full rounded border px-3 py-2 text-sm"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendCode()}
                  />
                  <button
                    onClick={sendCode}
                    disabled={busy || email.trim() === '' || cooldown > 0}
                    className="w-full rounded bg-sky-500 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {busy
                      ? '送信中...'
                      : cooldown > 0
                        ? `再送まで ${cooldown} 秒`
                        : '無料ではじめる'}
                  </button>
                </>
              ) : (
                <>
                  <p className="mb-3 text-xs text-gray-500">
                    {email} に届いたコードを入力してください。
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="mb-3 w-full rounded border px-3 py-2 text-center text-lg tracking-widest"
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && verify()}
                    autoFocus
                  />
                  <button
                    onClick={verify}
                    disabled={busy || code.trim() === ''}
                    className="w-full rounded bg-sky-500 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {busy ? '確認中...' : 'ログイン'}
                  </button>

                  <p className="mt-3 rounded bg-gray-50 p-2 text-[11px] leading-relaxed text-gray-500">
                    メールが届くまで少し時間がかかることがあります。
                    数分待っても届かない場合は、迷惑メールフォルダをご確認ください。
                  </p>

                  <div className="mt-3 flex justify-between text-xs">
                    <button onClick={backToEmail} className="text-gray-500 underline">
                      アドレスを変える
                    </button>
                    <button
                      onClick={sendCode}
                      disabled={busy || cooldown > 0}
                      className="text-sky-600 underline disabled:text-gray-400 disabled:no-underline"
                    >
                      {cooldown > 0 ? `再送まで ${cooldown} 秒` : 'コードを再送する'}
                    </button>
                  </div>
                </>
              )}

              {notice && <p className="mt-3 text-xs text-gray-600">{notice}</p>}
              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

              <p className="mt-5 border-t pt-3 text-[11px] leading-relaxed text-gray-400">
                ログインすることで
                <a href="/terms" className="mx-0.5 underline hover:text-gray-600">
                  利用規約
                </a>
                と
                <a href="/privacy" className="mx-0.5 underline hover:text-gray-600">
                  プライバシーポリシー
                </a>
                に同意したものとみなします。
              </p>
            </div>

            <p className="mt-6 text-center text-[11px] text-gray-400">
              あなただけの素敵なお店リストになりますように。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
