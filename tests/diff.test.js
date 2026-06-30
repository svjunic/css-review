import { describe, it, expect } from 'vitest'
import { parseCss } from '../src/core/parse.js'
import { resolve } from '../src/core/resolve.js'
import { diff } from '../src/core/diff.js'

/** CSS 文字列2つを受け取り diff 結果を返すヘルパー */
function diffCss(oldCss, newCss, diffOptions = {}, parseOptions = {}) {
  return diff(resolve(parseCss(oldCss, parseOptions)), resolve(parseCss(newCss, parseOptions)), diffOptions)
}

function getSelectorDiff(diffResult, contextKey, selector) {
  return diffResult.get(contextKey)?.selectors?.get(selector)
}

function getPropDiff(diffResult, contextKey, selector, prop) {
  return getSelectorDiff(diffResult, contextKey, selector)?.props?.get(prop)
}

describe('diff: 変更なし', () => {
  it('同一 CSS は全プロパティが unchanged', () => {
    const css = `.a { color: red; margin: 0; }`
    const result = diffCss(css, css)
    const prop = getPropDiff(result, 'base', '.a', 'color')
    expect(prop?.status).toBe('unchanged')
    expect(prop?.value).toBe('red')
  })

  it('整形違いだけ（改行・スペース）は差分なしになる', () => {
    const old = `.a { color: red; font-size: 16px; }`
    const next = `.a{color:red;font-size:16px;}`
    const result = diffCss(old, next)
    const sel = getSelectorDiff(result, 'base', '.a')
    expect(sel?.status).toBe('unchanged')
    expect(sel?.changeCount).toBe(0)
  })

  it('コンテキスト全体が変更なしなら changeCount が 0', () => {
    const css = `.a { color: red; }`
    const result = diffCss(css, css)
    expect(result.get('base')?.changeCount).toBe(0)
    expect(result.get('base')?.status).toBe('unchanged')
  })
})

describe('diff: プロパティの追加・削除・変更', () => {
  it('新しいプロパティが追加される', () => {
    const old = `.a { color: red; }`
    const next = `.a { color: red; margin: 0; }`
    const result = diffCss(old, next)
    const prop = getPropDiff(result, 'base', '.a', 'margin')
    expect(prop?.status).toBe('added')
    expect(prop?.newValue).toBe('0')
  })

  it('プロパティが削除される', () => {
    const old = `.a { color: red; margin: 0; }`
    const next = `.a { color: red; }`
    const result = diffCss(old, next)
    const prop = getPropDiff(result, 'base', '.a', 'margin')
    expect(prop?.status).toBe('removed')
    expect(prop?.oldValue).toBe('0')
  })

  it('プロパティ値が変更される', () => {
    const old = `.a { color: red; }`
    const next = `.a { color: blue; }`
    const result = diffCss(old, next)
    const prop = getPropDiff(result, 'base', '.a', 'color')
    expect(prop?.status).toBe('changed')
    expect(prop?.oldValue).toBe('red')
    expect(prop?.newValue).toBe('blue')
  })

  it('!important が付与された場合に changed になる', () => {
    const old = `.a { color: red; }`
    const next = `.a { color: red !important; }`
    const result = diffCss(old, next)
    const prop = getPropDiff(result, 'base', '.a', 'color')
    expect(prop?.status).toBe('changed')
    expect(prop?.oldImportant).toBe(false)
    expect(prop?.newImportant).toBe(true)
  })
})

describe('diff: セレクタの追加・削除', () => {
  it('セレクタ全体が新規追加される', () => {
    const old = `.a { color: red; }`
    const next = `.a { color: red; } .b { color: blue; }`
    const result = diffCss(old, next)
    const sel = getSelectorDiff(result, 'base', '.b')
    expect(sel?.status).toBe('added')
  })

  it('セレクタ全体が削除される', () => {
    const old = `.a { color: red; } .b { color: blue; }`
    const next = `.a { color: red; }`
    const result = diffCss(old, next)
    const sel = getSelectorDiff(result, 'base', '.b')
    expect(sel?.status).toBe('removed')
  })
})

