import type { HTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';
import { cn } from '@app/lib/cn';

interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** Heading level for the card title, to keep the document outline correct. */
  headingLevel?: 2 | 3;
}

/** A labelled content section. When titled, it is exposed as a named region. */
export function Card({
  title,
  description,
  headingLevel = 2,
  className,
  children,
  ...props
}: CardProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section
      aria-labelledby={title === undefined ? undefined : headingId}
      className={cn('rounded-2xl border border-border bg-surface p-5 shadow-sm', className)}
      {...props}
    >
      {title !== undefined && (
        <header className="mb-4">
          <Heading id={headingId} className="text-lg font-semibold text-fg">
            {title}
          </Heading>
          {description !== undefined && <p className="mt-1 text-sm text-muted">{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
