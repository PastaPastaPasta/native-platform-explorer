import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ addr: 'placeholder' }];
}

export default function Page({ params }: { params: { addr: string } }) {
  return <View addr={params.addr} />;
}
