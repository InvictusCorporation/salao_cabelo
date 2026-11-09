import test from 'node:test';
import assert from 'node:assert/strict';
import {birthdayClients,clientHistory} from '../clients.mjs';
import {birthDate} from '../validation.mjs';
import {localDate} from '../domain.mjs';

test('data de nascimento opcional aceita datas reais e rejeita datas futuras e inexistentes',()=>{
 assert.equal(birthDate(undefined),'');assert.equal(birthDate(''),'');
 assert.equal(birthDate('2000-02-29'),'2000-02-29');assert.equal(birthDate(localDate()),localDate());
 for(const invalid of ['2001-02-29','2000-02-30','0000-01-01','2999-11-01','09/11/1990',123])assert.throws(()=>birthDate(invalid),/nascimento/);
});
test('aniversariantes são filtrados pelo mês e ordenados pelo dia sem depender do ano',()=>{
 const clients=[{name:'Ana',birthDate:'1990-11-21'},{name:'Bia',birthDate:'2000-11-09'},{name:'Caio',birthDate:'1980-12-09'},{name:'Davi'},{name:'Eva',birthDate:''}];
 assert.deepEqual(birthdayClients(clients,'11').map(c=>c.name),['Bia','Ana']);
 assert.equal(birthdayClients(clients,'01').length,0);
 assert.deepEqual(birthdayClients([{name:'Bia',birthDate:'2000-02-29'}],'02').map(c=>c.name),['Bia']);
});
test('histórico isola o cliente, mantém cancelados e separa passado de reservas atuais',()=>{
 const appointments=[{id:'past',clientId:'a',date:'2026-11-08',start:'10:00',status:'confirmed'},
 {id:'today',clientId:'a',date:'2026-11-09',start:'09:00',status:'pending'},
 {id:'cancelled',clientId:'a',date:'2026-11-10',start:'10:00',status:'cancelled'},
 {id:'future',clientId:'a',date:'2026-11-11',start:'10:00',status:'confirmed'},
 {id:'other',clientId:'b',date:'2026-11-12',start:'10:00',status:'confirmed'}];
 const result=clientHistory(appointments,'a','2026-11-09');
 assert.deepEqual(result.all.map(a=>a.id),['future','cancelled','today','past']);
 assert.equal(result.previous,1);assert.equal(result.upcoming,2);assert.equal(result.cancelled,1);
 assert.equal(appointments[0].id,'past');assert.equal(clientHistory(appointments,'missing').all.length,0);
});
