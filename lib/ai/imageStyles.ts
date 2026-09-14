// Direct port of lib/imageStyle.js, unchanged in substance — the style
// guides themselves are already tested and tuned; only the module
// system changes (TS export, used by the new platform's image
// pipeline rather than the old one).

export interface ImageStyle {
  id: string;
  label: string;
  description: string;
  guide: string;
}

export const STYLES: Record<string, ImageStyle> = {
  painterly: {
    id: "painterly",
    label: "Painterly",
    description: "Semi-realistic, richly painted — the original StoryNest look",
    guide: `semi-realistic children's-book illustration, painterly digital art with soft dimensional shading and visible brushwork, warm natural lighting, rich detailed rendering of hair and fabric texture, gentle idealized proportions (not flat cartoon, not photorealistic — it must read clearly as a painted illustration, never as an actual photograph)`,
  },
  watercolor: {
    id: "watercolor",
    label: "Watercolor",
    description: "Soft washes and gentle color — a classic storybook feel",
    guide: `soft watercolor children's-book illustration, loose gentle brush washes, visible paper texture, delicate linework, muted blended colors, warm and gentle mood (not flat cartoon, not photorealistic, not painterly digital art with heavy shading — it must read clearly as a hand-painted watercolor illustration on textured paper)`,
  },
  cgi3d: {
    id: "cgi3d",
    label: "3D",
    description: "Rounded, expressive 3D-rendered characters",
    guide: `3D-rendered children's-book character illustration, smooth soft shading, rounded expressive features, warm cinematic lighting, clean dimensional CGI-style rendering (not flat cartoon, not a 2D painting, not photorealistic — it must read clearly as a 3D-rendered animated illustration)`,
  },
  coloring: {
    id: "coloring",
    label: "Coloring page",
    description: "Black-and-white line art your child can color in themselves",
    guide: `black-and-white coloring-book line art ONLY — clean bold uniform-width outlines, absolutely no color fill anywhere, no shading, no gray tones, no cross-hatching, no gradients, pure flat white background, simple clear linework with enough open space for a child to color in with crayons or paint`,
  },
};

export function getStyle(id?: string): ImageStyle {
  return (id && STYLES[id]) || STYLES.painterly!;
}

export const STYLE_IDS = Object.keys(STYLES);
