import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";

export default function Success() {
  const router = useRouter();
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("storynest_draft");
    if (!raw) {
      router.replace("/");
      return;
    }
    setDraft(JSON.parse(raw));
  }, [router]);

  const isPremium = draft?.tier === "premium";

  async function handleDownload() {
    // Same layout the emailed PDF uses (lib/generateStoryPdf.js) — this
    // button is a convenience copy, not the only place the PDF is built.
    const { buildStoryPdfBuffer } = await import("@/lib/generateStoryPdf");
    const buffer = await buildStoryPdfBuffer(draft);
    const blob = new Blob([buffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${draft.title.replace(/\s+/g, "_")}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (!draft) return null;

  return (
    <>
      <Head>
        <title>Payment successful — StoryNest</title>
      </Head>
      <main className="flex min-h-screen flex-col items-center justify-center bg-ivory_cloth px-6 text-center text-charcoal">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-leaf text-2xl text-white">✓</div>
        <h1 className="mt-6 font-display text-3xl">Payment successful!</h1>
        <p className="mt-2 font-body text-charcoal/70">
          "{draft.title}" is ready — download it below, or find it in your emailed receipt.
        </p>
        {isPremium && draft.illustrationFailedCount > 0 && (
          <p className="mt-2 max-w-sm font-body text-sm text-coral_ember">
            {draft.illustrationFailedCount} illustration(s) didn't generate cleanly — those pages will show text
            only. Contact support and we'll regenerate them.
          </p>
        )}

        <button
          onClick={handleDownload}
          className="mt-8 rounded-cloth bg-coral_ember px-8 py-3 font-body font-bold text-white"
        >
          Download PDF
        </button>

        <Link href="/account" className="mt-3 font-body text-sm text-charcoal/60 underline">
          Find it later in My Library
        </Link>
        <Link href="/characters" className="mt-2 font-body text-sm text-charcoal/60 underline">
          Create another story
        </Link>

        <div className="mt-10 flex gap-4 font-body text-sm">
          <a
            href={`https://wa.me/?text=${encodeURIComponent("I just made a personalized storybook on StoryNest!")}`}
            className="text-leaf underline"
          >
            Share on WhatsApp
          </a>
          <a
            href="https://facebook.com/sharer/sharer.php"
            target="_blank"
            rel="noreferrer"
            className="text-leaf underline"
          >
            Share on Facebook
          </a>
        </div>

        <p className="mt-12 max-w-sm font-body text-xs text-charcoal/50">
          How did your child like the story? Reply to your receipt email and let us know — we read every one.
        </p>
      </main>
    </>
  );
}