describe('diff: @media コンテキスト', () => {
  it('@media 内の変更は @media コンテキストに記録され base に影響しない', () => {
    const old = `.a { color: red; } @media (max-width: 768px) { .a { color: blue; } }`
    const next = `.a { color: red; } @media (max-width: 768px) { .a { color: green; } }`
    const result = diffCss(old, next)

    // base は変更なし
    expect(result.get('base')?.status).toBe('unchanged')

    // @media は変更あり
    const mediaProp = getPropDiff(result, '@media (max-width: 768px)', '.a', 'color')
    expect(mediaProp?.status).toBe('changed')
    expect(mediaProp?.oldValue).toBe('blue')
    expect(mediaProp?.newValue).toBe('green')
  })

  it('@media ブロックが丸ごと追加される場合は added ステータス', () => {
    const old = `.a { color: red; }`
    const next = `.a { color: red; } @media print { .a { display: none; } }`
    const result = diffCss(old, next)
    expect(result.get('@media print')?.status).toBe('added')
  })
})

describe('diff: 後勝ちルールが正しく適用された上での比較', () => {
  it('重複定義があっても最終値で比較される', () => {
    // old: 後勝ちで color: green
    const old = `.a { color: red; color: green; }`
    // new: 後勝ちで color: green
    const next = `.a { color: blue; color: green; }`
    const result = diffCss(old, next)
    // 最終値は同じ green → unchanged
    const prop = getPropDiff(result, 'base', '.a', 'color')
    expect(prop?.status).toBe('unchanged')
    expect(prop?.value).toBe('green')
  })

  it('!important 上書き後の最終値で比較される', () => {
    const old = `.a { color: red !important; color: blue; }` // red が残る
    const next = `.a { color: red !important; }`              // red が残る
    const result = diffCss(old, next)
    const prop = getPropDiff(result, 'base', '.a', 'color')
    expect(prop?.status).toBe('unchanged')
  })
})

describe('diff: グループセレクタの分解を通じた比較', () => {
  it('グループセレクタが分解されて個別に比較される', () => {
    const old = `.a, .b { color: red; }`
    const next = `.a, .b { color: blue; }`
    const result = diffCss(old, next)
    expect(getPropDiff(result, 'base', '.a', 'color')?.status).toBe('changed')
    expect(getPropDiff(result, 'base', '.b', 'color')?.status).toBe('changed')
  })
})

