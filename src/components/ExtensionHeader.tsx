"use client";

import Link from "next/link";

interface ExtensionHeaderProps {
  title: string;
  rightContent?: React.ReactNode;
  showClose?: boolean;
  showBack?: boolean;
}

export default function ExtensionHeader({ title, rightContent, showClose, showBack }: ExtensionHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-4">
      <div className="flex items-center gap-2">
        <Link href="/extension" className="h-7 w-7 rounded-md bg-accent text-text-on-accent text-sm font-bold flex items-center justify-center">
          F
        </Link>
        <p className="text-text-primary font-semibold text-lg">{title}</p>
      </div>
      <div className="flex items-center gap-2">
        {rightContent}
        {showBack && (
          <Link href="/extension/results" className="text-text-secondary hover:text-text-primary transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
        )}
        {showClose && (
          <Link href="/extension/results" className="text-text-secondary hover:text-text-primary transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}
