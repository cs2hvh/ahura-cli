# Image Assets Directory

## Directory Structure

```
public/images/
├── characters/          # Character portraits
├── gallery/            # Game screenshots
├── favicon.ico         # Browser favicon
├── favicon-16x16.png   # 16x16 favicon
├── favicon-32x32.png   # 32x32 favicon
├── apple-touch-icon.png # iOS home screen icon
├── og-image.jpg        # Open Graph image for social sharing
└── README.md           # This file
```

## Naming Conventions

### Characters
- Format: `{character-name}.webp`
- Examples: `luna.webp`, `rex.webp`, `zara.webp`, `finn.webp`
- Dimensions: 800x1000px (portrait orientation)
- Format: WebP for optimal compression

### Gallery
- Format: `{scene-name}.webp`
- Examples: `boss-battle.webp`, `forest-realm.webp`, `hero-collection.webp`
- Dimensions: 1920x1080px (landscape orientation)
- Format: WebP for optimal compression

### Icons & Favicons
- `favicon.ico`: 32x32px ICO format
- `favicon-16x16.png`: 16x16px PNG
- `favicon-32x32.png`: 32x32px PNG
- `apple-touch-icon.png`: 180x180px PNG
- `og-image.jpg`: 1200x630px JPG (for social media)

## Image Optimization Guidelines

1. **Format**: Use WebP for all photos and illustrations
2. **Compression**: Aim for 80-85% quality for WebP
3. **Dimensions**: Follow the recommended sizes above
4. **Alt Text**: Always provide descriptive alt text in components
5. **Lazy Loading**: Use Next.js Image component for automatic optimization

## Usage with Next.js Image Component

```tsx
import Image from 'next/image';

<Image
  src="/images/characters/luna.webp"
  alt="Luna Starlight - Mystic Mage"
  width={800}
  height={1000}
  loading="lazy"
  quality={85}
/>
```

## Placeholder Images

For development, use placeholder services:
- Characters: https://placehold.co/800x1000/9333ea/ffffff?text=Character
- Gallery: https://placehold.co/1920x1080/ec4899/ffffff?text=Screenshot
- Icons: https://placehold.co/180x180/9333ea/ffffff?text=Icon

## Production Checklist

- [ ] Replace all placeholder images with actual game assets
- [ ] Optimize all images (compress, convert to WebP)
- [ ] Verify all images have proper alt text
- [ ] Test lazy loading on slow connections
- [ ] Validate favicon displays correctly across browsers
- [ ] Check og:image renders properly on social media
