# 料理レシピ提案アプリ — 開発仕様

家庭用。手持ち食材からレシピを提案してもらい、気に入ったものを保存・評価する。

---

## 1. 解決したい課題

現状は毎回チャットAIに食材を手打ちしている。これが面倒。

- 食材入力を GUI のタップ操作に置き換える（主目的）
- 良かったレシピを保存する
- 作った結果を評価して記録する

## 2. 前提と制約

- 使用者は2人（本人と妻）。それぞれの iPhone にインストールして使う。ユーザー管理はせず、データは端末ごとに独立する
- 相手の端末に保存レシピを渡したいときは JSON のエクスポート / インポートで行う。常時同期はしない
- 利用シーンはキッチン。iPhone を片手で操作する
- 開発者は中国在住、半年以内に日本へ帰国予定
- 中国からは generativelanguage.googleapis.com に直接到達できない。提案を出すときは iPhone 側で VPN を有効にする
- サーバは持たない。アプリは静的ホスティングから配信し、データは端末内、LLM はクラウド API を直接呼ぶ
- 保険として、任意の OpenAI 互換エンドポイント（例: MacBook 上の Ollama）を設定画面から接続できるようにしておく。既定ではない

## 3. 技術構成

```
iPhone (PWA)  ← GitHub Pages から配信（HTTPS）
  ├─ IndexedDB (Dexie)  唯一のデータストア。source of truth
  └─ inference adapter（OpenAI 互換 chat completions を fetch で直接呼ぶ）
       ├─ gemini  https://generativelanguage.googleapis.com/v1beta/openai/  （既定）
       └─ custom  任意の OpenAI 互換エンドポイント
                  例: Mac 上の Ollama を tailscale serve で HTTPS 公開したもの
```

- フロント: Vite + React + TypeScript。PWA は vite-plugin-pwa
- データ: Dexie（IndexedDB）。サーバも同期もない
- LLM: SDK は使わない。OpenAI 互換の `POST {baseURL}/chat/completions` を fetch で叩く。provider ごとの分岐コードを書かない
- 配信: GitHub Pages。GitHub Actions で `vite build` して公開する。Vite の `base` はリポジトリ名に合わせる
- 開発時は `vite --host` を Mac で起動し、同一 LAN か Tailscale の IP で iPhone から確認する。Service Worker とホーム画面追加の確認は GitHub Pages 上で行う

### 認証

不要。API キーは各端末の設定画面で入力し、その端末の IndexedDB にのみ保存する。2台で同じキーを使ってよい。配信される HTML やバンドルに秘密は含めない。Google Cloud 側でキーに HTTP リファラ制限（配信ドメイン）をかける。

### オフライン

- 提案（LLM 呼び出し）はオンライン必須
- それ以外（保存済みレシピの閲覧、評価、設定）はすべて端末内で完結するので offline で動く
- Service Worker はアプリシェルをキャッシュするだけ。データは IndexedDB にあるので別途キャッシュしない

### バックアップ

- 設定画面に「エクスポート」「インポート」を置く
- エクスポートは全ストアを1つの JSON にまとめ、Web Share API（`navigator.share` に File を渡す）で「ファイル」アプリ等に保存する。API キーは含めない
- インポートは `<input type="file">` で JSON を読み、確認ダイアログの後に全ストアを置き換える。マージはしない
- 機種変更と Safari のデータ削除に備える用途。月1回程度の手動運用で足りる
- もう1台の端末にレシピを渡す用途にも使う。インポートは全置換なので、渡す側のデータで受け側が上書きされる点に注意

---

## 4. 非目標 — 実装しないこと

以下は検討した上で意図的に外している。良かれと思って追加しないこと。

