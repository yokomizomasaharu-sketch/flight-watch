/* ============================================================
   フライトウォッチ  監視データフィード  (flight_data.js)
   ------------------------------------------------------------
   このファイルは「エージェント（ももか）が更新する側」のデータで、
   公開しても問題のないセール・おすすめ便だけを置きます。
   （個人の予約・メモ・会員番号・パスポート等は一切含みません。
     個人に紐づく初期データは別ファイルに分けてあります）

   ■ 定期監視アクションからの更新手順
     1) 下の deals 配列に新しいオブジェクトを push（id は重複しない英数字）
     2) updatedAt を書き換える（ISO 8601・+09:00）
     3) addedAt に「今回の検出日」を入れると、画面で NEW バッジが付く
   ■ 必須キー: id / airline / title / kind / area / start / end
     kind    : 'sale'（セール・キャンペーン） | 'fare'（おすすめ便・実運賃）
     area    : 'taiwan' | 'asia' | 'europe' | 'domestic' | 'other'
     product : 'flight'（航空券・既定） | 'hotel' | 'package'（航空券＋ホテル）
   ■ 任意キー: priceMain / priceSub / travel / code / codeNote / conditions[] /
     tags[] / url / urlLabel / fitAirports[] / note / addedAt
   ============================================================ */
