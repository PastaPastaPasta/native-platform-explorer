import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ pkh: 'placeholder' }];
}

export default function Page({ params }: { params: { pkh: string } }) {
  return <View pkh={params.pkh} />;
}
