/**
 * Section-shaped skeleton placeholder for a lesson section.
 * Three lines at 100%, 90%, 75% width simulate a prose paragraph.
 * aria-hidden — purely decorative; the real section replaces it.
 */

import { Skeleton } from "#/components/ui/Skeleton";

export function LessonSkeleton() {
  return (
    <div
      className="wp-lesson-skeleton-section"
      aria-hidden="true"
      data-testid="lesson-section-skeleton"
    >
      <Skeleton width="100%" height="1.1rem" />
      <Skeleton width="90%" height="1.1rem" />
      <Skeleton width="75%" height="1.1rem" />
    </div>
  );
}
