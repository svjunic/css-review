---
name: css-verify
description: SASSやCSSを修正した後に最終的なスタイル変更が想定通りか検証するスキル。「CSS確認して」「スタイル変更を検証して」「/css-verify」「css変更を確認」「CSSの差分を見せて」などのフレーズが出た時に使用。プロジェクト内のスクリプトを使ってCSSの意味的差分を確認する（社内・開発環境向け）。
allowed-tools:
  - Bash
  - Read
---

# CSS 差分検証スキル（スクリプト版）

プロジェクト内の `bin/css-diff.js` を使い、CSSカスケードルールを踏まえた意味的差分で変更を検証するスキル。テキスト差分ではなく「最終的に有効なプロパティ値」レベルで比較するため、後勝ちルールや `!important` の影響も正確に把握できる。

## 前提条件

- Node.js 18.3.0 以上

> `<SKILL_DIR>` = このスキルが読み込まれた際に表示される `Base directory for this skill:` のパス。以降の手順でも同様に使用すること。

## 実行手順

### Step 1: 変更されたCSS/SCSS/SASSファイルを検出する

```bash
git diff --name-only HEAD -- '*.css' '*.scss' '*.sass'
```

変更ファイルが0件の場合は「検証対象なし（未コミットのCSS変更がありません）」と報告して終了。

> 変更ファイルが1件以上あった場合は、必ず Step 2 のスクリプトを実行すること。
> git diff のテキスト差分だけで変更内容を判断しないこと。

### Step 2: HTMLレポートを生成し、意味的差分を取得する

#### Step 2a: 各ファイルのHTMLレポートを生成する

変更された各ファイルを個別に比較し、HTMLレポートを `css-verify-report/` に出力する。
セレクタ順序の変更も検出するため `--order-risk` を常に付与する。

```bash
mkdir -p css-verify-report

for filepath in $(git diff --name-only HEAD -- '*.css' '*.scss' '*.sass' | sort); do
  git show HEAD:${filepath} > /tmp/css-verify-old-one.css 2>/dev/null || > /tmp/css-verify-old-one.css
  OUTPUT_HTML="css-verify-report/$(echo "$filepath" | sed 's|/|--|g').html"
  node <SKILL_DIR>/bin/css-diff.cjs \
    /tmp/css-verify-old-one.css ${filepath} \
    --format html --order-risk > "$OUTPUT_HTML" 2>&1 || true
  echo "HTMLレポート: $OUTPUT_HTML"
done
```

#### Step 2b: 全変更ファイルを連結してClaudeが読むための意味的差分を取得する

ファイルをまたぐセレクタ順序変化も検出するため、全体を連結して1回だけ比較する。

```bash
> /tmp/css-verify-old-full.css
> /tmp/css-verify-new-full.css

for filepath in $(git diff --name-only HEAD -- '*.css' '*.scss' '*.sass' | sort); do
  git show HEAD:${filepath} >> /tmp/css-verify-old-full.css 2>/dev/null || true
  printf "\n" >> /tmp/css-verify-old-full.css
  cat ${filepath} >> /tmp/css-verify-new-full.css
  printf "\n" >> /tmp/css-verify-new-full.css
done

# 大容量ファイル対応: 200KB超の場合は変更差分のみに絞る
COMBINED_SIZE=$(wc -c < /tmp/css-verify-new-full.css)
FILTER_OPT="--filter all"
if [ "$COMBINED_SIZE" -gt 204800 ]; then
  FILTER_OPT="--filter changed"
fi

node <SKILL_DIR>/bin/css-diff.cjs /tmp/css-verify-old-full.css /tmp/css-verify-new-full.css \
  --format json $FILTER_OPT
```

終了コードの意味：

- `0` → 差分なし
- `1` → 差分あり（JSON出力を解析する）
- `2` → エラー（ファイル読み込み失敗・CSSパースエラー）

### Step 3: 結果を解釈・報告する

Step 2b の JSON出力の `summary` と `contexts` を読み取り、以下の観点でレポートする。
**HTMLレポートのパスを必ず表示すること。**

**大量変更時（`changed + added + removed` 合計が 50 件超）:** `summary` のみ報告し、「変更件数が多いため詳細はHTMLレポートを参照してください」と案内する。

**変更の確認ポイント：**

- `changed` プロパティ: 変更前の値 (`oldValue`) → 変更後の値 (`newValue`) を表示
- `added` プロパティ: 意図的な追加か、想定外の副作用かを確認
- `removed` プロパティ: 意図的な削除か確認
- `@media` コンテキスト: メディアクエリ内の変更も見落とさない

**順序変更の報告（プロパティ変更がゼロでも必ず確認）：**

HTMLレポートに順序変更の詳細が含まれているため、プロパティ変更がゼロでも順序変更がある場合は以下のように報告する：

```
⚠️ **順序変更が検出されました**
セレクタの並び順が変更されています。想定通りの変更か確認してください。

HTMLレポートで詳細を確認してください:
→ css-verify-report/docs--common.css.html
```

**エージェントとしての判断：**

このスキルの目的は「CSSの変更が意図しないカスケードの副作用（セレクタの上書きや順序変更による影響）を引き起こしていないか」を確認することである。

- プロパティ変更あり → 変更内容が「意図した変更の直接的な結果」か「副作用」かを区別して報告。HTMLレポートも案内する
- プロパティ変更ゼロ・順序変更あり → `⚠️ **順序変更が検出されました**` と警告し、HTMLレポートへ誘導する
- 差分なし（exit code 0）かつ順序変更なし → 問題なしと報告

## エラー対処

| エラー               | 原因                          | 対処                                             |
| -------------------- | ----------------------------- | ------------------------------------------------ |
| `Exit code 2`        | CSSパースエラー               | ファイルの構文エラーを確認                       |
| `Cannot find module` | bin/css-diff.jsが見つからない | `npm ci` をスキルディレクトリで実行したか確認   |
| git showがエラー     | 新規追加ファイル              | 空ファイルを旧バージョンとして使用（Step 2参照） |
