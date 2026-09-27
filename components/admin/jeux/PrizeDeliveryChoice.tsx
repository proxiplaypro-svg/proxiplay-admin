"use client";
import {useEffect, useState} from 'react';
import {doc, getDoc, updateDoc} from 'firebase/firestore';
import {db} from '@/lib/firebase/client-app';

export function PrizeDeliveryChoice({value, onChange}: {value?: string; onChange: (value: 'merchant' | 'platform')=>void}) {
  return <fieldset className="my-3 rounded border p-3"><legend>Remise du lot</legend>
    <label className="mr-5"><input type="radio" checked={value !== 'platform'} onChange={()=>onChange('merchant')} /> Par le commerçant / partenaire</label>
    <label><input type="radio" checked={value === 'platform'} onChange={()=>onChange('platform')} /> Par ProxiPlay</label>
  </fieldset>;
}

export function PartnerDeliveryContact({merchantId, collectionName='enseignes', fulfillmentType, enabled=false, onEnabledChange}: {merchantId: string | null; collectionName?: string; fulfillmentType?: string; enabled?: boolean; onEnabledChange?: (enabled: boolean)=>void}) {
  const [email,setEmail]=useState(''),[needed,setNeeded]=useState(false),[feedback,setFeedback]=useState('');
  useEffect(()=>{let active=true;setNeeded(false);setFeedback('');
    if(merchantId) void getDoc(doc(db,collectionName,merchantId)).then(s=>{if(active){setEmail(s.data()?.email||'');setNeeded(s.data()?.managed_by_admin===true && !s.data()?.owner_id && !s.data()?.owner);}}).catch(()=>{if(active)setFeedback('Impossible de lire le contact.');});
    return ()=>{active=false;};},[merchantId,collectionName]);
  if(!needed) return null;
  return <div className="my-3 rounded border p-3"><label>Email de remise du partenaire (requis pour une remise par le partenaire)
    <input type="email" className="ml-2 rounded border p-2" value={email} onChange={e=>setEmail(e.target.value)} /></label>
    <button type="button" className="ml-2 underline" onClick={async()=>{try{if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email.trim()))throw Error('Email invalide.');await updateDoc(doc(db,collectionName,merchantId!),{email:email.trim()});setFeedback('Adresse enregistrée sur la fiche partenaire.');}catch(e){setFeedback(e instanceof Error?e.message:'Enregistrement impossible.');}}}>Enregistrer l’adresse</button>
    <p role="status">{feedback}</p>
    {fulfillmentType !== 'platform' && onEnabledChange ? <label className="mt-3 flex gap-2"><input type="checkbox" checked={enabled} onChange={e=>onEnabledChange(e.target.checked)} /> <span>Envoyer automatiquement les informations des gagnants au partenaire<br/><small>Le partenaire recevra par email les informations nécessaires à la remise des lots.</small></span></label> : null}
  </div>;
}
