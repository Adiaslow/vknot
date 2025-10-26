import { visit } from 'unist-util-visit';

/**
 * Remark plugin to automatically convert mathematical structure patterns
 * (like ### Theorem 2.1, **Definition 2.2**, Proof:**) into styled components.
 * Supports both heading format (### Theorem) and bold paragraph format (**Theorem**).
 */
export function remarkMathBlocks() {
  return (tree) => {
    // Define patterns for matching mathematical structures
    // Capture groups: 1 = number (e.g., "2.1"), 2 = title in parentheses (e.g., "Information Preservation")
    const patterns = {
      theorem: /^Theorem\s*(\d+\.?\d*)?(?:\s*\(([^)]+)\))?:?$/i,
      definition: /^Definition\s*(\d+\.?\d*)?(?:\s*\(([^)]+)\))?:?$/i,
      lemma: /^Lemma\s*(\d+\.?\d*)?(?:\s*\(([^)]+)\))?:?$/i,
      corollary: /^Corollary\s*(\d+\.?\d*)?(?:\s*\(([^)]+)\))?:?$/i,
      conjecture: /^Conjecture\s*(\d+\.?\d*)?(?:\s*\(([^)]+)\))?:?$/i,
      example: /^Example\s*(\d+\.?\d*)?(?:\s*\(([^)]+)\))?:?$/i,
      assumption: /^Assumption\s*(\d+\.?\d*)?(?:\s*\(([^)]+)\))?:?$/i,
      remark: /^Remark(?:\s*\(([^)]+)\))?:?$/i,
      proof: /^Proof(?:\s*\(([^)]+)\))?:?$/i,
    };

    // Helper function to create component node
    const createComponentNode = (componentType, number, title, contentNodes) => {
      const componentName = componentType.charAt(0).toUpperCase() + componentType.slice(1);
      const attributes = [];

      if (number) {
        attributes.push({
          type: 'mdxJsxAttribute',
          name: 'number',
          value: number,
        });
      }

      if (title) {
        attributes.push({
          type: 'mdxJsxAttribute',
          name: 'title',
          value: title,
        });
      }

      return {
        type: 'mdxJsxFlowElement',
        name: componentName,
        attributes,
        children: contentNodes,
        data: { hName: 'div' }
      };
    };

    // Process ### headings (new format)
    visit(tree, 'heading', (node, index, parent) => {
      // Only process level 3 headings (###)
      if (node.depth !== 3) return;
      if (!node.children || node.children.length === 0) return;

      // Extract text from heading
      const headingText = node.children
        .filter(child => child.type === 'text')
        .map(child => child.value)
        .join('');

      // Try to match against patterns
      for (const [componentType, pattern] of Object.entries(patterns)) {
        const match = headingText.match(pattern);
        if (!match) continue;

        // Extract number and title if present
        const number = match[1] || '';
        const title = match[2] || ''; // Title from parentheses

        // Look ahead to collect subsequent content until we hit another heading or math block
        const contentNodes = [];
        let nextIndex = index + 1;

        while (nextIndex < parent.children.length) {
          const nextNode = parent.children[nextIndex];

          // Stop if we hit another heading at same or higher level
          if (nextNode.type === 'heading' && nextNode.depth <= 3) {
            // Check if it's another math structure heading
            const nextHeadingText = nextNode.children
              .filter(c => c.type === 'text')
              .map(c => c.value)
              .join('');
            const isNextMathBlock = Object.values(patterns).some(p => p.test(nextHeadingText));
            if (isNextMathBlock) break;
            // If it's a regular heading at same level, also stop
            if (nextNode.depth === 3) break;
          }

          // Stop if we hit a bold paragraph that matches our patterns
          if (nextNode.type === 'paragraph' && nextNode.children[0]?.type === 'strong') {
            const nextBoldText = nextNode.children[0].children
              .filter(c => c.type === 'text')
              .map(c => c.value)
              .join('');
            const isNextMathBlock = Object.values(patterns).some(p => p.test(nextBoldText));
            if (isNextMathBlock) break;
          }

          // Stop if we hit horizontal rule
          if (nextNode.type === 'thematicBreak') break;

          contentNodes.push(nextNode);
          nextIndex++;
        }

        const componentNode = createComponentNode(componentType, number, title, contentNodes);

        // Replace the heading and consumed nodes with component
        parent.children.splice(index, nextIndex - index, componentNode);

        return index; // Continue from this position
      }
    });

    // Process **bold** paragraphs (existing format, backward compatibility)
    visit(tree, 'paragraph', (node, index, parent) => {
      if (!node.children || node.children.length === 0) return;

      const firstChild = node.children[0];

      // Check if paragraph starts with bold text
      if (firstChild.type !== 'strong') return;

      const boldText = firstChild.children
        .filter(child => child.type === 'text')
        .map(child => child.value)
        .join('');

      // Try to match against patterns
      for (const [componentType, pattern] of Object.entries(patterns)) {
        const match = boldText.match(pattern);
        if (!match) continue;

        // Extract number and title if present
        const number = match[1] || '';
        const title = match[2] || ''; // Title from parentheses

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

          // Stop if we hit a heading (especially math structure headings)
          if (nextNode.type === 'heading') {
            if (nextNode.depth === 3) {
              const nextHeadingText = nextNode.children
                .filter(c => c.type === 'text')
                .map(c => c.value)
                .join('');
              const isNextMathBlock = Object.values(patterns).some(p => p.test(nextHeadingText));
              if (isNextMathBlock) break;
            }
            break;
          }

          // Stop if we hit horizontal rule
          if (nextNode.type === 'thematicBreak') break;

          contentNodes.push(nextNode);
          nextIndex++;
        }

        const componentNode = createComponentNode(componentType, number, title, contentNodes);

        // Replace the original node and remove consumed nodes
        parent.children.splice(index, nextIndex - index, componentNode);

        return index; // Continue from this position
      }
    });
  };
}
