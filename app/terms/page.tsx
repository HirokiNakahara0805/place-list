export const metadata = { title: '利用規約 | 行きたいお店リスト' };

export default function Terms() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-sm leading-relaxed text-gray-800">
      <h1 className="mb-1 text-xl font-bold">利用規約</h1>
      <p className="mb-8 text-xs text-gray-500">最終更新日: 2026年7月27日</p>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">第1条（適用）</h2>
        <p>
          本規約は、個人が運営するウェブサービス「行きたいお店リスト」（以下「本サービス」）の
          利用条件を定めるものです。利用者は、本サービスを利用することで本規約に同意したものとみなします。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">第2条（サービス内容）</h2>
        <p>
          本サービスは、利用者が気になった飲食店等を地図上に記録・管理するための個人開発ツールです。
          無償で提供され、予告なく内容の変更・提供の中断・終了を行う場合があります。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">第3条（アカウント）</h2>
        <p>
          本サービスの利用にはメールアドレスによる認証が必要です。
          利用者は、自身のメールアドレスおよび認証コードの管理について責任を負うものとします。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">第4条（禁止事項）</h2>
        <p className="mb-2">利用者は、次の行為を行ってはなりません。</p>
        <ul className="list-inside list-disc space-y-1">
          <li>法令または公序良俗に違反する行為</li>
          <li>本サービスの運営を妨害する行為、過度な負荷をかける行為</li>
          <li>自動化された手段による大量アクセス</li>
          <li>他者になりすます行為、他者の権利を侵害する行為</li>
          <li>本サービスを通じて取得した情報の無断での商業利用</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">第5条（外部サービスの利用）</h2>
        <p>
          本サービスは、地図および店舗情報の表示に Google Maps Platform を利用しています。
          利用者は本サービスの利用にあたり、
          <a
            href="https://policies.google.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            Google 利用規約
          </a>
          にも同意するものとします。
          また、画像からの文字認識に Google の生成AIサービスを利用しています。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">第6条（免責事項）</h2>
        <p>
          本サービスは現状有姿で提供され、正確性・完全性・有用性および特定目的への適合性について
          いかなる保証も行いません。店舗情報は外部サービスから取得したものであり、
          実際の営業状況等と異なる場合があります。
        </p>
        <p className="mt-2">
          運営者は、本サービスの利用または利用不能により利用者に生じた損害、
          データの消失、外部サービスの仕様変更・提供終了に起因する不具合について、
          一切の責任を負いません。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">第7条（利用の停止）</h2>
        <p>
          運営者は、利用者が本規約に違反したと判断した場合、
          事前の通知なく当該利用者の利用を停止し、またはデータを削除することができます。
        </p>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 font-bold">第8条（規約の変更）</h2>
        <p>
          運営者は、必要と判断した場合、利用者への個別の通知なく本規約を変更できるものとします。
          変更後の規約は、本ページに掲載した時点から効力を生じます。
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-bold">第9条（準拠法・管轄）</h2>
        <p>
          本規約は日本法に準拠し、本サービスに関して紛争が生じた場合、
          運営者の住所地を管轄する裁判所を専属的合意管轄とします。
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
