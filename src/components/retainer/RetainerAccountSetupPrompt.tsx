"use client";

import { Check } from "lucide-react";
import Button from "@/components/ui/Button";

interface RetainerAccountSetupPromptProps {
  open: boolean;
  userName: string;
  onCreateAccount: () => void;
  onDefer: () => void;
}

function getFirstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export default function RetainerAccountSetupPrompt({
  open,
  userName,
  onCreateAccount,
  onDefer,
}: RetainerAccountSetupPromptProps) {
  if (!open) return null;

  const firstName = getFirstName(userName);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-100/95 p-4 overflow-y-auto">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-8 py-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex gap-1">
              <div className="h-1 w-10 rounded-full bg-[#C10007]" />
              <div className="h-1 w-10 rounded-full bg-[#C10007]" />
            </div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Step 2 of 2 · Account setup
            </p>
          </div>

          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-14 h-14 mb-5 rounded-full bg-green-50 flex items-center justify-center">
              <Check className="w-7 h-7 text-green-500" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3">
              Retainer submitted
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed max-w-md">
              Thanks, {firstName}. Your agreement is on file. To access your
              dashboard, set a password for your iClosed account.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              size="md"
              fullWidth
              onClick={onCreateAccount}
              className="rounded-full"
            >
              Yes, create my account
            </Button>
            <Button
              size="md"
              variant="secondary"
              fullWidth
              onClick={onDefer}
              className="rounded-full bg-white"
            >
              No, I&apos;ll do it later
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
