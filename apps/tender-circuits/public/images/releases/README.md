# Album Artwork

Place album cover art in this directory.

## File Naming Convention

Use the release slug (URL-friendly version of the title) as the filename:
- `life-is-fragile.jpg` - for "Life is Fragile" by Soft Systems

## Image Specifications

Recommended:
- Format: JPG or PNG
- Dimensions: 3000x3000px (square)
- Quality: High resolution for web display
- File size: Optimize for web (typically under 2MB)

## Adding Artwork to a Release

1. Place your image file in this directory
2. Update the release page at `src/pages/releases/[slug].astro`
3. Add the `artwork` field to the release object:
   ```javascript
   artwork: "/tender_circuits/images/releases/life-is-fragile.jpg"
   ```

The artwork will automatically display on the release page.
