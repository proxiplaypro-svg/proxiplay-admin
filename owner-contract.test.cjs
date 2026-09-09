const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('server merchant creation writes both ownership fields as references',()=>{
 const source=fs.readFileSync(__dirname+'/app/api/admin/marchands/route.ts','utf8');
 for(const field of ['owner','owner_id']) assert.match(source,new RegExp(field+': adminDb\\.doc\\('));
});
test('client merchant edition writes references or deletes both ownership fields',()=>{
 const source=fs.readFileSync(__dirname+'/app/admin/commercants/[merchantId]/edit/page.tsx','utf8');
 for(const field of ['owner','owner_id']) assert.ok(source.includes(field+': ownerUserId ? doc(db, "users", ownerUserId) : deleteField()'));
});
