import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "./client-app";

export interface MerchantFollowup {
  id: string;
  merchantId: string;
  dateValue: number;
  type: "whatsapp" | "email" | "note";
  message: string;
  envoyePar: string;
  reponse: string;
  commentaire: string;
}

const COLLECTION = "merchant_followups";

export async function getFollowups(): Promise<MerchantFollowup[]> {
  const snap = await getDocs(
    query(collection(db, COLLECTION), orderBy("date", "desc")),
  );
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      merchantId: String(data.merchant_id ?? ""),
      dateValue: (data.date as Timestamp)?.toMillis() ?? 0,
      type: (data.type as MerchantFollowup["type"]) ?? "whatsapp",
      message: String(data.message ?? ""),
      envoyePar: String(data.envoye_par ?? ""),
      reponse: String(data.reponse ?? ""),
      commentaire: String(data.commentaire ?? ""),
    };
  });
}

export async function addFollowup(params: {
  merchantId: string;
  type: MerchantFollowup["type"];
  message: string;
  envoyePar: string;
}): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    merchant_id: params.merchantId,
    date: Timestamp.now(),
    type: params.type,
    message: params.message,
    envoye_par: params.envoyePar,
    reponse: "",
    commentaire: "",
  });
  return ref.id;
}

export async function updateFollowupNote(
  followupId: string,
  commentaire: string,
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, followupId), { commentaire });
}
