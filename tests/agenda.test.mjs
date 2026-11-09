import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,localDate,saveAppointment,validateAppointment,slots} from '../domain.mjs';
const future=new Date();future.setDate(future.getDate()+7);
const date=localDate(future);
function fixture(){const s=seed();s.business.days=[0,1,2,3,4,5,6];s.appointments=[];return s;}
const appointment=(start='10:00')=>({clientId:'pedro',serviceId:'cut',professionalId:'lucas',date,start});
test('duas reservas da mesma vaga: apenas a primeira é aceita',()=>{const s=fixture();saveAppointment(s,appointment());assert.throws(()=>saveAppointment(s,appointment()),/ocupado/);assert.equal(s.appointments.length,1);});
test('reservas consecutivas são aceitas quando não há intervalo',()=>{const s=fixture();saveAppointment(s,appointment());assert.doesNotThrow(()=>saveAppointment(s,appointment('10:30')));});
test('intervalo após serviço também ocupa a agenda',()=>{const s=fixture();s.services[0].gap=15;saveAppointment(s,appointment());assert.throws(()=>saveAppointment(s,appointment('10:30')),/ocupado/);assert.doesNotThrow(()=>saveAppointment(s,appointment('10:45')));});
test('bloqueios, ausência e inativação impedem novas reservas',()=>{for(const status of ['absent','inactive']){const s=fixture();s.professionals[0].status=status;assert.match(validateAppointment(s,appointment()),/indisponível/);}const s=fixture();s.professionals[0].blocks=[{from:date,to:date,start:'09:30',end:'11:00'}];assert.match(validateAppointment(s,appointment()),/bloqueado/);});
test('intervalo de almoço e limite do expediente são respeitados',()=>{const s=fixture();assert.match(validateAppointment(s,appointment('12:00')),/intervalo/);assert.match(validateAppointment(s,appointment('18:45')),/horário de atendimento/);});
test('dias fechados e períodos de fechamento impedem reserva',()=>{const s=fixture();s.business.days=[];assert.match(validateAppointment(s,appointment()),/fechado/);s.business.days=[0,1,2,3,4,5,6];s.business.closures=[{from:date,to:date}];assert.match(validateAppointment(s,appointment()),/fechado/);});
test('serviço incompatível com profissional é rejeitado',()=>{const s=fixture();assert.match(validateAppointment(s,{...appointment(),serviceId:'nails'}),/não realiza/);});
test('remarcação inválida preserva a reserva original',()=>{const s=fixture();const a=saveAppointment(s,appointment());saveAppointment(s,appointment('11:00'));const before=structuredClone(s.appointments);assert.throws(()=>saveAppointment(s,appointment('11:00'),a.id),/ocupado/);assert.deepEqual(s.appointments,before);});
test('remarcação válida transfere uma única reserva',()=>{const s=fixture();const a=saveAppointment(s,appointment());saveAppointment(s,appointment('11:00'),a.id);assert.equal(s.appointments.length,1);assert.equal(s.appointments[0].start,'11:00');assert.equal(validateAppointment(s,appointment()),null);});
test('sem confirmação e com atraso, a reserva continua ocupando o horário',()=>{const s=fixture();const a=saveAppointment(s,appointment());a.late=true;assert.equal(a.status,'pending');assert.match(validateAppointment(s,appointment()),/ocupado/);});
test('cancelamento explícito libera o horário e impede remarcação da reserva cancelada',()=>{const s=fixture();const a=saveAppointment(s,appointment());a.status='cancelled';assert.equal(validateAppointment(s,appointment()),null);assert.throws(()=>saveAppointment(s,appointment('11:00'),a.id),/original/);});
test('horários disponíveis consideram duração, intervalo e bloqueio',()=>{const s=fixture();saveAppointment(s,appointment());const list=slots(s,'cut','lucas',date);assert(!list.includes('10:00'));assert(!list.includes('09:45'));assert(!list.includes('12:00'));assert(list.includes('10:30'));});
test('edição do serviço não encurta a ocupação de reservas existentes',()=>{const s=fixture();const a=saveAppointment(s,{...appointment(),serviceId:'combo'});s.services.find(x=>x.id==='combo').duration=15;assert.equal(a.duration,60);assert.match(validateAppointment(s,appointment('10:30')),/ocupado/);});

