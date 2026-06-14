# Mathematical Structure Components

Styled callouts for academic mathematical writing in MDX blog posts.

## Architecture

Every callout is a thin wrapper over a single `Environment.astro` block:

```
Theorem.astro ─┐
Definition.astro ┤
Lemma.astro    ─┼─▶ Environment.astro (data-kind="…") ─▶ styles/environments.css
…              ─┘
```

`Environment` renders one consistent layout (label · number · title · body)
and sets `data-kind`. All visual styling lives in `src/styles/environments.css`,
which is **token-driven**: the family shares one lightness/chroma and varies only
the hue (`--h-theorem`, `--h-definition`, …) declared in `src/styles/tokens.css`.
Because the colours resolve from CSS variables, the callouts follow the Paper /
Ink theme automatically — there are no per-component `dark:` classes.

To re-tint a kind, change its `--h-*` hue in `tokens.css`. To add a new kind, add
a hue token, a thin wrapper here, and one `.env[data-kind="…"]` line.

## Available Components

`Theorem`, `Definition`, `Lemma`, `Corollary`, `Conjecture`, `Example`,
`Assumption`, `Remark`, `Proof`.

```mdx
import { Theorem, Proof } from "../../components/math";

<Theorem title="Decomposition" number="2.1">
  Parallel decomposition preserves at least as much information as any serial
  decomposition.
</Theorem>

<Proof>
  Let I(A; M) be the mutual information between atoms and molecular properties…
</Proof>
```

## Props

All components accept:

- `title` (optional): label suffix shown in parentheses, e.g. `(Decomposition)`.
- `number` (optional): reference number, e.g. `"2.1"`.

`Remark` takes only `number`; `Proof` takes only `title` and appends a ▪ (Q.E.D.)
tombstone.

## Colour Scheme

One typeset block style; hue selected per kind from the `--h-*` tokens. `Proof`
is intentionally neutral (a ruled left border, no tint). All kinds adapt to dark
mode through the shared tokens rather than hand-tuned colour variants.
