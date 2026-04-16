import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ name: 'placeholder' }];
}

export default function Page({ params }: { params: { name: string } }) {
  return <View name={params.name} />;
}
