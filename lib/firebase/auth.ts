import { getAuth } from "firebase/auth";
import { firebaseApp } from "./client-app";

export const auth = getAuth(firebaseApp);