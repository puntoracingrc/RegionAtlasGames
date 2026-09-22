'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../history/aecar-gt8-history.json'),'utf8'));

test('historical title table is reproduced by the 43 championship records',()=>{
  assert.equal(data.championshipPodiums.length,43);
  assert.equal(Object.keys(data.computedTitleCounts).length,24);
  assert.equal(Object.values(data.computedTitleCounts).reduce((sum,value)=>sum+value,0),43);
  assert.ok(data.titleComparisons.every(item=>item.matches));
  assert.equal(data.computedTitleCounts['Toni Santana Yanes'],12);
  assert.equal(data.computedTitleCounts['Marc Ibars Pola'],4);
});

test('Copa de España stays separate and unresolved evidence remains explicit',()=>{
  assert.equal(data.otherNationalCompetitions.length,2);
  assert.ok(data.otherNationalCompetitions.every(item=>item.countsForChampionshipTitles===false));
  assert.deepEqual(data.knownConflicts.map(item=>item.status).sort(),['PARTIAL_SUPPORT','UNRESOLVED','UNRESOLVED']);
  assert.equal(data.championshipPodiums.filter(item=>item.verification==='verified_document').length,40);
});
