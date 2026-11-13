# Contributing

Thank you for looking. spark is a small experiment with one maintainer,
and it stays small on purpose: about 400 lines, no dependencies, no build
step. A feature has to earn its lines.

## Issues, not pull requests

Pull requests are turned off. If you found a bug or have an idea, open an
**issue** instead:

- **A bug**: the smallest template or signal graph that shows it, what
  you expected and what happened, and the browser (or Node version, for
  the tests).
- **An idea**: the problem it solves for you, not only the API you'd
  like. One that fits may be built; one that doesn't is answered with why.
- **A security problem**: don't open a public issue. Use GitHub's
  **Report a vulnerability** (the Security tab), so it stays private
  until it is mended.

Code in an issue (a failing test, a patch) is welcome as a sketch; the
change itself is made by the maintainer.

## In your own copy

```sh
npm test    # node --test, with the DOM shim in test/dom-shim.js
```

The demo runs from the repository root: `npx serve .` (or
`python3 -m http.server`), then open `/demo/`.
