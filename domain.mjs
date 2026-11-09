export const minutes = value => { const [h,m] = value.split(':').map(Number); return h*60+m; };
export const time = value => String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');
export const overlap = (a,b,c,d) => a<d && c<b;
export const localDate = (date=new Date()) => {
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const get=type=>parts.find(p=>p.type===type).value;
 return get('year')+'-'+get('month')+'-'+get('day');
};
export function validateAppointment(state, a, ignoreId) {
 const service=state.services.find(s=>s.id===a.serviceId);
 const pro=state.professionals.find(p=>p.id===a.professionalId);
 if(!service || !pro) return 'Selecione um serviço e um profissional.';
 if(!state.clients.some(c=>c.id===a.clientId)) return 'Selecione um cliente cadastrado.';
 if(pro.status!=='active') return 'Este profissional está indisponível.';
 if(!pro.serviceIds.includes(service.id)) return 'O profissional não realiza este serviço.';
 if(typeof a.date!=='string'||typeof a.start!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(a.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(a.start)||!Number.isFinite(Date.parse(a.date+'T12:00:00Z'))||new Date(a.date+'T12:00:00Z').toISOString().slice(0,10)!==a.date) return 'Informe data e horário válidos.';
 if(a.date<localDate()) return 'Escolha uma data a partir de hoje.';
 const day = new Date(a.date+'T12:00:00').getDay();
 if(!state.business.days.includes(day)) return 'O estabelecimento está fechado neste dia.';
 if((state.business.closures||[]).some(c=>a.date>=c.from&&a.date<=c.to)) return 'O estabelecimento está fechado neste período.';
 const start=minutes(a.start), end=start+Number(service.duration)+Number(service.gap);
 if(!Number.isFinite(start)||start<0||start>=1440) return 'Horário inválido.';
 const opening=Math.max(minutes(state.business.open),minutes(pro.open));
 const closing=Math.min(minutes(state.business.close),minutes(pro.close));
 if(start<opening || end>closing) return 'O serviço e o intervalo devem caber no horário de atendimento.';
 if(pro.breakStart && pro.breakEnd && overlap(start,end,minutes(pro.breakStart),minutes(pro.breakEnd))) return 'Horário indisponível: intervalo do profissional.';
 if((pro.blocks||[]).some(b=>a.date>=b.from&&a.date<=b.to && overlap(start,end,minutes(b.start),minutes(b.end)))) return 'Horário bloqueado ou período de ausência.';
 if(state.appointments.some(b=>b.id!==ignoreId&&b.status!=='cancelled'&&b.professionalId===a.professionalId&&b.date===a.date&&overlap(start,end,minutes(b.start),minutes(b.start)+Number(b.duration)+Number(b.gap)))) return 'Este horário já está ocupado. Escolha outro horário.';
 return null;
}
export function slots(state, serviceId, professionalId, date, ignoreId, clientId=state.clients[0]?.id) {
 const result=[];
 for(let n=minutes(state.business.open);n<minutes(state.business.close);n+=15) {
  const start=time(n);
  if(!validateAppointment(state,{serviceId,professionalId,date,start,clientId},ignoreId)) result.push(start);
 }
 return result;
}
export function saveAppointment(state, input, ignoreId) {
 const error=validateAppointment(state,input,ignoreId);
 if(error) throw new Error(error);
 const previous=ignoreId?state.appointments.find(a=>a.id===ignoreId):null;
 if(ignoreId&&(!previous||previous.status==='cancelled')) throw new Error('O agendamento original não está disponível.');
 const service=state.services.find(s=>s.id===input.serviceId);
 const appointment={...previous,...input,id:previous?.id||crypto.randomUUID(),duration:service.duration,gap:service.gap,price:service.price,status:previous?.status||'pending'};
 if(previous) state.appointments=state.appointments.map(a=>a.id===ignoreId?appointment:a); else state.appointments.push(appointment);
 return appointment;
}
export function seed() {
 const date=localDate();
 return {version:1,business:{name:'Studio Invictus',type:'Barbearia e salão',address:'',contact:'',open:'09:00',close:'19:00',days:[1,2,3,4,5,6],closures:[],reminders:24},
 services:[{id:'cut',name:'Corte masculino',price:45,duration:30,gap:0},{id:'combo',name:'Corte + barba',price:75,duration:60,gap:0},{id:'color',name:'Coloração',price:180,duration:120,gap:0},{id:'blow',name:'Escova',price:65,duration:60,gap:0},{id:'nails',name:'Manicure',price:35,duration:60,gap:0}],
 professionals:[{id:'lucas',name:'Lucas',role:'Barbeiro',status:'active',serviceIds:['cut','combo'],open:'09:00',close:'19:00',breakStart:'12:00',breakEnd:'13:00',blocks:[]},{id:'marina',name:'Marina',role:'Cabeleireira',status:'active',serviceIds:['color','blow'],open:'09:00',close:'19:00',breakStart:'12:00',breakEnd:'13:00',blocks:[]},{id:'ana',name:'Ana',role:'Manicure',status:'active',serviceIds:['nails'],open:'09:00',close:'18:00',breakStart:'12:00',breakEnd:'13:00',blocks:[]}],
 clients:[{id:'pedro',name:'Pedro Santos',phone:''},{id:'juliana',name:'Juliana Costa',phone:''},{id:'camila',name:'Camila Rocha',phone:''},{id:'rafael',name:'Rafael Lima',phone:''},{id:'fernanda',name:'Fernanda Alves',phone:''}],
 appointments:[{id:'a1',clientId:'pedro',serviceId:'combo',professionalId:'lucas',date,start:'09:00',duration:60,gap:0,price:75,status:'confirmed'},{id:'a2',clientId:'juliana',serviceId:'color',professionalId:'marina',date,start:'09:00',duration:120,gap:0,price:180,status:'confirmed'},{id:'a3',clientId:'camila',serviceId:'nails',professionalId:'ana',date,start:'10:00',duration:60,gap:0,price:35,status:'pending'},{id:'a4',clientId:'rafael',serviceId:'cut',professionalId:'lucas',date,start:'11:00',duration:30,gap:0,price:45,status:'confirmed'},{id:'a5',clientId:'fernanda',serviceId:'blow',professionalId:'marina',date,start:'13:00',duration:60,gap:0,price:65,status:'confirmed'}],waitlist:[]};
}

