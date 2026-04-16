import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ contractId: 'placeholder', position: '0' }];
}

export default function Page({
  params,
}: {
  params: { contractId: string; position: string };
}) {
  return <View contractId={params.contractId} position={params.position} />;
}
