import type { Metadata } from "next";
import SuccessPageContent from "./success-content";

export const metadata: Metadata = {
  title: "Order Complete",
  // This page only renders anything useful with a valid Stripe
  // session_id and is single-use per order — there's nothing here
  // worth a search engine indexing, and a different person hitting an
  // old/expired session link should never land on this via search.
  robots: {
    index: false,
    follow: false,
  },
};

export default function SuccessPage() {
  return <SuccessPageContent />;
}
