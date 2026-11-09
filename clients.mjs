import {localDate} from './domain.mjs';

export function birthdayClients(clients, month=localDate().slice(5,7)) {
 return clients.filter(c=>c.birthDate&&c.birthDate.slice(5,7)===String(month).padStart(2,'0'))
  .sort((a,b)=>a.birthDate.slice(8).localeCompare(b.birthDate.slice(8))||a.name.localeCompare(b.name,'pt-BR'));
}
export function clientHistory(appointments,clientId,today=localDate()) {
 const all=appointments.filter(a=>a.clientId===clientId).sort((a,b)=>(b.date+b.start).localeCompare(a.date+a.start));
 return {all,previous:all.filter(a=>a.status!=='cancelled'&&a.date<today).length,
  upcoming:all.filter(a=>a.status!=='cancelled'&&a.date>=today).length,
  cancelled:all.filter(a=>a.status==='cancelled').length};
}
