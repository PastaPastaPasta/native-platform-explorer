import type { Metadata } from 'next';
import IdentityView from './IdentityView';

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export const metadata: Metadata = {
  title: 'Identity — Native Platform Explorer',
};

export default function Page({ params }: { params: { id: string } }) {
  return <IdentityView id={params.id} />;
}
