# WhatsApp — integração v0.4

## Situação real

O conector da API oficial, a fila persistente, os agendamentos de envio, o recebimento de status e as respostas dos botões foram implementados. Os testes usam um transporte simulado e dados fictícios; não enviam mensagens à Meta.

O proprietário informou que ainda não definiu o número do salão. A conexão real permanece pendente e os envios estão desativados. A aplicação foi publicada em 11 de novembro de 2026 em https://76.13.113.108:8445/. Não foi criada conta Meta, registrado número, fornecido token nem submetido template. A configuração e a verificação do callback na Meta continuam pendentes. Não houve teste de entrega em telefone real.

## Ativação após definir o número

1. Configurar uma conta WhatsApp Business Platform / Cloud API na Meta e o número que pertencerá ao salão. Concluir os passos exigidos pela conta, incluindo eventuais verificações e condições comerciais. Não presumir que o aplicativo WhatsApp Business no celular, por si só, fornece acesso à API.
2. Preparar hospedagem persistente com HTTPS e o aplicativo em execução continuamente. O localhost atual não é um webhook público. Um proxy reverso pode encaminhar ao servidor ligado em 127.0.0.1 e deve preservar o Host público. Definir PUBLIC_ORIGIN com a origem HTTPS, sem caminho.
3. Copiar .env.example para .env e preencher localmente o token de acesso, identificador do número, segredo do aplicativo, um token de verificação escolhido para o webhook e a versão Graph suportada pela conta. Nenhum segredo deve ir ao navegador, Git, documentação ou chat. Em hospedagem, usar o gerenciador de segredos do ambiente e COOKIE_SECURE=1.
4. Criar e obter aprovação dos três modelos. O arquivo whatsapp-templates.json contém propostas para submissão, não templates já aprovados. Manter nomes, idioma e número/ordem de variáveis alinhados ao código. Depois informar os nomes reais aprovados nas variáveis WHATSAPP_TEMPLATE_*.
5. Reiniciar o servidor para carregar a configuração. Na Meta, definir o callback como PUBLIC_ORIGIN/webhooks/whatsapp, informar o mesmo WHATSAPP_VERIFY_TOKEN e assinar o campo messages da conta. O GET de verificação registra a configuração correspondente; cada POST exige assinatura HMAC-SHA256 válida.
6. Conferir o estado em Notificações. A ativação exige configuração preenchida e webhook verificado; isso não comprova, por si só, que o token e os modelos são aceitos pela Meta.
7. Cadastrar um destinatário de teste autorizado com número internacional +DDI, definir suas autorizações e fazer um agendamento futuro. Ativar os envios no painel e acompanhar: aceita pela API, enviada, entregue e lida. Validar em telefone real antes de liberar para todos.
8. Testar também confirmação, pedido de remarcação, cancelamento e SAIR no número real. Em ambiente de teste da Meta, usar somente destinatários permitidos pela conta.

A API de templates da Cloud API utiliza /PHONE_NUMBER_ID/messages. O endpoint de aniversário pode ser ajustado para marketing_messages somente quando esse produto estiver habilitado e validado na conta. Versão e elegibilidade devem ser conferidas durante a conexão; nenhum valor “mais recente” foi presumido no código.

## Modelos

- Confirmação do agendamento: 6 variáveis de corpo (cliente, serviço, profissional, data, hora, endereço), mais três botões de resposta rápida.
- Lembrete: mesmas 6 variáveis e mesmos botões.
- Aniversário: 2 variáveis de corpo (cliente e estabelecimento), sem promessa de presente individual ou compartilhamento da anotação interna.

A proposta de aniversário usa categoria MARKETING; a classificação e a aprovação finais são da Meta. Preferências de presente não são enviadas automaticamente. Para prometer um serviço ou campanha específica, o texto aprovado do modelo precisa refletir exatamente a oferta autorizada pelo salão.

## Regras de envio