window.FLIGHT_WATCH_DATA = {
  version: '2026-11-18a',
  updatedAt: '2026-11-17T19:00:00+09:00',
  // 前回更新から新しく検出した deal の id（画面で NEW バッジが付きます）
  newIds: ['airasia-thailand-2026', 'jal-bf-2026', 'peach-kix-tpe'],

  deals: [
    {
      id: 'jal-bf-2026',
      airline: 'JAL',
      color: '#c0002c',
      title: 'JALunLun BLACK FLYDAY（JMB会員先行は11/17 0:00〜）',
      kind: 'sale',
      product: 'flight',
      area: 'other',
      start: '2026-11-17T00:00:00+09:00',
      end: '2026-11-30T23:59:00+09:00',
      travel: '搭乗 2027-01-04〜2027-02-28（国内線セール運賃）',
      priceMain: '羽田−伊丹 片道 9,460円〜',
      priceSub: '国際線は海外DP最大5万円オフクーポン',
      code: '',
      conditions: [
        'JMB会員先行：2026-11-17 00:00〜23:59（新規予約は23:29まで）',
        '一般販売は11-18から',
        '当日中の決済が必須（コンビニ払い不可・普通席のみ・要9桁JMB番号）',
        '国際線タイムセールは11-18〜11-30',
        '仮想待合室が23:30頃から開くことがある（30分制限）'
      ],
      tags: ['国内線', 'JMB先行', '国際線あり'],
      fitAirports: ['KIX', 'ITM', 'HND', 'NRT'],
      url: 'https://www.jal.co.jp/jp/ja/',
      urlLabel: 'JAL公式サイト（運賃検索）',
      note: '国内線は羽田−伊丹が本命。国際線タイムセールは11-18スタートなので、両方を別々に確認したい。',
      addedAt: '2026-11-16'
    },
    {
      id: 'jetstar-bf-2026',
      airline: 'ジェットスター',
      color: '#ff530d',
      title: 'ブラックフライデー（関空⇄台北）',
      kind: 'sale',
      product: 'flight',
      area: 'taiwan',
      start: '2026-11-20T12:00:00+09:00',
      end: '2026-11-26T16:59:00+09:00',
      travel: '搭乗 2026-12-06〜2027-03-24',
      priceMain: '片道 8,696円〜',
      priceSub: 'アジア線は片道7,696円〜・燃油サーチャージ不要',
      code: '',
      conditions: [
        'セール開始 2026-11-20 12:00（先着・売切れ次第終了）',
        '対象搭乗期間：2026-12-06〜2027-03-24',
        '片道・諸税込みの表示額（受託手荷物は別）',
        '関空発の台北線が本命。朝発・夜帰国なら2泊3日が組みやすい'
      ],
      tags: ['台湾', '関空発', 'LCC', '朝発夜帰国向き'],
      fitAirports: ['KIX'],
      url: 'https://www.jetstar.com/jp/ja/home',
      urlLabel: 'ジェットスター公式（運賃検索）',
      note: '関空⇄台北の2泊3日なら、この路線が最安候補。開始時刻に合わせてアクセスしたい。',
      addedAt: '2026-11-14'
    },
    {
      id: 'cx-bf-2026',
      airline: 'キャセイパシフィック',
      color: '#00645a',
      title: 'ブラックフライデー エコノミー15%OFF',
      kind: 'sale',
      product: 'flight',
      area: 'taiwan',
      start: '2026-11-16T12:00:00+09:00',
      end: '2026-11-30T23:59:00+09:00',
      travel: '対象出発 〜2027-05-31',
      priceMain: '台北・高雄・香港など 15%OFF',
      priceSub: '割引上限8,000円（長距離は12,000円）',
      code: 'JPCXBFSB',
      codeNote: '長距離（ヨーロッパ等）用は JPCXBFLB（上限12,000円・先着450名）',
      conditions: [
        '近・中距離（台北・高雄・台中・香港など）15%OFF・上限8,000円・先着750名',
        '長距離（ヨーロッパ等）15%OFF・上限12,000円・先着450名',
        '対象出発：2027-05-31まで',
        'クーポンコードは予約時に必ず入力（先着枠が埋まると終了）'
      ],
      tags: ['台湾', '香港', 'ヨーロッパ', 'コードあり'],
      fitAirports: ['KIX', 'ITM', 'HND', 'NRT'],
      url: 'https://flights.cathaypacific.com/ja_JP/offers/black-friday.html',
      urlLabel: 'キャセイ公式 ブラックフライデー',
      note: '台北・高雄行きのFSCでは最有力。関空発も対象。',
      addedAt: '2026-11-16'
    },
    {
      id: 'ana-bf-2026',
      airline: 'ANA',
      color: '#13448f',
      title: 'ANA BLACK FRIDAY（11/20 0:00〜・減額マイル）',
      kind: 'sale',
      product: 'flight',
      area: 'domestic',
      start: '2026-11-20T00:00:00+09:00',
      end: '2026-11-30T23:59:00+09:00',
      travel: '国内線 搭乗 2027-01-07〜2027-02-28／国際線 アジア 2027-01-11〜06-30・欧州 2027-01-11〜02-28',
      priceMain: '国内線 全路線 減額マイル',
      priceSub: '海外ツアー最大150,000円OFFクーポン',
      code: '',
      conditions: [
        '特典航空券の「減額マイルキャンペーン」（国際線36路線＋国内線全路線）',
        '詳細は11-20 10:00に公開予定',
        '11-28〜30は「ANAにキュン！」拡大版を同時開催'
      ],
      tags: ['国内線', 'マイル', 'ツアー'],
      fitAirports: ['KIX', 'ITM', 'HND', 'NRT'],
      url: 'https://www.ana.co.jp/ja/jp/',
      urlLabel: 'ANA公式サイト',
      note: 'マイルが余っているなら国内線が実質無料に近づく。11/20 10:00の詳細公開を待つ。',
      addedAt: '2026-11-16'
    },
    {
      id: 'tway-bf-2026',
      airline: 'トリニティ航空（旧ティーウェイ）',
      color: '#d6001c',
      title: '国際線ブラックフライデー（11/16〜11/30）',
      kind: 'sale',
      product: 'flight',
      area: 'asia',
      start: '2026-11-16T00:00:00+09:00',
      end: '2026-11-30T23:59:00+09:00',
      travel: '対象出発 2027-02-01〜2027-10-30',
      priceMain: '最大 40,000ウォン割引',
      priceSub: '決済額に応じたクーポン',
      code: 'NOV26',
      conditions: [
        '東南アジア・豪州・米州・欧州が対象',
        '対象出発：2027-02-01〜2027-10-30',
        '割引額は決済金額に応じて変動'
      ],
      tags: ['韓国', 'アジア', 'コードあり'],
      fitAirports: ['KIX', 'NRT', 'HND'],
      url: 'https://www.twayair.com/',
      urlLabel: 'トリニティ航空公式サイト',
      note: 'ソウル線は対象外の可能性があるため、予約画面でコード適用可否を確認。',
      addedAt: '2026-11-16'
    },
    {
      id: 'tripcom-bf-2026',
      airline: 'Trip.com',
      color: '#287dfa',
      title: 'BLACK FRIDAY フラッシュセール',
      kind: 'sale',
      product: 'package',
      area: 'other',
      start: '2026-11-16T00:00:00+09:00',
      end: '2026-11-30T23:59:00+09:00',
      travel: '日程は各商品による',
      priceMain: '航空券・ホテル・航空券＋ホテル',
      priceSub: '先着決済順のフラッシュセール',
      code: '',
      conditions: [
        'フラッシュセールは先着決済順',
        '航空券単体より「航空券＋ホテル」の方が安いことがある',
        '表示額は手数料込みか必ず確認'
      ],
      tags: ['OTA', 'ホテル', '先着決済順'],
      fitAirports: ['KIX', 'ITM', 'HND', 'NRT'],
      url: 'https://jp.trip.com/flights/',
      urlLabel: 'Trip.com 航空券',
      note: 'アプリ版の方がクーポンが出ることがある。ホテル単体・パックも同じ画面から探せる。',
      addedAt: '2026-11-16'
    },
    {
      id: 'his-bf-2026',
      airline: 'HIS',
      color: '#e4007f',
      title: 'BLACK FRIDAY 2026（海外航空券クーポン最大1万円）',
      kind: 'sale',
      product: 'flight',
      area: 'other',
      start: '2026-11-11T10:00:00+09:00',
      end: '2026-12-06T23:59:00+09:00',
      travel: '各商品による',
      priceMain: '1グループ最大 10,000円引き',
      priceSub: '台湾4日間 24,800円〜（首都圏発例）',
      code: '',
      conditions: [
        '海外航空券クーポンの配布は〜11-24 10:00',
        '11-18 11:00に「海外航空券＋ホテル」追加弾',
        '11-27 11:00に4月以降出発ツアーを発売予定'
      ],
      tags: ['OTA', 'ツアー', 'パック', '追加弾あり'],
      fitAirports: ['KIX', 'ITM', 'HND', 'NRT'],
      url: 'https://www.his-j.com/',
      urlLabel: 'HIS公式サイト',
      note: '追加弾の11-18 11:00と11-27 11:00は要チェック。',
      addedAt: '2026-11-16'
    },
    {
      id: 'newt-bf-2026',
      airline: 'NEWT',
      color: '#0f9d58',
      title: 'BLACK FRIDAY 海外ツアー最大50%OFF',
      kind: 'sale',
      product: 'package',
      area: 'other',
      start: '2026-11-14T12:00:00+09:00',
      end: '2026-11-28T11:59:00+09:00',
      travel: '各商品による',
      priceMain: '関空発ソウル3〜5日間 29,800円〜',
      priceSub: '台北4日間29,800円〜／ソウル3日間19,800円〜',
      code: '',
      conditions: [
        'クーポン利用で最大50%OFF',
        'ローマ5〜9日間129,800円〜、パリ5〜10日間159,800円〜',
        '人数・出発地で条件が変わるため検索条件を合わせて確認'
      ],
      tags: ['OTA', 'ツアー', 'パック', '関空発'],
      fitAirports: ['KIX'],
      url: 'https://www.newt.net/',
      urlLabel: 'NEWT公式サイト',
      note: 'ツアーは航空券＋ホテルがセットなので、2泊3日の台湾なら総額で比較したい。',
      addedAt: '2026-11-16'
    },
    {
      id: 'malaysia-bf-2026',
      airline: 'マレーシア航空',
      color: '#003a70',
      title: 'ブラックフライデー 東南アジア路線',
      kind: 'sale',
      product: 'flight',
      area: 'asia',
      start: '2026-11-10T00:00:00+09:00',
      end: '2026-11-27T23:59:00+09:00',
      travel: '対象出発 〜2027-10-31',
      priceMain: '往復 61,420円〜',
      priceSub: 'クアラルンプール経由',
      code: '',
      conditions: [
        '対象出発：2027-10-31まで',
        '経由便のため所要時間は長め'
      ],
      tags: ['アジア', 'FSC'],
      fitAirports: ['KIX', 'NRT'],
      url: 'https://www.malaysiaairlines.com/jp/ja.html',
      urlLabel: 'マレーシア航空公式サイト',
      note: '台湾より東南アジア向け。乗継を楽しむ使い方に向く。',
      addedAt: '2026-11-16'
    },
    {
      id: 'klm-deal-2026',
      airline: 'KLM',
      color: '#00a1de',
      title: 'リアルディールデイズ（関西〜アムステルダム）',
      kind: 'sale',
      product: 'flight',
      area: 'europe',
      start: '2026-11-04T00:00:00+09:00',
      end: '2026-11-24T23:59:00+09:00',
      travel: '対象出発は予約画面による',
      priceMain: '往復 178,620円〜（諸税込）',
      priceSub: '乗継でヨーロッパ各都市へ延長できる',
      code: '',
      conditions: [
        '諸税込みの表示額',
        '乗継でヨーロッパ各都市へ延長できる'
      ],
      tags: ['ヨーロッパ'],
      fitAirports: ['KIX'],
      url: 'https://www.klm.co.jp/',
      urlLabel: 'KLM公式サイト',
      note: 'ヨーロッパは20万円前後が目安。10万円台が出たら破格。',
      addedAt: '2026-11-16'
    },
    {
      id: 'etihad-bf-2026',
      airline: 'エティハド航空',
      color: '#bd8b13',
      title: 'ブラックフライデー（詳細未発表）',
      kind: 'sale',
      product: 'flight',
      area: 'europe',
      start: '2026-11-22T00:00:00+09:00',
      end: '2026-11-29T23:59:00+09:00',
      travel: '未発表',
      priceMain: '詳細未発表',
      priceSub: 'アブダビ経由のヨーロッパ線',
      code: '',
      conditions: [
        '11-22〜11-29開催予定',
        '運賃・対象路線は発表待ち'
      ],
      tags: ['ヨーロッパ', '発表待ち'],
      fitAirports: ['KIX', 'NRT'],
      url: 'https://www.etihad.com/ja-jp/',
      urlLabel: 'エティハド航空公式サイト',
      note: '中東系は乗継で欧州が安くなることあり。発表後に追記する。',
      addedAt: '2026-11-16'
    },
    {
      id: 'peach-kix-tpe',
      airline: 'Peach',
      color: '#e6007e',
      title: '関空⇄台北・ソウル線（LCC定番）',
      kind: 'fare',
      product: 'flight',
      area: 'taiwan',
      start: '2026-11-17T00:00:00+09:00',
      end: '2026-12-31T23:59:00+09:00',
      travel: '毎日運航・時期により変動',
      priceMain: '片道 10,000円前後〜',
      priceSub: 'セール時は片道5,000円台も',
      code: '',
      conditions: [
        '手荷物は有料（受託20kg約3,000円）',
        '関空の第2ターミナル発着（保安検査・バス移動込みで時間に余裕を）',
        '深夜・早朝便が中心'
      ],
      tags: ['台湾', '韓国', '関空発', 'LCC'],
      fitAirports: ['KIX'],
      url: 'https://www.flypeach.com/',
      urlLabel: 'Peach公式サイト',
      note: '朝発・夜帰国の2泊3日が組みやすい。ジェットスターのセールと比較する。',
      addedAt: '2026-11-17'
    },
    {
      id: 'airasia-thailand-2026',
      airline: 'エアアジア',
      color: '#ff0000',
      title: 'タイランドセール（運賃最大15%OFF・バリューパック30%OFF）',
      kind: 'sale',
      product: 'flight',
      area: 'asia',
      start: '2026-11-16T00:00:00+09:00',
      end: '2026-11-29T23:59:00+09:00',
      travel: '搭乗 2026-11-16〜2027-01-17',
      priceMain: '運賃 最大15%OFF',
      priceSub: '受託手荷物込みバリューパックLITE 30%OFF',
      code: '',
      conditions: [
        '対象：タイ・エアアジア、タイ・エアアジアX（バンコク・プーケット・チェンマイ等）',
        'バリューパックLITE 30%割引は航空券予約時のみ適用',
        '対象搭乗期間は2027-01-17まで（一部対象外日あり）'
      ],
      tags: ['アジア', 'タイ', '関空発', 'LCC'],
      fitAirports: ['KIX', 'NRT', 'HND'],
      url: 'https://www.airasia.com/ja/jp',
      urlLabel: 'エアアジア公式サイト',
      note: '台湾・欧州に続く東南アジア候補として追加。',
      addedAt: '2026-11-17'
    }
  ],

  /* 初期予約：公開版はゼロ（予約・控えは開いた人の端末内にだけ保存されます）。 */
  trips: []
};
