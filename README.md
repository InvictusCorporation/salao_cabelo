# Invictus Beauty — v0.4

Aplicativo web para barbearias e salões da Invictus Systems, com autenticação de administrador, profissional e cliente, API e banco SQLite persistente no servidor.

## Executar

Requer Node.js 22.16 ou superior com suporte a node:sqlite. Validado neste computador com Node.js 26.13. Não há dependências para instalar.

No terminal desta pasta:

```powershell
npm start
```

Abra http://127.0.0.1:4173 no mesmo computador. Para encerrar, use Ctrl+C no terminal. O servidor aceita apenas conexões locais; acesso por outros computadores e publicação ainda não foram configurados.

## Primeiro acesso

1. Preencha seu nome, nome do estabelecimento, e-mail e senha (12 a 128 caracteres).
2. A primeira conta recebe o perfil Administrador. Essa configuração só pode ser concluída uma vez.
3. Cadastre serviços em Serviços e profissionais em Profissionais. Defina os serviços que cada profissional realiza.
4. Cadastre clientes ou permita que se cadastrem pela opção “Sou cliente e quero me cadastrar”.
5. Em Acessos, crie contas vinculadas a profissionais ou clientes já cadastrados, informando e-mail e senha temporária. A troca dessa senha é obrigatória no primeiro login.
6. Crie os atendimentos na agenda, ou entre como cliente para agendar.

Não existem senhas padrão nem contas demonstrativas no banco principal. Cada pessoa escolhe a própria senha; a inicialização não exige enviar credenciais pelo chat. O formulário de login é o mesmo para os três perfis: o servidor determina as permissões a partir da conta.

## Permissões

| Perfil | Acesso |
| --- | --- |
| Administrador | Agenda completa, cadastros, configurações, fila, criação de contas vinculadas e gestão dos atendimentos. |
| Profissional | Apenas sua agenda e clientes vinculados aos seus atendimentos. Pode informar ausência ou retorno; não altera reservas ou configurações. |
| Cliente | Apenas seus próprios atendimentos. Pode agendar, remarcar, cancelar, confirmar presença e registrar atraso. Não recebe dados de reservas alheias. |

O controle ocorre na API. Alterar a interface ou enviar requisições manualmente não amplia as permissões.

## Histórico e aniversários

Em Clientes, o botão Histórico mostra os agendamentos do cliente, com data, horário, serviço, profissional, valor previsto e situação, incluindo cancelamentos. Os resumos separam agendamentos anteriores, hoje/futuros e cancelados; não representam serviços realizados nem pagamentos comprovados.

O cadastro administrativo e o cadastro público de cliente aceitam data de nascimento opcional. Datas futuras e inexistentes são rejeitadas. Cadastros antigos continuam válidos sem aniversário, sem migração ou exclusão de dados.

A página Clientes lista aniversariantes do mês escolhido; Agenda e Visão geral lembram os aniversariantes do mês atual e destacam quantos fazem aniversário hoje. Quem nasceu em 29 de fevereiro aparece no mês de fevereiro, sem mudança automática de data.

O campo Benefício de aniversário permite planejar um brinde ou serviço especial. É uma anotação administrativa, sem aplicação de desconto, criação de reserva ou envio automático. Essa anotação não é exposta ao cliente; profissionais não recebem os campos de aniversário e planejamento na API.

## WhatsApp preparado para conexão

Notificações agora mostra a configuração do canal e as últimas mensagens. Envios ficam bloqueados até preencher a configuração e verificar o webhook. O cliente escolhe separadamente autorizações para atendimento e aniversário, no cadastro ou no botão WhatsApp da sua conta. O administrador também pode registrar autorizações concedidas pelo cliente.

O worker utiliza fila SQLite persistente, a cada 30 segundos. As confirmações são enfileiradas em transação com a reserva; lembretes respeitam a antecedência configurada e aniversários respeitam o horário escolhido. Aceitação da API, envio, entrega e leitura são estados separados. SAIR retira as autorizações; remarcação por botão registra solicitação sem liberar o horário original.

Os testes de envio usam transporte simulado; nenhum envio real foi realizado. O passo a passo de conexão e os modelos propostos estão em [docs/WHATSAPP.md](docs/WHATSAPP.md) e [docs/whatsapp-templates.json](docs/whatsapp-templates.json). Tokens devem ser preenchidos localmente em .env, a partir de .env.example, ou no gerenciador de segredos da hospedagem.

## Banco e persistência

O banco principal é criado automaticamente em `data/invictus.sqlite`. Contas, senhas derivadas, sessões, cadastros, reservas e auditoria ficam no servidor. Os dados persistem após recarregar o navegador, sair da conta ou reiniciar o processo. Navegadores conectados à mesma instância consultam o mesmo banco.

