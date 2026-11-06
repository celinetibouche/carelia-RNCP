import { useState } from 'react'

type AvatarProps = {
  name: string
  src?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = { sm: 'size-9 text-xs', md: 'size-11 text-sm', lg: 'size-14 text-base' }

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toLocaleUpperCase()).join('') || '?'
}

export function Avatar({ name, src, size = 'md', className = '' }: AvatarProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const showImage = Boolean(src) && src !== failedSrc

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary font-semibold text-secondary-foreground ${sizeClasses[size]} ${className}`}
      aria-label={name}
      role="img"
    >
      {showImage ? (
        <img src={src ?? undefined} alt="" className="size-full object-cover" onError={() => setFailedSrc(src ?? null)} />
      ) : initials(name)}
    </span>
  )
}
