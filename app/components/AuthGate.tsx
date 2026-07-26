'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

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
      setError(error.message);
      return;
    }
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
      setError('コードが正しくないか、期限が切れています');
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
      <div className="flex h-[100dvh] items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
          <h1 className="mb-1 text-lg font-bold">行きたい店リスト</h1>

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
                disabled={busy || email.trim() === ''}
                className="w-full rounded bg-sky-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? '送信中...' : 'ログインコードを送る'}
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

              <div className="mt-3 flex justify-between text-xs">
                <button onClick={backToEmail} className="text-gray-500 underline">
                  アドレスを変える
                </button>
                <button onClick={sendCode} disabled={busy} className="text-sky-600 underline">
                  コードを再送する
                </button>
              </div>
            </>
          )}

          {notice && <p className="mt-3 text-xs text-gray-600">{notice}</p>}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
