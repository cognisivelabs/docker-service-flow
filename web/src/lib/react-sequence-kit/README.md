# react-sequence-kit (vendored)

Source copy of [cognisivelabs/react-sequence-kit](https://github.com/cognisivelabs/react-sequence-kit)
at commit `41d6b79`, MIT licensed. It is vendored rather than installed so the
project builds in environments that can only pull public packages from a
mirror (the library is not published to npm).

Only the library is included (`engine/`, `react/`, `index.ts`); the demo app
and its global stylesheet are left out. Its only runtime dependency is React.

To update, copy `src/engine`, `src/react` and `src/index.ts` from the upstream
repo (dropping the `./index.css` import) and record the new commit here.
