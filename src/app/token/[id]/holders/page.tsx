import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default function Page({ params }: { params: { id: string } }) {
  return <View id={params.id} />;
}
