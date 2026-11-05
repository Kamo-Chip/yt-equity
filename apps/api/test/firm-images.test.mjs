import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import {testApp} from './helpers/app.mjs';
const {app,pg,db,schema}=await testApp();after(async()=>{await app.close()});
const headers={'x-test-role':'moderator',origin:'http://localhost:3000'};
test('firm image fields round-trip through Fastify, clear, and audit without relationships',async()=>{
 const created=await app.inject({method:'POST',url:'/api/v1/moderator/firms',headers,payload:{name:'Image firm',profilePictureUrl:'https://example.com/logo.png',profilePictureBackground:'#171717'}});
 assert.equal(created.statusCode,201,created.body);const firm=created.json();
 const publicFirm=await app.inject({url:'/api/v1/firms/'+firm.id});assert.equal(publicFirm.json().profilePictureUrl,'https://example.com/logo.png');assert.equal(publicFirm.json().profilePictureBackground,'#171717');
 const invalid=await app.inject({method:'PATCH',url:'/api/v1/moderator/firms/'+firm.id,headers,payload:{profilePictureBackground:'bad'}});assert.equal(invalid.statusCode,400);
 const cleared=await app.inject({method:'PATCH',url:'/api/v1/moderator/firms/'+firm.id,headers,payload:{profilePictureUrl:null,profilePictureBackground:null}});assert.equal(cleared.statusCode,200,cleared.body);assert.equal(cleared.json().profilePictureUrl,null);assert.equal(cleared.json().profilePictureBackground,null);
 const optional=await app.inject({url:'/api/v1/firms/'+firm.id});assert.equal(optional.json().profilePictureUrl,undefined);
 assert.equal((await db.select().from(schema.auditEvents)).length,2);assert.equal((await db.select().from(schema.claims)).length,0);
});
