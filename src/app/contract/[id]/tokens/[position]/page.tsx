import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ id: 'placeholder', position: '0' }];
}

export default function Page({ params }: { params: { id: string; position: string } }) {
  return <View id={params.id} position={params.position} />;
}
