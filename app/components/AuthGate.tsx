'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

type AuthLikeError = { message?: string; code?: string; status?: number };

// Supabaseの英語メッセージを日本語に置き換える
const toJa = (e: AuthLikeError): string => {
  const msg = e.message ?? '';
  const code = e.code ?? '';

  // 「あと N 秒待って」系は秒数を拾って伝える
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

// 「あと N 秒」の N を取り出す
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

  // 再送までの待ち時間を1秒ずつ減らす
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // コードを送る。emailRedirectTo を渡さないことでリンクではなくコードが送られる
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
    setCooldown(30); // 連打を防ぐため、成功後も少し間隔をあける
    setStep('code');
    setNotice('メールにコードを送りました');
  };

  const verify = async () => {
    // 桁数は決め打ちしない（6桁とは限らないため）
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
    // 成功すると onAuthStateChange が発火して画面が切り替わる
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
        {/* 上部バー：どのサイトを開いているか一目で分かるように */}
        <header className="flex items-center gap-2 border-b bg-white px-4 py-3 shadow-sm">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm text-white"
          >
            📍
          </span>
          <span className="text-base font-bold text-gray-800">行きたいお店リスト</span>
          <span className="ml-auto text-[11px] text-gray-400">ikitai-omise.com</span>
        </header>

        <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
          <h1 className="mb-1 text-lg font-bold">ログイン</h1>

          {step === 'email' ? (
            <>
              <p className="mb-4 text-xs text-gray-500">
                メールアドレスにログイン用のコードを送ります。パスワードは不要です。
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
                className="w-full rounded bg-sky-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy
                  ? '送信中...'
                  : cooldown > 0
                    ? `再送まで ${cooldown} 秒`
                    : 'ログインコードを送る'}
              </button>
            </>
          ) : (
            <>
              <p className="mb-4 text-xs text-gray-500">
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
                className="w-full rounded bg-sky-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
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
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