O aplicativo não grava mais reservas em localStorage. Os dados demonstrativos da v0.1 permanecem no armazenamento antigo do navegador, mas não são importados automaticamente. O banco novo começa com cadastros e agenda vazios.

A disponibilidade é consultada no servidor e revalidada ao concluir. Criação e remarcação usam transação SQLite com BEGIN IMMEDIATE; gatilhos SQL também impedem sobreposição, incluindo o intervalo após o serviço. Em caso de falha, a remarcação preserva a reserva original. O fuso usado nesta instalação é America/Fortaleza.

As telas de agenda se atualizam a cada 15 segundos quando estão visíveis e sem modal aberto. Uma configuração desatualizada é recusada com conflito de versão; recarregue antes de reenviar.

## Backup

```powershell
npm run backup
```

O comando usa a API de backup do SQLite, incluindo corretamente as transações no WAL, e salva uma cópia consistente em `data/backups/`. O backup foi validado nesta entrega. A exportação JSON em Configurações serve para consultar os dados de negócio; não substitui o backup do banco, pois não contém contas e sessões.

Copie backups para um local seguro. Não copie somente o arquivo .sqlite enquanto o servidor estiver ativo: o WAL pode conter alterações ainda não incorporadas. Para uma restauração, encerre todas as instâncias, preserve os arquivos atuais e restaure uma cópia consistente; nunca substitua o banco em uso. A hospedagem futura deve usar disco persistente e política de backup, fora de uma pasta de sincronização de arquivos.

Pode-se escolher outro arquivo sem editar código:

```powershell
$env:DB_PATH = 'C:\dados-invictus\invictus.sqlite'
npm start
```

Escolha o caminho antes do primeiro cadastro para não abrir acidentalmente um banco vazio.

## Verificar

```powershell
npm test
npm run check
```

A suíte inclui regras de agenda, login e permissões, isolamento entre clientes, origem e CSRF, senhas temporárias, logout e expiração, persistência após reabrir o banco, duas conexões HTTP disputando a mesma vaga e proteção de sobreposição diretamente no SQL.

Testes automatizados utilizam bancos temporários isolados. A verificação visual também utiliza contas fictícias em banco separado. Nenhuma dessas contas é criada no banco principal.

## Segurança e escopo atual

Senhas usam scrypt com salt aleatório. Sessões têm token aleatório, somente o hash do token é persistido, e o cookie é HttpOnly e SameSite=Strict. Alterar a senha revoga sessões anteriores. Mutações exigem origem local autorizada e, após login, token CSRF. Há limite persistido de tentativas de autenticação e auditoria das alterações.

A aplicação continua local. Antes de hospedá-la, devem ser definidos domínio, HTTPS, origem permitida, cookies Secure, verificação de e-mail, recuperação de senha e operação de backups. Não há recuperação de senha por e-mail nem redefinição pelo administrador nesta entrega. Não apague o banco para recuperar acesso.

O conector WhatsApp foi implementado com fila, lembretes, aniversários, status e respostas de botões, mas os envios reais continuam desativados: o número do salão ainda não foi definido. Credenciais, modelos aprovados, hospedagem HTTPS, webhook e teste em telefone real permanecem pendentes. Consulte docs/WHATSAPP.md. E-mail, push, pagamentos e ofertas de antecipação ainda não foram integrados.

## Organização

- `server.mjs`: servidor HTTP, API e autorização.
- `database.mjs`: esquema SQLite v2, transações, persistência, auditoria e gatilhos.
- `auth.mjs`: derivação de senhas, sessões e limite de tentativas.
- `validation.mjs`: validação de configurações recebidas.
- `whatsapp.mjs` e `whatsapp-fields.mjs`: conector, fila, webhook e autorizações.
- `domain.mjs`: disponibilidade e regras de reserva.
- `app.js`, `index.html`, `styles.css`: interface e integração com a API.
- `scripts/backup.mjs`: backup consistente.
- `tests/`: testes automatizados.
- `docs/ESCOPO.md` e `docs/referencia-visual.png`: referência original.
- `docs/STATUS.md` e `docs/DECISOES.md`: situação e decisões atuais.

`data/`, bancos e segredos estão no .gitignore e não são servidos por HTTP. O servidor publica apenas os cinco arquivos públicos explicitamente permitidos.

Repositório do projeto: https://github.com/InvictusCorporation/salao_cabelo

Para obter o código em outro computador:

```powershell
git clone https://github.com/InvictusCorporation/salao_cabelo.git
cd salao_cabelo
npm start
```

O repositório contém código, documentação e testes. O banco local, seus backups e credenciais não são versionados. A publicação do código não hospeda o aplicativo nem ativa o WhatsApp.

