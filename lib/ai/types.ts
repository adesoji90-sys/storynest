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
// mid-feature. Shape is a best guess based on Section 14's description
// (a prompt plus a character reference for consistency) and will very
// likely need adjusting once a real image provider is actually wired
// up — this is a starting point, not a locked contract.
export interface ImageGenerationRequest {
  prompt: string;
  characterReferenceAssetIds?: string[];
  width?: number;
  height?: number;
}

export interface ImageGenerationResult {
  assetStorageKey: string;
  model: string;
}

export interface ImageProvider {
  generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult>;
}

// Same status as ImageProvider — interface only, no implementation.
export interface NarrationRequest {
  text: string;
  voiceId?: string;
  language?: string;
}

export interface NarrationResult {
  assetStorageKey: string;
  durationMs: number;
  model: string;
}

export interface NarrationProvider {
  generateNarration(request: NarrationRequest): Promise<NarrationResult>;
}
