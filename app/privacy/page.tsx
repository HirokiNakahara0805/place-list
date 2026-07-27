export const metadata = { title: 'プライバシーポリシー | 行きたいお店リスト' };

export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-sm leading-relaxed text-gray-800">
      <h1 className="mb-1 text-xl font-bold">プライバシーポリシー</h1>
      <p className="mb-8 text-xs text-gray-500">最終更新日: 2026年7月27日</p>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">1. 取得する情報</h2>
        <ul className="list-inside list-disc space-y-1">
          <li>メールアドレス（認証のため）</li>
          <li>利用者が登録した店舗の名称・住所・位置情報・メモ・リンク・タグ</li>
          <li>位置情報（「現在地」機能を利用した場合のみ。端末上で処理し、保存しません）</li>
          <li>アップロードされた画像（店名の抽出にのみ使用し、保存しません）</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">2. 利用目的</h2>
        <p>
          取得した情報は、本サービスの提供、認証、および不具合の調査のためにのみ利用します。
          広告配信や第三者への販売は行いません。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">3. 保管とアクセス制御</h2>
        <p>
          登録データは Supabase Inc. が提供するデータベースに保管されます。
          行単位のアクセス制御により、各利用者は自身が登録したデータのみを参照できます。
          運営者は、障害調査等の必要がある場合に限りデータベースにアクセスすることがあります。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">4. 外部サービスへの提供</h2>
        <p className="mb-2">本サービスは、機能の実現のため以下の外部サービスを利用します。</p>
        <ul className="list-inside list-disc space-y-1">
          <li>
            <span className="font-medium">Google Maps Platform</span>
            ：地図の表示、店舗の検索・詳細情報の取得
          </li>
          <li>
            <span className="font-medium">Google Gemini API</span>
            ：アップロードされた画像からの店名抽出
          </li>
          <li>
            <span className="font-medium">Supabase</span>：認証およびデータの保管
          </li>
          <li>
            <span className="font-medium">Vercel</span>：アプリケーションの配信
          </li>
        </ul>
        <p className="mt-2">
          各サービスにおける取り扱いは、それぞれの提供者のプライバシーポリシーに従います。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">5. 位置情報について</h2>
        <p>
          「現在地」機能は、端末の位置情報を利用します。利用には端末側での許可が必要であり、
          取得した位置は地図の表示と距離の計算にのみ使用し、サーバーに送信・保存しません。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">6. Cookie等の利用</h2>
        <p>
          ログイン状態の保持のため、認証情報をブラウザに保存します。
          解析目的の Cookie や広告目的のトラッキングは使用していません。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">7. データの削除</h2>
        <p>
          登録した店舗は、アプリ内でいつでも削除できます。
          アカウントおよび全データの削除を希望する場合は、下記の連絡先までご連絡ください。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">8. お問い合わせ</h2>
        <p>
          本ポリシーに関するお問い合わせは、
          <span className="font-medium">secure.ops.hi@gmail.com</span>
          までお願いします。
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-bold">9. 改定</h2>
        <p>
          本ポリシーの内容は、必要に応じて変更されることがあります。
          変更後の内容は、本ページに掲載した時点から適用されます。
        </p>
      </section>

      <p className="mt-10">
        <a href="/" className="text-blue-600 underline">
          ← アプリに戻る
        </a>
      </p>
    </main>
  );
}
