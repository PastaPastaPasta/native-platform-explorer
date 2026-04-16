import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ proTxHash: 'placeholder' }];
}

export default function Page({ params }: { params: { proTxHash: string } }) {
  return <View proTxHash={params.proTxHash} />;
}
