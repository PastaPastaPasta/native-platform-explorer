import View from './View';

export const dynamicParams = false;
export function generateStaticParams() {
  return [{ id: 'placeholder', type: 'placeholder', docId: 'placeholder' }];
}

export default function Page({
  params,
}: {
  params: { id: string; type: string; docId: string };
}) {
  return <View id={params.id} type={params.type} docId={params.docId} />;
}
