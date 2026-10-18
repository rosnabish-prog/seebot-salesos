const {test} = require('node:test');
const {strict:assert} = require('node:assert');
const {STAGES,STAGE_FIELDS,STAGE_INDEX} = require('../../../packages/shared/dist/index.js');

test('Seebot starts all opportunities at Account Researched and ends at Closed Won',()=>{
 assert.equal(STAGES[0].id,'ACCOUNT_RESEARCHED');
 assert.equal(STAGES[STAGES.length-1].id,'CLOSED_WON');
 assert.equal(STAGES.length,11);
});

test('stage identifiers are unique and ordered',()=>{
 assert.equal(new Set(STAGES.map(s=>s.id)).size,STAGES.length);
 STAGES.forEach((s,i)=>assert.equal(STAGE_INDEX[s.id],i));
});

test('each stage has associated evidence metadata',()=>{
 for(const stage of STAGES)assert.ok(Array.isArray(STAGE_FIELDS[stage.id]));
 const research=STAGE_FIELDS.ACCOUNT_RESEARCHED;
 assert.ok(research.some(f=>f.key==='researchSource'&&f.required));
 assert.ok(research.some(f=>f.key==='nextAction'&&f.required));
});

test('production negotiation requires commercial terms and handoff information',()=>{
 const evidence=STAGE_FIELDS.PRODUCTION_NEGOTIATED;
 assert.ok(evidence.some(f=>f.key==='commercialTerms'&&f.required));
 assert.ok(evidence.some(f=>f.key==='handoffOwner'&&f.required));
});
