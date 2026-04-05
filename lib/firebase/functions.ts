import { getFunctions } from "firebase/functions";
import { firebaseApp } from "./client-app";

export const functionsClient = getFunctions(firebaseApp, "europe-west1");
