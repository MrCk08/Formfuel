import Link from "next/link"

export function SearchCode({ code }: { code: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-chip px-2 py-0.5 font-mono text-xs font-semibold tracking-[0.14em] text-ink">
      <span className="font-sans text-[10px] font-semibold uppercase tracking-normal text-muted">Code</span>
      {code}
    </span>
  )
}

export function TagList({ tags, linked = false }: { tags: string[]; linked?: boolean }) {
  if (tags.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) =>
        linked ? (
          <Link
            key={tag}
            href={`/browse?q=${encodeURIComponent(tag)}`}
            className="rounded-full bg-chip px-2.5 py-1 text-xs text-muted hover:text-ink"
          >
            {tag}
          </Link>
        ) : (
          <span key={tag} className="rounded-full bg-chip px-2.5 py-1 text-xs text-muted">
            {tag}
          </span>
        ),
      )}
    </div>
  )
}

export function SurveyMeta({ searchCode, tags }: { searchCode: string; tags: string[] }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 text-center">
      {searchCode ? <SearchCode code={searchCode} /> : null}
      <TagList tags={tags} linked />
    </div>
  )
}
