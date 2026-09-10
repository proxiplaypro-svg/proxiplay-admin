// Run only against the demo emulators (Auth 9099, Firestore 8080, Functions 5001).
import { deleteApp } from 'firebase/app';
import { firebaseApp } from './lib/firebase/client-app';
import { createRequire } from 'node:module';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFirestoreEmulator } from 'firebase/firestore';
import { connectFunctionsEmulator } from 'firebase/functions';
import { auth } from './lib/firebase/auth';
import { getConfiguredAdminEmails, isAllowedAdminEmail } from './lib/firebase/adminAccess';
import { db as clientDb } from './lib/firebase/client-app';
import { operatorFunctions } from './lib/firebase/operatorPrizeClaim';
import { markPrizesAsRetiredAction } from './lib/firebase/adminActions';
import { getWinnersList } from './lib/firebase/adminQueries';
import { POST as retiredRoute } from './app/api/admin/winners/retire/route';

if (process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== 'demo-proxiplay-lifecycle') throw Error('Demo project required');
const backendRoot = path.resolve(process.env.PROXIPLAY_MOBILE_ROOT || '../Proxiplay-develop', 'firebase/functions');
const backend = createRequire(path.join(backendRoot, 'package.json'));
const {test, assert, admin, db, time, game, participate, client, assertSucceeds} = backend('./test/lifecycle_helpers.cjs');
const {drawWinnerForAnimation} = backend('./draw_animation_winner');
const {drawReferralGame} = backend('./referral_game_engine');
const {drawWinnerForMonthlyChallenge} = backend('./monthly_challenge');
connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
connectFirestoreEmulator(clientDb, '127.0.0.1', 8080);
connectFunctionsEmulator(operatorFunctions, '127.0.0.1', 5001);
test.after(async () => { await deleteApp(firebaseApp); });
const password = 'EmulatorOnly-123456!';
async function login(uid = 'operator') {
  const email = uid === 'operator' ? getConfiguredAdminEmails()[0] : uid + '@example.test';
  try { await admin.auth().createUser({uid, email, password}); } catch (e) {
    if ((e as {code: string}).code !== 'auth/uid-already-exists' && (e as {code: string}).code !== 'auth/email-already-exists') throw e;
  }
  // Use an account accepted by the real admin screen's access guard too.
  if (uid === 'operator') {
    const account = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(account.uid, {password});
    await db.doc('users/' + account.uid).set({user_role:'admin'});
  }
  await signInWithEmailAndPassword(auth, email, password);
  assert.equal(isAllowedAdminEmail(auth.currentUser?.email), uid === 'operator');
}
async function withdraw(id: string) {
  await login();
  const rows = await getWinnersList();
  const row = rows.find(r => r.id === id);
  assert.ok(row, 'real admin query exposes the generated prize');
  assert.equal(row!.winnerId, 'player');
  assert.equal(row!.fulfillmentType, 'platform');
  const visible = await assertSucceeds(client('player').doc('prizes/' + id).get());
  const link = await assertSucceeds(client('player').doc('users/player/my_lots/' + id).get());
  assert.equal(link.data().prize_id.path, 'prizes/' + id);
  assert.equal(row!.prizeCode, visible.data().claim_code);
  const input = {prizeId:id, winnerId:'player', code:row!.prizeCode, requestId:randomUUID()};
  await assert.rejects(markPrizesAsRetiredAction({...input, code:'WRONG'}), {code:'functions/failed-precondition'});
  await assert.rejects(markPrizesAsRetiredAction({...input, winnerId:'other'}), {code:'functions/failed-precondition'});
  await login('other');
  await assert.rejects(markPrizesAsRetiredAction(input), {code:'functions/permission-denied'});
  await login();
  assert.equal((await markPrizesAsRetiredAction(input)).updatedCount, 1);
  assert.equal((await db.doc('prizes/' + id).get()).data().claimed, true);
  // No manual sync trigger invocation: the actual endpoint must commit both states.
  assert.equal((await client('player').doc('users/player/my_lots/' + id).get()).data().prize_snapshot.claimed, true);
  assert.equal((await getWinnersList()).find(r=>r.id===id)!.statusKey, 'retire');
  await assert.rejects(markPrizesAsRetiredAction({...input, requestId:randomUUID()}), {code:'functions/already-exists'});
  // Exact network retry is an acknowledgement, not a second withdrawal.
  assert.equal((await markPrizesAsRetiredAction(input)).updatedCount, 1);
}

