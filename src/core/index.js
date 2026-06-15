import { parseCss } from './parse.js'
import { resolve } from './resolve.js'
import { diff } from './diff.js'

export { parseCss }
export { resolve }
export { diff }
export {
  normalizeSelector,
  normalizeMediaCondition,
  normalizeValue,
  canonicalizeValue,
  canonicalizeSelector,
} from './normalize.js'

/**
 * CSS テキスト2つを受け取り、構造的差分を返す高レベル API。
 * @param {string} oldCss
 * @param {string} newCss
 * @param {{ ignoreCosmetic?: boolean, semanticSelectors?: boolean }} [options]
 * @returns {Map}
 */
export function diffCss(oldCss, newCss, options = {}) {
  return diff(
    resolve(parseCss(oldCss, { semanticSelectors: options.semanticSelectors })),
    resolve(parseCss(newCss, { semanticSelectors: options.semanticSelectors })),
    { ignoreCosmetic: options.ignoreCosmetic },
  )
}
