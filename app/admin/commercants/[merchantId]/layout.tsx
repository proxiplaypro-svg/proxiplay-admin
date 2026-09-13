import type { ReactNode } from "react";
import GooglePlaceIdEditor from "./GooglePlaceIdEditor";

type MerchantLayoutProps = {
  children: ReactNode;
  params: Promise<{
    merchantId: string;
  }>;
};

export default async function MerchantLayout({ children, params }: MerchantLayoutProps) {
  const { merchantId } = await params;

  return (
    <>
      {children}
      <GooglePlaceIdEditor merchantId={merchantId} />
    </>
  );
}