describe('diff: ignoreCosmetic — 表記揺れを無視した比較', () => {
  it('calc 内の * 周辺スペース違いは unchanged になる', () => {
    const old = `.a { letter-spacing: calc(2.01em + var(--x) * 5); }`
    const next = `.a { letter-spacing: calc(2.01em + var(--x)*5); }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'letter-spacing')?.status).toBe('unchanged')
  })

  it('ignoreCosmetic OFF では calc 内の * スペース違いは changed になる', () => {
    const old = `.a { letter-spacing: calc(2.01em + var(--x) * 5); }`
    const next = `.a { letter-spacing: calc(2.01em + var(--x)*5); }`
    const result = diffCss(old, next)
    expect(getPropDiff(result, 'base', '.a', 'letter-spacing')?.status).toBe('changed')
  })

  it('先頭ゼロ省略 (.2em vs 0.2em) は unchanged になる', () => {
    const old = `.a { margin: 0.2em; }`
    const next = `.a { margin: .2em; }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'margin')?.status).toBe('unchanged')
  })

  it('負の先頭ゼロ省略 (-.2em vs -0.2em) は unchanged になる', () => {
    const old = `.a { margin: -0.2em; }`
    const next = `.a { margin: -.2em; }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'margin')?.status).toBe('unchanged')
  })

  it('calc 内の負の先頭ゼロ省略 (-.5em) は unchanged になる', () => {
    const old = `.a { margin: calc(-0.5em + 1px); }`
    const next = `.a { margin: calc(-.5em + 1px); }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'margin')?.status).toBe('unchanged')
  })

  it('calc 内で * の後に来る先頭ゼロ省略 (calc(1 * .5em)) は unchanged になる', () => {
    const old = `.a { margin: calc(1 * 0.5em); }`
    const next = `.a { margin: calc(1 * .5em); }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'margin')?.status).toBe('unchanged')
  })

  it('calc 内で * の後に来る負の先頭ゼロ省略 (calc(1 * -.5em)) は unchanged になる', () => {
    const old = `.a { margin: calc(1 * -0.5em); }`
    const next = `.a { margin: calc(1 * -.5em); }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'margin')?.status).toBe('unchanged')
  })

  it('16進カラーの大文字小文字・短縮形は unchanged になる', () => {
    const old = `.a { color: #FFF; }`
    const next = `.a { color: #ffffff; }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'color')?.status).toBe('unchanged')
  })

  it('クォートの有無は unchanged になる', () => {
    const old = `.a { font-family: 'sans-serif'; }`
    const next = `.a { font-family: sans-serif; }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'font-family')?.status).toBe('unchanged')
  })

  it('!important の有無は ignoreCosmetic に関わらず changed になる', () => {
    const old = `.a { color: red; }`
    const next = `.a { color: red !important; }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'color')?.status).toBe('changed')
  })

  it('カンマ後のスペース有無の違いは unchanged になる', () => {
    // 例1: transition でカンマ後スペースあり vs なし
    const old = `.a { transition: color 0.2s, border-color 0.2s; }`
    const next = `.a { transition: color 0.2s,border-color 0.2s; }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'transition')?.status).toBe('unchanged')
  })

  it('シングルとダブルクォート + カンマスペース違いは unchanged になる', () => {
    // 例2: font-family のクォート種別とカンマ後スペース
    const old = `.a { font-family: 'Noto Sans JP', sans-serif; }`
    const next = `.a { font-family: "Noto Sans JP",sans-serif; }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'font-family')?.status).toBe('unchanged')
  })

  it('先頭ゼロ省略をショートハンドで使っても unchanged になる', () => {
    // 例3: margin の値の先頭ゼロ省略
    const old = `.a { margin: 0 0.2em; }`
    const next = `.a { margin: 0 .2em; }`
    const result = diffCss(old, next, { ignoreCosmetic: true })
    expect(getPropDiff(result, 'base', '.a', 'margin')?.status).toBe('unchanged')
  })
})

describe('diff: semanticSelectors — 属性セレクタのクォート等価', () => {
  it('クォートありとなしの属性セレクタが同一セレクタに集約される', () => {
    const old = `.a [class*='list'] { color: red; }`
    const next = `.a [class*=list] { color: red; }`
    const result = diffCss(old, next, {}, { semanticSelectors: true })
    // canonical 形 (.a [class*=list]) で unchanged
    const sel = result.get('base')?.selectors?.get('.a [class*=list]')
    expect(sel?.status).toBe('unchanged')
  })

  it('semanticSelectors OFF では別セレクタとして扱われる', () => {
    const old = `.a [class*='list'] { color: red; }`
    const next = `.a [class*=list] { color: red; }`
    const result = diffCss(old, next)
    // old 側のキーは ".a [class*='list']"（正規化済みだがクォートあり）
    // new 側のキーは ".a [class*=list]"
    const selectors = [...(result.get('base')?.selectors?.keys() ?? [])]
    // 2つのセレクタが別々に存在し、片方が removed、片方が added
    expect(selectors.length).toBe(2)
  })

  it('orlfr-article の実例: クォートありとなしが同一に集約される', () => {
    const old = `.orlfr-article ol:not([class*='list']):not([class*='faq-']) { margin: 0; }`
    const next = `.orlfr-article ol:not([class*=list]):not([class*=faq-]) { margin: 0; }`
    const result = diffCss(old, next, {}, { semanticSelectors: true })
    const ctxSelectors = result.get('base')?.selectors
    const anyChanged = [...(ctxSelectors?.values() ?? [])].some(s => s.status !== 'unchanged')
    expect(anyChanged).toBe(false)
  })
})
