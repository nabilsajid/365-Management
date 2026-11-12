import { redirect } from 'next/navigation';
import { getPageContext } from '@/lib/page';

export default async function Home() {
  const { isAdmin } = await getPageContext();
  redirect(isAdmin ? '/dashboard' : '/projects');
}