| 項目 | 外した理由 |
|---|---|
| 在庫管理（数量・賞味期限） | 買い物と調理のたびに更新義務が発生し、必ず現実とズレて信用できなくなる。冷蔵庫を目視しながら操作する前提なので、その場のチェックリストで足りる |
| 好みの自動学習 / プロフィール要約 | 「本場のイタリアンを作りたい」ときに自分好みに丸められるのが困る。しかも丸められたことに気づけない。LLM 生成の要約は内容が不透明でデバッグ不能 |
| 評価データのプロンプト注入 | 上と同じ理由。ratings は本人が見るための記録であり、LLM には渡さない |
| 各画面の戻るボタン | iOS のスワイプバックと history API で足りる。縦幅の無駄 |
| 提案直後の評価入力 | 提案時点ではまだ作っていない。評価導線は「作った」ボタン直後と保存レシピ一覧の未評価バッジの2つ |
| 認証・ユーザー管理 | 家庭内の2台で完結する。API キーは各端末で入力し、端末内にしかない |
| サーバ / 端末間同期 / クラウド DB | 各端末で完結する。バックアップと端末間の受け渡しは JSON の手動エクスポート / インポートで足りる |
| 買い物リスト / 献立カレンダー / 栄養計算 / レシピ画像生成 | Phase 2 以降。初回スコープには入れない |

制約と嗜好は別物である点に注意。苦手な食材・調理時間の上限といった「制約」は `settings.constraints_text` に本人が手で書き、常時プロンプトに注入する。これは LLM 生成しない。

---

## 5. 画面構成

タブは3つ。

```
提案タブ ──→ 食材選択 ──→ 提案結果 ──┐
                                    ├─→ レシピ詳細 ──→ 評価シート
保存タブ ──→ 保存レシピ一覧 ─────────┘
設定タブ ──→ 設定
```

### 食材選択（提案タブのホーム）

上から順に:

1. モード切替セグメント（食材から / 料理名から）
2. 選択済み食材のチップ帯。右端に「全解除」ボタン。空のときは代わりに「前回の選択を復元」ボタンを出す
   - チップ帯の末尾に「自由入力」チップを1つ置く。タップでテキスト入力が開き、リストにない食材を1行で追加できる。入力した食材は ingredients ストアには入れず、プロンプトにだけ渡す
3. カテゴリタブ（横スクロール）
4. 食材グリッド 1行3列。タップでトグル
5. 下部固定ボタン「提案してもらう」

- カテゴリタブの先頭は仮想カテゴリ「よく使う」。ストアを持たず `use_count` 降順の上位12件
- 初回起動時は use_count が全て0なので、そのときだけ「野菜」を初期表示にする
- 下部固定ボタンは必須。上部に置くと片手操作で親指が届かない
- 選択状態はクライアントがアプリを閉じるまでメモリに保持する。提案結果から戻ったときは送信時と同じ選択が表示されていること（1品足して再提案する流れが最頻出のため）
- 「料理名から」に切り替えた場合、3〜4（カテゴリタブと食材グリッド）が料理名の入力欄1つに差し替わる。チップ帯（2）は両モード共通で残り、選択済み食材はそのまま送る。これにより料理名モードでも missing_ingredients が「買い足すもの」として正しく出る

### 提案結果

- レシピカード3枚を縦積み
- 各カードにタイトル / 調理時間 / missing_ingredients のバッジ
- 下部に「別の案を出す」。同じ入力に、直前に表示した3件のタイトルを除外リストとして添えて再送する（同じ案を返しがちなため）。use_count はこのボタンでは加算しない
- 使用した engine と model を小さく表示する
- 生成中は経過秒数つきのローディング表示を出す

### レシピ詳細

- 材料と手順
- 右上に保存アイコン。保存済みの場合は「作った」ボタンに変わり、押すと cooked_count を +1 し、そのまま評価シートを開く（スキップ可）
- 保存済みの場合はメニューから削除できる。削除は recipes と対応する ratings を同一トランザクションで消す
- `settings.keep_awake = true` のとき、この画面を開いている間は Screen Wake Lock を取得して画面スリープを防ぐ。画面を離れたら解放する

### 評価シート

- bottom sheet で開く。入口は「作った」ボタン直後と、保存レシピ一覧の未評価バッジの2つ
- 味（また食べたいか）と 手間（また作りたいか）の2軸。各5段階のセグメント。スライダーは使わない
- メモは任意の1行

