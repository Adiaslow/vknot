# Mathematical Structure Components

Styled components for academic mathematical writing in MDX blog posts.

## Available Components

### Theorem

Blue-styled component for theorems.

```mdx
import { Theorem } from "../../components/math";

<Theorem title="Theorem" number="2.1">
  Parallel decomposition preserves at least as much information as any serial
  decomposition.
</Theorem>
```

### Definition

Amber-styled component for definitions.

```mdx
import { Definition } from "../../components/math";

<Definition title="Definition" number="2.1">
  A **serial hierarchy** processes information through a single intermediate
  level.
</Definition>
```

### Proof

Gray-styled component for proofs (includes ∎ symbol at end).

```mdx
import { Proof } from "../../components/math";

<Proof>
  Let I(A; M) be the mutual information between atoms and molecular
  properties...
</Proof>
```

### Lemma

Green-styled component for lemmas.

```mdx
import { Lemma } from "../../components/math";

<Lemma title="Lemma" number="2.2">
  The meet (intersection) of two partitions provides finer granularity.
</Lemma>
```

### Corollary

Cyan-styled component for corollaries.

```mdx
import { Corollary } from "../../components/math";

<Corollary number="2.3">Direct consequence of Theorem 2.1...</Corollary>
```

### Remark

Purple-styled component for remarks.

```mdx
import { Remark } from "../../components/math";

<Remark>Note that this approach differs from traditional methods...</Remark>
```

### Example

Teal-styled component for examples.

```mdx
import { Example } from "../../components/math";

<Example number="3.1">
  Consider a cyclic peptide with sequence CYCLO(Arg-D-Phe-Pro)...
</Example>
```

### Conjecture

Rose-styled component for conjectures.

```mdx
import { Conjecture } from "../../components/math";

<Conjecture number="4.1">
  The parallel hierarchy learns compositional rules that generalize...
</Conjecture>
```

## Props

All components accept:

- `title` (optional): Custom title (defaults to component name)
- `number` (optional): Number/reference for the structure (e.g., "2.1", "4.3")

Proof component only uses `title` (no numbering).

## Color Scheme

- **Theorem**: Blue (scientific, formal)
- Definition: Amber (foundational, important)
- Proof: Gray (supporting, detailed)
- **Lemma**: Green (auxiliary result)
- Corollary: Cyan (derived result)
- **Remark**: Purple (observation, note)
- Example: Teal (illustration)
- Conjecture: Rose (hypothesis)

All components support dark mode with appropriate color adjustments.
