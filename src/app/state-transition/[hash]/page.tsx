import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ hash: 'placeholder' }];
}

export default function Page({ params }: { params: { hash: string } }) {
  return <View hash={params.hash} />;
}
