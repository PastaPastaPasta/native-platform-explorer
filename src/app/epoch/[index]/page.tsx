import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ index: '0' }];
}

export default function Page({ params }: { params: { index: string } }) {
  return <View index={params.index} />;
}