### 保存レシピ一覧

- 評価順ソート
- cooked_count > 0 かつ未評価のレシピに未評価バッジを表示する。これが評価入力への主導線

### 設定

- engine 切替（gemini / custom）と、それぞれの接続情報
  - gemini: API キー、モデル名
  - custom: baseURL、モデル名、API キー（Ollama なら任意の文字列）
- 人数（servings）。1〜6 のセグメント。既定2
- constraints_text の編集（自由記述）
- 画面スリープ防止（keep_awake）の ON/OFF
- 常備調味料の ON/OFF
- バックアップ: エクスポート / インポート

---

## 6. データモデル（Dexie ストア）

```ts
ingredients  { id, name, category, sort_order, use_count, is_active }
             // index: ++id, &name, category
seasonings   { id, name, enabled }
             // index: ++id, &name
recipes      { id, title, ingredients: {name, amount}[], steps: string[],
               time_min, missing_ingredients: string[], engine, model, created_at }
             // index: ++id, created_at
ratings      { recipe_id, taste_score, effort_score, cooked_count, note, updated_at }
             // index: &recipe_id
settings     { id: 1,
               engine: "gemini" | "custom",
               gemini: { apiKey, model },
               custom: { baseURL, model, apiKey },
               servings, keep_awake, constraints_text,
               last_selection: number[] }
             // index: id
```

- 型は `src/db/schema.ts` に置き、ストア定義とアプリ全体で共有する
- SQL の JSON 文字列カラムは使わず、配列・オブジェクトをそのまま保存する

### 運用ルール

- `settings.last_selection` は「前回提案したときの選択」。提案実行時に上書きする。在庫ではない
- 画面上の選択状態と直近の提案結果はメモリと sessionStorage に持つ。提案結果から戻っても、Service Worker の更新で再読込されても消えない。アプリを閉じると消え、次回は「前回の選択を復元」で戻せる
- 自由入力の食材はどのストアにも保存しない。その提案リクエストにだけ含める
- use_count は「提案してもらう」を押したタイミングでのみ加算する。選択のトグルでは加算しない（試行錯誤でカウントが汚れるため）
- 食材の非表示は `is_active = false`。削除はしない（use_count の履歴を壊さないため）
- 地域別（日本 / 中国）のカラムは持たない。使わない食材は use_count が伸びず自然に沈む

### 初期データ

`src/db/seed-ingredients.ts` を参照。食材131品目・調味料35種。配列の並び順がそのまま sort_order になるので、insert 時にインデックスを振る。初回起動時にストアが空であれば投入する。

粒度のルール:

- 肉は部位まで分ける（豚バラと豚こまで作れる料理が違う）
- 野菜は品目単位で止める（量の概念がないため細分化しても無意味）
- 加工品は形状まで分ける（豆腐 / 厚揚げ / 油揚げは別物）

---

## 7. LLM 呼び出し仕様

### adapter

```ts
type Engine = { baseURL: string; model: string; apiKey: string; extra?: string };
// extra: リクエスト本文にそのままマージする追加パラメータ（JSON 文字列）。
//   Qwen3 系は thinking が既定 ON で 90 秒近くかかるので `{"enable_thinking":false}`、
//   Gemini は `{"reasoning_effort":"low"}` を既定にする。provider 分岐はこの設定値で吸収する

// 既定 (gemini)
//   baseURL: "https://generativelanguage.googleapis.com/v1beta/openai"
//   model:   設定画面で入力。既定値は実装時点の Gemini Flash 系の最新を入れる
//   apiKey:  設定画面で入力
//
// custom の例 (Mac 上の Ollama を tailscale serve で公開した場合)
//   baseURL: "https://<mac名>.<tailnet>.ts.net/v1"
//   model:   "qwen3.6:35b-a3b"
//   apiKey:  "ollama"

// POST `${baseURL}/chat/completions`
//   headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }
//   body:    { ...JSON.parse(extra), model, messages, response_format: { type: "json_schema", json_schema: {...} } }
```

