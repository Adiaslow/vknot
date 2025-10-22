# Album Artwork

Place album cover art in this directory.

## File Naming Convention

**IMPORTANT**: Use lowercase with dashes (no spaces) matching the release slug:
- ✅ `life-is-fragile.jpg` - Correct
- ❌ `Life is Fragile.jpg` - Incorrect (spaces cause URL encoding issues)

## Image Specifications

Recommended:
- Format: JPG or PNG
- Dimensions: 3000x3000px (square) or higher
- Quality: High resolution for web display
- File size: Optimize for web (under 5MB recommended)

## Adding Artwork to a Release

1. Place your image file in this directory with a dash-separated filename
2. Update the release page at `src/pages/releases/[slug].astro`
3. Add the `artwork` field to the release object:
   ```javascript
   artwork: "/tender_circuits/images/releases/life-is-fragile.jpg"
   ```

The artwork will automatically display on both the release detail page and releases listing page.
