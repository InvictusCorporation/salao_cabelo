# Decisões e regras — v0.2

## Arquitetura

O aplicativo permanece na pasta local do projeto e não foi publicado. O servidor HTTP agora é responsável por autenticação, autorização, disponibilidade e persistência.

Foi adotado SQLite pelo suporte nativo disponível no Node.js deste computador, sem baixar bibliotecas. A API de DatabaseSync e de backup está documentada em [Node.js SQLite](https://nodejs.org/api/sqlite.html). A derivação de senhas utiliza [crypto.scrypt](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback).

Existe um estabelecimento por instalação, identificado como main no banco. As tabelas possuem business_id, mas não foi implementado cadastro de múltiplos estabelecimentos. O business_id da requisição nunca é aceito como autoridade: é obtido da conta autenticada.

Dados de cadastros são armazenados como JSON por registro, com identificador e vínculo ao estabelecimento em colunas. Agendamentos, usuários e sessões usam colunas próprias, índices e referências. O esquema tem user_version=1; futuras mudanças deverão acrescentar migrações sem descartar dados.

## Reservas e concorrência

Cada criação e remarcação inicia uma transação BEGIN IMMEDIATE, lê a agenda mais recente, verifica disponibilidade e somente então grava. O SQLite serializa escritas concorrentes e aplica gatilhos que rejeitam intervalos sobrepostos do mesmo profissional e dia. O intervalo após o serviço participa da ocupação.

Remarcação atualiza a mesma reserva; não libera a anterior antes de concluir. Falhas dão rollback. Preço, duração, intervalo e situação inicial são determinados pelo servidor, mesmo que o cliente envie outros valores.

As configurações administrativas usam comparação de revisão para impedir que formulários antigos sobrescrevam alterações feitas por outro acesso. O endpoint de configurações não aceita alterações nas reservas enviadas no corpo; elas só são modificadas pelos endpoints próprios.

## Contas e autorização

- Primeiro usuário: administrador; configuração inicial bloqueada após a primeira conta.
- Cadastro público: somente cliente, vinculado a um cadastro próprio novo.
- Acesso criado pelo administrador: profissional ou cliente já cadastrado, uma conta por vínculo.
- Senha administrativa de provisionamento: temporária, troca obrigatória antes de consultar dados.
- Administrador gerencia todos os registros do estabelecimento.
- Profissional recebe apenas sua agenda e clientes associados aos seus atendimentos.
- Cliente recebe apenas sua identidade e seus próprios atendimentos. Pode ver o catálogo de serviços e os dados necessários dos profissionais para escolher atendimento.
- A consulta de horários devolve apenas vagas, sem dados de reservas alheias.
- Senhas não são gravadas em texto puro; tokens de sessão também não são persistidos em forma utilizável como cookie.
- Senha alterada: todas as sessões são revogadas e uma nova sessão é emitida para o solicitante.
- Cookies são HttpOnly, SameSite=Strict, com validade de 12 horas. Secure fica condicionado a COOKIE_SECURE=1 para futura configuração HTTPS.
- Origem permitida é o próprio host local. A lista de hosts é limitada a localhost e loopback.
- Não se confia em perfil, cliente, profissional ou estabelecimento escolhido no navegador como prova de autorização.

## Regras de negócio preservadas

Falta de confirmação e atraso não cancelam nem liberam reservas. Não há multas ou bloqueio automático de clientes. Profissionais ausentes ou inativos não recebem reservas novas. Bloqueios e fechamentos impedem novas reservas, preservando as anteriores para tratamento.

Duração, intervalo e preço são fotografados na reserva. Alterar o serviço não modifica o atendimento retroativamente. O cancelamento é explícito e preserva o histórico. Fila de espera não cria reservas nem ofertas automaticamente.

As mensagens continuam sendo prévias. Nenhuma integração de envio ou pagamento foi adicionada.

## Limites

Grade de 15 minutos; expediente e intervalo do profissional iguais em todos os dias de funcionamento. O fuso desta instalação é America/Fortaleza. Ausência global dura até a situação ser alterada; bloqueios por período permitem ausência com data.

O banco é um arquivo persistente nesta máquina, não um serviço em nuvem. Acesso de outros dispositivos e publicação dependem de uma etapa própria de hospedagem. Recuperação e verificação de e-mail permanecem pendentes.


## Histórico e aniversário — v0.3

Dados adicionais são campos opcionais no JSON do cliente, sem mudança no esquema SQL v1. A data de nascimento é validada no servidor e pode ficar vazia. O histórico usa as reservas persistidas, incluindo cancelamentos, e não infere comparecimento ou pagamento. Planejamento do presente é apenas anotação administrativa. O lembrete é mostrado no painel, sem criação automática de reserva ou envio de mensagens. A listagem mensal inclui 29 de fevereiro no mês de fevereiro, sem antecipação automática em anos comuns.

## WhatsApp — v0.4

Foi escolhido o conector direto com a API oficial da Meta, via HTTP e configuração em ambiente. Como o número ainda não foi definido pelo proprietário, a implementação permanece desativada e foi validada apenas com mocks de transporte e bancos de teste. Credenciais não são aceitas pela interface nem persistidas nas configurações.

O esquema v2 adiciona fila, preferências, deduplicação de eventos e recibos. Envios ficam fora da transação SQL após reivindicação atômica, e a fila é criada junto da reserva. Falhas de resultado incerto não têm repetição automática. Retornos de botões são assinados, vinculados ao remetente e à fotografia do horário; solicitar remarcação não muda nem libera a reserva.

Dados de presente individual continuam internos e não entram no template de aniversário. Os modelos propostos e os limites da verificação estão documentados em WHATSAPP.md. A ativação depende do número, da conta real, da aprovação de templates e de infraestrutura HTTPS, que ainda não foram configurados.
