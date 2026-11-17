import { cn } from '@app/lib/cn';

/** WeLife mark: a generation tree (one parent node branching to two descendants). */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={cn('size-8', className)}>
      <rect width="512" height="512" rx="112" fill="#0e6e5c" />
      <path
        d="M256 170V250M256 250L170 330M256 250L342 330"
        stroke="#fff"
        strokeWidth="28"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="256" cy="150" r="46" fill="#f5b942" />
      <circle cx="160" cy="350" r="40" fill="#fff" />
      <circle cx="352" cy="350" r="40" fill="#fff" />
    </svg>
  );
}
