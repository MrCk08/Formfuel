export function Flame({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="currentColor"
        d="M12.6 1.8c.5 2.8-.5 4.7-1.9 6.3-1.1 1.3-2 2.3-2.2 3.8.7-1.4 2-2.3 3.1-3.2-.8 2-1 3.8-.2 5.1 1.1-1.3 1.9-2.8 2.1-4.4 1.5 1.5 2.6 3.3 2.6 5.6 0 3.8-3.1 6.8-7 6.8s-7-3-7-6.8c0-2.4 1.1-4.2 2.4-5.8 1.4 2.2 2.8 3.4 4.3 3.4-.6-1.5-.4-3.1.4-4.8.9-1.6 1.6-3.5 2.4-6z"
      />
    </svg>
  )
}

export function Logo({ dotted = false }: { dotted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-[1.35rem] font-semibold tracking-tight text-ink">
      {dotted ? null : <Flame className="h-6 w-6 text-amber" />}
      <span>
        Formfuel
        {dotted ? <span className="text-amber">.</span> : null}
      </span>
    </span>
  )
}

export function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 6.5V10l2.4 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function BookmarkIcon({ filled, className }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <path
        d="M6 3.5h8A1.5 1.5 0 0 1 15.5 5v12l-5.5-3.2L4.5 17V5A1.5 1.5 0 0 1 6 3.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none">
      <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M4.5 18.5c.6-2.4 2.4-3.8 4.5-3.8s3.9 1.4 4.5 3.8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="16.5" cy="9.5" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M16 14.8c1.6.2 2.9 1.2 3.5 2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none">
      <path d="M5 19V10M10 19V5M15 19v-7M20 19H4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8.5 12.2 11 14.6 15.5 9.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none">
      <path d="M10 3.5v9M6.5 9.5 10 13l3.5-3.5M4.5 16.5h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MegaphoneIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none">
      <path d="M4 9.5v2.2a1 1 0 0 0 1 1h1.2L8 16v-3.3h1.2l6.3 2.3V5.2L9.2 7.5H5a1 1 0 0 0-1 1v1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" fill="none">
      <path d="M4 13.5 10 6.5l6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function GoogleMark() {
  return (
    <svg viewBox="0 0 18 18" className="h-4 w-4" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.9 10.7A5.4 5.4 0 0 1 3.6 9c0-.6.1-1.2.3-1.7V5H.9A9 9 0 0 0 0 9c0 1.4.3 2.8.9 4l3-2.3z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
    </svg>
  )
}
