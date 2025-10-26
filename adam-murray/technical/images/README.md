# Images Directory

Place your blog post images here.

## Usage in Blog Posts

In your `.mdx` files, reference images like this:

```markdown
![Alt text description](/adam-murray/technical/images/your-image.jpg)
```

## Examples

```markdown
# Simple image
![Diagram showing the algorithm](/adam-murray/technical/images/algorithm-diagram.png)

# Image with caption (in MDX)
<figure>
  <img src="/adam-murray/technical/images/results.jpg" alt="Experimental results" />
  <figcaption>Figure 1: Experimental results showing convergence</figcaption>
</figure>
```

## Organization

You can organize images by post:

```
images/
  ├── 2025-01-adduct-intervals/
  │   ├── diagram-1.png
  │   └── diagram-2.png
  └── 2025-01-soap-film/
      └── surface.jpg
```

Then reference as:
```markdown
![Surface visualization](/adam-murray/technical/images/2025-01-soap-film/surface.jpg)
```
