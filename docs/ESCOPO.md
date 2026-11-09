ESCOPO DO PROJETO — APLICATIVO WEB PARA BARBEARIAS E SALÕES
INVICTUS SYSTEMS

OBJETIVO

Desenvolver um aplicativo web responsivo, acessível pelo computador e pelo celular, para gerenciar barbearias, salões de beleza e estabelecimentos que oferecem os dois tipos de atendimento.

No cadastro, o estabelecimento poderá escolher:
- Barbearia.
- Salão de beleza.
- Barbearia e salão.

Organizar o funcionamento pelos serviços oferecidos e pelos profissionais habilitados.

O nome “Invictus Beauty” é provisório.

1. PERFIS DE ACESSO

ADMINISTRADOR
- Configurar o estabelecimento.
- Cadastrar serviços e profissionais.
- Definir preços, duração dos serviços e intervalos.
- Gerenciar horários de funcionamento, fechamentos e bloqueios.
- Consultar a agenda completa da equipe.
- Criar, remarcar e cancelar agendamentos.
- Acompanhar confirmações de presença.
- Gerenciar fila de espera e ofertas de antecipação.
- Configurar lembretes.
- Ativar ou desativar o pagamento antecipado.

PROFISSIONAL
- Consultar a própria agenda.
- Acompanhar os dados dos seus atendimentos.
- Consultar confirmações de presença.
- Informar ausências e atrasos.
- Enviar avisos aos clientes afetados.

CLIENTE
- Escolher serviço e profissional.
- Consultar horários disponíveis.
- Agendar atendimento.
- Receber confirmação e lembretes.
- Confirmar presença.
- Remarcar ou cancelar.
- Informar que vai se atrasar.
- Aceitar ou recusar ofertas de antecipação.
- Pagar antecipadamente quando a opção estiver habilitada.

2. CADASTRO DO ESTABELECIMENTO

Campos e configurações:
- Nome.
- Tipo de estabelecimento.
- Logotipo e identidade visual.
- Endereço.
- Informações de contato.
- Dias e horários de funcionamento.
- Períodos de fechamento.
- Configuração dos lembretes.
- Ativação ou desativação do pagamento antecipado.

3. SERVIÇOS

Cada serviço deverá possuir:
- Nome.
- Preço.
- Duração.
- Intervalo entre atendimentos.
- Profissionais habilitados.

Exemplos para barbearia:
- Corte masculino.
- Barba.
- Acabamento.
- Corte e barba.

Exemplos para salão:
- Corte.
- Escova.
- Coloração.
- Hidratação.
- Manicure.

Permitir cadastrar outros serviços.

Serviços de salão podem envolver aplicação, espera e finalização. O funcionamento dessas etapas e a ocupação do profissional durante cada uma deverão ser definidos antes da implementação desse recurso.

4. PROFISSIONAIS

Cada profissional terá:
- Cadastro.
- Serviços que realiza.
- Agenda individual.
- Horários de atendimento.
- Intervalos.
- Bloqueios.
- Períodos de ausência.

Situações:
- Ativo.
- Ausente.
- Inativo.

Profissionais ausentes ou inativos não poderão receber novos agendamentos nos períodos em que estiverem indisponíveis. Agendamentos existentes afetados deverão ser sinalizados para tratamento pelo estabelecimento.

5. AGENDA E AGENDAMENTO

Fluxo do cliente:
1. Escolher o serviço.
2. Escolher o profissional.
3. Consultar datas e horários disponíveis.
4. Selecionar o horário.
5. Concluir o agendamento.
6. Receber a confirmação.

A disponibilidade deverá considerar:
- Funcionamento do estabelecimento.
- Disponibilidade do profissional.
- Duração do serviço.
- Intervalos.
- Ausências.
- Bloqueios.
- Reservas existentes.

Impedir sobreposição de atendimentos incompatíveis para o mesmo profissional.

Verificar novamente a disponibilidade ao concluir uma reserva ou remarcação.

Na agenda, apresentar:
- Cliente.
- Serviço.
- Profissional.
- Data.
- Horário e duração.
- Situação da confirmação de presença.

6. CONFIRMAÇÃO E LEMBRETES

Ao agendar, o cliente deverá receber:
- Serviço.
- Profissional.
- Data.
- Horário.
- Endereço.

Antes do atendimento, enviar lembrete com:
- Confirmar presença.
- Remarcar.
- Cancelar.

Próximo do horário, prever aviso com:
- Orientação para chegar cinco minutos antes.
- Opção “Vou me atrasar”.

Os horários dos lembretes serão configuráveis. Os exemplos de 24 horas e 2 horas antes são sugestões.

O canal de envio ainda deverá ser definido e integrado: WhatsApp, e-mail ou notificações do aplicativo.

Não apresentar mensagens como enviadas sem confirmação da integração responsável.

7. CONFIRMAÇÃO DE PRESENÇA

Exibir na agenda:
- Aguardando confirmação.
- Presença confirmada.

