export default function CampaignsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <style>{`
        /* On the animation form, keep only the merchant search field visible
           until the admin actually types a search query. */
        div:has(> label > input[placeholder="Rechercher par nom ou ville"]:placeholder-shown)
          > label
          + div:has(button) {
          display: none;
        }
      `}</style>
      {children}
    </>
  );
}