engine の違いは設定値の差だけで吸収する。分岐コードを書かない。

実装時に最初に確認すること:

- Gemini の OpenAI 互換エンドポイントがブラウザからの直接呼び出し（CORS）を通すこと
- `response_format: json_schema` が Gemini で期待どおり効くこと

custom で Ollama を繋ぐ場合の Mac 側の準備（必要になったときだけ行う）:

- `OLLAMA_ORIGINS` に配信ドメイン（`https://<user>.github.io`）を含める
- `tailscale serve --bg --https=443 http://localhost:11434` で HTTPS 化する。PWA は HTTPS 配信なので http のエンドポイントは mixed content で呼べない
- Qwen3 系は thinking を無効にしないと structured output の前に無駄なトークンを消費する。OpenAI 互換経路で無効化できるかを試す

### 出力スキーマ

structured outputs（JSON schema 指定）を必ず使う。

```json
{
  "recipes": [
    {
      "title": "string",
      "time_min": 0,
      "ingredients": [{ "name": "string", "amount": "string" }],
      "missing_ingredients": ["string"],
      "steps": ["string"]
    }
  ]
}
```

recipes は3件。missing_ingredients は選択食材にも常備調味料にも含まれないものを列挙させる。

steps は「料理初心者がそのまま作れる詳しさ」を指示する。切り方・火加減・加熱時間・入れる順番・仕上がりの目安を各手順に含め、下ごしらえは独立した手順にする。5〜8 手順が目安。簡潔さを優先させると手順が雑になるので、短くする指示は書かない。

パースに失敗した場合は1回だけリトライし、それでも失敗したら生テキストを表示するフォールバックに落とす。

### プロンプトに入れるもの

- 選択された食材（自由入力の食材を含む）
- enabled = true の調味料（常時注入。チェックリスト UI には出さない）
- settings.servings（人数。分量の基準）
- settings.constraints_text
- モード（食材から / 料理名から）と、料理名モードの場合はその料理名
- 「別の案を出す」のときのみ、直前に表示したタイトル3件の除外リスト

入れないもの: 過去のレシピ、評価データ、好みの要約。除外リストはそのセッションの直前結果に限り、保存済みレシピは参照しない。

custom でローカルの小型モデルを繋ぐ場合もあるので、コンテキストは短く保つこと。

---

## 8. 実装順

1. プロジェクト雛形（Vite + React + TypeScript + vite-plugin-pwa）と GitHub Pages への配信。iPhone でホーム画面に追加でき、スタンドアロン起動することを最初に確認する。ここが通らないと PWA の前提が崩れたまま実装が進んでしまう
2. Dexie のスキーマと seed 投入
3. 食材選択画面
4. inference adapter と提案結果画面。Gemini の CORS と structured outputs の確認をこの段階の最初に行う
5. レシピ保存・レシピ詳細・削除
6. 評価シート、保存一覧、未評価バッジ
7. 設定画面（engine と接続情報、人数、制約、keep_awake、調味料、エクスポート / インポート）
8. Screen Wake Lock と PWA の仕上げ（manifest、アイコン、オフライン時のアプリシェル）

### PWA の注意点

- iOS では HTTPS（secure context）でないと Service Worker を登録できない。GitHub Pages は HTTPS なのでこの条件を満たす。開発中の `vite --host` の http 接続ではホーム画面追加しても単なるブックマークになる
- Screen Wake Lock API は iOS 16.4 以降で PWA からも使える。バックグラウンドに回ると自動解放されるので、visibilitychange で再取得する
- IndexedDB はホーム画面に追加した PWA では消えにくいが、保証はない。バックアップ導線を必ず用意する

---

## 9. 完了条件

- iPhone のホーム画面から起動できる
- 冷蔵庫を見ながら10タップ以内で提案が出せる
- Mac を起動していなくても、iPhone 単体（VPN あり）で Gemini による提案が完結する
- 保存したレシピが機内モードでも閲覧できる
- エクスポートした JSON をインポートして、保存レシピと評価が復元できる
- 実際に晩ご飯を1食作れる
