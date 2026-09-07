// Single source of truth for the illustration style, imported by every
// image-generation route. Keeping this in one place is what makes a
// library character (generated once, text-to-image) and a custom character
// (generated from a photo) look like they belong in the same book when an
// illustration puts them side by side.
//
// Deliberately semi-realistic, not flat cartoon and not literal photo
// reproduction: dimensional shading and detailed rendering read as a much
// more polished, premium storybook, while staying clearly an illustration.
// That line matters here specifically — these are generated from real
// children's photos, and a render indistinguishable from an actual
// photograph of a real child is a meaningfully more sensitive thing to
// produce than a painted likeness, and something most image-API providers
// restrict outright. Don't loosen the "clearly a painting, not a photo"
// constraint even in pursuit of more realism.

export const STYLE_GUIDE = `semi-realistic children's-book illustration,
painterly digital art with soft dimensional shading and visible brushwork,
warm natural lighting, rich detailed rendering of hair and fabric texture,
gentle idealized proportions (not flat cartoon, not photorealistic — it
must read clearly as a painted illustration, never as an actual photograph)`;
