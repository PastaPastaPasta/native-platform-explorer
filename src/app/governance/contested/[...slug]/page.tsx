import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ slug: ['placeholder'] }];
}

export default function Page({ params }: { params: { slug: string[] } }) {
  return <View slug={params.slug} />;
}
