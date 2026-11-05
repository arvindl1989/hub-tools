// ── Lint ─────────────────────────────────────────────────────────────────────
// The rule that earns its keep here is no-undef.
//
// Vite builds a file with a free variable without complaint, and React renders
// nothing when one is hit: the page goes white, #root stays empty, and the only
// sign is a single line in the browser console. It has happened twice — a
// helper called from a sibling component that never imported it, and a palette
// whose import was pruned while a call to it remained. Both shipped. Both took
// a browser session to find.
//
//     npm run lint
//
// There was no config in the project at all before this; it was being rebuilt
// by hand in a scratch directory each time, which is the same as not having it.

import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // Registered but with every rule off, so the
    // eslint-disable-next-line comments already in the source resolve
    // instead of erroring as an unknown rule.
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The one that matters, and the reason this file exists. Never a warning.
      'no-undef': 'error',
      // Cheap, and the same shape of mistake: a name that is not what it looks
      // like. JSX makes a component look unused to the base rule, hence the
      // capital-letter exemption.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]', args: 'none' }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
    },

    // Deliberately NOT the recommended set. Turning it on today reports a few
    // dozen pre-existing findings — hook ordering, setState in effects — which
    // are worth working through but are not this gate's job, and a lint that
    // fails on arrival is a lint nobody runs. Widen it when there is time to
    // clear what it finds.
  },
]
