# Situação — 9 de novembro de 2026 — v0.4

## Senha administrativa — v0.4.1

Fluxo privado para redefinir a senha do administrador existente: emissão por console autorizado, uso único, validade de 30 minutos, senha definida pelo proprietário, revogação de sessões antigas e proteção contra reutilização. Não há senha universal nem criação pública de administradores. O esquema v3 é aditivo; 60 testes passaram.

## Publicação na VPS — 11 de novembro de 2026

Aplicativo publicado em https://76.13.113.108:8445/ com HTTPS válido, serviços próprios, banco migrado preservando a conta existente, backup diário e sincronização horária do certificado já gerenciado na VPS. Os 52 testes passaram no runtime Node.js v24.19.0 do servidor. Os demais projetos não foram alterados ou reiniciados; a comparação dos processos antes/depois permaneceu igual. Detalhes em DEPLOYMENT.md.

## Preparação do WhatsApp — v0.4

- Conector HTTP para a API oficial, sem dependências externas.
- Fila persistente e worker para confirmações, lembretes e aniversários.
- Consentimentos independentes e retirada por conta do cliente ou SAIR.
- Webhook autenticado, recibos de entrega/leitura e botões de confirmação, cancelamento e solicitação de remarcação.
- Controle conservador de envios incertos para evitar repetição automática.
- Central administrativa e configuração local de credenciais.
- Migração aditiva SQLite v2, preservando contas e cadastros.
- 52 testes aprovados, incluindo 17 testes do conector com transporte simulado.
- Teste visual em banco separado: configuração desativada, gravação e persistência da autorização do cliente.

**Ativação real pendente:** o proprietário ainda não definiu o número do salão. Não houve conexão real à Meta nem envio a telefone. A hospedagem HTTPS por IP já foi concluída. Faltam conta/número, credenciais, modelos aprovados, configuração e verificação do callback na Meta e teste ponta a ponta.

## Histórico e aniversários — v0.3

- Histórico por cliente com agendamentos, valores previstos e cancelamentos.
- Data de nascimento opcional no cadastro administrativo e no cadastro público.
- Aniversariantes por mês, destaque para o dia e lembrete no painel administrativo.
- Campo interno para planejar brinde ou serviço de aniversário, sem envio ou concessão automática.
- Validação e persistência sem alteração do esquema ou exclusão de registros antigos.
- Verificação visual em banco temporário: histórico, edição, persistência e filtro mensal.

## Base implementada na v0.2

- Banco SQLite persistente, esquema v1 e inicialização sem contas ou reservas demonstrativas.
- Primeiro administrador criado na tela de configuração inicial.
- Login dos três perfis e permissões verificadas no servidor.
- Cadastro público exclusivamente de clientes, sem possibilidade de escolher privilégios.
- Criação administrativa de acessos vinculados a cadastros de profissional ou cliente.
- Senha temporária com troca obrigatória, alteração da própria senha e revogação de sessões.
- Sessões com validade de 12 horas, logout, limite de tentativas, proteção de origem e CSRF.
- API para leitura conforme perfil e atualização administrativa de cadastros com revisão otimista.
- Reservas, confirmação, atraso, cancelamento e remarcação gravados no banco.
- Disponibilidade consultada no servidor, transação e gatilhos contra sobreposição.
- Profissional pode marcar ausência e retorno sem cancelar atendimentos existentes.
- Histórico de auditoria das alterações.
- Backup SQLite consistente por comando.
- Interface atualizada, sem gravação de negócio em localStorage.

## Validação

60 testes passaram. Os testes de domínio e integração cobrem autenticação, permissões, isolamento, segurança das requisições, transações, concorrência por vaga, remarcação, logout, expiração e persistência. A validação de navegador utilizou contas fictícias de administrador, profissional e cliente em banco temporário, incluindo criação de serviço, criação de reserva e persistência após recarregar.

Na entrega v0.2, o banco principal foi inicializado sem usuários para o primeiro acesso do proprietário. A atualização v0.3 preserva contas, sessões e cadastros existentes. As contas de teste não estão no banco principal.

## O que permanece pendente

| Área | Pendências |
| --- | --- |
| Hospedagem | Publicada por IP com HTTPS na porta 8445, disco persistente e backup diário. Domínio não solicitado. |
| Contas | Verificação de e-mail, recuperação de senha, desativação de contas e administração de múltiplos administradores. |
| Negócio | Um estabelecimento por instalação; não há onboarding de múltiplos estabelecimentos na mesma instância. |
| Configuração | Logotipo personalizado, horários por dia do profissional e sinalização completa de mudanças gerais de disponibilidade. |
| Notificações | Ativar a conexão Meta preparada, definir número, aprovar modelos, publicar webhook HTTPS e testar entrega real. Avisos de atraso do profissional seguem pendentes. |
| Antecipação | Prioridade, prazo, compatibilidade e oferta com transferência por aceite. |
| Retorno | Lembretes periódicos, sem criação automática de reservas. |
| Pagamento | Provedor, transferência em remarcação e regras de devolução. |
| Migração | Importação dos antigos exemplos do navegador não executada. |
| Git | Repositório definido: https://github.com/InvictusCorporation/salao_cabelo. Banco, backups e credenciais excluídos do versionamento. |

O escopo original em ESCOPO.md contém a situação histórica da entrega inicial. Este arquivo registra a situação atual.

