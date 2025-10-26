import { visit } from 'unist-util-visit';

/**
 * Remark plugin to automatically convert mathematical structure patterns
 * (like **Theorem 2.1**, **Definition 2.2**, **Proof:**) into styled components.
 */
export function remarkMathBlocks() {
  return (tree) => {
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!node.children || node.children.length === 0) return;

      const firstChild = node.children[0];

      // Check if paragraph starts with bold text
      if (firstChild.type !== 'strong') return;

      const boldText = firstChild.children
        .filter(child => child.type === 'text')
        .map(child => child.value)
        .join('');

      // Match patterns like "Theorem 2.1", "Definition 2.2", "Proof:", etc.
      // Also matches optional titles in parentheses like "Theorem 2.1 (Information Preservation):"
      const patterns = {
        theorem: /^Theorem\s*(\d+\.?\d*)?(?:\s*\([^)]+\))?:?$/i,
        definition: /^Definition\s*(\d+\.?\d*)?(?:\s*\([^)]+\))?:?$/i,
        lemma: /^Lemma\s*(\d+\.?\d*)?(?:\s*\([^)]+\))?:?$/i,
        corollary: /^Corollary\s*(\d+\.?\d*)?(?:\s*\([^)]+\))?:?$/i,
        conjecture: /^Conjecture\s*(\d+\.?\d*)?(?:\s*\([^)]+\))?:?$/i,
        example: /^Example\s*(\d+\.?\d*)?(?:\s*\([^)]+\))?:?$/i,
        remark: /^Remark(?:\s*\([^)]+\))?:?$/i,
        proof: /^Proof(?:\s*\([^)]+\))?:?$/i,
      };

      for (const [componentType, pattern] of Object.entries(patterns)) {
        const match = boldText.match(pattern);
        if (!match) continue;

        // Extract number if present
        const number = match[1] || '';

        // Get remaining content (everything after the bold title)
        const remainingContent = node.children.slice(1);

        // Look ahead to collect subsequent paragraphs until we hit another math block
        const contentNodes = [{ type: 'paragraph', children: remainingContent }];
        let nextIndex = index + 1;

        while (nextIndex < parent.children.length) {
          const nextNode = parent.children[nextIndex];

          // Stop if we hit another math block
          if (nextNode.type === 'paragraph' &&
              nextNode.children[0]?.type === 'strong') {
            const nextBoldText = nextNode.children[0].children
              .filter(c => c.type === 'text')
              .map(c => c.value)
              .join('');

            const isNextMathBlock = Object.values(patterns).some(p => p.test(nextBoldText));
            if (isNextMathBlock) break;
          }

          // Stop if we hit a heading
          if (nextNode.type === 'heading') break;

          // Stop if we hit horizontal rule
          if (nextNode.type === 'thematicBreak') break;

          contentNodes.push(nextNode);
          nextIndex++;
        }

        // Create the component node
        const componentName = componentType.charAt(0).toUpperCase() + componentType.slice(1);

        const componentNode = {
          type: 'mdxJsxFlowElement',
          name: componentName,
          attributes: number ? [
            {
              type: 'mdxJsxAttribute',
              name: 'number',
              value: number,
            }
          ] : [],
          children: contentNodes,
          data: { hName: 'div' }
        };

        // Replace the original node and remove consumed nodes
        parent.children.splice(index, nextIndex - index, componentNode);

        return index; // Continue from this position
      }
    });
  };
}
