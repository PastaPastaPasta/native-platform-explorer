import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ contractId: 'placeholder' }];
}

export default function Page({ params }: { params: { contractId: string } }) {
  return <View contractId={params.contractId} />;
}
