'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

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

  const sendLink = async () => {
    if (email.trim() === '') return;
    setSending(true);
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSent(false);
    setEmail('');
  };

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-gray-500">
        読み込み中...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow">
          <h1 className="mb-1 text-lg font-bold">行きたい店リスト</h1>
          <p className="mb-4 text-xs text-gray-500">
            メールアドレスにログイン用リンクを送ります。パスワードは不要です。
          </p>

          {sent ? (
            <div className="rounded bg-sky-50 p-3 text-sm">
              <p className="font-medium">メールを送信しました</p>
              <p className="mt-1 text-xs text-gray-600">
                届いたリンクを、この端末のブラウザで開いてください。
              </p>
              <button
                onClick={() => setSent(false)}
                className="mt-3 text-xs text-sky-600 underline"
              >
                別のアドレスで送り直す
              </button>
            </div>
          ) : (
            <>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                className="mb-3 w-full rounded border px-3 py-2 text-sm"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendLink()}
              />
              <button
                onClick={sendLink}
                disabled={sending || email.trim() === ''}
                className="w-full rounded bg-sky-500 px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {sending ? '送信中...' : 'ログインリンクを送る'}
              </button>
              {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <button
        onClick={signOut}
        className="fixed bottom-2 right-2 z-20 rounded bg-white/90 px-2 py-1 text-[10px] text-gray-500 shadow hover:text-gray-800"
      >
        ログアウト（{user.email}）
      </button>
    </>
  );
}
