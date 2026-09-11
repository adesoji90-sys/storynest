import { useState } from "react";

// The real exit gate for Reading Mode — a PIN the parent set on /family
// before entering, verified server-side (with lockout after repeated
// failures) rather than a puzzle. See lib/readingModePin.ts and
// /api/family/reading-mode-pin/verify for why: a puzzle can be defeated
// by anything that computes (a calculator, a sibling), but a PIN is a
// secret the child doesn't hold, which is the actual property needed
// here.
export default function ExitReadingModeGate({ accessToken, onCancel, onSuccess }) {
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (!/^\d{4}$/.test(pin)) return setError("Enter your 4-digit PIN.");
    setError("");
    setChecking(true);
    try {
      const res = await fetch("/api/family/reading-mode-pin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.valid) {
        onSuccess();
        return;
      }
      setError(data.error || "Incorrect PIN.");
      setPin("");
    } catch {
      setError("Couldn't check the PIN — try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/40 px-6">
      <div className="w-full max-w-xs rounded-cloth bg-white p-6 text-center shadow-lg">
        <h2 className="font-display text-xl">Parents only</h2>
        <p className="mt-2 font-body text-sm text-charcoal/60">Enter your PIN to leave reading mode.</p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            autoFocus
            className="mt-4 w-full rounded-cloth border border-charcoal/15 bg-white px-4 py-2 text-center font-body text-lg tracking-widest"
          />
          {error && <p className="mt-2 font-body text-sm text-coral_ember">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={checking}
              className="flex-1 rounded-cloth bg-coral_ember px-4 py-2 font-body font-bold text-white disabled:opacity-50"
            >
              {checking ? "Checking…" : "Exit"}
            </button>
            <button type="button" onClick={onCancel} className="flex-1 rounded-cloth border border-charcoal/15 px-4 py-2 font-body">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
