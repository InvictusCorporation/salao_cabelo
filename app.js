import {localDate,minutes,time,slots} from './domain.mjs';
import {birthdayClients,clientHistory} from './clients.mjs';
let birthdayMonth=localDate().slice(5,7);
let state,session=null,csrf='',needsSetup=false;
let page='Agenda',date=localDate(),filter='all',selectedClient;
const root=document.querySelector('#app'),modal=document.querySelector('#modal');
const roles={admin:'Administrador',professional:'Profissional',client:'Cliente'};
const isAdmin=()=>session?.role==='admin';
const paths={overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',calendar:'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16',clients:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87 M16 3a4 4 0 0 1 0 8',pro:'M3 7h18v14H3z M8 7V3h8v4 M8 12h1 M8 16h1 M13 12h5 M13 16h5',scissors:'M6 6a3 3 0 1 0 0 .1 M6 18a3 3 0 1 0 0 .1 M8 8l12 12 M8 16 20 4',wait:'M4 20h10 M9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6 M3 17v-2a6 6 0 0 1 9-5 M18 13v3l2 1 M23 16a5 5 0 1 0-10 0 5 5 0 0 0 10 0',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 4-3 1-1 4H9l-1-4-3-1-2-4 2-5 3-1z',plus:'M12 5v14 M5 12h14',check:'M5 12l4 4L20 5',clock:'M12 8v5l3 2 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',left:'M15 5l-7 7 7 7',right:'M9 5l7 7-7 7',close:'M6 6l12 12 M6 18 18 6',menu:'M4 6h16 M4 12h16 M4 18h16',info:'M12 11v6 M12 7h.01 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',store:'M3 10l2-7h14l2 7 M4 10v11h16V10 M3 10c0 4 4 4 5 0 0 4 7 4 8 0 0 4 5 4 5 0 M9 21v-7h6v7',list:'M9 6h12 M9 12h12 M9 18h12 M3 6h.1 M3 12h.1 M3 18h.1',arrow:'M5 12h14 M14 7l5 5-5 5',crown:'M3 8l7 14h14L33 8l-12 8L17 2l-5 14z M10 26h14'};
const icon=name=>'<svg viewBox="0 0 '+(name==='crown'?'36 30':'24 24')+'" aria-hidden="true"'+(name==='crown'?' class="crown"':'')+'><path d="'+(paths[name]||paths.calendar)+'"/></svg>';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const initials=n=>n.split(' ').filter(Boolean).map(x=>x[0]).slice(0,2).join('');
const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const by=(collection,id)=>state[collection].find(x=>x.id===id);
const names=a=>({client:by('clients',a.clientId)?.name||'Cliente',service:by('services',a.serviceId)?.name||'Serviço',pro:by('professionals',a.professionalId)?.name||'Profissional'});
const badge=a=>'<span class="badge '+a.status+'">'+(a.status==='confirmed'?'Presença confirmada':a.status==='cancelled'?'Cancelado':'Aguardando confirmação')+'</span>';
const btn=(text,action,klass='',data='')=>'<button type="button" class="btn '+klass+'" data-action="'+action+'" '+data+'>'+text+'</button>';
const empty=(title,text)=>'<div class="empty">'+icon('calendar')+'<strong>'+title+'</strong>'+text+'</div>';
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove('show'),4500);}
async function api(url,method='GET',data){
 const res=await fetch(url,{method,credentials:'same-origin',headers:method==='GET'?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf},...(method==='GET'?{}:{body:JSON.stringify(data||{})})});
 const result=await res.json();
 if(!res.ok){if(res.status===401){session=null;modal.close();render();}throw Error(result.error||'Não foi possível concluir.');}return result;
}
async function loadLatest(){const userId=session?.id;const incoming=await api('/api/state');if(session?.id!==userId)return;if(!state||incoming.revision>=state.revision)state=incoming;selectedClient=session.clientId||state.clients[0]?.id;}
async function update(mutate){
 if(!isAdmin())throw Error('Acesso exclusivo do administrador.');
 const before=structuredClone(state);mutate();
 try{state=await api('/api/admin/state','PUT',state);render();}catch(error){state=before;throw error;}
}
const menus=[['Visão geral','overview'],['Agenda','calendar'],['Clientes','clients'],['Profissionais','pro'],['Serviços','scissors'],['Fila de espera','wait'],['Notificações','bell'],['Configurações','settings']];
function render(){
 if(!session){authScreen();return;}
 if(session.mustChange){passwordScreen();return;}
 if(!state)return;

 root.innerHTML='<aside class="sidebar"><div class="brand">'+icon('crown')+'<strong>INVICTUS<br>BEAUTY</strong><small>BARBEARIA & SALÃO</small></div><nav class="nav" aria-label="Menu principal">'+visibleMenus().map(([label,i])=>'<button data-page="'+label+'" class="'+(page===label?'active':'')+'">'+icon(i)+label+'</button>').join('')+'</nav><div class="sidebar-foot"><strong>INVICTUS SYSTEMS</strong><p>Cuidar do seu negócio é o nosso estilo.</p></div></aside><div class="workspace"><header class="topbar"><button class="icon-button mobile-menu" data-action="menu" aria-label="Abrir menu">'+icon('menu')+'</button><div class="breadcrumb">'+icon('store')+' Workspace <span> / &nbsp; '+esc(state.business.name)+'</span></div><div class="top-actions"><span class="local-tag">DADOS SALVOS NO SERVIDOR</span><button class="icon-button" data-page="Notificações" aria-label="Notificações">'+icon('bell')+'</button><div class="account"><span class="avatar">'+esc(initials(session.name))+'</span><div><strong>'+esc(session.name)+'</strong><small>'+roles[session.role]+'</small></div></div>'+ (session.role==='client'?btn('WhatsApp','whatsapp-preferences','small'):'')+btn('Minha senha','password','small')+btn('Sair','logout','small')+'</div></header><main class="content">'+heading()+pageContent()+'<footer class="footer"><span><i class="dot"></i> Banco de dados do estabelecimento</span><span>Invictus Systems © 2026</span></footer></main></div>';
 if(!isAdmin()){root.querySelector('.stack.side')?.remove();root.querySelector('.layout')?.classList.add('solo');root.querySelector('.topbar [data-page]')?.remove();}
 document.title='Invictus Beauty • '+page;bindPage();if(page==='Acessos')loadUsers();if(isAdmin()&&(page==='Agenda'||page==='Notificações'))loadWhatsApp();
}
function heading(){
 const descriptions={'Visão geral':'Uma visão do seu dia, para cuidar de cada detalhe.','Clientes':'Relacionamentos que vão além de um atendimento.','Profissionais':'Talento, especialidades e disponibilidade da sua equipe.','Serviços':'Cada cuidado, com seu tempo e seu valor.','Fila de espera':'Organize o interesse dos clientes em novos horários.','Notificações':'Acompanhe os envios e as respostas dos clientes.','Configurações':'Seu estabelecimento, do seu jeito.','Área do cliente':'Seus horários e cuidados em um só lugar.','Acessos':'Contas e perfis vinculados ao estabelecimento.'};
 const subtitle=page==='Agenda'?new Date(date+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):descriptions[page];
 let actions=page==='Agenda'||page==='Visão geral'?btn(icon('plus')+' Novo agendamento','new-appointment','primary'):page==='Clientes'?btn(icon('plus')+' Novo cliente','new-client','primary'):page==='Profissionais'?btn(icon('plus')+' Novo profissional','new-pro','primary'):page==='Serviços'?btn(icon('plus')+' Novo serviço','new-service','primary'):page==='Fila de espera'?btn(icon('plus')+' Adicionar à fila','new-wait','primary'):page==='Área do cliente'?btn('Voltar à agenda','agenda')+btn(icon('plus')+' Agendar','new-appointment','primary'):'';
 if(!isAdmin())actions=session.role==='client'?btn(icon('plus')+' Agendar','new-appointment','primary'):btn('Informar ausência / retorno','own-status');
 if(page==='Acessos')actions=btn(icon('plus')+' Criar acesso','new-user','primary');
 return '<div class="heading"><div><span class="eyebrow">Seu negócio em boas mãos</span><h1>'+esc(page==='Agenda'?'Agenda de atendimentos':page)+'</h1><p class="subtitle">'+esc(subtitle)+'</p></div><div class="heading-actions">'+actions+'</div></div>';
}
function daily(){return state.appointments.filter(a=>a.date===date&&a.status!=='cancelled');}
function stats(){const all=daily();return '<div class="stats">'+[[all.length,'Agendamentos no dia','calendar'],[all.filter(a=>a.status==='confirmed').length,'Presenças confirmadas','check'],[all.filter(a=>a.status==='pending').length,'Aguardando confirmação','clock'],[state.waitlist.length,'Na fila de espera','clients']].map(([n,label,i])=>'<div class="stat"><div class="stat-icon">'+icon(i)+'</div><div><strong>'+n+'</strong><p>'+label+'</p></div></div>').join('')+'</div>';}
function table(appointments,clientView=false){
 if(!appointments.length)return empty('Nenhum atendimento por aqui','Os agendamentos aparecerão nesta lista.');
 return '<div class="table-wrap"><table><thead><tr><th>'+(clientView?'Data':'Cliente')+'</th><th>Serviço</th><th>Profissional</th><th>Horário</th><th>Situação</th><th></th></tr></thead><tbody>'+appointments.map(a=>{const n=names(a);return '<tr><td>'+(clientView?esc(a.date.split('-').reverse().join('/')):'<div class="client-cell"><span class="avatar">'+esc(initials(n.client))+'</span><strong>'+esc(n.client)+'</strong></div>')+'</td><td>'+esc(n.service)+'</td><td>'+esc(n.pro)+'</td><td>'+a.start+' – '+time(minutes(a.start)+a.duration)+'</td><td>'+badge(a)+(a.late?'<span class="badge neutral">Atraso informado</span>':'')+'</td><td>'+btn('Detalhes','detail','small','data-id="'+a.id+'"')+'</td></tr>';}).join('')+'</tbody></table></div>';
}
function calendar(){
 const pros=state.professionals.filter(p=>filter==='all'||p.id===filter);
 if(!pros.length)return empty('Cadastre um profissional','Adicione sua equipe para visualizar a agenda.');
 const from=Math.floor(Math.min(minutes(state.business.open),540)/60),to=Math.ceil(Math.max(minutes(state.business.close),1020)/60),height=(to-from)*76;
 return '<div class="calendar-scroll"><div class="calendar" style="--cols:'+pros.length+'"><div class="calendar-header"><div>HORÁRIO</div>'+pros.map(p=>'<div><span class="avatar">'+esc(initials(p.name))+'</span><div class="pro-info"><strong>'+esc(p.name)+'</strong><small class="'+(p.status==='active'?'':'unavailable')+'">'+esc(p.status==='active'?p.role:p.status==='absent'?'Ausente':'Inativo')+'</small></div></div>').join('')+'</div><div class="calendar-body"><div class="times">'+Array.from({length:to-from},(_,i)=>'<div class="time">'+String(i+from).padStart(2,'0')+':00</div>').join('')+'</div>'+pros.map(p=>{
 let html='';
 const block=(start,end,label)=>'<div class="break" style="top:'+Math.max(0,(minutes(start)-from*60)/60*76)+'px;height:'+((minutes(end)-minutes(start))/60*76)+'px">'+label+'</div>';
 if(p.breakStart&&p.breakEnd)html+=block(p.breakStart,p.breakEnd,'Intervalo');
 for(const b of (p.blocks||[]).filter(b=>date>=b.from&&date<=b.to))html+=block(b.start,b.end,'Bloqueado / ausência');
 html+=daily().filter(a=>a.professionalId===p.id).map(a=>{const n=names(a),affected=p.status!=='active'||(p.blocks||[]).some(b=>date>=b.from&&date<=b.to&&minutes(a.start)<minutes(b.end)&&minutes(a.start)+a.duration>minutes(b.start));return '<button class="appointment '+a.status+(a.duration<45?' compact':'')+'" data-action="detail" data-id="'+a.id+'" style="top:'+((minutes(a.start)-from*60)/60*76+4)+'px;height:'+Math.max(33,a.duration/60*76-8)+'px" aria-label="'+esc(n.client+', '+n.service+', '+a.start)+'"><strong>'+esc(n.client)+'</strong><span class="service">'+esc(n.service)+(affected?' · ⚠ Rever atendimento':'')+'</span><span class="apt-time"><i class="status-dot"></i>'+a.start+' – '+time(minutes(a.start)+a.duration)+'</span></button>';}).join('');
 const serviceId=p.serviceIds[0],free=serviceId&&slots(state,serviceId,p.id,date).find(s=>minutes(s)>=840);
 if(free&&isAdmin())html+='<button class="free-slot" data-action="slot" data-pro="'+p.id+'" data-time="'+free+'" style="top:'+((minutes(free)-from*60)/60*76+5)+'px;height:40px">'+icon('plus')+free+' · Horário disponível</button>';
 return '<div class="pro-column" style="height:'+height+'px">'+html+'</div>';
 }).join('')+'</div></div></div><div class="legend"><span><i class="dot"></i>Presença confirmada</span><span><i class="dot yellow"></i>Aguardando confirmação</span><span><i class="dot gray"></i>Intervalo / bloqueio</span></div>';
}
function notifications(){
 return '<section class="panel right-panel"><h2>'+icon('bell')+' WhatsApp do salão</h2><div id="wa-summary"><p class="subtle">Consultando conexão…</p></div><button class="btn full" data-page="Notificações">Central de mensagens</button></section>';
}
function pageContent(){
 if(page==='Agenda')return stats()+birthdayNotice()+'<div class="layout"><div class="stack"><section class="panel"><div class="panel-head"><div class="panel-title">'+icon('calendar')+'<h2>Agenda da equipe</h2></div><div class="toolbar"><button class="icon-button" data-action="prev" aria-label="Dia anterior">'+icon('left')+'</button><input aria-label="Data da agenda" type="date" id="agenda-date" value="'+date+'"><button class="icon-button" data-action="next" aria-label="Próximo dia">'+icon('right')+'</button><select id="professional-filter" aria-label="Filtrar profissional"><option value="all">Toda a equipe</option>'+state.professionals.map(p=>'<option value="'+p.id+'" '+(filter===p.id?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select></div></div>'+calendar()+'</section><section class="panel"><div class="panel-head"><div class="panel-title">'+icon('list')+'<h2>Atendimentos do dia</h2></div><small>'+daily().length+' atendimentos</small></div>'+table(daily().sort((a,b)=>a.start.localeCompare(b.start)))+'</section></div><div class="stack side">'+notifications()+'<div class="mini-banner"><span class="eyebrow">Mais tempo para cuidar</span><h3>Uma agenda organizada.<br>Uma experiência melhor.</h3><p>Configure seus serviços e sua equipe para começar.</p>'+btn('Configurar estabelecimento '+icon('arrow'),'settings')+'</div></div></div>';
 if(page==='Visão geral')return stats()+birthdayNotice()+'<div class="notice">Dados dos agendamentos salvos no banco do estabelecimento.</div><div class="cards">'+[['Receita prevista no dia',money(daily().reduce((s,a)=>s+a.price,0)),'Estimativa; não representa pagamentos.'],['Sua equipe',state.professionals.filter(p=>p.status==='active').length+' profissionais ativos',state.services.length+' serviços cadastrados.'],['Clientes',state.clients.length+' clientes',state.business.name]].map(([label,value,text])=>'<section class="entity-card"><span class="eyebrow">'+label+'</span><h2>'+esc(value)+'</h2><p>'+esc(text)+'</p></section>').join('')+'</div><section class="panel" style="margin-top:22px"><div class="panel-head"><h2>Atendimentos do dia selecionado</h2></div>'+table(daily())+'</section>';
 if(page==='Clientes')return clientsPage();
 if(page==='Profissionais')return '<div class="cards">'+state.professionals.map(p=>'<section class="entity-card"><div class="row"><span class="avatar">'+esc(initials(p.name))+'</span><span class="badge '+(p.status==='active'?'':'pending')+'">'+({active:'Ativo',absent:'Ausente',inactive:'Inativo'}[p.status])+'</span></div><h3>'+esc(p.name)+'</h3><p>'+esc(p.role)+'<br>'+p.open+' – '+p.close+' · intervalo '+(p.breakStart?p.breakStart+' – '+p.breakEnd:'não definido')+'</p><p>'+p.serviceIds.map(id=>esc(by('services',id)?.name||'')).join(' · ')+'</p><p>'+p.blocks.length+' bloqueio(s) cadastrado(s)</p>'+btn('Editar profissional','edit-pro','small','data-id="'+p.id+'"')+' '+btn('Bloquear horário','block','small','data-id="'+p.id+'"')+'</section>').join('')+'</div>';
 if(page==='Serviços')return '<div class="cards">'+state.services.map(s=>'<section class="entity-card"><span class="stat-icon">'+icon('scissors')+'</span><h3>'+esc(s.name)+'</h3><p>'+s.duration+' minutos · '+s.gap+' min de intervalo<br>'+state.professionals.filter(p=>p.serviceIds.includes(s.id)).map(p=>esc(p.name)).join(', ')+'</p><div class="row"><h2>'+money(s.price)+'</h2>'+btn('Editar serviço','edit-service','small','data-id="'+s.id+'"')+'</div></section>').join('')+'</div>';
 if(page==='Configurações')return settings();
 if(page==='Notificações')return '<div id="whatsapp-page" class="stack"><section class="panel right-panel">Carregando central de mensagens…</section></div>';
 if(page==='Fila de espera')return '<div class="notice">Cadastro de interesse disponível. Ofertas de antecipação, prioridade, prazo e transferência mediante aceite ainda serão implementados.</div><section class="panel"><div class="panel-head"><h2>Clientes interessados</h2></div>'+(state.waitlist.length?'<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Serviço</th><th></th></tr></thead><tbody>'+state.waitlist.map(w=>'<tr><td>'+esc(by('clients',w.clientId)?.name)+'</td><td>'+esc(by('services',w.serviceId)?.name)+'</td><td>'+btn('Remover','remove-wait','small','data-id="'+w.id+'"')+'</td></tr>').join('')+'</tbody></table></div>':empty('Fila de espera vazia','Adicione clientes interessados em um horário.'))+'</section>';
 if(page==='Área do cliente')return '<section class="panel"><div class="panel-head"><h2>Meus atendimentos</h2></div>'+table(state.appointments,true)+'</section>';
 if(page==='Acessos')return '<section class="panel"><div class="panel-head"><h2>Usuários do estabelecimento</h2></div><div id="users-list" class="empty">Carregando contas…</div></section>';

 return '';
}

function clientTable(clients){
 return clients.length?'<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Telefone</th><th>Aniversário</th><th>Próximas reservas</th><th></th></tr></thead><tbody>'+clients.map(c=>'<tr><td><div class="client-cell"><span class="avatar">'+esc(initials(c.name))+'</span><strong>'+esc(c.name)+'</strong></div></td><td>'+esc(c.phone||'Não informado')+'</td><td>'+birthdayLabel(c.birthDate)+'</td><td>'+clientHistory(state.appointments,c.id).upcoming+'</td><td>'+btn('Histórico','client-history','small','data-id="'+c.id+'"')+' '+btn('Editar','edit-client','small','data-id="'+c.id+'"')+'</td></tr>').join('')+'</tbody></table></div>':empty('Nenhum cliente encontrado','Tente outro nome ou cadastre um cliente.');
}
const field=(label,name,type,value,extra='')=>'<label class="field">'+label+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+extra+'></label>';
const options=(list,selected)=>list.map(x=>'<option value="'+x.id+'" '+(x.id===selected?'selected':'')+'>'+esc(x.name)+'</option>').join('');
const select=(label,name,list,selected,extra='')=>'<label class="field">'+label+'<select name="'+name+'" '+extra+'>'+options(list,selected)+'</select></label>';
function settings(){
 const b=state.business;
 return '<form id="settings-form" class="panel settings"><div class="form-grid">'+field('Nome do estabelecimento','name','text',b.name,'required maxlength="90"')+select('Tipo de estabelecimento','type',['Barbearia','Salão de beleza','Barbearia e salão'].map(name=>({id:name,name})),b.type)+field('Endereço','address','text',b.address,'maxlength="220"')+field('Contato','contact','text',b.contact,'maxlength="80"')+'<h3 class="section-label">Horário de funcionamento</h3>'+field('Abertura','open','time',b.open,'required')+field('Fechamento','close','time',b.close,'required')+'<div class="field wide">Dias de funcionamento<div class="checks">'+['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map((d,i)=>'<label><input type="checkbox" name="days" value="'+i+'" '+(b.days.includes(i)?'checked':'')+'>'+d+'</label>').join('')+'</div></div><h3 class="section-label">Preferências de lembretes</h3>'+field('Antecedência (horas)','reminders','number',b.reminders,'min="1" max="168" required')+'<div class="form-hint">Antecedência do lembrete no WhatsApp quando o canal estiver ativado. Confira a conexão em Notificações.</div><h3 class="section-label">Fechamentos do estabelecimento</h3>'+field('Início do fechamento','closureFrom','date','')+field('Fim do fechamento','closureTo','date','')+'<div class="field wide">'+(b.closures||[]).map((c,i)=>'<div>'+esc(c.from)+' a '+esc(c.to)+' '+btn('Remover','remove-closure','small','data-index="'+i+'"')+'</div>').join('')+'</div><div class="form-hint field wide">Fechamentos preservam as reservas existentes para revisão pela equipe. Pagamentos e logotipo personalizado ainda não estão disponíveis.</div></div><div class="form-error" role="alert"></div><div class="dialog-actions">'+btn('Exportar dados','export')+'<button class="btn primary" type="submit">Salvar configurações</button></div></form>';
}
function showModal(title,body){modal.innerHTML='<div class="dialog-head"><h2>'+esc(title)+'</h2><button class="icon-button" data-action="close" aria-label="Fechar">'+icon('close')+'</button></div><div class="dialog-body">'+body+'</div>';if(!modal.open)modal.showModal();}
function form(title,fields,onSubmit){
 showModal(title,'<form id="entity-form"><div class="form-grid">'+fields+'</div><div class="form-error" role="alert"></div><div class="dialog-actions">'+btn('Voltar','close')+'<button class="btn primary" type="submit">Salvar</button></div></form>');
 modal.querySelector('form').onsubmit=async e=>{e.preventDefault();const submit=e.target.querySelector('button[type=submit]');submit.disabled=true;try{await onSubmit(new FormData(e.target));modal.close();render();toast('Dados salvos no banco de dados.');}catch(err){e.target.querySelector('.form-error').textContent=err.message;}finally{submit.disabled=false;}};
}
function clientForm(id){
 const c=by('clients',id)||{};
 form(id?'Editar cliente':'Novo cliente',field('Nome completo','name','text',c.name||'','required maxlength="100"')+field('Telefone','phone','tel',c.phone||'','maxlength="30"')+field('Data de nascimento (opcional)','birthDate','date',c.birthDate||'','max="'+localDate()+'"')+whatsappFieldsForm(c,true)+'<label class="field wide">Benefício de aniversário (planejamento)<textarea name="birthdayBenefit" maxlength="300" placeholder="Ex.: hidratação de presente, acabamento ou um brinde">'+esc(c.birthdayBenefit||'')+'</textarea><span class="form-hint">Anotação interna para a equipe administrativa. Não concede benefício nem envia mensagem automaticamente.</span></label>',async fd=>{
  const name=fd.get('name').trim();if(!name)throw Error('Informe o nome do cliente.');
  await update(()=>{const value={id:id||crypto.randomUUID(),name,phone:fd.get('phone').trim(),birthDate:fd.get('birthDate'),birthdayBenefit:fd.get('birthdayBenefit').trim(),...whatsappFormData(fd)};if(id)state.clients=state.clients.map(x=>x.id===id?value:x);else state.clients.push(value);selectedClient=value.id;});
 });
}
function serviceForm(id){const s=by('services',id)||{duration:30,gap:0,price:0};form(id?'Editar serviço':'Novo serviço',field('Nome do serviço','name','text',s.name||'','required maxlength="100"')+field('Preço (R$)','price','number',s.price,'required min="0" step="0.01" max="100000"')+field('Duração (minutos)','duration','number',s.duration,'required min="15" max="600" step="5"')+field('Intervalo após o serviço (min)','gap','number',s.gap,'required min="0" max="180" step="5"')+'<div class="field wide">Profissionais habilitados<div class="checks">'+state.professionals.map(p=>'<label><input type="checkbox" name="professionalIds" value="'+p.id+'" '+(p.serviceIds.includes(id)?'checked':'')+'>'+esc(p.name)+'</label>').join('')+'</div><span class="form-hint">Alterações não modificam a duração de reservas existentes.</span></div>',async fd=>{
 const name=fd.get('name').trim();if(!name)throw Error('Informe o nome do serviço.');
 await update(()=>{const value={id:id||crypto.randomUUID(),name,price:Number(fd.get('price')),duration:Number(fd.get('duration')),gap:Number(fd.get('gap'))};if(id)state.services=state.services.map(x=>x.id===id?value:x);else state.services.push(value);for(const p of state.professionals){p.serviceIds=p.serviceIds.filter(s=>s!==value.id);if(fd.getAll('professionalIds').includes(p.id))p.serviceIds.push(value.id);}});
});}
function proForm(id){const p=by('professionals',id)||{open:'09:00',close:'19:00',status:'active',serviceIds:[],blocks:[]};form(id?'Editar profissional':'Novo profissional',field('Nome','name','text',p.name||'','required maxlength="100"')+field('Especialidade / cargo','role','text',p.role||'','required maxlength="70"')+select('Situação','status',[{id:'active',name:'Ativo'},{id:'absent',name:'Ausente'},{id:'inactive',name:'Inativo'}],p.status)+'<span></span>'+field('Início do expediente','open','time',p.open,'required')+field('Fim do expediente','close','time',p.close,'required')+field('Início do intervalo','breakStart','time',p.breakStart||'')+field('Fim do intervalo','breakEnd','time',p.breakEnd||'')+'<div class="field wide">Serviços realizados<div class="checks">'+state.services.map(s=>'<label><input type="checkbox" name="serviceIds" value="'+s.id+'" '+(p.serviceIds.includes(s.id)?'checked':'')+'>'+esc(s.name)+'</label>').join('')+'</div></div><div class="form-hint field wide">Ausências e inativação preservam reservas existentes e impedem novos agendamentos. Revise os atendimentos afetados na agenda.</div>',async fd=>{
 const v=Object.fromEntries(fd);if(!v.name.trim()||!v.role.trim())throw Error('Informe nome e cargo.');if(v.open>=v.close)throw Error('O fim do expediente precisa ser após o início.');
 if(Boolean(v.breakStart)!==Boolean(v.breakEnd)||(v.breakStart&&(v.breakStart>=v.breakEnd||v.breakStart<v.open||v.breakEnd>v.close)))throw Error('Informe um intervalo válido dentro do expediente.');
 await update(()=>{const value={...p,id:id||crypto.randomUUID(),name:v.name.trim(),role:v.role.trim(),status:v.status,open:v.open,close:v.close,breakStart:v.breakStart,breakEnd:v.breakEnd,serviceIds:fd.getAll('serviceIds')};if(id)state.professionals=state.professionals.map(x=>x.id===id?value:x);else state.professionals.push(value);});
});}
function blockForm(id){
 const p=by('professionals',id);
 form('Bloqueios de '+p.name,field('Data inicial','from','date',date,'required')+field('Data final','to','date',date,'required')+field('Início','start','time',p.open,'required')+field('Fim','end','time',p.close,'required')+'<div class="field wide">'+(p.blocks||[]).map((b,i)=>'<div>'+b.from+' a '+b.to+' · '+b.start+'–'+b.end+' '+btn('Remover','remove-block','small','data-id="'+id+'" data-index="'+i+'"')+'</div>').join('')+'</div><div class="form-hint field wide">Use também para períodos de ausência. Reservas existentes serão preservadas e sinalizadas na agenda.</div>',async fd=>{const v=Object.fromEntries(fd);if(v.from>v.to||v.start>=v.end)throw Error('Informe um período válido.');await update(()=>by('professionals',id).blocks.push(v));});
}
async function appointmentForm(id,pre={}){
 await loadLatest();
 const a=by('appointments',id),clientMode=session.role==='client';
 if(a?.status==='cancelled'){toast('Este agendamento já foi cancelado.');return;}
 if(!state.clients.length||!state.services.length||!state.professionals.length){toast('Cadastre cliente, serviço e profissional antes de agendar.');return;}
 showModal(a?'Remarcar atendimento':'Novo agendamento','<form id="appointment-form"><div class="form-grid">'+select('Cliente','clientId',clientMode?state.clients.filter(c=>c.id===selectedClient):state.clients,a?.clientId||selectedClient,'required')+select('Serviço','serviceId',state.services,a?.serviceId||pre.serviceId,'required')+select('Profissional','professionalId',state.professionals,a?.professionalId||pre.professionalId,'required')+field('Data','date','date',a?.date||date,'required min="'+localDate()+'"')+'<label class="field wide">Horário disponível<select name="start" required></select><span class="form-hint" id="slot-hint"></span></label></div><div class="form-error" role="alert"></div><div class="dialog-actions">'+btn('Voltar','close')+'<button class="btn primary" type="submit">'+(a?'Confirmar remarcação':'Concluir agendamento')+'</button></div></form>');
 const f=modal.querySelector('form');
 function refresh(keepPro=false){
  const previous=f.elements.professionalId.value,serviceId=f.elements.serviceId.value;
  const pros=state.professionals.filter(p=>p.status==='active'&&p.serviceIds.includes(serviceId));
  f.elements.professionalId.innerHTML=options(pros,keepPro?previous:a?.professionalId||pre.professionalId||previous);refreshSlots();
 }
 let slotRequest=0;
 async function refreshSlots(){
  const request=++slotRequest;f.querySelector('button[type="submit"]').disabled=true;
  const params=new URLSearchParams({serviceId:f.elements.serviceId.value,professionalId:f.elements.professionalId.value,date:f.elements.date.value,clientId:f.elements.clientId.value});
  if(a)params.set('ignoreId',a.id);let list;
  try{list=(await api('/api/availability?'+params)).slots;}catch(error){f.querySelector('.form-error').textContent=error.message;return;}
  if(request!==slotRequest)return;
  f.elements.start.innerHTML=list.length?list.map(t=>'<option '+(t===(pre.start||a?.start)?'selected':'')+'>'+t+'</option>').join(''):'<option value="">Nenhum horário disponível</option>';
  const s=by('services',f.elements.serviceId.value);f.querySelector('#slot-hint').textContent=s?money(s.price)+' · '+s.duration+' min + '+s.gap+' min de intervalo':'';
  f.querySelector('button[type="submit"]').disabled=!list.length;
 }
 f.elements.serviceId.onchange=()=>refresh(true);f.elements.professionalId.onchange=refreshSlots;f.elements.date.onchange=refreshSlots;f.elements.clientId.onchange=refreshSlots;refresh();
 f.onsubmit=async e=>{e.preventDefault();const input=Object.fromEntries(new FormData(f));try{
  await api(a?'/api/appointments/'+a.id:'/api/appointments',a?'PUT':'POST',input);
  await loadLatest();modal.close();date=input.date;render();toast(a?'Remarcação concluída. O horário anterior foi liberado.':'Agendamento salvo no banco.');
 }catch(err){f.querySelector('.form-error').textContent=err.message;}};
}
function detail(id){
 const a=by('appointments',id);if(!a)return;
 const n=names(a),clientMode=session.role==='client';
 showModal('Detalhes do atendimento','<span class="eyebrow">'+esc(n.service)+'</span><h2>'+esc(n.client)+'</h2><div class="detail-grid">'+[['Profissional',n.pro],['Data',a.date.split('-').reverse().join('/')],['Horário',a.start+' – '+time(minutes(a.start)+a.duration)],['Valor',money(a.price)]].map(([label,value])=>'<div><small>'+label+'</small><strong>'+esc(value)+'</strong></div>').join('')+'</div>'+badge(a)+(a.late?'<p class="notice">Atraso informado. O horário continua reservado.</p>':'')+'<div class="dialog-actions">'+(a.status!=='cancelled'&&session.role!=='professional'?((a.status==='pending'?btn('Confirmar presença','confirm','primary','data-id="'+id+'"'):'')+btn('Remarcar','reschedule','','data-id="'+id+'"')+(clientMode?btn('Vou me atrasar','late','','data-id="'+id+'"'):'')+btn('Cancelar atendimento','cancel','danger','data-id="'+id+'"')):'')+'</div><p class="form-hint">Mensagens automáticas dependem da ativação do WhatsApp e da autorização do cliente. '+(clientMode?'Ações disponíveis para seus atendimentos.':'Confirmações podem ser registradas pelo administrador.')+'</p>');
}
function cancelDialog(id){showModal('Cancelar atendimento?','<p class="subtitle">O horário será liberado. Não haverá multa automática.</p><div class="dialog-actions">'+btn('Voltar','detail','','data-id="'+id+'"')+btn('Confirmar cancelamento','do-cancel','danger','data-id="'+id+'"')+'</div>');}
function waitForm(){form('Adicionar à fila de espera',select('Cliente','clientId',state.clients,selectedClient,'required')+select('Serviço','serviceId',state.services,undefined,'required')+'<div class="field wide"><span class="form-hint">Este cadastro não cria reservas nem envia ofertas.</span></div>',async fd=>{if(!fd.get('clientId')||!fd.get('serviceId'))throw Error('Cadastre cliente e serviço primeiro.');await update(()=>state.waitlist.push({id:crypto.randomUUID(),clientId:fd.get('clientId'),serviceId:fd.get('serviceId')}));});}
function bindPage(){
 document.querySelector('#birthday-month')?.addEventListener('change',e=>{birthdayMonth=e.target.value;render();});
 document.querySelector('#agenda-date')?.addEventListener('change',e=>{if(e.target.value){date=e.target.value;render();}});
 document.querySelector('#professional-filter')?.addEventListener('change',e=>{filter=e.target.value;render();});
 document.querySelector('#selected-client')?.addEventListener('change',e=>{selectedClient=e.target.value;render();});
 document.querySelector('#client-search')?.addEventListener('input',e=>{const q=e.target.value.toLocaleLowerCase('pt-BR');document.querySelector('#client-results').innerHTML=clientTable(state.clients.filter(c=>(c.name+' '+c.phone).toLocaleLowerCase('pt-BR').includes(q)));});
 document.querySelector('#settings-form')?.addEventListener('submit',async e=>{
  e.preventDefault();const fd=new FormData(e.target),v=Object.fromEntries(fd),days=fd.getAll('days').map(Number);
  try{if(!v.name.trim())throw Error('Informe o nome do estabelecimento.');if(v.open>=v.close)throw Error('O fechamento deve ser após a abertura.');if(!days.length)throw Error('Selecione ao menos um dia de funcionamento.');if(Boolean(v.closureFrom)!==Boolean(v.closureTo)||(v.closureFrom&&v.closureFrom>v.closureTo))throw Error('Informe as duas datas do fechamento em ordem.');
   await update(()=>{state.business={...state.business,name:v.name.trim(),type:v.type,address:v.address.trim(),contact:v.contact.trim(),open:v.open,close:v.close,days,reminders:Number(v.reminders)};if(v.closureFrom)state.business.closures.push({from:v.closureFrom,to:v.closureTo});});toast('Configurações salvas. Revise reservas afetadas pelas mudanças.');
  }catch(err){e.target.querySelector('.form-error').textContent=err.message;}
 });
}
document.addEventListener('click',async e=>{
 try{
 const nav=e.target.closest('[data-page]');if(nav){if(!visibleMenus().some(([name])=>name===nav.dataset.page))return;page=nav.dataset.page;document.body.classList.remove('menu-open');render();return;}
 const button=e.target.closest('[data-action]');if(!button)return;const d=button.dataset;
 switch(d.action){
 case 'logout':await api('/api/auth/logout','POST');session=null;state=null;csrf='';modal.close();render();break;
 case 'password':passwordDialog();break;
 case 'whatsapp-preferences':whatsappPreferences();break;
 case 'wa-process':await api('/api/whatsapp/process','POST');await loadWhatsApp();toast('Fila verificada. Consulte a situação de cada mensagem.');break;
 case 'wa-retry':await api('/api/whatsapp/'+d.id+'/retry','POST');await loadWhatsApp();toast('Nova tentativa colocada na fila.');break;
 case 'new-user':userForm();break;
 case 'own-status':ownStatus();break;
 case 'menu':document.body.classList.toggle('menu-open');break;
 case 'close':modal.close();break;
 
 
 case 'settings':if(!isAdmin())return;page='Configurações';render();break;
 case 'preview':toast('Prévia da mensagem. Nenhuma mensagem foi enviada.');break;
 case 'prev':case 'next':{const current=new Date(date+'T12:00:00');current.setDate(current.getDate()+(d.action==='next'?1:-1));date=localDate(current);render();break;}
 case 'new-appointment':await appointmentForm();break;
 case 'slot':{const p=by('professionals',d.pro);await appointmentForm(null,{professionalId:p.id,serviceId:p.serviceIds[0],start:d.time});break;}
 case 'detail':detail(d.id);break;
 case 'reschedule':await appointmentForm(d.id);break;
 case 'confirm':await api('/api/appointments/'+d.id+'/confirm','POST');await loadLatest();render();detail(d.id);toast('Presença registrada.');break;
 case 'cancel':cancelDialog(d.id);break;
 case 'do-cancel':await api('/api/appointments/'+d.id+'/cancel','POST');await loadLatest();render();modal.close();toast('Atendimento cancelado. Horário liberado.');break;
 case 'late':await api('/api/appointments/'+d.id+'/late','POST');await loadLatest();render();detail(d.id);toast('Atraso registrado. O horário continua reservado.');break;
 case 'new-client':clientForm();break;
 case 'edit-client':clientForm(d.id);break;
 case 'client-history':showClientHistory(d.id);break;
 case 'birthdays-current':if(!isAdmin())return;birthdayMonth=localDate().slice(5,7);page='Clientes';render();break;
 case 'new-service':serviceForm();break;
 case 'edit-service':serviceForm(d.id);break;
 case 'new-pro':proForm();break;
 case 'edit-pro':proForm(d.id);break;
 case 'block':blockForm(d.id);break;
 case 'remove-block':await update(()=>by('professionals',d.id).blocks.splice(Number(d.index),1));blockForm(d.id);break;
 case 'remove-closure':await update(()=>state.business.closures.splice(Number(d.index),1));break;
 case 'new-wait':waitForm();break;
 case 'remove-wait':await update(()=>state.waitlist=state.waitlist.filter(w=>w.id!==d.id));toast('Cadastro removido da fila.');break;
 case 'export':{const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='invictus-beauty-'+localDate()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Cópia dos dados exportada.');break;}
 }
 }catch(error){toast(error.message);}
});
boot();


function visibleMenus(){
 if(session?.role==='admin')return [...menus,['Acessos','pro']];
 if(session?.role==='professional')return [['Agenda','calendar']];
 return [['Área do cliente','calendar']];
}
async function boot(){
 root.innerHTML='<div class="empty">Carregando Invictus Beauty…</div>';
 const recoveryToken=new URLSearchParams(location.hash.slice(1)).get('admin-recovery');
 if(recoveryToken){history.replaceState(null,'',location.pathname+location.search);await adminRecoveryScreen(recoveryToken);return;}
 try{
  const status=await api('/api/auth/status');needsSetup=status.needsSetup;
  if(status.authenticated){const result=await api('/api/auth/me');session=result.user;csrf=result.csrf;await enterWorkspace();}
  else authScreen();
 }catch(error){root.innerHTML='<div class="auth-shell"><section class="panel auth-card"><h1>Servidor indisponível</h1><p>'+esc(error.message)+'</p><p>Confira se o servidor está em execução e recarregue a página.</p></section></div>';}
}
async function enterWorkspace(){
 page=session.role==='client'?'Área do cliente':'Agenda';filter='all';
 if(!session.mustChange)await loadLatest();
 render();
}
function authScreen(mode=needsSetup?'setup':'login'){
 document.title='Invictus Beauty • Entrar';
 const setup=mode==='setup',register=mode==='register';
 root.innerHTML='<div class="auth-shell"><div class="auth-brand">'+icon('crown')+'<strong>INVICTUS BEAUTY</strong><p>Seu negócio em boas mãos.</p></div><section class="panel auth-card"><span class="eyebrow">'+(setup?'Primeiro acesso':'Bem-vindo ao seu espaço')+'</span><h1>'+(setup?'Configure seu estabelecimento':register?'Crie sua conta de cliente':'Entre na sua conta')+'</h1><p class="subtitle">'+(setup?'Crie a conta administradora para começar.':'Administrador, profissional e cliente acessam com seu e-mail e senha.')+'</p><form id="auth-form" class="auth-form"><div class="form-grid">'+(setup||register?field('Seu nome','name','text','','required autocomplete="name" maxlength="100"'):'')+(setup?field('Nome do estabelecimento','businessName','text','','required maxlength="90"'):'')+field('E-mail','email','email','','required autocomplete="username" maxlength="254"')+ (register?field('Telefone (opcional)','phone','tel','','autocomplete="tel" maxlength="30"')+field('Data de nascimento (opcional)','birthDate','date','','max="'+localDate()+'" autocomplete="bday"')+whatsappFieldsForm({},false):'')+field('Senha'+(setup||register?' (mínimo 12 caracteres)':''),'password','password','','required '+(setup||register?'minlength="12" autocomplete="new-password"':'autocomplete="current-password"')+' maxlength="128"')+'</div><div class="form-error" role="alert"></div><button type="submit" class="btn primary full">'+(setup?'Criar estabelecimento':register?'Criar conta':'Entrar')+'</button></form>'+(!setup?'<button type="button" class="auth-link" id="auth-switch">'+(register?'Já tenho uma conta':'Sou cliente e quero me cadastrar')+'</button>':'')+'<p class="form-hint">Seus dados e agendamentos são salvos no banco do estabelecimento. O WhatsApp só envia mensagens quando ativado pelo salão e autorizado por você.</p></section><span class="subtle">INVICTUS SYSTEMS</span></div>';
 root.querySelector('#auth-switch')?.addEventListener('click',()=>authScreen(register?'login':'register'));
 root.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const f=e.target,submit=f.querySelector('button[type="submit"]');submit.disabled=true;
  try{const result=await api('/api/auth/'+mode,'POST',{...Object.fromEntries(new FormData(f)),...(register?whatsappFormData(new FormData(f)):{})});session=result.user;csrf=result.csrf;needsSetup=false;await enterWorkspace();}
  catch(error){f.querySelector('.form-error').textContent=error.message;}
  finally{submit.disabled=false;}
 };
}
function passwordFields(){
 return field('Senha atual','currentPassword','password','','required autocomplete="current-password" maxlength="128"')+field('Nova senha (mínimo 12 caracteres)','password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')+field('Repita a nova senha','repeat','password','','required minlength="12" maxlength="128" autocomplete="new-password"');
}
async function changePassword(fd){
 if(fd.get('password')!==fd.get('repeat'))throw Error('As novas senhas precisam ser iguais.');
 const result=await api('/api/account/password','POST',{currentPassword:fd.get('currentPassword'),password:fd.get('password')});
 session=result.user;csrf=result.csrf;
}
function passwordScreen(){
 root.innerHTML='<div class="auth-shell"><section class="panel auth-card"><h1>Crie sua senha pessoal</h1><p class="subtitle">Seu primeiro acesso usa uma senha temporária. Altere-a para continuar.</p><form class="auth-form"><div class="form-grid">'+passwordFields()+'</div><div class="form-error" role="alert"></div><button class="btn primary full" type="submit">Alterar senha e continuar</button></form>'+btn('Sair','logout','full')+'</section></div>';
 root.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,button=f.querySelector('button');button.disabled=true;try{await changePassword(new FormData(f));await enterWorkspace();}catch(error){f.querySelector('.form-error').textContent=error.message;}finally{button.disabled=false;}};
}
function passwordDialog(){form('Alterar minha senha',passwordFields(),async fd=>{await changePassword(fd);await loadLatest();});}
function userForm(){
 const fields=select('Perfil','role',[{id:'professional',name:'Profissional'},{id:'client',name:'Cliente'}],'professional')+select('Cadastro vinculado','referenceId',state.professionals,undefined,'required')+field('E-mail de acesso','email','email','','required autocomplete="off" maxlength="254"')+field('Senha temporária (mínimo 12 caracteres)','password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')+'<div class="form-hint field wide">Cadastre o profissional ou cliente antes de criar o acesso. A troca da senha temporária será obrigatória no primeiro login. Combine a entrega dessa senha diretamente com a pessoa; o aplicativo não envia mensagens.</div>';
 form('Criar acesso',fields,async fd=>{await api('/api/users','POST',Object.fromEntries(fd));});
 const f=modal.querySelector('form');f.elements.role.onchange=()=>{f.elements.referenceId.innerHTML=options(f.elements.role.value==='professional'?state.professionals:state.clients);};
}
async function loadUsers(){
 const target=document.querySelector('#users-list');
 try{const data=await api('/api/users');if(!target.isConnected)return;target.className='table-wrap';target.innerHTML='<table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Situação</th></tr></thead><tbody>'+data.users.map(u=>'<tr><td><strong>'+esc(u.name)+'</strong></td><td>'+esc(u.email)+'</td><td>'+roles[u.role]+'</td><td>'+esc(u.mustChange?'Troca de senha pendente':'Conta ativa')+'</td></tr>').join('')+'</tbody></table>';}
 catch(error){target.textContent=error.message;}
}
function ownStatus(){
 const p=state.professionals.find(p=>p.id===session.professionalId);
 if(!p)return;
 form('Minha disponibilidade',select('Situação','status',[{id:'active',name:'Ativo'},{id:'absent',name:'Ausente'}],p.status)+'<div class="form-hint field wide">Marcar ausência impede novas reservas. Seus atendimentos existentes serão preservados para revisão pelo administrador. Não há envio automático de avisos.</div>',async fd=>{await api('/api/professional/status','POST',{status:fd.get('status')});await loadLatest();});
}
setInterval(async()=>{
 if(!session||session.mustChange||modal.open||!['Agenda','Visão geral','Área do cliente'].includes(page)||document.hidden)return;
 try{await loadLatest();render();}catch{}
},15000);


function birthdayLabel(value){return value?esc(value.slice(8,10)+'/'+value.slice(5,7)):'Não informado';}
function birthdayNotice(){
 if(!isAdmin())return '';
 const clients=birthdayClients(state.clients),today=localDate().slice(5);
 if(!clients.length)return '';
 const countToday=clients.filter(c=>c.birthDate.slice(5)===today).length;
 return '<div class="birthday-notice">'+icon('calendar')+'<div><strong>'+clients.length+' aniversariante(s) neste mês</strong><p>'+(countToday?countToday+' faz(em) aniversário hoje. ':'')+'Prepare um cuidado especial para seus clientes.</p></div><button class="btn small" data-action="birthdays-current">Ver aniversariantes</button></div>';
}
function clientsPage(){
 const list=birthdayClients(state.clients,birthdayMonth),today=localDate().slice(5);
 const months=Array.from({length:12},(_,i)=>({id:String(i+1).padStart(2,'0'),name:new Date(2024,i,15).toLocaleDateString('pt-BR',{month:'long'})}));
 return '<div class="stack"><section class="panel"><div class="panel-head"><div><h2>Aniversariantes do mês</h2><p class="subtle">Planeje um brinde ou um serviço especial.</p></div><label class="field">Mês<select id="birthday-month">'+options(months,birthdayMonth)+'</select></label></div>'+(list.length?'<div class="birthday-grid">'+list.map(c=>'<article class="birthday-card"><div class="row"><span class="avatar">'+esc(initials(c.name))+'</span><span class="badge '+(c.birthDate.slice(5)===today?'':'pending')+'">'+(c.birthDate.slice(5)===today?'Hoje · ':'')+birthdayLabel(c.birthDate)+'</span></div><h3>'+esc(c.name)+'</h3><p>'+esc(c.phone||'Telefone não informado')+'</p><p class="birthday-benefit"><strong>Ideia de presente</strong><br>'+esc(c.birthdayBenefit||'Nenhum benefício planejado.')+'</p><div class="row">'+btn('Ver histórico','client-history','small','data-id="'+c.id+'"')+btn('Planejar benefício','edit-client','small','data-id="'+c.id+'"')+'</div></article>').join('')+'</div>':empty('Nenhum aniversário cadastrado neste mês','Preencha a data de nascimento nos cadastros para lembrar de cada cliente.'))+'<p class="form-hint birthday-foot">Lembrete no painel. Aniversários só são enviados com autorização do cliente e WhatsApp ativado. Benefícios não são concedidos automaticamente.</p></section><section class="panel"><div class="panel-head"><h2>'+state.clients.length+' clientes cadastrados</h2><input class="search" id="client-search" placeholder="Buscar por nome ou telefone" aria-label="Buscar clientes"></div><div id="client-results">'+clientTable(state.clients)+'</div></section></div>';
}
function showClientHistory(id){
 if(!isAdmin())return;
 const c=by('clients',id);if(!c)return;
 const history=clientHistory(state.appointments,id);
 const rows=history.all.map(a=>{const n=names(a);return '<tr><td>'+esc(a.date.split('-').reverse().join('/'))+'<br><span class="subtle">'+a.start+'</span></td><td>'+esc(n.service)+'<br><span class="subtle">'+a.duration+' min</span></td><td>'+esc(n.pro)+'</td><td>'+money(a.price)+'</td><td>'+badge(a)+(a.late?'<span class="badge neutral">Atraso informado</span>':'')+'</td></tr>';}).join('');
 showModal('Histórico de '+c.name,'<div class="detail-grid"><div><small>Telefone</small><strong>'+esc(c.phone||'Não informado')+'</strong></div><div><small>Aniversário</small><strong>'+birthdayLabel(c.birthDate)+'</strong></div></div><div class="history-summary"><span><strong>'+history.previous+'</strong> agendamentos anteriores</span><span><strong>'+history.upcoming+'</strong> hoje / futuros</span><span><strong>'+history.cancelled+'</strong> cancelados</span></div>'+(history.all.length?'<div class="table-wrap"><table><thead><tr><th>Data / hora</th><th>Serviço</th><th>Profissional</th><th>Valor previsto</th><th>Situação</th></tr></thead><tbody>'+rows+'</tbody></table></div>':empty('Sem agendamentos registrados','Os próximos agendamentos deste cliente aparecerão aqui.'))+'<p class="form-hint">O histórico inclui reservas e cancelamentos. A confirmação de presença não comprova que o serviço foi realizado ou pago.</p>'+btn('Editar cadastro / benefício','edit-client','small','data-id="'+c.id+'"'));
}


function whatsappFieldsForm(c={},admin=false){
 return field('WhatsApp com DDI (opcional)','whatsappNumber','tel',c.whatsappNumber||'','maxlength="35" placeholder="+55 85 99999-9999" autocomplete="tel"')+'<div class="field wide"><div class="checks wa-consent"><label><input type="checkbox" name="whatsappAppointments" '+(c.whatsappAppointments?'checked':'')+'>'+ (admin?'Cliente autorizou confirmações e lembretes pelo WhatsApp.':'Autorizo receber confirmações e lembretes do salão pelo WhatsApp.')+'</label><label><input type="checkbox" name="whatsappBirthdays" '+(c.whatsappBirthdays?'checked':'')+'>'+ (admin?'Cliente autorizou felicitações e ofertas de aniversário.':'Autorizo receber felicitações e ofertas de aniversário pelo WhatsApp.')+'</label></div><span class="form-hint">'+(admin?'Registre somente autorizações que o cliente concedeu. ':'As autorizações são opcionais. ')+'Pode retirar a autorização na sua conta ou responder SAIR pelo WhatsApp.</span></div>';
}
function whatsappFormData(fd){return {whatsappNumber:fd.get('whatsappNumber')||'',whatsappAppointments:fd.has('whatsappAppointments'),whatsappBirthdays:fd.has('whatsappBirthdays')};}
function whatsappPreferences(){
 const c=state.clients.find(c=>c.id===session.clientId);if(!c)return;
 form('Minhas preferências de WhatsApp',whatsappFieldsForm(c),async fd=>{await api('/api/account/whatsapp','PUT',whatsappFormData(fd));await loadLatest();});
}
const waStates={queued:'Na fila',sending:'Processando',accepted:'Aceita pela API',sent:'Enviada',delivered:'Entregue',read:'Lida',failed:'Falha confirmada',unknown:'Envio incerto',skipped:'Não enviada'};
const waKinds={booking:'Confirmação do agendamento',reminder:'Lembrete',birthday:'Aniversário'};
async function loadWhatsApp(){
 const target=document.querySelector('#whatsapp-page'),summary=document.querySelector('#wa-summary');
 if(!target&&!summary)return;
 try{
  const data=await api('/api/whatsapp'),cfg=data.settings;
  const title=cfg.enabled&&data.ready?'Envios ativados':data.ready?'Conexão preparada · envios desativados':'Conexão pendente · envios desativados';
  if(summary?.isConnected){const pending=data.messages.filter(m=>m.state==='queued').length;summary.innerHTML='<p class="wa-status">'+esc(title)+'</p><p class="subtle">'+pending+' mensagem(ns) na fila.</p><p class="form-hint">Aceitação da API e entrega ao cliente são acompanhadas separadamente.</p>';}
  if(!target?.isConnected)return;
  target.innerHTML='<section class="panel right-panel"><div class="panel-title">'+icon('bell')+'<h2>'+esc(title)+'</h2></div><p class="form-hint">Envios pela API oficial da Meta. Defina o número do salão e conclua a conexão antes de ativar. Os modelos precisam estar aprovados na conta.</p>'+(!data.ready?'<div class="notice">'+(data.missing.length?'A conexão do número e os modelos de mensagem precisam ser configurados.<details><summary>Detalhes para configuração</summary>'+esc(data.missing.join(', '))+'</details>':'')+(!data.webhookVerified?'O webhook ainda não foi verificado pela Meta.':'')+'</div>':'')+(data.webhookUrl?'<p class="form-hint">Webhook: '+esc(data.webhookUrl)+'</p>':'')+'<form id="wa-settings"><div class="form-grid"><div class="field wide"><div class="checks wa-consent">'+[['enabled','Ativar os envios automáticos'],['bookings','Confirmação ao criar ou remarcar um agendamento'],['reminders','Lembretes antes do atendimento'],['birthdays','Felicitações de aniversário']].map(([key,label])=>'<label><input type="checkbox" name="'+key+'" '+(cfg[key]?'checked':'')+' '+(key==='enabled'&&!data.ready&&!cfg.enabled?'disabled':'')+'>'+label+'</label>').join('')+'</div></div>'+field('Horário do aniversário (Fortaleza)','birthdayHour','number',cfg.birthdayHour,'min="8" max="18" required')+'<div class="form-hint">Lembretes: '+state.business.reminders+' horas antes, conforme Configurações. Aniversários são enviados no próprio dia, até 20h. O servidor precisa permanecer ligado.</div></div><div class="form-error" role="alert"></div><div class="dialog-actions"><button class="btn primary" type="submit">Salvar preferências</button>'+btn('Verificar fila agora','wa-process')+'</div></form></section><section class="panel"><div class="panel-head"><h2>Acompanhamento das mensagens</h2><small>Últimas 100 mensagens</small></div>'+whatsappHistory(data.messages)+'<p class="form-hint birthday-foot">“Aceita pela API” não significa entrega. Envios incertos não são repetidos automaticamente; confira no WhatsApp Manager. Pedidos de remarcação preservam a reserva até a troca ser concluída.</p></section>';
  const form=target.querySelector('form');
  form.onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button[type=submit]');b.disabled=true;try{const fd=new FormData(f);await api('/api/whatsapp','PUT',{enabled:fd.has('enabled'),bookings:fd.has('bookings'),reminders:fd.has('reminders'),birthdays:fd.has('birthdays'),birthdayHour:Number(fd.get('birthdayHour'))});await loadLatest();await loadWhatsApp();toast('Preferências do WhatsApp salvas.');}catch(error){f.querySelector('.form-error').textContent=error.message;}finally{b.disabled=false;}};
 }catch(error){if(target?.isConnected)target.textContent=error.message;if(summary?.isConnected)summary.textContent='Não foi possível consultar a conexão.';}
}
function whatsappHistory(messages){
 if(!messages.length)return empty('Nenhuma mensagem registrada','Os envios aparecerão aqui quando a conexão e as autorizações estiverem configuradas.');
 return '<div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Mensagem</th><th>Situação</th><th>Retorno do cliente / observação</th><th></th></tr></thead><tbody>'+messages.map(m=>'<tr><td>'+esc(by('clients',m.client_id)?.name||'Cliente')+'</td><td>'+esc(waKinds[m.kind])+'<br><span class="subtle">'+new Date(m.updated_at).toLocaleString('pt-BR',{timeZone:'America/Fortaleza'})+'</span></td><td><span class="badge '+(['failed','unknown'].includes(m.state)?'cancelled':['accepted','queued','sending'].includes(m.state)?'pending':'')+'">'+esc(waStates[m.state]||m.state)+'</span></td><td class="wa-observation">'+esc(m.action_requested==='reschedule'?'Remarcação solicitada — tratar na agenda':m.action_requested==='confirm'?'Presença confirmada pelo WhatsApp':m.action_requested==='cancel'?'Cancelado pelo cliente':m.error||'')+'</td><td>'+(m.state==='failed'?btn('Tentar novamente','wa-retry','small','data-id="'+m.id+'"'):'')+'</td></tr>').join('')+'</tbody></table></div>';
}


async function adminRecoveryScreen(token){
 session=null;state=null;csrf='';
 document.title='Invictus Beauty • Senha do administrador';
 try{
  const account=await api('/api/auth/admin-recovery/inspect','POST',{token});
  root.innerHTML='<div class="auth-shell"><div class="auth-brand">'+icon('crown')+'<strong>INVICTUS BEAUTY</strong></div><section class="panel auth-card"><span class="eyebrow">Acesso administrativo privado</span><h1>Defina sua senha de administrador</h1><p class="subtitle">Este acesso é exclusivo da conta administradora abaixo. Seus clientes e agendamentos serão preservados.</p><form class="auth-form"><div class="form-grid">'+field('E-mail do administrador','email','email',account.email,'readonly autocomplete="username"')+field('Nova senha (mínimo 12 caracteres)','password','password','','required minlength="12" maxlength="128" autocomplete="new-password"')+field('Repita a nova senha','repeat','password','','required minlength="12" maxlength="128" autocomplete="new-password"')+'</div><div class="form-error" role="alert"></div><button class="btn primary full" type="submit">Salvar senha de administrador</button></form><p class="form-hint">Acesso de uso único, válido até '+new Date(account.expiresAt).toLocaleTimeString('pt-BR',{timeZone:'America/Fortaleza',hour:'2-digit',minute:'2-digit'})+' (Fortaleza). Ao salvar, os acessos antigos desta conta serão encerrados. Não compartilhe este acesso.</p></section></div>';
  root.querySelector('form').onsubmit=async e=>{
   e.preventDefault();const f=e.target,fd=new FormData(f),submit=f.querySelector('button');submit.disabled=true;
   try{
    if(fd.get('password')!==fd.get('repeat'))throw Error('As novas senhas precisam ser iguais.');
    const result=await api('/api/auth/admin-recovery/complete','POST',{token,password:fd.get('password')});
    token='';f.reset();authScreen('login');root.querySelector('[name=email]').value=result.email;toast('Senha do administrador definida. Entre com sua nova senha.');
   }catch(error){f.querySelector('.form-error').textContent=error.message;}
   finally{submit.disabled=false;}
  };
 }catch(error){
  token='';root.innerHTML='<div class="auth-shell"><section class="panel auth-card"><h1>Acesso privado indisponível</h1><p class="subtitle">'+esc(error.message)+'</p><button id="back-to-login" class="btn full">Voltar ao login</button></section></div>';
  root.querySelector('button').onclick=()=>authScreen('login');
 }
}

