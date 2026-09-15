# 進捗記録

最終更新: 2026-09-15

## 現在の状態

- アプリは公開済み: https://kekekeopopop-hue.github.io/reizoko-recipe/
- リポジトリ: https://github.com/kekekeopopop-hue/reizoko-recipe（パブリック）。main に push すると GitHub Actions が自動で再デプロイする
- 実装は CLAUDE.md の実装順 1〜8 まで完了。ヘッドレス Chrome とモック LLM で一連の流れ（20項目）を検証済み
- 残っているのは実機（iPhone）での確認と、LLM プロバイダの接続

## 決めたこと（Opus との元案からの変更点）

| 項目 | 元案 | 現在 |
|---|---|---|
| 構成 | Mac 上の Hono + SQLite + Ollama、tailscale serve で公開 | サーバなし。GitHub Pages の静的 PWA、データは IndexedDB、LLM はブラウザから直接呼ぶ |
| LLM 既定 | Ollama (qwen3:35b-a3b) | Gemini (gemini-3.8-flash)。ただし中国からは使えないので下記参照 |
| 保険 | Gemini 切替 | 任意の OpenAI 互換エンドポイント（設定画面の「カスタム」）。Ollama もここから繋げる |
| 使用者 | 1人 | 2人（本人と妻）。端末ごとに独立、同期なし。JSON エクスポート / インポートで受け渡し |
| 追加 | なし | 人数設定、画面スリープ防止（設定で ON/OFF）、全解除、自由入力食材、別の案で除外リスト、作った直後に評価シート、レシピ削除 |
| seed | 食材118・調味料28 | 食材131・調味料35（だし系、ポン酢、いんげん、かつお節など追加） |

## LLM プロバイダの調査結果（2026-09-15、Mac から実測）

| プロバイダ | 中国から到達 | CORS | 備考 |
|---|---|---|---|
| Gemini | VPN 必須。VPN 経由でも「User location is not supported」で拒否された | 可 | 帰国後に使う |
| Qwen (Alibaba 百炼) | 可 | 可 | 推奨。qwen3.8-flash。JSON スキーマ出力対応（北京リージョン） |
| DeepSeek | 可 | 可 | 次点。deepseek-flash。メール登録だけで使える |
| Kimi (Moonshot) | 可 | 可 | 予備 |
| OpenAI | 不可 | 未確認 | 中国から接続不能 |

アプリ側は JSON スキーマ出力に非対応のプロバイダでも動くよう、json_schema → json_object → 指定なし の順に自動で切り替える。設定画面のカスタムにプリセットボタンあり。

## ユーザー側の次の作業

1. 阿里云百炼コンソール https://bailian.console.aliyun.com/ で API キーを作る
   - 右上の地域が「华北2（北京）」であることを確認
   - 左メニューの「API-KEY」→「创建 API Key」→ 一覧の「查看」で `sk-...` をコピー
2. アプリの設定タブ → 「カスタム (OpenAI互換)」→ プリセット「Qwen (Alibaba 中国)」→ API キー貼り付け → 「接続テスト」
   - モデル一覧に qwen3.8-flash が出れば成功
3. iPhone の Safari で URL を開き「ホーム画面に追加」。妻の iPhone でも同様
4. 実際に提案を出して、JSON として読めるか、画面スリープ防止が効くかを確認
5. うまくいかない場合は設定画面の下に出るエラー文をそのまま Claude に貼る

## 実装メモ

- 選択状態と直近の提案結果は sessionStorage にも保存している（Service Worker 更新時の再読込対策）
- API キーはエクスポートに含めない。インポートは全置換
- 開発時の動作確認: `npm run dev` で Mac 上に起動し、同一 LAN の iPhone から http で見る。PWA の確認は公開 URL で行う
- e2e スクリプトは Claude のセッション用一時ディレクトリにあり、リポジトリには入れていない。必要なら再作成する（Playwright + Chrome、モック LLM サーバ）

## 未着手・保留

- Qwen / DeepSeek の実 API で JSON が想定どおり返るかは未検証（モックでのみ検証）
- （対応済み 2026-09-15）Qwen 3.x の thinking が既定 ON で約 90 秒かかっていた。設定の「追加パラメータ」に `{"enable_thinking":false}` を送るようにした。プリセットを押すと自動で入る。既存端末は起動時に補完される
- （対応済み 2026-09-15）手順が雑だった。プロンプトの「各1〜2文で簡潔に」をやめ、切り方・火加減・時間・順番・仕上がりの目安を各手順に含めるよう指示。出力トークンは増えるので、thinking OFF と合わせて実測で確認する
- 帰国後に Gemini へ戻すときは設定で切り替えるだけ
