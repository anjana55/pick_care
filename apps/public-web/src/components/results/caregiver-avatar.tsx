import { UserRound } from 'lucide-react';
import { apiUrl } from '@/lib/api/client';
import { cn } from '@/lib/utils';

/**
 * A caregiver's profile photo on a search card or their public profile, or a
 * neutral silhouette when they have none. A plain <img>: the API serves it
 * (its own origin in some deployments), already a 640 px square, so
 * next/image would add nothing.
 */
export function CaregiverAvatar({ photoUrl, alt, className }: { photoUrl?: string | null; alt: string; className?: string }) {
  if (photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={apiUrl(photoUrl)} alt={alt} loading="lazy" className={cn('shrink-0 rounded-full border border-border object-cover', className)} />;
  }
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-full bg-brand-light text-brand-dark/50', className)}>
      <UserRound className="h-1/2 w-1/2" />
    </span>
  );
}
