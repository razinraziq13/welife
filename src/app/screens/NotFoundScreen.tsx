import { Link } from 'react-router';
import { PageHeader } from '@app/components/PageHeader';
import { buttonVariants } from '@app/components/ui/button';

export function NotFoundScreen() {
  return (
    <div>
      <PageHeader title="Page not found" description="There is nothing at this address." />
      <Link to="/" className={buttonVariants()}>
        Go to Home
      </Link>
    </div>
  );
}
