// ─────────────────────────────────────────
// WELCOME SCREEN — MVP11 W30
// First-run gate. Shown only when no user data exists in localStorage.
// Intentionally thin — will be polished in MVP12.
// ─────────────────────────────────────────

import { useState } from 'react';
import type { FormEvent } from 'react';

interface WelcomeScreenProps {
  onBegin: () => void;
}

export function WelcomeScreen({ onBegin }: WelcomeScreenProps) {
  const [showProfileCode, setShowProfileCode] = useState(false);
  const [profileCode, setProfileCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  function handleProfileCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Coming soon - profile codes will be available at launch');
    setProfileCode('');
  }

  return (
    <div className="flex h-dvh flex-col items-center justify-center bg-gray-900 px-6">
      <div className="flex flex-col items-center gap-6 text-center">
        <span className="text-7xl" role="img" aria-label="frog">🐸</span>

        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-bold tracking-tight text-white">
            CAN-DO-BE
          </h1>
          <p className="text-base text-gray-400">
            Your life. Your quest.
          </p>
        </div>

        <button
          type="button"
          onClick={onBegin}
          className="mt-4 w-full max-w-xs rounded-xl bg-emerald-500 px-6 py-4 text-lg font-semibold text-white shadow-lg active:bg-emerald-600"
        >
          Begin
        </button>

        <button
          type="button"
          onClick={() => {
            setShowProfileCode((current) => !current);
            setMessage(null);
          }}
          className="text-sm text-emerald-300 underline underline-offset-4"
        >
          Have a profile code? Enter it here
        </button>

        {showProfileCode && (
          <form onSubmit={handleProfileCodeSubmit} className="flex w-full max-w-xs flex-col gap-3">
            <input
              type="text"
              value={profileCode}
              onChange={(event) => setProfileCode(event.target.value)}
              placeholder="Enter profile code"
              className="rounded-xl border border-gray-700 bg-gray-800 px-4 py-3 text-white placeholder:text-gray-500 focus:border-emerald-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-xl border border-emerald-400 px-4 py-3 text-sm font-semibold text-emerald-200 active:bg-emerald-950"
            >
              Submit Code
            </button>
            {message && (
              <p className="text-sm text-gray-300">{message}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