test('animation real participation -> draw -> admin query -> SDK HTTP claim -> player snapshot', async () => {
  await db.doc('animations/a').set({name:'Animation', prize_description:'Lot', status:'active', threshold:1, start_date:time('2026-09-01'), end_date:time('2026-09-30')});
  await game('game', {animation_id:'a', hasMainPrize:false}); await participate();
  await drawWinnerForAnimation('a', {now:time('2026-10-01')}); await withdraw('animation_a');
});
test('referral invitation -> acceptance -> draw -> admin SDK HTTP claim', async () => {
  await db.doc('app_config/share_promo').set({enabled:true, isDraft:false, rewardType:'all_games_until_midnight', rewardValue:1});
  await db.doc('referral_games/r').set({status:'active', start_date:time('2020-01-01'), end_date:time('2030-01-01'), prize_description:'Parrainage'});
  const share = backend('./lib/share_promo'); const ft = backend('./test/lifecycle_helpers.cjs').ft;
  const invitation = await ft.wrap(share.createReferral)({}, {auth:{uid:'player'}});
  await ft.wrap(share.registerReferralAcceptance)({inviteCode:invitation.inviteCode}, {auth:{uid:'other'}});
  await drawReferralGame('r', {now:time('2031-01-01')}); await withdraw('referral_game_r');
});
test('monthly real participation -> qualification -> draw -> admin SDK HTTP claim', async () => {
  const config = {challenge_id:'2026-09', type:'attendance', enabled:true, month:'2026-09', target_days:1,
    title:'Challenge', prize_title:'Lot mensuel', draw_date:time('2026-10-01T09:00:00Z')};
  await db.doc('monthly_challenges/2026-09').set(config); await game(); await participate();
  process.env.EMULATOR_TEST_DATE = '2026-10-01'; await drawWinnerForMonthlyChallenge(config, 'admin_integration');
  await withdraw('monthly_challenge_2026-09');
});
test('actual admin action refuses expired and incoherent links; legacy HTTP route is gone', async () => {
  await login();
  const input = {prizeId:'expired', winnerId:'player', code:'EXPIRED123', requestId:randomUUID()};
  await db.doc('prizes/expired').set({winner_id:db.doc('users/player'), fulfillment_type:'partner', claim_code:input.code, claimed:false, usage_deadline:time('2020-01-01')});
  await db.doc('users/player/my_lots/expired').set({prize_id:db.doc('prizes/expired')});
  await assert.rejects(markPrizesAsRetiredAction(input), {code:'functions/failed-precondition'});
  await db.doc('prizes/expired').update({usage_deadline:time('2030-01-01')});
  await db.doc('users/player/my_lots/expired').update({prize_id:db.doc('prizes/wrong')});
  await assert.rejects(markPrizesAsRetiredAction(input), {code:'functions/failed-precondition'});
  assert.equal((await retiredRoute()).status, 410);
  assert.equal((await db.doc('prizes/expired').get()).data().claimed, false);
});

test('HTTP handler rejects absent and forged Auth tokens without trusting a client admin flag', async () => {
  const url = 'http://127.0.0.1:5001/demo-proxiplay-lifecycle/us-central1/claimOperatorPrize';
  for (const authorization of ['', 'Bearer forged-token']) {
    const response = await fetch(url, {method:'POST', headers:{'content-type':'application/json', ...(authorization ? {authorization} : {})},
      body:JSON.stringify({data:{prizeId:'x', winnerId:'player', code:'x', admin:true}})});
    assert.equal(response.status, 401);
  }
});