A ausência de resposta NÃO cancela automaticamente o atendimento e NÃO libera o horário.

8. ATRASOS

Disponibilizar a opção “Vou me atrasar” ao cliente.

Permitir que o profissional informe atrasos e avise os clientes afetados.

Regras obrigatórias:
- Não cancelar automaticamente por atraso.
- Não liberar automaticamente o horário por atraso.
- Não aplicar multa automática.
- Não bloquear automaticamente o cliente.

A tolerância e o procedimento de atendimento em caso de atraso ainda deverão ser detalhados.

9. CANCELAMENTO E REMARCAÇÃO

Permitir cancelamento e remarcação.

Na remarcação:
- Verificar disponibilidade e duração.
- Confirmar a mudança antes de liberar a reserva anterior.

Se existir pagamento antecipado, tratar transferência para o novo atendimento ou devolução, conforme regras que ainda serão definidas.

10. FILA DE ESPERA E ANTECIPAÇÃO

Quando surgir uma vaga, oferecer a antecipação a clientes com atendimento compatível.

Fluxo:
1. Um horário fica disponível.
2. Identificar cliente e serviço compatíveis com a vaga.
3. Enviar oferta de antecipação.
4. Apresentar:
   - Aceitar antecipação.
   - Manter meu horário.
5. Ao aceitar, verificar novamente a disponibilidade.
6. Confirmar a transferência.
7. Somente então liberar o horário anterior.

Exemplo de mensagem:
“Surgiu uma vaga hoje às 14h. Deseja antecipar seu atendimento?”

Se o cliente recusar ou não responder:
- Preservar o agendamento original.
- Oferecer a vaga ao próximo cliente.

Se a vaga já tiver sido ocupada:
- Informar que não está mais disponível.
- Preservar o agendamento original.

Impedir que dois clientes confirmem a mesma vaga.

A prioridade da fila e o prazo de resposta ainda deverão ser definidos.

11. LEMBRETES DE RETORNO

Permitir lembretes periódicos para o cliente realizar novo agendamento, por exemplo, a cada 15 dias.

Esses lembretes NÃO criam reservas automaticamente.

12. PAGAMENTO ANTECIPADO

Recurso opcional, ativado pelo estabelecimento.

Prever:
- Pagamento no agendamento.
- Tratamento de remarcação.
- Devolução quando aplicável.

Não aplicar multa automática.

Ainda definir:
- Meio de pagamento.
- Integração.
- Regras e prazos de devolução.

13. INTERFACE VISUAL

Usar a imagem aprovada como referência.

Características:
- Menu lateral preto.
- Destaques em amarelo-ouro.
- Área principal clara.
- Interface responsiva.
- Agenda por profissional.
- Indicadores de agendamentos.
- Presenças confirmadas.
- Agendamentos aguardando confirmação.
- Clientes na fila de espera.
- Próximos atendimentos.
- Central de notificações.

Menus:
- Visão geral.
- Agenda.
- Clientes.
- Profissionais.
- Serviços.
- Fila de espera.
- Notificações.
- Configurações.

As ações de confirmação e antecipação deverão estar disponíveis ao cliente. No painel administrativo, poderão aparecer como acompanhamento ou prévia das mensagens.

14. ORDEM DE IMPLEMENTAÇÃO

Etapa 1:
- Cadastro do estabelecimento.
- Cadastro de serviços.
- Cadastro de profissionais.

Etapa 2:
- Agenda.
- Disponibilidade.
- Intervalos, bloqueios e ausências.
- Prevenção de sobreposição.

Etapa 3:
- Agendamento.
- Remarcação.
- Cancelamento.
- Confirmação de presença.

Etapa 4:
- Integração de notificações.
- Lembretes.
- Avisos de atraso.

Etapa 5:
- Fila de espera.
- Oferta de antecipação.
- Transferência somente mediante aceite.

Etapa 6:
- Lembretes de retorno.

Etapa 7:
- Pagamento antecipado opcional.

15. VALIDAÇÕES IMPORTANTES

Verificar:
- Duas tentativas simultâneas de reservar o mesmo horário.
- Remarcação para horário indisponível.
- Reservas durante bloqueios ou ausências.
- Duração do serviço e intervalo necessário.
- Aceite de antecipação de vaga já ocupada.
- Preservação da reserva original quando a antecipação falhar.
- Ausência de cancelamento automático por atraso ou falta de confirmação.
- Lembretes de retorno sem criação de reservas.

16. DOCUMENTAÇÃO E SITUAÇÃO ATUAL

Registrar regras, decisões, implementação e instruções de execução em arquivos .md.

Salvar código e documentação no Git quando o repositório deste projeto estiver definido e acessível.

Situação atual:
- Escopo consolidado.
- Referência visual aprovada.
- Programação ainda não iniciada devido a bloqueio de acesso no ambiente local.

Não tratar integrações ou funcionalidades planejadas como já implementadas.