- Desativado por padrão, inclusive em bancos existentes.
- Autorizações independentes para atendimento e para aniversário. Não inferir autorização por existir telefone no cadastro.
- Número de WhatsApp separado do telefone geral, com + e DDI explícitos. Não acrescentar país ou dígitos automaticamente.
- Cadastro administrativo registra autorização declarada pelo administrador; cliente pode escolher no cadastro público ou editar suas preferências.
- SAIR, PARAR, STOP ou CANCELAR MENSAGENS retiram ambas as autorizações, sem cancelar agendamentos.
- Confirmação é enfileirada na mesma transação da reserva criada ou remarcada. Isso confirma o cadastro da reserva, não a presença do cliente.
- Lembretes ficam elegíveis na janela configurada em business.reminders e expiram no início do atendimento. Ligar o servidor depois da hora não envia um lembrete vencido.
- Aniversários são processados no próprio dia, a partir do horário escolhido (8h a 18h), até 20h, no fuso America/Fortaleza, uma vez por cliente/ano. Não há compensação automática para dias em que o servidor ficou desligado. Em anos comuns, 29 de fevereiro não é convertido em outra data.
- A fila verifica cancelamento, remarcação, número e autorizações novamente antes de iniciar o envio.
- Mensagens já em trânsito ou aceitas pela Meta não podem ser desfeitas por uma alteração posterior no aplicativo.
- Worker consulta a fila a cada 30 segundos enquanto o servidor estiver ligado. O botão Verificar fila agora usa o mesmo processamento.
- Limite de 20 mensagens por rodada, com reivindicação transacional para impedir que duas instâncias processem a mesma linha simultaneamente.

## Status, falhas e respostas

O retorno com wamid representa aceitação pela API. O aplicativo só mostra “Enviada”, “Entregue” ou “Lida” após o webhook correspondente. Eventos atrasados não regridem entrega ou leitura para estados anteriores.

Falhas explícitas 4xx são registradas sem salvar a resposta bruta que possa conter informações sensíveis. Erro 429 agenda até três tentativas. Timeout, 5xx, resposta inválida ou interrupção do processamento viram “Envio incerto”, sem repetição automática: conferir no WhatsApp Manager. Não há garantia de exactly-once na rede; a política conservadora reduz risco de duplicação.

Falhas confirmadas podem ser reenfileiradas explicitamente pelo administrador após corrigir a causa, se o prazo, a reserva e a autorização ainda forem válidos. Envios incertos não têm esse botão.

Botões carregam identificadores autenticados com HMAC; o webhook verifica também o remetente e a versão do horário. “Confirmar presença” atualiza a reserva correta. “Cancelar” cancela explicitamente. “Remarcar” registra solicitação na central e preserva o horário original; o administrador conclui a troca pela agenda, ou o cliente a realiza no aplicativo. Não há conversação livre automatizada nem mensagem automática de resposta aos botões.

## Dados e segurança

Esquema SQLite v2 acrescenta tabelas whatsapp_settings, whatsapp_outbox, whatsapp_inbound e whatsapp_receipts. A migração é aditiva e preserva dados e contas. Cada fila possui chave única de deduplicação, destinatário e fotografia do horário; recibos antecipados podem ser conciliados após a aceitação da API.

Não há credenciais nas tabelas de configurações ou nas respostas da API. .env é ignorado pelo Git. A Central é exclusiva do administrador; o cliente só altera suas próprias autorizações. O webhook é público por necessidade, mas cada POST é autenticado pelo segredo do aplicativo sobre os bytes originais. Desligar o canal não libera horários nem apaga histórico.

## Fontes consultadas

- [Política de mensagens do WhatsApp Business](https://whatsappbusiness.com/policy/): autorização, templates e janela de atendimento.
- [Coleção oficial da Meta no Postman — envio de template](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text): formato e resposta com wamid.
- [Referência oficial Meta de componentes de template](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/component_object/): estrutura de botões de resposta. O SDK está arquivado; o aplicativo usa HTTP diretamente, sem instalá-lo.

Parte da documentação direta de developers.facebook.com apresentou indisponibilidade/rate limit durante a consulta. A configuração e a validação de ponta a ponta na conta real ainda são necessárias.

