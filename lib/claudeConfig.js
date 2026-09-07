// Single source of truth for which Claude model the story-generation routes
// use. As of this writing, Claude Sonnet 5 (claude-sonnet-5) is Anthropic's
// current standard model at $2/$10 per million input/output tokens —
// cheaper than the earlier claude-sonnet-4-6 ($3/$15) this app originally
// shipped with. Check Anthropic's pricing page before launch in case a
// newer model has since become the better default.
export const CLAUDE_MODEL = "claude-sonnet-5";
