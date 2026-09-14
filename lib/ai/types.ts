// Shared types for Step 14's provider abstraction (Section 14/17's
// "the app should not be hard-wired to one AI vendor" requirement).
// Three provider interfaces — Story, Image, Narration — so a call site
// depends on a shape, not a specific vendor's API. Only StoryProvider
// has a real implementation right now (AnthropicStoryProvider); Image
// and Narration are defined as interfaces ahead of the work that will
// actually implement them (Step 15+ for images, later for narration),
// so those steps have a shape to fill in rather than starting from
// nothing.

export interface StoryGenerationRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
}

export interface StoryGenerationResult {
  rawText: string; // raw text response — the caller parses this as JSON, since the expected shape (title/pages vs. title/pages/ageRange/etc.) differs per call site
  inputTokens: number | null;
  outputTokens: number | null;
  model: string;
}

export interface StoryProvider {
  generateStory(request: StoryGenerationRequest): Promise<StoryGenerationResult>;
}

// Not implemented yet — defined now so Step 15 (image generation) has
// an interface to build against instead of inventing one from scratch
// mid-feature. Reference images are passed as already-resolved bytes
// (the caller fetches them from storage first), and the result is raw
// bytes too, not a storage key — the provider's job is generating an
// image, not deciding where it's saved. Bucket names and file-naming
// conventions differ per use case (a character reference vs. a page
// illustration), so that decision belongs to the caller, which already
// has the database context to make it, not to a generic AI provider.
export interface ImageReference {
  label: string;
  base64: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  references?: ImageReference[]; // omit for a from-scratch generation; include for character-consistent placement into a scene
  width: number;
  height: number;
}

export interface ImageGenerationResult {
  base64: string;
  model: string;
}

export interface ImageProvider {
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

// Same status as ImageProvider — interface only, no implementation, but
// storage-agnostic for the same reason: a provider generates audio, it
// doesn't decide bucket names or file-naming conventions. durationMs is
// the provider's best estimate, not necessarily a hard measurement from
// the actual audio file — the first real implementation may only be
// able to estimate this from input length rather than parse the
// generated audio's real duration, and callers should treat it that
// way until proven otherwise.
export interface NarrationRequest {
  text: string;
  voiceId?: string;
  language?: string;
}

export interface NarrationResult {
  base64: string;
  mimeType: string;
  durationMs: number;
  model: string;
}

export interface NarrationProvider {
  generateNarration(request: NarrationRequest): Promise<NarrationResult>;
}
